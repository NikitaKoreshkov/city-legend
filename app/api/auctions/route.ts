import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await ensureDatabase();

    // Получаем параметры пагинации и фильтрации из query string
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '1000', 10);
    const category = searchParams.get('category');
    const collection = searchParams.get('collection');
    const sortBy = searchParams.get('sortBy') || 'relevance';
    const featured = searchParams.get('featured') === 'true';

    // Формируем запрос с учетом фильтрации (алиас a — для JOIN с отзывами)
    let countQuery = 'SELECT COUNT(*) FROM auctions a';
    let query = `SELECT a.*,
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
    ) rv ON rv.auction_id = a.id`;
    const queryParams: any[] = [];
    const whereConditions: string[] = [];

    if (featured) {
      whereConditions.push('a.is_featured = true');
    }

    if (category) {
      // Сначала найдем ID категории по slug
      const categoryResult = await pool.query(
        'SELECT id FROM auction_categories WHERE slug = $1',
        [category]
      );
      
      if (categoryResult.rows.length > 0) {
        const paramIndex = queryParams.length + 1;
        whereConditions.push(`a.category_id = $${paramIndex}`);
        queryParams.push(categoryResult.rows[0].id);
      }
    }

    if (collection) {
      const collectionResult = await pool.query(
        'SELECT id FROM auction_collections WHERE slug = $1',
        [collection]
      );
      if (collectionResult.rows.length > 0) {
        const paramIndex = queryParams.length + 1;
        whereConditions.push(`a.collection_id = $${paramIndex}`);
        queryParams.push(collectionResult.rows[0].id);
      }
    }

    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      countQuery += whereClause;
      query += whereClause;
    }

    // Применяем сортировку
    if (sortBy === 'price-low') {
      // Сортировка по цене от низкой к высокой
      // Парсим цену из формата "5 123 000 ₽" - извлекаем все цифры и преобразуем в число
      query += ` ORDER BY (
        CASE 
          WHEN a.starting_price ~ '^[0-9]' THEN
            CAST(REGEXP_REPLACE(a.starting_price, '[^0-9]', '', 'g') AS BIGINT)
          ELSE 0
        END
      ) ASC, a.id ASC`;
    } else if (sortBy === 'price-high') {
      // Сортировка по цене от высокой к низкой
      query += ` ORDER BY (
        CASE 
          WHEN a.starting_price ~ '^[0-9]' THEN
            CAST(REGEXP_REPLACE(a.starting_price, '[^0-9]', '', 'g') AS BIGINT)
          ELSE 0
        END
      ) DESC, a.id ASC`;
    } else {
      // Релевантность: сначала лучшие по оценкам, затем по числу отзывов, без отзывов — в конце
      query += ` ORDER BY COALESCE(rv.avg_rating, 0) DESC,
                         COALESCE(rv.review_count, 0) DESC,
                         a.id ASC`;
    }

    // Добавляем параметры limit и offset
    const limitParamIndex = queryParams.length + 1;
    const offsetParamIndex = queryParams.length + 2;
    query += ` LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;
    queryParams.push(limit, offset);

    // Получаем общее количество аукционов
    const countParams = queryParams.slice(0, queryParams.length - 2); // Без limit и offset
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Получаем аукционы с пагинацией и фильтрацией
    const result = await pool.query(query, queryParams);

    const hasMore = offset + result.rows.length < totalCount;

    // Получаем уникальные подкатегории для текущей категории
    let subcategories: string[] = [];
    if (category) {
      // Находим ID категории по slug
      const categoryResult = await pool.query(
        'SELECT id FROM auction_categories WHERE slug = $1',
        [category]
      );
      
      if (categoryResult.rows.length > 0) {
        const categoryId = categoryResult.rows[0].id;
        
        // Получаем подкатегории этой категории
        const subcatResult = await pool.query(
          'SELECT name FROM auction_subcategories WHERE category_id = $1 ORDER BY sort_order ASC, name ASC',
          [categoryId]
        );
        subcategories = subcatResult.rows.map(row => row.name);
      }
    }

    return NextResponse.json({ 
      auctions: result.rows,
      hasMore,
      total: totalCount,
      subcategories: subcategories
    }, { status: 200 });
  } catch (error: any) {
    console.error('Ошибка при получении аукционов:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка при получении аукционов' },
      { status: 500 }
    );
  }
}

