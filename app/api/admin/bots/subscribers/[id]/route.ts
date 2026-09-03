import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool, { ensureBotCouponSchema } from '@/lib/db';
import { getSubscriberDetail, linkSubscriberToCabinet } from '@/lib/bots/subscribersAdmin';
import { getSubscriberById } from '@/lib/bots/couponDeliver';

type RouteCtx = { params: Promise<{ id: string }> };

/** GET — subscriber card */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const detail = await getSubscriberDetail(id);
    if (!detail) return NextResponse.json({ error: 'Подписчик не найден' }, { status: 404 });
    return NextResponse.json({ subscriber: detail });
  } catch (err) {
    console.error('[Subscriber GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** PATCH — block, notes, vip, link cabinet */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  let body: {
    is_active?: boolean;
    manager_notes?: string;
    is_vip?: boolean;
    cabinet_user_id?: number | null;
    link_cabinet_email?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  await ensureBotCouponSchema();
  const sub = await getSubscriberById(id);
  if (!sub) return NextResponse.json({ error: 'Подписчик не найден' }, { status: 404 });

  if (typeof body.is_active === 'boolean') {
    await pool.query(`UPDATE bot_subscribers SET is_active = $1 WHERE id = $2`, [body.is_active, id]);
  }
  if (body.manager_notes !== undefined) {
    await pool.query(`UPDATE bot_subscribers SET manager_notes = $1 WHERE id = $2`, [
      body.manager_notes.slice(0, 4000),
      id,
    ]);
  }
  if (typeof body.is_vip === 'boolean') {
    await pool.query(`UPDATE bot_subscribers SET is_vip = $1 WHERE id = $2`, [body.is_vip, id]);
  }
  if (body.cabinet_user_id === null) {
    await pool.query(`UPDATE bot_subscribers SET cabinet_user_id = NULL WHERE id = $1`, [id]);
  } else if (typeof body.cabinet_user_id === 'number') {
    await linkSubscriberToCabinet(id, body.cabinet_user_id);
  } else if (body.link_cabinet_email?.trim()) {
    const u = await pool.query<{ id: number }>(
      `SELECT id FROM cabinet_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [body.link_cabinet_email.trim()]
    );
    if (u.rows.length === 0) {
      return NextResponse.json({ error: 'Аккаунт с таким email не найден' }, { status: 404 });
    }
    await linkSubscriberToCabinet(id, u.rows[0].id);
  }

  const detail = await getSubscriberDetail(id);
  return NextResponse.json({ ok: true, subscriber: detail });
}

/** DELETE — remove subscriber */
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  await ensureBotCouponSchema();
  const sub = await getSubscriberById(id);
  if (!sub) return NextResponse.json({ error: 'Подписчик не найден' }, { status: 404 });

  await pool.query(`DELETE FROM bot_subscribers WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true, id });
}
