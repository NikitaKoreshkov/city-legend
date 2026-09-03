import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureCabinetCoreSchema, ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function GET() {
  const auth = await requireAdminApi('orders.view');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();
  await ensureCabinetCoreSchema();
  const r = await pool.query(
    `SELECT r.id, r.user_id, u.email AS user_email, r.order_id, r.order_item_id, r.auction_id,
            r.lot_title, r.review_text, r.rating, r.likes_count, r.dislikes_count,
            r.created_at, r.admin_hidden_at, r.admin_hidden_reason
     FROM cabinet_user_reviews r
     LEFT JOIN cabinet_users u ON u.id = r.user_id
     ORDER BY r.created_at DESC
     LIMIT 500`
  );
  return NextResponse.json({
    reviews: r.rows.map((row) => ({
      ...row,
      created_at: row.created_at ? new Date(row.created_at as Date).toISOString() : null,
      admin_hidden_at: row.admin_hidden_at ? new Date(row.admin_hidden_at as Date).toISOString() : null,
    })),
  });
}

/** Скрыть отзыв с витрины (soft). */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdminApi('orders.view');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();
  await ensureCabinetCoreSchema();
  let body: { id?: number; hidden?: boolean; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Неверный JSON' }, { status: 400 });
  }
  const id = Number(body.id || 0);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Некорректный id' }, { status: 400 });
  const hide = Boolean(body.hidden);
  const reason =
    typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  if (hide) {
    await pool.query(
      `UPDATE cabinet_user_reviews SET admin_hidden_at = CURRENT_TIMESTAMP, admin_hidden_reason = $2 WHERE id = $1`,
      [id, reason || null]
    );
  } else {
    await pool.query(
      `UPDATE cabinet_user_reviews SET admin_hidden_at = NULL, admin_hidden_reason = NULL WHERE id = $1`,
      [id]
    );
  }
  return NextResponse.json({ ok: true });
}

/** Полное удаление отзыва и ответов бутика. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminApi('orders.view');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();
  await ensureCabinetCoreSchema();
  let id = 0;
  try {
    const url = new URL(req.url);
    id = Number(url.searchParams.get('id') || 0);
  } catch {
    /* */
  }
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Укажите id' }, { status: 400 });
  await pool.query(`DELETE FROM cabinet_user_reviews WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
