import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool, { ensureDatabase } from '@/lib/db';
import {
  getSubscribersByCabinetUserId,
  sendCouponToSubscriber,
  deliverTextToSubscriber,
  type Platform,
} from '@/lib/bots/couponDeliver';

const ERROR_RU: Record<string, string> = {
  SUBSCRIBER_NOT_FOUND: 'Подписчик не найден',
  SUBSCRIBER_INACTIVE: 'Подписчик заблокирован',
  COUPON_NOT_FOUND: 'Купон не найден',
  COUPON_INACTIVE: 'Купон неактивен',
  COUPON_EXPIRED: 'Срок действия купона истёк',
  COUPON_CODE_REQUIRED: 'Укажите код купона',
  COUPON_GENERATE_FAILED: 'Не удалось сгенерировать уникальный код',
  NO_BOT_SUBSCRIBERS: 'Клиент не подписан на бота (Telegram/Max)',
};

/** POST — send coupon from CRM to client's bot subscriptions */
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi('crm.view');
  if (auth instanceof NextResponse) return auth;

  let body: {
    cabinetUserId?: number;
    platform?: 'all' | Platform;
    text?: string;
    mode?: 'existing' | 'create';
    couponCode?: string;
    title?: string;
    discountPercent?: number;
    minTotalRub?: number;
    expiryDays?: number;
    codePrefix?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cabinetUserId = Number(body.cabinetUserId);
  if (!Number.isFinite(cabinetUserId)) {
    return NextResponse.json({ error: 'cabinetUserId обязателен' }, { status: 400 });
  }

  await ensureDatabase();
  const userRow = await pool.query<{ id: number }>(
    `SELECT id FROM cabinet_users WHERE id = $1 LIMIT 1`,
    [cabinetUserId]
  );
  if (userRow.rows.length === 0) {
    return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
  }

  const subscribers = await getSubscribersByCabinetUserId(cabinetUserId);
  if (subscribers.length === 0) {
    return NextResponse.json({ error: ERROR_RU.NO_BOT_SUBSCRIBERS }, { status: 422 });
  }

  const targetPlatform = body.platform ?? 'all';
  const targets =
    targetPlatform === 'all'
      ? subscribers
      : subscribers.filter((s) => s.platform === targetPlatform);

  if (targets.length === 0) {
    return NextResponse.json(
      { error: 'Нет активной подписки на выбранную платформу' },
      { status: 422 }
    );
  }

  const mode = body.mode ?? (body.couponCode ? 'existing' : 'create');
  const messageText =
    body.text?.trim() ||
    `🎁 <b>Персональный купон</b> для вас от City Legend`;

  let sent = 0;
  let failed = 0;
  const results: { subscriberId: number; platform: string; couponCode?: string; error?: string }[] = [];

  for (const sub of targets) {
    try {
      const r = await sendCouponToSubscriber({
        subscriberId: sub.id,
        messageText,
        mode,
        couponCode: body.couponCode,
        title: body.title ?? `CRM — ${sub.first_name || 'клиент'}`,
        discountPercent: body.discountPercent,
        minTotalRub: body.minTotalRub,
        expiryDays: body.expiryDays,
        codePrefix: body.codePrefix ?? 'CRM',
      });
      sent++;
      results.push({ subscriberId: sub.id, platform: sub.platform, couponCode: r.couponCode });
    } catch (err) {
      failed++;
      const key = err instanceof Error ? err.message : '';
      results.push({
        subscriberId: sub.id,
        platform: sub.platform,
        error: ERROR_RU[key] ?? 'Ошибка отправки',
      });
    }
  }

  return NextResponse.json({
    ok: sent > 0,
    sent,
    failed,
    total: targets.length,
    results,
  });
}
