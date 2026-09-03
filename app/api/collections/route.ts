import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';

/** Публичный список коллекций (для главной и фильтра каталога). */
export async function GET() {
  try {
    await ensureDatabase();
    const result = await pool.query(
      `SELECT id, name, slug, sort_order FROM auction_collections ORDER BY sort_order ASC, id ASC`
    );
    return NextResponse.json({ collections: result.rows });
  } catch (error) {
    console.error('collections GET:', error);
    return NextResponse.json({ collections: [] });
  }
}
