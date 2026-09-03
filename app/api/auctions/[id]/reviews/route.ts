import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const auctionId = Number(id);
    if (!Number.isFinite(auctionId) || auctionId <= 0) {
      return NextResponse.json({ error: 'Некорректный id' }, { status: 400 });
    }

    let rowsRes;
    try {
      rowsRes = await pool.query(
        `SELECT id, lot_title, review_text, likes_count, dislikes_count, created_at, rating
         FROM cabinet_user_reviews
         WHERE auction_id = $1
         ORDER BY created_at DESC
         LIMIT 120`,
        [auctionId]
      );
    } catch {
      rowsRes = await pool.query(
        `SELECT id, lot_title, review_text, likes_count, dislikes_count, created_at, NULL::int AS rating
         FROM cabinet_user_reviews
         WHERE auction_id = $1
         ORDER BY created_at DESC
         LIMIT 120`,
        [auctionId]
      );
    }

    const rows = rowsRes.rows as Array<{
      id: number;
      lot_title: string;
      review_text: string;
      likes_count: number;
      dislikes_count: number;
      created_at: Date;
      rating: number | null;
    }>;

    const reviews = rows.map((r) => {
      const inferred = 4 + (Number(r.likes_count || 0) - Number(r.dislikes_count || 0)) / 10;
      const stars = clamp(Math.round(r.rating ?? inferred), 1, 5);
      return {
        id: r.id,
        lotTitle: r.lot_title,
        text: r.review_text,
        rating: stars,
        createdAt: r.created_at.toISOString(),
      };
    });

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    let sum = 0;
    for (const r of reviews) {
      sum += r.rating;
      distribution[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
    }

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 ? Number((sum / totalReviews).toFixed(1)) : 0;

    return NextResponse.json({
      averageRating,
      totalReviews,
      distribution,
      reviews,
    });
  } catch (error) {
    console.error('auctions/[id]/reviews', error);
    return NextResponse.json({ error: 'Ошибка загрузки отзывов' }, { status: 500 });
  }
}
