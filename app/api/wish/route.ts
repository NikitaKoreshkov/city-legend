import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { randomBytes } from 'crypto';

async function ensureWishTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wish_links (
      id SERIAL PRIMARY KEY,
      token VARCHAR(32) NOT NULL UNIQUE,
      auction_id INTEGER NOT NULL,
      friend_name VARCHAR(200),
      occasion VARCHAR(200),
      wish_date VARCHAR(100),
      personal_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`ALTER TABLE wish_links ADD COLUMN IF NOT EXISTS friend_name VARCHAR(200);`);
  await pool.query(`ALTER TABLE wish_links ADD COLUMN IF NOT EXISTS occasion VARCHAR(200);`);
  await pool.query(`ALTER TABLE wish_links ADD COLUMN IF NOT EXISTS wish_date VARCHAR(100);`);
  await pool.query(`ALTER TABLE wish_links ADD COLUMN IF NOT EXISTS personal_message TEXT;`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wish_links_token ON wish_links (token);
  `);
}

// POST /api/wish — создать персональную ссылку
export async function POST(request: Request) {
  try {
    await ensureDatabase();
    await ensureWishTable();

    const body = await request.json() as {
      auctionId?: unknown;
      friendName?: unknown;
      occasion?: unknown;
      wishDate?: unknown;
      personalMessage?: unknown;
    };

    const auctionId = typeof body.auctionId === 'number' ? body.auctionId : null;
    if (!auctionId) {
      return NextResponse.json({ error: 'auctionId required' }, { status: 400 });
    }

    const check = await pool.query('SELECT id FROM auctions WHERE id = $1', [auctionId]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    }

    const friendName = typeof body.friendName === 'string' ? body.friendName.trim().slice(0, 200) : null;
    const occasion = typeof body.occasion === 'string' ? body.occasion.trim().slice(0, 200) : null;
    const wishDate = typeof body.wishDate === 'string' ? body.wishDate.trim().slice(0, 100) : null;
    const personalMessage = typeof body.personalMessage === 'string' ? body.personalMessage.trim().slice(0, 1000) : null;

    // Каждый раз создаём новый токен (персонализированный — уникален)
    const token = randomBytes(12).toString('hex');
    await pool.query(
      `INSERT INTO wish_links (token, auction_id, friend_name, occasion, wish_date, personal_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [token, auctionId, friendName, occasion, wishDate, personalMessage]
    );

    return NextResponse.json({ token });
  } catch (err) {
    console.error('wish POST error', err);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// GET /api/wish?token=xxx
export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await ensureWishTable();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }

    const res = await pool.query<{
      token: string;
      auction_id: number;
      friend_name: string | null;
      occasion: string | null;
      wish_date: string | null;
      personal_message: string | null;
      created_at: Date;
      name: string;
      starting_price: string;
      compare_at_price: string | null;
      images: string[];
      additional_info: string | null;
      category: string | null;
    }>(`
      SELECT wl.token, wl.auction_id, wl.friend_name, wl.occasion, wl.wish_date, wl.personal_message, wl.created_at,
             a.name, a.starting_price, a.compare_at_price, a.images,
             a.additional_info, a.category
      FROM wish_links wl
      JOIN auctions a ON a.id = wl.auction_id
      WHERE wl.token = $1
    `, [token]);

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Ссылка не найдена' }, { status: 404 });
    }

    return NextResponse.json({ wish: res.rows[0] });
  } catch (err) {
    console.error('wish GET error', err);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
