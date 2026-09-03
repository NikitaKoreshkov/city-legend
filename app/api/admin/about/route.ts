import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';

// GET - получить весь контент страницы О нас
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await pool.query('SELECT * FROM about_content');
    
    const content: Record<string, any> = {};
    result.rows.forEach(row => {
      content[row.section] = row.data;
    });

    return NextResponse.json(content);
  } catch (error) {
    console.error('Ошибка получения контента:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// POST - обновить контент страницы О нас
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { section, data } = await request.json();

    if (!section || !data) {
      return NextResponse.json({ error: 'Секция и данные обязательны' }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO about_content (section, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (section) 
       DO UPDATE SET data = $2, updated_at = NOW()`,
      [section, JSON.stringify(data)]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка обновления контента:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

