import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';

// POST - добавить новую опцию фильтра
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { filter_id, value, sort_order } = await request.json();

    if (!filter_id || !value) {
      return NextResponse.json(
        { error: 'filter_id и value обязательны' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO filter_options (filter_id, value, sort_order)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [filter_id, value, sort_order || 0]
    );

    return NextResponse.json({ success: true, option: result.rows[0] });
  } catch (error) {
    console.error('Ошибка добавления опции:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// PUT - обновить опцию фильтра
export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, value, sort_order } = await request.json();

    if (!id || !value) {
      return NextResponse.json(
        { error: 'id и value обязательны' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE filter_options 
       SET value = $1, sort_order = $2
       WHERE id = $3
       RETURNING *`,
      [value, sort_order, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Опция не найдена' }, { status: 404 });
    }

    return NextResponse.json({ success: true, option: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления опции:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// DELETE - удалить опцию фильтра
export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID опции обязателен' }, { status: 400 });
    }

    await pool.query('DELETE FROM filter_options WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления опции:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

