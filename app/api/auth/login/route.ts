import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool, { ensureDatabase } from '@/lib/db';
import { CABINET_COOKIE } from '@/lib/auth/constants';
import { cabinetSessionCookieOptions } from '@/lib/auth/cookieOptions';
import { signCabinetToken } from '@/lib/auth/jwt';
import { normalizeEmail, validateEmail, verifyPassword } from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { getClientIp } from '@/lib/auth/request';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 12;

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`login:${ip}`, MAX_PER_WINDOW, WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Слишком много попыток входа. Подождите.' },
        { status: 429 }
      );
    }

    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
    }

    const emailRaw = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const emailErr = validateEmail(emailRaw);
    if (emailErr) {
      return NextResponse.json({ error: emailErr }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Введите пароль' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    await ensureDatabase();

    const result = await pool.query(
      `SELECT id, email, password_hash, COALESCE(display_name, '') AS name
       FROM cabinet_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const row = result.rows[0] as
      | { id: number; email: string; password_hash: string; name: string }
      | undefined;

    const ok = row ? await verifyPassword(password, row.password_hash) : false;
    if (!ok || !row) {
      // Одинаковое сообщение и задержка при неверном пароле / несуществующем email
      await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 200)));
      return NextResponse.json(
        { error: 'Неверный email или пароль' },
        { status: 401 }
      );
    }

    const token = await signCabinetToken(row.id, row.email);
    const jar = await cookies();
    jar.set(CABINET_COOKIE, token, cabinetSessionCookieOptions());

    return NextResponse.json({
      user: { id: row.id, email: row.email, name: row.name || '' },
    });
  } catch (e) {
    console.error('auth/login', e);
    if (e instanceof Error && e.message.includes('AUTH_SECRET')) {
      return NextResponse.json(
        { error: 'Сервер не настроен для входа (AUTH_SECRET)' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
