import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';

// GET - публичный доступ к контенту главной страницы
export async function GET() {
  try {
    await ensureDatabase();
    const result = await pool.query('SELECT * FROM homepage_content');
    
    const content: Record<string, any> = {};
    result.rows.forEach(row => {
      content[row.section] = row.data;
    });

    console.log('Контент главной страницы (categories):', JSON.stringify(content.categories, null, 2));

    return NextResponse.json(content);
  } catch (error) {
    console.error('Ошибка получения контента:', error);
    // Возвращаем пустой объект если таблица не существует
    return NextResponse.json({});
  }
}

