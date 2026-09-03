import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// Публичный API для получения фильтров категории
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categorySlug = searchParams.get('category');

    if (!categorySlug) {
      return NextResponse.json({ filters: [] });
    }

    // Находим категорию по slug
    const categoryResult = await pool.query(
      'SELECT id FROM auction_categories WHERE slug = $1',
      [categorySlug]
    );

    if (categoryResult.rows.length === 0) {
      return NextResponse.json({ filters: [] });
    }

    const categoryId = categoryResult.rows[0].id;

    // Получаем фильтры категории
    const filtersResult = await pool.query(
      'SELECT * FROM filters WHERE category_id = $1 ORDER BY sort_order ASC, id ASC',
      [categoryId]
    );

    // Получаем опции для каждого фильтра
    const filtersWithOptions = await Promise.all(
      filtersResult.rows.map(async (filter) => {
        const optionsResult = await pool.query(
          'SELECT * FROM filter_options WHERE filter_id = $1 ORDER BY sort_order ASC, id ASC',
          [filter.id]
        );
        return {
          ...filter,
          options: optionsResult.rows,
        };
      })
    );

    return NextResponse.json({ filters: filtersWithOptions });
  } catch (error) {
    console.error('Ошибка получения фильтров:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

