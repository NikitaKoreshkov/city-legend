import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function GET() {
  const auth = await requireAdminApi('content.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const res = await pool.query('SELECT key, value, updated_at FROM cabinet_cms_copy ORDER BY key ASC');
    return NextResponse.json({ items: res.rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi('content.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { key, value } = await request.json();
    if (!key || value == null) return NextResponse.json({ error: 'key и value обязательны' }, { status: 400 });
    await pool.query(
      `UPDATE cabinet_cms_copy SET value = $2, updated_at = NOW() WHERE key = $1`,
      [key, String(value)]
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi('content.edit');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const body = await request.json();
    // Batch update: { updates: { key: value, ... } }
    const updates = body.updates as Record<string, string>;
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'updates обязателен' }, { status: 400 });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [k, v] of Object.entries(updates)) {
        await client.query(
          `UPDATE cabinet_cms_copy SET value = $2, updated_at = NOW() WHERE key = $1`,
          [k, String(v)]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
