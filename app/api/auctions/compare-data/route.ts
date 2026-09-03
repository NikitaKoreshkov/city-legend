import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureCabinetCoreSchema, ensureDatabase } from '@/lib/db';
import { COMPARE_MAX } from '@/lib/compareStorage';
import { pickComparableAuctions, resolveAuctionCategoryId } from '@/lib/compareCategory';

export async function GET(req: NextRequest) {
  try {
    await ensureDatabase();
    await ensureCabinetCoreSchema();
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('ids') || '';
    const ids = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const unique = [...new Set(ids)].slice(0, COMPARE_MAX);
    if (unique.length < 2) {
      return NextResponse.json(
        { error: 'Укажите минимум два товара (ids в query)' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `SELECT a.*,
        c.name AS category_name,
        c.slug AS category_slug,
        col.name AS collection_name,
        rv.avg_rating AS review_avg,
        rv.review_count AS review_count
       FROM auctions a
       LEFT JOIN auction_categories c ON c.id = a.category_id
       LEFT JOIN auction_collections col ON col.id = a.collection_id
       LEFT JOIN (
         SELECT auction_id,
           AVG(rating)::double precision AS avg_rating,
           COUNT(*)::int AS review_count
         FROM cabinet_user_reviews
         WHERE auction_id IS NOT NULL AND admin_hidden_at IS NULL
         GROUP BY auction_id
       ) rv ON rv.auction_id = a.id
       WHERE a.id = ANY($1::int[])`,
      [unique]
    );

    if (result.rows.length !== unique.length) {
      return NextResponse.json({ error: 'Один из товаров не найден' }, { status: 404 });
    }

    const orderIndex = new Map(unique.map((id, i) => [id, i]));
    const rows = [...result.rows].sort(
      (a, b) => (orderIndex.get(a.id as number) ?? 0) - (orderIndex.get(b.id as number) ?? 0)
    ) as Array<Record<string, unknown> & { id: number; category?: string | null }>;

    const categoryIds = await Promise.all(rows.map((row) => resolveAuctionCategoryId(pool, row)));
    const picked = pickComparableAuctions(rows, categoryIds);

    if (picked.rows.length < 2 || picked.categoryId == null) {
      return NextResponse.json(
        {
          error:
            'Сравнивать можно только товары одной категории. Добавьте позиции через «Сравнение» на карточке товара.',
        },
        { status: 400 }
      );
    }

    const categoryId = picked.categoryId;
    const sorted = picked.rows;

    const filtersRes = await pool.query(
      `SELECT id, name, type, sort_order
       FROM filters
       WHERE category_id = $1
       ORDER BY sort_order ASC NULLS LAST, id ASC`,
      [categoryId]
    );

    const warning =
      picked.droppedIds.length > 0
        ? 'Часть товаров скрыта — в сравнении остались позиции одной категории.'
        : null;

    return NextResponse.json({
      categoryName: sorted[0].category_name || sorted[0].category || null,
      categoryId,
      filters: filtersRes.rows as { id: number; name: string; type: string; sort_order: number }[],
      auctions: sorted,
      activeIds: sorted.map((a) => a.id),
      droppedIds: picked.droppedIds,
      warning,
    });
  } catch (e) {
    console.error('compare-data', e);
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 });
  }
}
