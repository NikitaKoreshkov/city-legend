import type { Pool } from 'pg';

export function normalizeCategoryId(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** category_id из FK или legacy-поля auctions.category → id из auction_categories. */
export async function resolveAuctionCategoryId(
  pool: Pool,
  row: { category_id?: unknown; category?: unknown }
): Promise<number | null> {
  const direct = normalizeCategoryId(row.category_id);
  if (direct != null) return direct;

  const legacy = String(row.category ?? '').trim();
  if (!legacy) return null;

  const r = await pool.query<{ id: number }>(
    `SELECT id FROM auction_categories
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
        OR slug = $1
        OR LOWER(TRIM(slug)) = LOWER(TRIM($1))
     ORDER BY id ASC
     LIMIT 1`,
    [legacy]
  );
  return normalizeCategoryId(r.rows[0]?.id);
}

export function pickComparableAuctions<T extends { id: number }>(
  rows: T[],
  categoryIds: (number | null)[]
): { rows: T[]; categoryId: number | null; droppedIds: number[] } {
  if (rows.length !== categoryIds.length) {
    return { rows: [], categoryId: null, droppedIds: rows.map((r) => r.id) };
  }

  const pairs = rows.map((row, i) => ({ row, catId: categoryIds[i] }));
  const withCat = pairs.filter((p): p is { row: T; catId: number } => p.catId != null);

  if (withCat.length < 2) {
    return { rows: [], categoryId: null, droppedIds: rows.map((r) => r.id) };
  }

  const groups = new Map<number, T[]>();
  for (const { row, catId } of withCat) {
    const list = groups.get(catId) ?? [];
    list.push(row);
    groups.set(catId, list);
  }

  let bestCat: number | null = null;
  let bestRows: T[] = [];
  for (const [catId, list] of groups) {
    if (list.length > bestRows.length) {
      bestCat = catId;
      bestRows = list;
    }
  }

  if (bestRows.length < 2 || bestCat == null) {
    return { rows: [], categoryId: null, droppedIds: rows.map((r) => r.id) };
  }

  const keptIds = new Set(bestRows.map((r) => r.id));
  return {
    rows: bestRows,
    categoryId: bestCat,
    droppedIds: rows.filter((r) => !keptIds.has(r.id)).map((r) => r.id),
  };
}
