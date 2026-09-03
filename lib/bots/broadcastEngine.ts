import pool, { ensureBotCouponSchema } from '@/lib/db';
import {
  deliverCouponToSubscriber,
  deliverTextToSubscriber,
  recordCouponSend,
  resolveCouponForDelivery,
  saveCouponQrPublic,
} from './couponDeliver';
import type { Platform } from './register';
import { applyBroadcastTemplate } from './templateVars';
import { querySubscribers, type BroadcastSegment, type SubscriberListFilters } from './subscribersAdmin';

export type BroadcastPayload = {
  text: string;
  sendCoupon?: boolean;
  platform?: 'telegram' | 'max' | 'all';
  couponMode?: 'create' | 'existing';
  couponCode?: string;
  couponDiscountPercent?: number;
  couponExpiryDays?: number;
  couponMinTotalRub?: number;
  couponTitle?: string;
  couponPrefix?: string;
  segment?: BroadcastSegment;
  vipOnly?: boolean;
  filters?: Omit<SubscriberListFilters, 'segment' | 'vipOnly'>;
};

export type BroadcastRunResult = {
  ok: boolean;
  runId: number;
  sent: number;
  failed: number;
  total: number;
  failures: Array<{
    subscriberId: number;
    platform: string;
    firstName: string;
    error: string;
  }>;
};

type SubRow = {
  id: number;
  platform: string;
  platform_user_id: string;
  first_name: string;
  phone: string;
};

export async function resolveBroadcastTargets(payload: BroadcastPayload): Promise<SubRow[]> {
  const filters: SubscriberListFilters = {
    ...(payload.filters ?? {}),
    includeInactive: false,
    platform: payload.platform ?? 'all',
    segment: payload.segment ?? 'all',
    vipOnly: payload.vipOnly,
  };
  const rows = await querySubscribers(filters);
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    platform_user_id: r.platform_user_id,
    first_name: r.first_name,
    phone: r.phone,
  }));
}

export async function executeBroadcast(payload: BroadcastPayload): Promise<BroadcastRunResult> {
  await ensureBotCouponSchema();
  const subscribers = await resolveBroadcastTargets(payload);
  const failures: BroadcastRunResult['failures'] = [];

  const runIns = await pool.query<{ id: number }>(
    `INSERT INTO bot_broadcast_runs (payload, total) VALUES ($1::jsonb, $2) RETURNING id`,
    [JSON.stringify(payload), subscribers.length]
  );
  const runId = runIns.rows[0].id;

  let sharedCoupon: { couponId: number; code: string; discountPercent: number } | null = null;
  if (payload.sendCoupon && (payload.couponMode ?? 'create') === 'existing') {
    sharedCoupon = await resolveCouponForDelivery({
      mode: 'existing',
      couponCode: payload.couponCode,
    });
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    let couponCode = '';
    let discountPercent = payload.couponDiscountPercent ?? 10;
    let couponId: number | null = null;
    let itemError: string | null = null;

    try {
      if (payload.sendCoupon) {
        const mode = payload.couponMode ?? 'create';
        if (mode === 'existing' && sharedCoupon) {
          couponId = sharedCoupon.couponId;
          couponCode = sharedCoupon.code;
          discountPercent = sharedCoupon.discountPercent;
        } else {
          const created = await resolveCouponForDelivery({
            mode: 'create',
            title: payload.couponTitle ?? 'Купон рассылки',
            discountPercent: payload.couponDiscountPercent ?? 10,
            minTotalRub: payload.couponMinTotalRub ?? 0,
            expiryDays: payload.couponExpiryDays ?? 30,
            codePrefix: payload.couponPrefix ?? 'PROMO',
          });
          couponId = created.couponId;
          couponCode = created.code;
          discountPercent = created.discountPercent;
        }
      }

      const personalized = applyBroadcastTemplate(payload.text, {
        firstName: sub.first_name,
        couponCode,
        discountPercent,
        phone: sub.phone,
      });

      if (payload.sendCoupon) {
        const { buffer, qrUrl } = await saveCouponQrPublic(couponCode);
        await deliverCouponToSubscriber({
          platform: sub.platform as Platform,
          platformUserId: sub.platform_user_id,
          couponCode,
          messageText: personalized,
          discountPercent,
          qrBuffer: buffer,
          qrPublicUrl: qrUrl,
        });
        await recordCouponSend(sub.id, couponId, couponCode);
      } else {
        await deliverTextToSubscriber({
          platform: sub.platform as Platform,
          platformUserId: sub.platform_user_id,
          text: personalized,
        });
      }
      sent++;
      await pool.query(
        `INSERT INTO bot_broadcast_run_items
           (run_id, subscriber_id, platform, platform_user_id, first_name, success)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [runId, sub.id, sub.platform, sub.platform_user_id, sub.first_name]
      );
    } catch (err) {
      failed++;
      itemError = err instanceof Error ? err.message : String(err);
      failures.push({
        subscriberId: sub.id,
        platform: sub.platform,
        firstName: sub.first_name,
        error: itemError,
      });
      await pool.query(
        `INSERT INTO bot_broadcast_run_items
           (run_id, subscriber_id, platform, platform_user_id, first_name, success, error)
         VALUES ($1, $2, $3, $4, $5, FALSE, $6)`,
        [runId, sub.id, sub.platform, sub.platform_user_id, sub.first_name, itemError]
      );
      console.error(`[Broadcast] Failed ${sub.platform}:${sub.platform_user_id}`, err);
    }
  }

  await pool.query(
    `UPDATE bot_broadcast_runs SET sent = $1, failed = $2, finished_at = NOW() WHERE id = $3`,
    [sent, failed, runId]
  );

  return { ok: true, runId, sent, failed, total: subscribers.length, failures };
}

export async function processScheduledBroadcasts(): Promise<number> {
  await ensureBotCouponSchema();
  const pending = await pool.query<{ id: number; payload: BroadcastPayload }>(
    `SELECT id, payload FROM bot_scheduled_broadcasts
     WHERE status = 'pending' AND scheduled_at <= NOW()
     ORDER BY scheduled_at ASC
     LIMIT 5`
  );
  let processed = 0;
  for (const row of pending.rows) {
    await pool.query(`UPDATE bot_scheduled_broadcasts SET status = 'running' WHERE id = $1`, [row.id]);
    try {
      const result = await executeBroadcast(row.payload);
      await pool.query(
        `UPDATE bot_scheduled_broadcasts SET status = 'done', run_id = $1 WHERE id = $2`,
        [result.runId, row.id]
      );
    } catch (err) {
      console.error('[Scheduled broadcast]', row.id, err);
      await pool.query(`UPDATE bot_scheduled_broadcasts SET status = 'failed' WHERE id = $1`, [row.id]);
    }
    processed++;
  }
  return processed;
}

export async function scheduleBroadcast(
  payload: BroadcastPayload,
  scheduledAt: Date,
  createdBy?: string
): Promise<number> {
  await ensureBotCouponSchema();
  const ins = await pool.query<{ id: number }>(
    `INSERT INTO bot_scheduled_broadcasts (scheduled_at, payload, created_by)
     VALUES ($1, $2::jsonb, $3) RETURNING id`,
    [scheduledAt.toISOString(), JSON.stringify(payload), createdBy ?? null]
  );
  return ins.rows[0].id;
}

export async function getBroadcastRun(runId: number) {
  await ensureBotCouponSchema();
  const run = await pool.query(
    `SELECT id, started_at, finished_at, sent, failed, total, payload FROM bot_broadcast_runs WHERE id = $1`,
    [runId]
  );
  if (run.rows.length === 0) return null;
  const items = await pool.query(
    `SELECT subscriber_id, platform, platform_user_id, first_name, success, error
     FROM bot_broadcast_run_items WHERE run_id = $1 ORDER BY id`,
    [runId]
  );
  return { run: run.rows[0], items: items.rows };
}
