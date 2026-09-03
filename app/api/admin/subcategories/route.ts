import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';

// POST - добавить подкатегорию
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { category_id, name, slug, sort_order } = await request.json();

    if (!category_id || !name || !slug) {
      return NextResponse.json(
        { error: 'Category ID, название и slug обязательны' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO auction_subcategories (category_id, name, slug, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [category_id, name, slug, sort_order || 0]
    );

    return NextResponse.json({ success: true, subcategory: result.rows[0] });
  } catch (error) {
    console.error('Ошибка добавления подкатегории:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// PUT - обновить подкатегорию
export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, name, slug, sort_order } = await request.json();

    if (!id || !name || !slug) {
      return NextResponse.json(
        { error: 'ID, название и slug обязательны' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE auction_subcategories 
       SET name = $1, slug = $2, sort_order = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, slug, sort_order, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Подкатегория не найдена' }, { status: 404 });
    }

    return NextResponse.json({ success: true, subcategory: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления подкатегории:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// DELETE - удалить подкатегорию
export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID подкатегории обязателен' }, { status: 400 });
    }

    await pool.query('DELETE FROM auction_subcategories WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления подкатегории:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

