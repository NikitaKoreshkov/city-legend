import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool, { ensureBotCouponSchema } from '@/lib/db';

export async function GET() {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  await ensureBotCouponSchema();
  const res = await pool.query(
    `SELECT id, status, scheduled_at, payload, created_by, created_at, run_id
     FROM bot_scheduled_broadcasts
     ORDER BY scheduled_at DESC
     LIMIT 50`
  );
  return NextResponse.json({ scheduled: res.rows });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id required' }, { status: 422 });
  await ensureBotCouponSchema();
  await pool.query(
    `UPDATE bot_scheduled_broadcasts SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
    [id]
  );
  return NextResponse.json({ ok: true });
}
