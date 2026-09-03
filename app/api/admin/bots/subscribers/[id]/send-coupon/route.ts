import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { sendCouponToSubscriber } from '@/lib/bots/couponDeliver';

type RouteCtx = { params: Promise<{ id: string }> };

const ERROR_RU: Record<string, string> = {
  SUBSCRIBER_NOT_FOUND: 'Подписчик не найден',
  SUBSCRIBER_INACTIVE: 'Подписчик заблокирован — разблокируйте перед отправкой',
  COUPON_NOT_FOUND: 'Купон не найден',
  COUPON_INACTIVE: 'Купон неактивен',
  COUPON_EXPIRED: 'Срок действия купона истёк',
  COUPON_CODE_REQUIRED: 'Укажите код купона',
  COUPON_GENERATE_FAILED: 'Не удалось сгенерировать уникальный код',
};

/** POST — send personal coupon + QR to one subscriber */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const { id: idStr } = await ctx.params;
  const subscriberId = Number(idStr);
  if (!Number.isFinite(subscriberId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: {
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

  const mode = body.mode ?? (body.couponCode ? 'existing' : 'create');

  try {
    const result = await sendCouponToSubscriber({
      subscriberId,
      messageText: body.text,
      mode,
      couponCode: body.couponCode,
      title: body.title,
      discountPercent: body.discountPercent,
      minTotalRub: body.minTotalRub,
      expiryDays: body.expiryDays,
      codePrefix: body.codePrefix ?? 'VIP',
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const key = err instanceof Error ? err.message : '';
    console.error('[Send coupon to subscriber]', err);
    return NextResponse.json(
      { error: ERROR_RU[key] ?? 'Ошибка отправки купона' },
      { status: 400 }
    );
  }
}
