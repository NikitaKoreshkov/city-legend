import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';

// GET - получить все категории с подкатегориями
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const categoriesResult = await pool.query(
      'SELECT * FROM auction_categories ORDER BY sort_order ASC, id ASC'
    );

    const subcategoriesResult = await pool.query(
      'SELECT * FROM auction_subcategories ORDER BY sort_order ASC, id ASC'
    );

    // Получаем количество товаров для каждой категории
    const auctionCountsResult = await pool.query(
      'SELECT category_id, COUNT(*) as count FROM auctions WHERE category_id IS NOT NULL GROUP BY category_id'
    );

    // Создаем мапу количества товаров по category_id
    const auctionCountsByCategory: Record<number, number> = {};
    auctionCountsResult.rows.forEach(row => {
      auctionCountsByCategory[row.category_id] = parseInt(row.count);
    });

    // Группируем подкатегории по category_id
    const subcategoriesByCategory: Record<number, any[]> = {};
    subcategoriesResult.rows.forEach(sub => {
      if (!subcategoriesByCategory[sub.category_id]) {
        subcategoriesByCategory[sub.category_id] = [];
      }
      subcategoriesByCategory[sub.category_id].push(sub);
    });

    const categories = categoriesResult.rows.map(cat => ({
      ...cat,
      subcategories: subcategoriesByCategory[cat.id] || [],
      auction_count: auctionCountsByCategory[cat.id] || 0,
    }));

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// POST - добавить новую категорию
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, slug, image_url, sort_order } = await request.json();

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Название и slug обязательны' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO auction_categories (name, slug, image_url, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, slug, image_url || null, sort_order || 0]
    );

    return NextResponse.json({ success: true, category: result.rows[0] });
  } catch (error) {
    console.error('Ошибка добавления категории:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// PUT - обновить категорию
export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, name, slug, image_url, sort_order } = await request.json();

    if (!id || !name || !slug) {
      return NextResponse.json(
        { error: 'ID, название и slug обязательны' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE auction_categories 
       SET name = $1, slug = $2, image_url = $3, sort_order = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, slug, image_url, sort_order, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Категория не найдена' }, { status: 404 });
    }

    return NextResponse.json({ success: true, category: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления категории:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// DELETE - удалить категорию
export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID категории обязателен' }, { status: 400 });
    }

    await pool.query('DELETE FROM auction_categories WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления категории:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

