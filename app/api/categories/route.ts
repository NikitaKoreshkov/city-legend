import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';

// Публичный API для получения категорий (без проверки авторизации)
export async function GET() {
  try {
    await ensureDatabase();
    const categoriesResult = await pool.query(
      'SELECT id, name, slug, image_url, sort_order FROM auction_categories ORDER BY sort_order ASC, id ASC'
    );

    return NextResponse.json({ 
      categories: categoriesResult.rows 
    });
  } catch (error) {
    console.error('Ошибка получения категорий:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

