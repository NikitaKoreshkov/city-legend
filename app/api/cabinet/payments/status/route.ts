import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { tbankGetState } from '@/lib/tbankAcquiring';

export const dynamic = 'force-dynamic';
const TBANK_FINAL_FAIL_STATUSES = new Set([
  'REJECTED',
  'CANCELED',
  'DEADLINE_EXPIRED',
  'AUTH_FAIL',
  'PARTIAL_REJECTED',
]);

export async function GET(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const id = Math.floor(Number(req.nextUrl.searchParams.get('paymentConfirmationId') || ''));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Некорректный идентификатор' }, { status: 400 });
  }

  await ensureDatabase();
  const res = await pool.query(
    `SELECT id, status, amount_rub, currency, provider_payment_id, confirmed_at, expires_at, meta
     FROM cabinet_payment_confirmations
     WHERE id = $1 AND user_id = $2`,
    [id, user.id]
  );
  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
  }

  const row = res.rows[0] as {
    id: number;
    status: string;
    amount_rub: string;
    currency: string;
    provider_payment_id: string;
    confirmed_at: Date | null;
    expires_at: Date | null;
    meta: { tbankPaymentId?: string } | null;
  };

  const terminalKey = process.env.TBANK_TERMINAL_KEY?.trim();
  const password = process.env.TBANK_PASSWORD?.trim();

  if (
    row.status === 'pending' &&
    row.meta?.tbankPaymentId &&
    terminalKey &&
    password
  ) {
    const gs = await tbankGetState({
      terminalKey,
      password,
      paymentId: row.meta.tbankPaymentId,
    });
    await pool.query(
      `UPDATE cabinet_payment_confirmations
       SET meta = meta || $3::jsonb
       WHERE id = $1 AND user_id = $2`,
      [
        id,
        user.id,
        JSON.stringify({
          tbankLastStateAt: new Date().toISOString(),
          tbankLastStateStatus: gs.ok ? gs.status : null,
          tbankLastStateMessage: gs.ok ? null : gs.message,
          tbankLastStateOk: gs.ok,
        }),
      ]
    );
    if (gs.ok && gs.status === 'CONFIRMED') {
      await pool.query(
        `UPDATE cabinet_payment_confirmations
         SET status = 'confirmed',
             confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP)
         WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
        [id, user.id]
      );
      row.status = 'confirmed';
    } else if (gs.ok && TBANK_FINAL_FAIL_STATUSES.has(gs.status)) {
      await pool.query(
        `UPDATE cabinet_payment_confirmations
         SET status = 'rejected',
             meta = meta || $3::jsonb
         WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
        [
          id,
          user.id,
          JSON.stringify({
            tbankFinalStatus: gs.status,
            tbankFinalMessage: null,
            tbankFinalAt: new Date().toISOString(),
          }),
        ]
      );
      row.status = 'rejected';
    }
  }

  return NextResponse.json({
    status: row.status,
    amountRub: Number(row.amount_rub),
    currency: row.currency,
    providerPaymentId: row.provider_payment_id,
    expiresAt: row.expires_at?.toISOString() ?? null,
  });
}
