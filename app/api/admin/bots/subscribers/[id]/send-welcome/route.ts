import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool from '@/lib/db';
import {
  deliverCouponToSubscriber,
  getSubscriberById,
  recordCouponSend,
  resolveCouponForDelivery,
  saveCouponQrPublic,
} from '@/lib/bots/couponDeliver';
import type { Platform } from '@/lib/bots/register';

type RouteCtx = { params: Promise<{ id: string }> };

/** POST — resend welcome-style coupon (admin bypasses bot 24h QR quota) */
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const sub = await getSubscriberById(id);
  if (!sub) return NextResponse.json({ error: 'Подписчик не найден' }, { status: 404 });
  if (!sub.is_active) return NextResponse.json({ error: 'Подписчик заблокирован' }, { status: 400 });

  try {
    const resolved = await resolveCouponForDelivery({
      mode: 'create',
      title: 'Welcome купон',
      discountPercent: 10,
      expiryDays: 90,
      codePrefix: 'BOT',
    });
    const { buffer } = await saveCouponQrPublic(resolved.code);
    const messageText = `🎉 <b>${sub.first_name || 'друг'}</b>, ваш welcome-купон на скидку <b>${resolved.discountPercent}%</b>`;

    await deliverCouponToSubscriber({
      platform: sub.platform as Platform,
      platformUserId: sub.platform_user_id,
      couponCode: resolved.code,
      messageText,
      discountPercent: resolved.discountPercent,
      qrBuffer: buffer,
    });
    await recordCouponSend(sub.id, resolved.couponId, resolved.code);
    await pool.query(`UPDATE bot_subscribers SET last_qr_sent_at = NOW() WHERE id = $1`, [sub.id]);

    return NextResponse.json({ ok: true, couponCode: resolved.code });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка';
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 400 });
  }
}
