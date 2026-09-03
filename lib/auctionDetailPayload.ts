import pool, { ensureDatabase } from '@/lib/db';

export type AuctionDetailPayload = {
  auction: Record<string, unknown>;
  relatedAuctions: Record<string, unknown>[];
  collection: { id: number; name: string; slug: string } | null;
  category: { id: number; name: string; slug: string } | null;
};

/** Одна точка загрузки лота для API и SSR страницы лота (включая compare_at_price). */
export async function getAuctionDetailPayload(auctionId: number): Promise<AuctionDetailPayload | null> {
  if (!Number.isFinite(auctionId) || auctionId < 1) return null;

  await ensureDatabase();

  const result = await pool.query('SELECT * FROM auctions WHERE id = $1', [auctionId]);
  if (result.rows.length === 0) return null;

  const auction = result.rows[0] as Record<string, unknown>;

  let category: { id: number; name: string; slug: string } | null = null;
  const catId = auction.category_id as number | null | undefined;
  if (catId != null) {
    const catRes = await pool.query(
      'SELECT id, name, slug FROM auction_categories WHERE id = $1',
      [catId]
    );
    if (catRes.rows.length > 0) {
      category = catRes.rows[0] as { id: number; name: string; slug: string };
    }
  }

  let relatedAuctions: Record<string, unknown>[] = [];
  let collection: { id: number; name: string; slug: string } | null = null;
  const colId = auction.collection_id as number | null | undefined;
  if (colId != null) {
    const colRes = await pool.query(
      'SELECT id, name, slug FROM auction_collections WHERE id = $1',
      [colId]
    );
    if (colRes.rows.length > 0) {
      collection = colRes.rows[0] as { id: number; name: string; slug: string };
      const relatedResult = await pool.query(
        `SELECT * FROM auctions
         WHERE collection_id = $1 AND id != $2
         ORDER BY id ASC
         LIMIT 16`,
        [colId, auctionId]
      );
      relatedAuctions = relatedResult.rows as Record<string, unknown>[];
    }
  }

  return { auction, relatedAuctions, collection, category };
}

/** Для передачи в Client Component из Server Component (Date → string). */
export function serializeAuctionDetailPayload(payload: AuctionDetailPayload): AuctionDetailPayload {
  return JSON.parse(JSON.stringify(payload)) as AuctionDetailPayload;
}
