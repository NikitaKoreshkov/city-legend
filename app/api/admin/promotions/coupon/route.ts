import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function POST(request: Request) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { code, title, discount_percent, min_total_rub, expires_at, active } = await request.json();
    if (!code || !title || discount_percent == null) {
      return NextResponse.json({ error: 'Код, название и скидка обязательны' }, { status: 400 });
    }
    const result = await pool.query(
      `INSERT INTO cabinet_coupons (code, title, discount_percent, min_total_rub, expires_at, active)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO UPDATE SET title=$2, discount_percent=$3, min_total_rub=$4, expires_at=$5, active=$6
       RETURNING *`,
      [code.toUpperCase(), title, discount_percent, min_total_rub ?? 0, expires_at || null, active !== false]
    );
    return NextResponse.json({ success: true, coupon: result.rows[0] });
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
    const { id, code, title, discount_percent, min_total_rub, expires_at, active } = await request.json();
    if (!id || !code || !title || discount_percent == null) {
      return NextResponse.json({ error: 'Все обязательные поля должны быть заполнены' }, { status: 400 });
    }
    const result = await pool.query(
      `UPDATE cabinet_coupons SET code=$1, title=$2, discount_percent=$3, min_total_rub=$4, expires_at=$5, active=$6
       WHERE id=$7 RETURNING *`,
      [code.toUpperCase(), title, discount_percent, min_total_rub ?? 0, expires_at || null, active !== false, id]
    );
    if (!result.rows.length) return NextResponse.json({ error: 'Купон не найден' }, { status: 404 });
    return NextResponse.json({ success: true, coupon: result.rows[0] });
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
    await pool.query('DELETE FROM cabinet_coupons WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
