import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET - публичный доступ к контенту страницы О нас
export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM about_content');
    
    const content: Record<string, any> = {};
    result.rows.forEach(row => {
      content[row.section] = row.data;
    });

    return NextResponse.json(content);
  } catch (error) {
    console.error('Ошибка получения контента:', error);
    // Возвращаем пустой объект если таблица не существует
    return NextResponse.json({});
  }
}

