import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool from '@/lib/db';
import { deliverTextToSubscriber, getSubscriberById, getSiteUrl } from '@/lib/bots/couponDeliver';
import type { Platform } from '@/lib/bots/register';
import { applyBroadcastTemplate } from '@/lib/bots/templateVars';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: { auctionId?: number; text?: string; sendToAllPlatforms?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const auctionId = Number(body.auctionId);
  if (!Number.isFinite(auctionId)) return NextResponse.json({ error: 'auctionId required' }, { status: 422 });

  const sub = await getSubscriberById(id);
  if (!sub) return NextResponse.json({ error: 'Подписчик не найден' }, { status: 404 });
  if (!sub.is_active) return NextResponse.json({ error: 'Подписчик заблокирован' }, { status: 400 });

  const lot = await pool.query<{ name: string; starting_price: string }>(
    `SELECT name, starting_price FROM auctions WHERE id = $1 LIMIT 1`,
    [auctionId]
  );
  if (lot.rows.length === 0) return NextResponse.json({ error: 'Лот не найден' }, { status: 404 });

  const lotRow = lot.rows[0];
  const url = `${getSiteUrl()}/collection/${auctionId}`;
  const defaultText = `✨ <b>{имя}</b>, рекомендуем лот:\n<b>${lotRow.name}</b>\nот ${lotRow.starting_price} ₽\n\n🔗 <a href="${url}">Открыть на сайте</a>`;

  let targets: Array<{ id: number; platform: Platform; platform_user_id: string; first_name: string }> = [
    {
      id: sub.id,
      platform: sub.platform as Platform,
      platform_user_id: sub.platform_user_id,
      first_name: sub.first_name,
    },
  ];

  if (body.sendToAllPlatforms !== false && sub.phone_key) {
    const sibs = await pool.query<{
      id: number;
      platform: Platform;
      platform_user_id: string;
      first_name: string;
      is_active: boolean;
    }>(
      `SELECT id, platform, platform_user_id, first_name, is_active
       FROM bot_subscribers WHERE phone_key = $1 AND is_active = TRUE`,
      [sub.phone_key]
    );
    if (sibs.rows.length > 0) {
      targets = sibs.rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        platform_user_id: r.platform_user_id,
        first_name: r.first_name,
      }));
    }
  }

  const errors: string[] = [];
  let sentCount = 0;

  for (const t of targets) {
    const text = applyBroadcastTemplate(body.text?.trim() || defaultText, {
      firstName: t.first_name,
      phone: sub.phone,
    });
    try {
      await deliverTextToSubscriber({
        platform: t.platform,
        platformUserId: t.platform_user_id,
        text,
      });
      sentCount++;
    } catch (err) {
      errors.push(`${t.platform}: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
    }
  }

  if (sentCount === 0) {
    return NextResponse.json({ error: errors[0] ?? 'Ошибка отправки' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    url,
    sentCount,
    errors: errors.length ? errors : undefined,
  });
}
