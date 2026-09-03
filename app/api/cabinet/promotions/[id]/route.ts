import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  const params = await ctx.params;
  const id = Number(params.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Некорректный id' }, { status: 400 });
  }

  await ensureDatabase();
  const res = await pool.query(
    `SELECT id, title, subtitle, promo_code, discount_label, valid_until
     FROM cabinet_promotions
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  if (res.rows.length === 0) return NextResponse.json({ error: 'Акция не найдена' }, { status: 404 });

  const row = res.rows[0] as {
    id: number;
    title: string;
    subtitle: string | null;
    promo_code: string | null;
    discount_label: string | null;
    valid_until: Date | null;
  };
  return NextResponse.json({
    promotion: {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      code: row.promo_code,
      discountLabel: row.discount_label,
      validUntil: row.valid_until ? row.valid_until.toISOString().slice(0, 10) : null,
    },
  });
}
