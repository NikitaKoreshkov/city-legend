import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool, { ensureBotCouponSchema } from '@/lib/db';

export async function GET() {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  await ensureBotCouponSchema();
  const res = await pool.query(
    `SELECT id, title, body, created_at, updated_at FROM bot_broadcast_templates ORDER BY id`
  );
  return NextResponse.json({ templates: res.rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  let body: { title?: string; body?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.title?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'title and body required' }, { status: 422 });
  }
  await ensureBotCouponSchema();
  const ins = await pool.query(
    `INSERT INTO bot_broadcast_templates (title, body) VALUES ($1, $2) RETURNING *`,
    [body.title.trim(), body.body.trim()]
  );
  return NextResponse.json({ template: ins.rows[0] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  let body: { id?: number; title?: string; body?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 422 });
  await ensureBotCouponSchema();
  await pool.query(
    `UPDATE bot_broadcast_templates SET title = COALESCE($1, title), body = COALESCE($2, body), updated_at = NOW() WHERE id = $3`,
    [body.title?.trim() ?? null, body.body?.trim() ?? null, body.id]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id required' }, { status: 422 });
  await ensureBotCouponSchema();
  await pool.query(`DELETE FROM bot_broadcast_templates WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
