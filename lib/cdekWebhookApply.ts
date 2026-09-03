import type { Pool, PoolClient } from 'pg';
import pool from '@/lib/db';

/** Разбор тела вебхука СДЭК v2 (ORDER_STATUS и варианты). */
export function parseCdekWebhookBody(body: unknown): {
  orderUuid: string | null;
  cdekNumber: string | null;
  statusCode: string | null;
  eventType: string | null;
} | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const eventType = b.type != null ? String(b.type) : null;
  const attrs = b.attributes as Record<string, unknown> | undefined;
  if (!attrs || typeof attrs !== 'object') {
    const uuid = typeof b.uuid === 'string' ? b.uuid : null;
    return { orderUuid: uuid, cdekNumber: null, statusCode: null, eventType };
  }
  const code = String(attrs.code || attrs.status_code || '').trim();
  let orderUuid: string | null = null;
  let cdekNumber: string | null = null;
  const rel = attrs.related_entities;
  if (Array.isArray(rel)) {
    for (const e of rel) {
      if (e && typeof e === 'object') {
        const t = (e as { type?: string }).type;
        if (t === 'order' || t === 'ORDER') {
          const u = (e as { uuid?: string }).uuid;
          const cn = (e as { cdek_number?: string }).cdek_number;
          if (u) orderUuid = u;
          if (cn) cdekNumber = cn;
        }
      }
    }
  }
  if (!orderUuid && typeof attrs.uuid === 'string') orderUuid = attrs.uuid;
  if (!cdekNumber && typeof attrs.cdek_number === 'string') cdekNumber = attrs.cdek_number;

  return {
    orderUuid,
    cdekNumber: cdekNumber || null,
    statusCode: code || null,
    eventType,
  };
}

export type CdekOrderPatch = {
  status?: string;
  progressPercent: number;
  setCompletedAt: boolean;
};

/** Карта кодов статуса СДЭК → наш заказ. */
export function mapCdekStatusToPatch(statusCode: string | null): CdekOrderPatch | null {
  if (!statusCode) return null;
  const c = statusCode.toUpperCase().trim();

  if (c === 'DELIVERED' || c === 'DELIVERED_AT_PICK_UP_POINT') {
    return { status: 'delivered', progressPercent: 100, setCompletedAt: true };
  }
  if (c.includes('RETURN') && (c.includes('SENDER') || c.includes('RETURNED'))) {
    return { status: 'shipped', progressPercent: 55, setCompletedAt: false };
  }
  if (c === 'NOT_DELIVERED' || c === 'LOST' || c === 'INVALID') {
    return { status: 'processing', progressPercent: 45, setCompletedAt: false };
  }
  if (
    /COURIER|PICK_UP|PVZ|TRANSIT|OFFICE|WAREHOUSE|SHIPMENT|SENT|PASSED|MET_|ACCEPTED|READY|RECEIVED|ARRIVED|TAKEN/i.test(
      c
    )
  ) {
    return { status: 'shipped', progressPercent: 78, setCompletedAt: false };
  }
  if (c === 'CREATED' || c === 'REGISTERED') {
    return { status: 'processing', progressPercent: 35, setCompletedAt: false };
  }
  return { progressPercent: 52, setCompletedAt: false };
}

function shouldApplyStatus(current: string | null | undefined, next: string | undefined): string | undefined {
  if (!next) return undefined;
  const cur = (current || 'processing').toLowerCase();
  const n = next.toLowerCase();
  const rank: Record<string, number> = {
    pending: 0,
    processing: 1,
    shipped: 2,
    delivered: 3,
    completed: 4,
    cancelled: 100,
    refunded: 100,
  };
  if ((rank[cur] ?? 0) >= 100) return undefined;
  if (rank[cur] >= 3 && n !== 'completed') return undefined;
  if ((rank[n] ?? 0) < (rank[cur] ?? 0)) return undefined;
  return n;
}

export async function applyCdekWebhookToOrder(
  db: Pool | PoolClient,
  parsed: { orderUuid: string | null; cdekNumber: string | null; statusCode: string | null }
): Promise<{ ok: true; orderId: number } | { ok: false; reason: string }> {
  const patch = mapCdekStatusToPatch(parsed.statusCode);
  if (!patch && !parsed.cdekNumber && !parsed.orderUuid) {
    return { ok: false, reason: 'empty_payload' };
  }

  const res = await db.query(
    `SELECT id, status, cdek_order_uuid, tracking_number
     FROM cabinet_orders
     WHERE ($1::varchar IS NOT NULL AND cdek_order_uuid = $1)
        OR ($2::varchar IS NOT NULL AND tracking_number = $2)
     ORDER BY id DESC
     LIMIT 1`,
    [parsed.orderUuid, parsed.cdekNumber]
  );
  if (res.rows.length === 0) {
    return { ok: false, reason: 'order_not_found' };
  }
  const row = res.rows[0] as {
    id: number;
    status: string;
    cdek_order_uuid: string | null;
    tracking_number: string | null;
  };

  const newStatus = shouldApplyStatus(row.status, patch?.status);
  const progressBump = patch?.progressPercent ?? 0;
  const tracking =
    parsed.cdekNumber && parsed.cdekNumber !== row.tracking_number ? parsed.cdekNumber : null;

  await db.query(
    `UPDATE cabinet_orders SET
       tracking_number = COALESCE($2::varchar, tracking_number),
       status = CASE WHEN $3::varchar IS NOT NULL THEN $3::varchar ELSE status END,
       progress_percent = GREATEST(COALESCE(progress_percent, 0), $4::int),
       cdek_last_status_code = COALESCE($5::varchar, cdek_last_status_code),
       cdek_last_status_at = CASE WHEN $5::varchar IS NOT NULL THEN NOW() ELSE cdek_last_status_at END,
       completed_at = CASE
         WHEN $6::boolean AND completed_at IS NULL THEN CURRENT_TIMESTAMP
         ELSE completed_at
       END,
       cdek_order_uuid = COALESCE(cdek_order_uuid, $7::varchar)
     WHERE id = $1`,
    [
      row.id,
      tracking,
      newStatus ?? null,
      progressBump,
      parsed.statusCode,
      !!(patch?.setCompletedAt),
      parsed.orderUuid,
    ]
  );

  return { ok: true, orderId: row.id };
}

/** Обработка одного или нескольких событий из тела запроса. */
export async function processCdekWebhookPayload(body: unknown): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
}> {
  const list = Array.isArray(body) ? body : [body];
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  const client = await pool.connect();
  try {
    for (const item of list) {
      const parsed = parseCdekWebhookBody(item);
      if (!parsed || (!parsed.orderUuid && !parsed.cdekNumber && !parsed.statusCode)) {
        skipped++;
        continue;
      }
      const r = await applyCdekWebhookToOrder(client, parsed);
      if (r.ok) processed++;
      else if (r.reason === 'empty_payload') skipped++;
      else if (r.reason === 'order_not_found') {
        skipped++;
        errors.push('order_not_found');
      }
    }
  } finally {
    client.release();
  }

  return { processed, skipped, errors };
}
