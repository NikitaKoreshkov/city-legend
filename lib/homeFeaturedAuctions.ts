import pool, { ensureDatabase } from '@/lib/db';

/** Те же правила сортировки, что в GET /api/auctions?featured=true (для SSR главной без лишнего round-trip). */
export async function getFeaturedAuctionsForHome(limit = 4) {
  try {
    await ensureDatabase();
    const result = await pool.query(
      `SELECT a.*,
        rv.avg_rating AS review_avg,
        rv.review_count AS review_count
      FROM auctions a
      LEFT JOIN (
        SELECT auction_id,
          AVG(rating)::double precision AS avg_rating,
          COUNT(*)::int AS review_count
        FROM cabinet_user_reviews
        WHERE auction_id IS NOT NULL
        GROUP BY auction_id
      ) rv ON rv.auction_id = a.id
      WHERE a.is_featured = true
      ORDER BY COALESCE(rv.avg_rating, 0) DESC,
               COALESCE(rv.review_count, 0) DESC,
               a.id ASC
      LIMIT $1 OFFSET 0`,
      [limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}
