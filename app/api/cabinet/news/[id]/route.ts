import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { estimateReadingMinutes } from '@/lib/blogReadingTime';

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
    `SELECT id, title, excerpt, image_url, created_at,
            COALESCE(NULLIF(TRIM(category), ''), 'Бутик') AS category,
            COALESCE(body, '') AS body
     FROM cabinet_site_news
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  if (res.rows.length === 0) return NextResponse.json({ error: 'Новость не найдена' }, { status: 404 });

  const row = res.rows[0] as {
    id: number;
    title: string;
    excerpt: string;
    image_url: string | null;
    created_at: Date;
    category: string;
    body: string;
  };
  return NextResponse.json({
    news: {
      id: row.id,
      title: row.title,
      excerpt: row.excerpt,
      category: row.category,
      body: row.body,
      imageUrl: row.image_url,
      createdAt: row.created_at.toISOString(),
      readingMinutes: estimateReadingMinutes(`${row.excerpt}\n${row.body}`),
    },
  });
}
