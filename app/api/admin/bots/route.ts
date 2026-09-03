import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool, { ensureDatabase } from '@/lib/db';
import {
  deliverCouponToSubscriber,
  deliverTextToSubscriber,
  recordCouponSend,
  resolveCouponForDelivery,
  saveCouponQrPublic,
} from '@/lib/bots/couponDeliver';
import type { Platform } from '@/lib/bots/register';

async function listSubscribers(includeInactive: boolean) {
  await ensureDatabase();
  const result = await pool.query<{
    id: number;
    platform: string;
    platform_user_id: string;
    first_name: string;
    phone: string;
    cabinet_user_id: number | null;
    is_active: boolean;
    registered_at: string;
  }>(
    includeInactive
      ? `SELECT id, platform, platform_user_id, first_name, phone, cabinet_user_id, is_active, registered_at
         FROM bot_subscribers ORDER BY registered_at DESC`
      : `SELECT id, platform, platform_user_id, first_name, phone, cabinet_user_id, is_active, registered_at
         FROM bot_subscribers WHERE is_active = TRUE ORDER BY registered_at DESC`
  );
  return result.rows;
}

// GET /api/admin/bots — list subscribers (?includeInactive=1)
export async function GET(req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  try {
    const includeInactive = req.nextUrl.searchParams.get('includeInactive') === '1';
    const subscribers = await listSubscribers(includeInactive);

    const withCoupons = await Promise.all(
      subscribers.map(async (sub) => {
        const row = await pool.query<{ coupon_code: string }>(
          `SELECT coupon_code FROM bot_coupon_sends
           WHERE subscriber_id = $1
           ORDER BY sent_at DESC LIMIT 1`,
          [sub.id]
        );
        return { ...sub, last_coupon: row.rows[0]?.coupon_code ?? null };
      })
    );

    return NextResponse.json({ subscribers: withCoupons });
  } catch (err) {
    console.error('[Admin Bots GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

interface BroadcastBody {
  text: string;
  sendCoupon?: boolean;
  platform?: 'telegram' | 'max' | 'all';
  /** create = unique code per subscriber; existing = same manual coupon for all */
  couponMode?: 'create' | 'existing';
  couponCode?: string;
  couponDiscountPercent?: number;
  couponExpiryDays?: number;
  couponMinTotalRub?: number;
  couponTitle?: string;
  couponPrefix?: string;
}

// POST /api/admin/bots — broadcast message (+ optional coupon)
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  let body: BroadcastBody;
  try {
    body = (await req.json()) as BroadcastBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 422 });
  }

  const targetPlatform = body.platform ?? 'all';
  await ensureDatabase();

  const includeInactive = false;
  const all = await listSubscribers(includeInactive);
  const subscribers = all.filter(
    (s) => targetPlatform === 'all' || s.platform === targetPlatform
  );

  let sent = 0;
  let failed = 0;

  /** For existing coupon mode — resolve once for entire broadcast */
  let sharedCoupon: { couponId: number; code: string; discountPercent: number } | null = null;
  if (body.sendCoupon && (body.couponMode ?? 'create') === 'existing') {
    try {
      sharedCoupon = await resolveCouponForDelivery({
        mode: 'existing',
        couponCode: body.couponCode,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'COUPON_ERROR';
      return NextResponse.json({ error: msg }, { status: 422 });
    }
  }

  for (const sub of subscribers) {
    try {
      if (body.sendCoupon) {
        const mode = body.couponMode ?? 'create';
        let couponId: number;
        let couponCode: string;
        let discountPercent: number;

        if (mode === 'existing' && sharedCoupon) {
          couponId = sharedCoupon.couponId;
          couponCode = sharedCoupon.code;
          discountPercent = sharedCoupon.discountPercent;
        } else {
          const created = await resolveCouponForDelivery({
            mode: 'create',
            title: body.couponTitle ?? 'Купон рассылки',
            discountPercent: body.couponDiscountPercent ?? 10,
            minTotalRub: body.couponMinTotalRub ?? 0,
            expiryDays: body.couponExpiryDays ?? 30,
            codePrefix: body.couponPrefix ?? 'PROMO',
          });
          couponId = created.couponId;
          couponCode = created.code;
          discountPercent = created.discountPercent;
        }

        const { buffer } = await saveCouponQrPublic(couponCode);

        await deliverCouponToSubscriber({
          platform: sub.platform as Platform,
          platformUserId: sub.platform_user_id,
          couponCode,
          messageText: body.text,
          discountPercent,
          qrBuffer: buffer,
        });

        await recordCouponSend(sub.id, couponId, couponCode);
      } else {
        await deliverTextToSubscriber({
          platform: sub.platform as Platform,
          platformUserId: sub.platform_user_id,
          text: body.text,
        });
      }
      sent++;
    } catch (err) {
      console.error(`[Broadcast] Failed to send to ${sub.platform}:${sub.platform_user_id}`, err);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, total: subscribers.length });
}
