import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function POST(request: Request) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { title, subtitle, promo_code, discount_label, active, valid_until, sort_order, details_url } = await request.json();
    if (!title) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 });
    const result = await pool.query(
      `INSERT INTO cabinet_promotions (title, subtitle, promo_code, discount_label, active, valid_until, sort_order, details_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, subtitle || null, promo_code || null, discount_label || null, active !== false, valid_until || null, sort_order ?? 0, details_url || null]
    );
    return NextResponse.json({ success: true, promo: result.rows[0] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { id, title, subtitle, promo_code, discount_label, active, valid_until, sort_order, details_url } = await request.json();
    if (!id || !title) return NextResponse.json({ error: 'ID и название обязательны' }, { status: 400 });
    const result = await pool.query(
      `UPDATE cabinet_promotions SET title=$1, subtitle=$2, promo_code=$3, discount_label=$4, active=$5,
       valid_until=$6, sort_order=$7, details_url=$8 WHERE id=$9 RETURNING *`,
      [title, subtitle || null, promo_code || null, discount_label || null, active !== false, valid_until || null, sort_order ?? 0, details_url || null, id]
    );
    if (!result.rows.length) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
    return NextResponse.json({ success: true, promo: result.rows[0] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });
    await ensureDatabase();
    await pool.query('DELETE FROM cabinet_promotions WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
