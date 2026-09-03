import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function GET() {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const result = await pool.query(
      'SELECT * FROM cabinet_loyalty_tiers ORDER BY sort_order ASC, id ASC'
    );
    return NextResponse.json({ tiers: result.rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { from_rub, label, percent, sort_order } = await request.json();
    if (from_rub == null || !label || percent == null) {
      return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 });
    }
    const result = await pool.query(
      `INSERT INTO cabinet_loyalty_tiers (from_rub, label, percent, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [from_rub, label, percent, sort_order ?? 0]
    );
    return NextResponse.json({ success: true, tier: result.rows[0] });
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
    const { id, from_rub, label, percent, sort_order } = await request.json();
    if (!id || from_rub == null || !label || percent == null) {
      return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 });
    }
    const result = await pool.query(
      `UPDATE cabinet_loyalty_tiers SET from_rub=$1, label=$2, percent=$3, sort_order=$4 WHERE id=$5 RETURNING *`,
      [from_rub, label, percent, sort_order ?? 0, id]
    );
    if (!result.rows.length) return NextResponse.json({ error: 'Уровень не найден' }, { status: 404 });
    return NextResponse.json({ success: true, tier: result.rows[0] });
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
    await pool.query('DELETE FROM cabinet_loyalty_tiers WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
