import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const auctionId = parseInt(id, 10);
    if (!Number.isFinite(auctionId) || auctionId < 1) {
      return NextResponse.json({ error: 'Некорректный id' }, { status: 400 });
    }

    const base = await pool.query(
      `SELECT a.id, a.category_id,
        c.name AS category_name, c.slug AS category_slug
       FROM auctions a
       LEFT JOIN auction_categories c ON c.id = a.category_id
       WHERE a.id = $1`,
      [auctionId]
    );
    if (base.rows.length === 0) {
      return NextResponse.json({ error: 'Лот не найден' }, { status: 404 });
    }

    const row = base.rows[0] as {
      category_id: number | null;
      category_name: string | null;
      category_slug: string | null;
    };

    if (row.category_id == null) {
      return NextResponse.json({
        category: null,
        candidates: [],
        message: 'У этого товара не указана категория — сравнение по типу недоступно.',
      });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const sortBy = searchParams.get('sortBy') || 'relevance';
    const limit = Math.min(120, Math.max(1, parseInt(searchParams.get('limit') || '80', 10) || 80));

    const params: unknown[] = [row.category_id, auctionId];
    let p = 3;
    let searchSql = '';
    if (q.length > 0) {
      const like = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      params.push(like, like);
      searchSql = ` AND (a.name ILIKE $${p} OR COALESCE(a.additional_info, '') ILIKE $${p + 1})`;
      p += 2;
    }

    let orderSql = `ORDER BY COALESCE(rv.avg_rating, 0) DESC, COALESCE(rv.review_count, 0) DESC, a.id ASC`;
    if (sortBy === 'price-low') {
      orderSql = `ORDER BY (
        CASE WHEN a.starting_price ~ '^[0-9]' THEN
          CAST(REGEXP_REPLACE(a.starting_price, '[^0-9]', '', 'g') AS BIGINT) ELSE 0 END
      ) ASC, a.id ASC`;
    } else if (sortBy === 'price-high') {
      orderSql = `ORDER BY (
        CASE WHEN a.starting_price ~ '^[0-9]' THEN
          CAST(REGEXP_REPLACE(a.starting_price, '[^0-9]', '', 'g') AS BIGINT) ELSE 0 END
      ) DESC, a.id ASC`;
    } else if (sortBy === 'name-asc') {
      orderSql = 'ORDER BY a.name ASC, a.id ASC';
    } else if (sortBy === 'name-desc') {
      orderSql = 'ORDER BY a.name DESC, a.id ASC';
    }

    params.push(limit);
    const limIdx = p;

    const sql = `
      SELECT a.id, a.name, a.additional_info, a.starting_price, a.compare_at_price, a.images,
        a.auction_dates, a.inventory_qty, a.reserved_qty,
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
      WHERE a.category_id = $1 AND a.id != $2
      ${searchSql}
      ${orderSql}
      LIMIT $${limIdx}
    `;

    const result = await pool.query(sql, params);

    return NextResponse.json({
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
      },
      candidates: result.rows,
    });
  } catch (e) {
    console.error('compare-candidates', e);
    return NextResponse.json({ error: 'Ошибка загрузки' }, { status: 500 });
  }
}
