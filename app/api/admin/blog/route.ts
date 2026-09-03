import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function GET() {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const result = await pool.query(
      `SELECT id, title, excerpt, body, image_url, category, sort_order, target_segment, created_at
       FROM cabinet_site_news ORDER BY sort_order ASC, id ASC`
    );
    return NextResponse.json({ posts: result.rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { title, excerpt, body, image_url, category, sort_order, target_segment } = await request.json();
    if (!title) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 });
    const result = await pool.query(
      `INSERT INTO cabinet_site_news (title, excerpt, body, image_url, category, sort_order, target_segment)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, excerpt || '', body || '', image_url || null, category || 'Бутик', sort_order ?? 0, target_segment || 'all']
    );
    return NextResponse.json({ success: true, post: result.rows[0] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { id, title, excerpt, body, image_url, category, sort_order, target_segment } = await request.json();
    if (!id || !title) return NextResponse.json({ error: 'ID и название обязательны' }, { status: 400 });
    const result = await pool.query(
      `UPDATE cabinet_site_news
       SET title=$1, excerpt=$2, body=$3, image_url=$4, category=$5, sort_order=$6, target_segment=$7
       WHERE id=$8 RETURNING *`,
      [title, excerpt || '', body || '', image_url || null, category || 'Бутик', sort_order ?? 0, target_segment || 'all', id]
    );
    if (!result.rows.length) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
    return NextResponse.json({ success: true, post: result.rows[0] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });
    await ensureDatabase();
    await pool.query('DELETE FROM cabinet_site_news WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
