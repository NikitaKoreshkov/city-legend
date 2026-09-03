import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function GET() {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const [promos, coupons] = await Promise.all([
      pool.query('SELECT * FROM cabinet_promotions ORDER BY sort_order ASC, id ASC'),
      pool.query('SELECT * FROM cabinet_coupons ORDER BY id ASC'),
    ]);
    return NextResponse.json({ promotions: promos.rows, coupons: coupons.rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
