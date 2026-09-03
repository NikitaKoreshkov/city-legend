import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page');
    if (!page) return NextResponse.json({ error: 'page обязателен' }, { status: 400 });
    await ensureDatabase();
    const result = await pool.query(
      'SELECT section, data FROM page_content WHERE page_slug=$1',
      [page]
    );
    const content: Record<string, unknown> = {};
    for (const row of result.rows) {
      content[row.section] = row.data;
    }
    return NextResponse.json({ content });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
