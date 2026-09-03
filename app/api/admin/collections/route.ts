import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const counts = await pool.query(
      `SELECT collection_id, COUNT(*)::int AS count
       FROM auctions
       WHERE collection_id IS NOT NULL
       GROUP BY collection_id`
    );
    const byCollection: Record<number, number> = {};
    for (const row of counts.rows) {
      byCollection[row.collection_id] = row.count;
    }

    const result = await pool.query(
      `SELECT * FROM auction_collections ORDER BY sort_order ASC, id ASC`
    );

    const collections = result.rows.map((c) => ({
      ...c,
      auction_count: byCollection[c.id] || 0,
    }));

    return NextResponse.json({ collections });
  } catch (error) {
    console.error('admin/collections GET', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const { name, slug, sort_order } = await request.json();

    if (!name || !slug) {
      return NextResponse.json({ error: 'Название и slug обязательны' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO auction_collections (name, slug, sort_order)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, slug, sort_order ?? 0]
    );

    return NextResponse.json({ success: true, collection: result.rows[0] });
  } catch (error) {
    console.error('admin/collections POST', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const { id, name, slug, sort_order } = await request.json();

    if (!id || !name || !slug) {
      return NextResponse.json({ error: 'ID, название и slug обязательны' }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE auction_collections
       SET name = $1, slug = $2, sort_order = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, slug, sort_order ?? 0, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Коллекция не найдена' }, { status: 404 });
    }

    return NextResponse.json({ success: true, collection: result.rows[0] });
  } catch (error) {
    console.error('admin/collections PUT', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });
    }

    await pool.query('DELETE FROM auction_collections WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('admin/collections DELETE', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
