import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';

export async function GET() {
  try {
    const user = await getCabinetUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
    }
    await ensureDatabase();
    const res = await pool.query(
      `SELECT auction_id FROM cabinet_favorites WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    );
    const ids = (res.rows as { auction_id: number }[]).map((r) => r.auction_id);
    return NextResponse.json({ ids });
  } catch (e) {
    console.error('cabinet/favorites GET', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCabinetUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
    }
    await ensureDatabase();
    let body: { auctionId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
    }
    const auctionId = typeof body.auctionId === 'number' ? body.auctionId : parseInt(String(body.auctionId), 10);
    if (!Number.isFinite(auctionId) || auctionId < 1) {
      return NextResponse.json({ error: 'Некорректный лот' }, { status: 400 });
    }

    const lot = await pool.query('SELECT id FROM auctions WHERE id = $1 LIMIT 1', [auctionId]);
    if (lot.rows.length === 0) {
      return NextResponse.json({ error: 'Лот не найден' }, { status: 404 });
    }

    const del = await pool.query(
      `DELETE FROM cabinet_favorites WHERE user_id = $1 AND auction_id = $2 RETURNING auction_id`,
      [user.id, auctionId]
    );
    if (del.rowCount && del.rowCount > 0) {
      return NextResponse.json({ favored: false });
    }

    await pool.query(
      `INSERT INTO cabinet_favorites (user_id, auction_id) VALUES ($1, $2)`,
      [user.id, auctionId]
    );
    return NextResponse.json({ favored: true });
  } catch (e) {
    console.error('cabinet/favorites POST', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
