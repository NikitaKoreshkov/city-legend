import { NextRequest, NextResponse } from 'next/server';
import { processScheduledBroadcasts } from '@/lib/bots/broadcastEngine';
import { runBotTriggers } from '@/lib/bots/triggers';

/** Cron: scheduled broadcasts + trigger messages. Auth: ?secret=BOT_CRON_SECRET */
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') ?? req.headers.get('x-bot-cron-secret');
  const expected = process.env.BOT_CRON_SECRET?.trim();
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const scheduled = await processScheduledBroadcasts();
    const triggers = await runBotTriggers();
    return NextResponse.json({ ok: true, scheduled, triggers });
  } catch (err) {
    console.error('[Bot cron]', err);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
