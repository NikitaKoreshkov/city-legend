import { NextRequest, NextResponse } from 'next/server';
import { handleMaxBotEvent } from '@/lib/bots/cityLegendMaxBot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-max-bot-api-secret');
  const expectedSecret = process.env.MAX_WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.MAX_BOT_TOKEN?.trim()) {
    return NextResponse.json({ ok: true });
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    await handleMaxBotEvent(raw);
  } catch (err) {
    const cause =
      err && typeof err === 'object' && 'cause' in err
        ? (err as { cause?: unknown }).cause
        : undefined;
    console.error('[Max Webhook] Error handling update:', err);
    if (cause) console.error('[Max Webhook] cause:', cause);
  }

  return NextResponse.json({ ok: true });
}
