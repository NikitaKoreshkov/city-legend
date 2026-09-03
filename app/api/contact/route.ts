import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { checkRateLimit } from '@/lib/auth/rateLimit';

function clientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const rip = req.headers.get('x-real-ip');
  if (rip) return rip.trim().slice(0, 64);
  return 'unknown';
}

// POST - создать новую заявку обратной связи
export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request);
    if (!checkRateLimit(`contact:${ip}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Слишком много заявок. Попробуйте позже.' }, { status: 429 });
    }

    const { name, email, phone, message, auction_id } = await request.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Имя, email и сообщение обязательны' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO contact_requests (name, email, phone, message, auction_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, email, phone || null, message, auction_id || null]
    );

    return NextResponse.json({
      success: true,
      message: 'Заявка отправлена успешно',
      request: result.rows[0],
    });
  } catch (error) {
    console.error('Ошибка создания заявки:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
