import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';

// GET - получить все фильтры с опциями
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');

    let query = 'SELECT * FROM filters';
    const params: any[] = [];

    if (categoryId) {
      query += ' WHERE category_id = $1';
      params.push(categoryId);
    }

    query += ' ORDER BY sort_order ASC, id ASC';

    const filtersResult = await pool.query(query, params);

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

// POST - добавить новый фильтр
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { category_id, name, type, sort_order } = await request.json();

    if (!category_id || !name || !type) {
      return NextResponse.json(
        { error: 'category_id, name и type обязательны' },
        { status: 400 }
      );
    }

    // Проверяем валидность типа
    if (!['checkbox', 'range', 'text'].includes(type)) {
      return NextResponse.json(
        { error: 'type должен быть checkbox, range или text' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO filters (category_id, name, type, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [category_id, name, type, sort_order || 0]
    );

    return NextResponse.json({ success: true, filter: result.rows[0] });
  } catch (error) {
    console.error('Ошибка добавления фильтра:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// PUT - обновить фильтр
export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, name, type, sort_order } = await request.json();

    if (!id || !name || !type) {
      return NextResponse.json(
        { error: 'id, name и type обязательны' },
        { status: 400 }
      );
    }

    if (!['checkbox', 'range', 'text'].includes(type)) {
      return NextResponse.json(
        { error: 'type должен быть checkbox, range или text' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE filters 
       SET name = $1, type = $2, sort_order = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, type, sort_order, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Фильтр не найден' }, { status: 404 });
    }

    return NextResponse.json({ success: true, filter: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления фильтра:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// DELETE - удалить фильтр
export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID фильтра обязателен' }, { status: 400 });
    }

    await pool.query('DELETE FROM filters WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления фильтра:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

