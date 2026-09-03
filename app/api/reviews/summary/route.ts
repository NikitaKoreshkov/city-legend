import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET() {
  try {
    await ensureDatabase();

    let rowsRes;
    try {
      rowsRes = await pool.query(
        `SELECT id, lot_title, review_text, likes_count, dislikes_count, created_at, rating AS raw_rating
         FROM cabinet_user_reviews
         ORDER BY created_at DESC
         LIMIT 400`
      );
    } catch {
      rowsRes = await pool.query(
        `SELECT id, lot_title, review_text, likes_count, dislikes_count, created_at, NULL::int AS raw_rating
         FROM cabinet_user_reviews
         ORDER BY created_at DESC
         LIMIT 400`
      );
    }

    const rows = rowsRes.rows as {
      id: number;
      lot_title: string;
      review_text: string;
      likes_count: number;
      dislikes_count: number;
      created_at: Date;
      raw_rating: number | null;
    }[];

    const normalized = rows.map((r) => {
      const fromReactions = 4 + (Number(r.likes_count || 0) - Number(r.dislikes_count || 0)) / 10;
      const rating = clamp(Math.round(r.raw_rating ?? fromReactions), 1, 5);
      return {
        id: r.id,
        lotTitle: r.lot_title,
        text: r.review_text,
        rating,
        createdAt: r.created_at.toISOString(),
      };
    });

    const totalReviews = normalized.length;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    let sum = 0;
    for (const r of normalized) {
      sum += r.rating;
      dist[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
    }
    const averageRating = totalReviews > 0 ? Number((sum / totalReviews).toFixed(1)) : 0;
    const latest = normalized.slice(0, 6);

    return NextResponse.json({
      averageRating,
      totalReviews,
      distribution: dist,
      latest,
    });
  } catch (error) {
    console.error('reviews/summary', error);
    return NextResponse.json({ error: 'Ошибка загрузки отзывов' }, { status: 500 });
  }
}
