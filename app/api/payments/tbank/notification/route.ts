import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { tbankVerifyToken } from '@/lib/tbankAcquiring';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Уведомление T-Bank / Tinkoff о статусе платежа (внешний callback, без cookie).
 */
export async function POST(req: NextRequest) {
  const password = process.env.TBANK_PASSWORD?.trim();
  const terminalKey = process.env.TBANK_TERMINAL_KEY?.trim();
  if (!password || !terminalKey) {
    return NextResponse.json({ Error: 'Payments not configured' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ Error: 'Invalid JSON' }, { status: 400 });
  }

  if (String(body.TerminalKey ?? '') !== terminalKey) {
    return NextResponse.json({ Error: 'Terminal' }, { status: 403 });
  }

  const token = typeof body.Token === 'string' ? body.Token : undefined;
  if (!tbankVerifyToken(body, password, token)) {
    return NextResponse.json({ Error: 'Invalid token' }, { status: 403 });
  }

  const paymentId = body.PaymentId != null ? String(body.PaymentId) : '';
  const status = String(body.Status ?? '');
  const webhookMeta = {
    tbankWebhookAt: new Date().toISOString(),
    tbankWebhookStatus: status || null,
    tbankWebhookErrorCode:
      body.ErrorCode != null && String(body.ErrorCode).trim() ? String(body.ErrorCode) : null,
    tbankWebhookMessage:
      body.Message != null && String(body.Message).trim() ? String(body.Message) : null,
    tbankWebhookSuccess:
      typeof body.Success === 'boolean'
        ? body.Success
        : String(body.Success ?? '').toLowerCase() === 'true',
    tbankWebhookPaymentId: paymentId || null,
    tbankWebhookTerminalKey:
      body.TerminalKey != null && String(body.TerminalKey).trim()
        ? String(body.TerminalKey)
        : null,
  };

  if (!paymentId) {
    return NextResponse.json({ Error: 'No PaymentId' }, { status: 400 });
  }

  await ensureDatabase();
  await pool.query(
    `UPDATE cabinet_payment_confirmations
     SET meta = meta || $2::jsonb
     WHERE provider_payment_id = $1`,
    [paymentId, JSON.stringify(webhookMeta)]
  );

  const FINAL_FAIL = new Set(['REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'AUTH_FAIL', 'PARTIAL_REJECTED']);

  if (status === 'CONFIRMED') {
    await pool.query(
      `UPDATE cabinet_payment_confirmations
       SET status = 'confirmed',
           confirmed_at = COALESCE(confirmed_at, CURRENT_TIMESTAMP),
           meta = meta || $2::jsonb
       WHERE provider_payment_id = $1 AND status = 'pending'`,
      [paymentId, JSON.stringify({ tbankNotifiedAt: new Date().toISOString() })]
    );
  } else if (FINAL_FAIL.has(status)) {
    await pool.query(
      `UPDATE cabinet_payment_confirmations
       SET status = 'rejected',
           meta = meta || $2::jsonb
       WHERE provider_payment_id = $1 AND status = 'pending'`,
      [paymentId, JSON.stringify({ tbankNotifiedAt: new Date().toISOString() })]
    );
  }

  // Tinkoff / T-Bank ожидают HTTP 200 и тело «OK»
  return new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
