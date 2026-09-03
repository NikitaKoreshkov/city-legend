import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { deliverTextToSubscriber } from '@/lib/bots/couponDeliver';
import { getSubscriberById } from '@/lib/bots/couponDeliver';
import type { Platform } from '@/lib/bots/register';
import { applyBroadcastTemplate } from '@/lib/bots/templateVars';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: { text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: 'Укажите текст сообщения' }, { status: 422 });

  const sub = await getSubscriberById(id);
  if (!sub) return NextResponse.json({ error: 'Подписчик не найден' }, { status: 404 });
  if (!sub.is_active) return NextResponse.json({ error: 'Подписчик заблокирован' }, { status: 400 });

  const personalized = applyBroadcastTemplate(text, { firstName: sub.first_name, phone: sub.phone });

  try {
    await deliverTextToSubscriber({
      platform: sub.platform as Platform,
      platformUserId: sub.platform_user_id,
      text: personalized,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка отправки';
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 400 });
  }
}
