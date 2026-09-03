import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { applyCdekWebhookToOrder, parseCdekWebhookBody } from '@/lib/cdekWebhookApply';

export const dynamic = 'force-dynamic';

function verifyWebhookSecret(req: NextRequest): boolean {
  const secret = process.env.CDEK_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const h =
    req.headers.get('x-webhook-secret') ||
    req.headers.get('x-api-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    '';
  return h === secret;
}

/**
 * Вебхук статусов СДЭК. Укажите URL в ЛК СДЭК:
 * {NEXT_PUBLIC_SITE_URL}/api/webhooks/cdek
 * Опционально задайте CDEK_WEBHOOK_SECRET и передайте тот же токен в заголовке X-Webhook-Secret или Authorization: Bearer …
 */
export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : [body];
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    const parsed = parseCdekWebhookBody(item);
    if (!parsed || (!parsed.orderUuid && !parsed.cdekNumber && !parsed.statusCode)) {
      skipped++;
      continue;
    }
    const r = await applyCdekWebhookToOrder(pool, parsed);
    if (r.ok) processed++;
    else if (r.reason === 'empty_payload') skipped++;
    else {
      skipped++;
      if (r.reason === 'order_not_found') errors.push('order_not_found');
    }
  }

  return NextResponse.json({ ok: true, processed, skipped, errors: errors.slice(0, 5) });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'cdek-webhook' });
}
