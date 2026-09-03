import pool, { ensureBotCouponSchema } from '@/lib/db';
import type { Platform } from './register';

export type BroadcastSegment =
  | 'all'
  | 'no_purchase'
  | 'no_coupon_30d'
  | 'qr_no_order'
  | 'vip';

export type SubscriberListFilters = {
  q?: string;
  platform?: 'telegram' | 'max' | 'all';
  includeInactive?: boolean;
  hasCabinet?: boolean;
  noCouponDays?: number;
  registeredFrom?: string;
  registeredTo?: string;
  segment?: BroadcastSegment;
  vipOnly?: boolean;
};

export type SubscriberRow = {
  id: number;
  platform: Platform;
  platform_user_id: string;
  first_name: string;
  phone: string;
  phone_key: string | null;
  cabinet_user_id: number | null;
  is_active: boolean;
  is_vip: boolean;
  manager_notes: string;
  registered_at: string;
  last_coupon: string | null;
  coupon_status: string | null;
  cabinet_email: string | null;
  sibling_ids: number[];
};

export type CouponHistoryItem = {
  id: number;
  coupon_code: string;
  sent_at: string;
  qr_scanned_at: string | null;
  order_id: number | null;
  order_status: string | null;
};

export type SubscriberDetail = SubscriberRow & {
  cabinet_display_name: string | null;
  coupons: CouponHistoryItem[];
  siblings: Array<{
    id: number;
    platform: Platform;
    platform_user_id: string;
    is_active: boolean;
  }>;
};

export type BotsStats = {
  activeSubscribers: number;
  telegramActive: number;
  maxActive: number;
  newLast7Days: number;
  couponsIssued30d: number;
  couponsUsed30d: number;
  qrScans30d: number;
  qrToOrderConversionPct: number;
  dualPlatformGroups: number;
};

function segmentClause(segment?: BroadcastSegment, vipOnly?: boolean): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (vipOnly || segment === 'vip') {
    parts.push(`bs.is_vip = TRUE`);
  }
  if (segment === 'no_purchase') {
    parts.push(`
      NOT EXISTS (
        SELECT 1 FROM cabinet_orders o
        WHERE o.user_id = bs.cabinet_user_id
          AND bs.cabinet_user_id IS NOT NULL
          AND o.status NOT IN ('cancelled', 'draft')
      )
    `);
  }
  if (segment === 'no_coupon_30d') {
    parts.push(`
      NOT EXISTS (
        SELECT 1 FROM bot_coupon_sends bcs
        WHERE bcs.subscriber_id = bs.id
          AND bcs.sent_at >= NOW() - INTERVAL '30 days'
      )
    `);
  }
  if (segment === 'qr_no_order') {
    parts.push(`
      EXISTS (
        SELECT 1 FROM bot_coupon_sends bcs
        JOIN bot_coupon_qr_scans qr ON UPPER(qr.coupon_code) = UPPER(bcs.coupon_code)
        WHERE bcs.subscriber_id = bs.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM bot_coupon_sends bcs2
        JOIN cabinet_orders o ON UPPER(o.coupon_code) = UPPER(bcs2.coupon_code)
          AND o.user_id = bs.cabinet_user_id
          AND bs.cabinet_user_id IS NOT NULL
        WHERE bcs2.subscriber_id = bs.id
      )
    `);
  }
  return { sql: parts.length ? parts.join(' AND ') : 'TRUE', params };
}

export async function querySubscribers(filters: SubscriberListFilters): Promise<SubscriberRow[]> {
  await ensureBotCouponSchema();
  const params: unknown[] = [];
  let n = 1;
  const where: string[] = [];

  if (!filters.includeInactive) {
    where.push('bs.is_active = TRUE');
  }
  if (filters.platform && filters.platform !== 'all') {
    where.push(`bs.platform = $${n++}`);
    params.push(filters.platform);
  }
  if (filters.hasCabinet === true) {
    where.push('bs.cabinet_user_id IS NOT NULL');
  } else if (filters.hasCabinet === false) {
    where.push('bs.cabinet_user_id IS NULL');
  }
  if (filters.q?.trim()) {
    where.push(`(
      bs.first_name ILIKE $${n} OR bs.phone ILIKE $${n}
      OR bs.platform_user_id ILIKE $${n}
    )`);
    params.push(`%${filters.q.trim()}%`);
    n++;
  }
  if (filters.registeredFrom) {
    where.push(`bs.registered_at >= $${n++}::date`);
    params.push(filters.registeredFrom);
  }
  if (filters.registeredTo) {
    where.push(`bs.registered_at < ($${n++}::date + INTERVAL '1 day')`);
    params.push(filters.registeredTo);
  }
  if (filters.noCouponDays != null && filters.noCouponDays > 0) {
    where.push(`
      NOT EXISTS (
        SELECT 1 FROM bot_coupon_sends bcs
        WHERE bcs.subscriber_id = bs.id
          AND bcs.sent_at >= NOW() - ($${n}::int * INTERVAL '1 day')
      )
    `);
    params.push(filters.noCouponDays);
    n++;
  }

  const seg = segmentClause(filters.segment, filters.vipOnly);
  if (seg.sql !== 'TRUE') where.push(seg.sql);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const res = await pool.query<{
    id: number;
    platform: Platform;
    platform_user_id: string;
    first_name: string;
    phone: string;
    phone_key: string | null;
    cabinet_user_id: number | null;
    is_active: boolean;
    is_vip: boolean;
    manager_notes: string;
    registered_at: string;
    last_coupon: string | null;
    qr_scanned_at: string | null;
    order_id: number | null;
    cabinet_email: string | null;
  }>(
    `SELECT
       bs.id, bs.platform, bs.platform_user_id, bs.first_name, bs.phone, bs.phone_key,
       bs.cabinet_user_id, bs.is_active, bs.is_vip, COALESCE(bs.manager_notes, '') AS manager_notes,
       bs.registered_at,
       lc.coupon_code AS last_coupon,
       qr.last_scan_at AS qr_scanned_at,
       ord.id AS order_id,
       cu.email AS cabinet_email
     FROM bot_subscribers bs
     LEFT JOIN LATERAL (
       SELECT coupon_code FROM bot_coupon_sends
       WHERE subscriber_id = bs.id ORDER BY sent_at DESC LIMIT 1
     ) lc ON TRUE
     LEFT JOIN LATERAL (
       SELECT last_scan_at FROM bot_coupon_qr_scans
       WHERE UPPER(coupon_code) = UPPER(lc.coupon_code) LIMIT 1
     ) qr ON lc.coupon_code IS NOT NULL
     LEFT JOIN LATERAL (
       SELECT o.id FROM cabinet_orders o
       WHERE bs.cabinet_user_id IS NOT NULL
         AND o.user_id = bs.cabinet_user_id
         AND lc.coupon_code IS NOT NULL
         AND UPPER(o.coupon_code) = UPPER(lc.coupon_code)
       ORDER BY o.created_at DESC LIMIT 1
     ) ord ON TRUE
     LEFT JOIN cabinet_users cu ON cu.id = bs.cabinet_user_id
     ${whereSql}
     ORDER BY bs.registered_at DESC`,
    params
  );

  const siblingMap = new Map<string, number[]>();
  for (const row of res.rows) {
    const key = row.phone_key || `solo:${row.id}`;
    const arr = siblingMap.get(key) ?? [];
    arr.push(row.id);
    siblingMap.set(key, arr);
  }

  return res.rows.map((row) => {
    const key = row.phone_key || `solo:${row.id}`;
    const siblings = siblingMap.get(key) ?? [row.id];
    let coupon_status: string | null = null;
    if (row.last_coupon) {
      if (row.order_id) coupon_status = `Заказ #${row.order_id}`;
      else if (row.qr_scanned_at) coupon_status = 'QR активирован';
      else coupon_status = 'Выдан';
    }
    return {
      id: row.id,
      platform: row.platform,
      platform_user_id: row.platform_user_id,
      first_name: row.first_name,
      phone: row.phone,
      phone_key: row.phone_key,
      cabinet_user_id: row.cabinet_user_id,
      is_active: row.is_active,
      is_vip: row.is_vip,
      manager_notes: row.manager_notes,
      registered_at: row.registered_at,
      last_coupon: row.last_coupon,
      coupon_status,
      cabinet_email: row.cabinet_email,
      sibling_ids: siblings.filter((id) => id !== row.id),
    };
  });
}

export async function getSubscriberDetail(id: number): Promise<SubscriberDetail | null> {
  await ensureBotCouponSchema();
  const base = await pool.query<{
    id: number;
    platform: Platform;
    platform_user_id: string;
    first_name: string;
    phone: string;
    phone_key: string | null;
    cabinet_user_id: number | null;
    is_active: boolean;
    is_vip: boolean;
    manager_notes: string;
    registered_at: string;
    cabinet_email: string | null;
    cabinet_display_name: string | null;
  }>(
    `SELECT bs.*, COALESCE(bs.manager_notes, '') AS manager_notes,
            cu.email AS cabinet_email, cu.display_name AS cabinet_display_name
     FROM bot_subscribers bs
     LEFT JOIN cabinet_users cu ON cu.id = bs.cabinet_user_id
     WHERE bs.id = $1 LIMIT 1`,
    [id]
  );
  if (base.rows.length === 0) return null;
  const row = base.rows[0];

  const coupons = await pool.query<CouponHistoryItem>(
    `SELECT
       bcs.id,
       bcs.coupon_code,
       bcs.sent_at::text AS sent_at,
       qr.last_scan_at::text AS qr_scanned_at,
       o.id AS order_id,
       o.status AS order_status
     FROM bot_coupon_sends bcs
     LEFT JOIN bot_coupon_qr_scans qr ON UPPER(qr.coupon_code) = UPPER(bcs.coupon_code)
     LEFT JOIN cabinet_orders o ON bs.cabinet_user_id IS NOT NULL
       AND o.user_id = bs.cabinet_user_id
       AND UPPER(o.coupon_code) = UPPER(bcs.coupon_code)
     FROM bot_coupon_sends bcs
     JOIN bot_subscribers bs ON bs.id = bcs.subscriber_id
     WHERE bcs.subscriber_id = $1
     ORDER BY bcs.sent_at DESC`,
    [id]
  );

  let siblings: SubscriberDetail['siblings'] = [];
  if (row.phone_key) {
    const sib = await pool.query<{ id: number; platform: Platform; platform_user_id: string; is_active: boolean }>(
      `SELECT id, platform, platform_user_id, is_active
       FROM bot_subscribers
       WHERE phone_key = $1 AND id <> $2
       ORDER BY platform`,
      [row.phone_key, id]
    );
    siblings = sib.rows;
  }

  const list = await querySubscribers({ includeInactive: true, q: undefined });
  const self = list.find((s) => s.id === id);

  return {
    id: row.id,
    platform: row.platform,
    platform_user_id: row.platform_user_id,
    first_name: row.first_name,
    phone: row.phone,
    phone_key: row.phone_key,
    cabinet_user_id: row.cabinet_user_id,
    is_active: row.is_active,
    is_vip: row.is_vip,
    manager_notes: row.manager_notes,
    registered_at: row.registered_at,
    last_coupon: self?.last_coupon ?? null,
    coupon_status: self?.coupon_status ?? null,
    cabinet_email: row.cabinet_email,
    cabinet_display_name: row.cabinet_display_name,
    sibling_ids: self?.sibling_ids ?? [],
    coupons: coupons.rows,
    siblings,
  };
}

export async function getBotsStats(): Promise<BotsStats> {
  await ensureBotCouponSchema();
  const [subs, issued, used, scans, dual] = await Promise.all([
    pool.query<{ active: string; tg: string; max: string; new7: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE is_active)::text AS active,
         COUNT(*) FILTER (WHERE is_active AND platform = 'telegram')::text AS tg,
         COUNT(*) FILTER (WHERE is_active AND platform = 'max')::text AS max,
         COUNT(*) FILTER (WHERE registered_at >= NOW() - INTERVAL '7 days')::text AS new7
       FROM bot_subscribers`
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM bot_coupon_sends WHERE sent_at >= NOW() - INTERVAL '30 days'`
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(DISTINCT o.id)::text AS c
       FROM cabinet_orders o
       WHERE o.coupon_code IS NOT NULL AND o.coupon_code <> ''
         AND o.created_at >= NOW() - INTERVAL '30 days'
         AND o.status NOT IN ('cancelled', 'draft')`
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM bot_coupon_qr_scans
       WHERE last_scan_at >= NOW() - INTERVAL '30 days'`
    ),
    pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM (
         SELECT phone_key FROM bot_subscribers
         WHERE phone_key IS NOT NULL AND phone_key <> ''
         GROUP BY phone_key HAVING COUNT(DISTINCT platform) > 1
       ) t`
    ),
  ]);
  const s = subs.rows[0];
  const scanCount = Number(scans.rows[0]?.c ?? 0);
  const usedCount = Number(used.rows[0]?.c ?? 0);
  const conversion = scanCount > 0 ? Math.round((usedCount / scanCount) * 100) : 0;

  return {
    activeSubscribers: Number(s?.active ?? 0),
    telegramActive: Number(s?.tg ?? 0),
    maxActive: Number(s?.max ?? 0),
    newLast7Days: Number(s?.new7 ?? 0),
    couponsIssued30d: Number(issued.rows[0]?.c ?? 0),
    couponsUsed30d: usedCount,
    qrScans30d: scanCount,
    qrToOrderConversionPct: conversion,
    dualPlatformGroups: Number(dual.rows[0]?.c ?? 0),
  };
}

export async function linkSubscriberToCabinet(
  subscriberId: number,
  cabinetUserId: number
): Promise<void> {
  await ensureBotCouponSchema();
  const user = await pool.query(`SELECT id FROM cabinet_users WHERE id = $1`, [cabinetUserId]);
  if (user.rows.length === 0) throw new Error('CABINET_USER_NOT_FOUND');
  await pool.query(`UPDATE bot_subscribers SET cabinet_user_id = $1 WHERE id = $2`, [
    cabinetUserId,
    subscriberId,
  ]);
}

export async function findCabinetUserByEmailOrPhone(q: string): Promise<{ id: number; email: string } | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;
  const byEmail = await pool.query<{ id: number; email: string }>(
    `SELECT id, email FROM cabinet_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [trimmed]
  );
  if (byEmail.rows[0]) return byEmail.rows[0];
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const sub = await pool.query<{ cabinet_user_id: number }>(
    `SELECT cabinet_user_id FROM bot_subscribers
     WHERE cabinet_user_id IS NOT NULL
       AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE $1
     LIMIT 1`,
    [`%${digits.slice(-10)}`]
  );
  if (!sub.rows[0]?.cabinet_user_id) return null;
  const u = await pool.query<{ id: number; email: string }>(
    `SELECT id, email FROM cabinet_users WHERE id = $1`,
    [sub.rows[0].cabinet_user_id]
  );
  return u.rows[0] ?? null;
}

export async function getSubscribersByPhoneKey(phoneKey: string): Promise<Array<{ id: number; platform: Platform; is_active: boolean }>> {
  const res = await pool.query(
    `SELECT id, platform, is_active FROM bot_subscribers WHERE phone_key = $1 AND is_active = TRUE`,
    [phoneKey]
  );
  return res.rows as Array<{ id: number; platform: Platform; is_active: boolean }>;
}

export function subscribersToCsv(rows: SubscriberRow[]): string {
  const header = ['platform', 'first_name', 'phone', 'registered_at', 'last_coupon', 'coupon_status', 'is_active', 'is_vip', 'cabinet_email'];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.platform,
        r.first_name,
        r.phone,
        r.registered_at,
        r.last_coupon ?? '',
        r.coupon_status ?? '',
        r.is_active ? 'yes' : 'no',
        r.is_vip ? 'yes' : 'no',
        r.cabinet_email ?? '',
      ]
        .map(escape)
        .join(',')
    );
  }
  return lines.join('\n');
}
