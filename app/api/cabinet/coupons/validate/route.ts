import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();
  let body: { code?: string; totalRub?: number };
  try {
    body = (await req.json()) as { code?: string; totalRub?: number };
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }
  const code = String(body.code || '').trim().toUpperCase();
  const totalRub = Number(body.totalRub || 0);
  if (!code) return NextResponse.json({ error: 'Введите купон' }, { status: 400 });

  const res = await pool.query(
    `SELECT code, title, discount_percent, min_total_rub, expires_at, active
     FROM cabinet_coupons
     WHERE UPPER(code) = $1
     LIMIT 1`,
    [code]
  );
  if (res.rows.length === 0) return NextResponse.json({ error: 'Купон не найден' }, { status: 404 });
  const row = res.rows[0] as {
    code: string;
    title: string;
    discount_percent: number;
    min_total_rub: string | number;
    expires_at: Date | null;
    active: boolean;
  };
  if (!row.active) return NextResponse.json({ error: 'Купон неактивен' }, { status: 400 });
  if (row.expires_at && row.expires_at.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Срок действия купона истёк' }, { status: 400 });
  }
  const minTotalRub = Number(row.min_total_rub || 0);
  if (totalRub < minTotalRub) {
    return NextResponse.json(
      { error: `Минимальная сумма для купона: ${new Intl.NumberFormat('ru-RU').format(minTotalRub)} ₽` },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    coupon: {
      code: row.code.toUpperCase(),
      title: row.title,
      discountPercent: row.discount_percent,
      minTotalRub,
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    },
  });
}
