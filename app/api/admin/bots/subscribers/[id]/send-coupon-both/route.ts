import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool from '@/lib/db';
import { sendCouponToSubscriber, type SendCouponToSubscriberInput } from '@/lib/bots/couponDeliver';

type RouteCtx = { params: Promise<{ id: string }> };

/** POST — send coupon to this subscriber + siblings on other platform (same phone) */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: Omit<SendCouponToSubscriberInput, 'subscriberId'>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const primary = await pool.query<{ phone_key: string | null }>(
    `SELECT phone_key FROM bot_subscribers WHERE id = $1`,
    [id]
  );
  if (primary.rows.length === 0) {
    return NextResponse.json({ error: 'Подписчик не найден' }, { status: 404 });
  }

  const ids = [id];
  const phoneKey = primary.rows[0].phone_key;
  if (phoneKey) {
    const sibs = await pool.query<{ id: number }>(
      `SELECT id FROM bot_subscribers WHERE phone_key = $1 AND is_active = TRUE`,
      [phoneKey]
    );
    for (const row of sibs.rows) {
      if (!ids.includes(row.id)) ids.push(row.id);
    }
  }

  const results: Array<{ subscriberId: number; ok: boolean; couponCode?: string; error?: string }> = [];
  let sharedCode: string | undefined;

  for (const subscriberId of ids) {
    try {
      const input: SendCouponToSubscriberInput = {
        subscriberId,
        ...body,
        mode: body.mode ?? 'create',
        ...(sharedCode && body.mode !== 'create' ? { couponCode: sharedCode, mode: 'existing' as const } : {}),
      };
      if (subscriberId !== id && body.mode === 'create' && sharedCode) {
        input.mode = 'existing';
        input.couponCode = sharedCode;
      }
      const r = await sendCouponToSubscriber(input);
      if (!sharedCode) sharedCode = r.couponCode;
      results.push({ subscriberId, ok: true, couponCode: r.couponCode });
    } catch (err) {
      results.push({
        subscriberId,
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 200) : 'error',
      });
    }
  }

  const ok = results.some((r) => r.ok);
  return NextResponse.json({ ok, results, couponCode: sharedCode });
}
