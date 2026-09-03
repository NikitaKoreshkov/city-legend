import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

const ALLOWED_PAGES = new Set(['care', 'how-to-order']);

export async function GET(request: Request) {
  const auth = await requireAdminApi('content.edit');
  if (auth instanceof NextResponse) return auth;

  const page = new URL(request.url).searchParams.get('page')?.trim() ?? '';
  if (!ALLOWED_PAGES.has(page)) {
    return NextResponse.json({ error: 'Unknown page' }, { status: 400 });
  }

  try {
    await ensureDatabase();
    const result = await pool.query<{ section: string; data: unknown }>(
      `SELECT section, data FROM site_page_content WHERE page = $1`,
      [page]
    );

    const content: Record<string, unknown> = {};
    for (const row of result.rows) {
      content[row.section] = row.data;
    }

    return NextResponse.json({ content });
  } catch (error) {
    console.error('admin/page-content GET', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi('content.edit');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      page?: unknown;
      section?: unknown;
      data?: unknown;
    };

    const page = typeof body.page === 'string' ? body.page.trim() : '';
    const section = typeof body.section === 'string' ? body.section.trim() : '';
    const { data } = body;

    if (!ALLOWED_PAGES.has(page) || !section || data === undefined) {
      return NextResponse.json(
        { error: 'page, section и data обязательны' },
        { status: 400 }
      );
    }

    await ensureDatabase();
    await pool.query(
      `INSERT INTO site_page_content (page, section, data, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (page, section)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [page, section, JSON.stringify(data)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('admin/page-content POST', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
