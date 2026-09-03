import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureBotCouponSchema, ensureDatabase } from '@/lib/db';

export async function POST(req: NextRequest) {
  await ensureDatabase();
  await ensureBotCouponSchema();

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const code = String(body.code || '').trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: 'Купон не указан' }, { status: 400 });
  }

  try {
  const coupon = await pool.query<{ active: boolean; expires_at: Date | null }>(
    `SELECT active, expires_at
     FROM cabinet_coupons
     WHERE UPPER(code) = $1
     LIMIT 1`,
    [code]
  );
  if (coupon.rows.length === 0) {
    return NextResponse.json({ error: 'Купон не найден' }, { status: 404 });
  }
  const c = coupon.rows[0];
  if (!c.active) {
    return NextResponse.json({ error: 'Купон неактивен' }, { status: 400 });
  }
  if (c.expires_at && c.expires_at.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Срок действия купона истёк' }, { status: 400 });
  }

  // QR работает 1 раз в 24 часа по coupon_code.
  const consume = await pool.query<{ last_scan_at: Date }>(
    `INSERT INTO bot_coupon_qr_scans (coupon_code, last_scan_at)
     VALUES ($1, CURRENT_TIMESTAMP)
     ON CONFLICT (coupon_code) DO UPDATE
       SET last_scan_at = EXCLUDED.last_scan_at
       WHERE bot_coupon_qr_scans.last_scan_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
     RETURNING last_scan_at`,
    [code]
  );

  if (consume.rows.length === 0) {
    const r = await pool.query<{ last_scan_at: Date }>(
      `SELECT last_scan_at FROM bot_coupon_qr_scans WHERE coupon_code = $1 LIMIT 1`,
      [code]
    );
    const last = r.rows[0]?.last_scan_at ? new Date(r.rows[0].last_scan_at) : new Date();
    const nextAt = new Date(last.getTime() + 24 * 60 * 60 * 1000);
    const retryAfterSec = Math.max(1, Math.ceil((nextAt.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'Этот QR уже использован за последние 24 часа. Попробуйте позже.',
        retryAfterSec,
        nextAt: nextAt.toISOString(),
      },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    );
  }

    return NextResponse.json({ ok: true, code });
  } catch (err) {
    console.error('[promo/resolve]', err);
    return NextResponse.json(
      { error: 'Не удалось проверить купон. Попробуйте позже.' },
      { status: 500 }
    );
  }
}

