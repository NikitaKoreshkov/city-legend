import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool, { ensureDatabase } from '@/lib/db';
import { CABINET_COOKIE } from '@/lib/auth/constants';
import { cabinetSessionCookieOptions } from '@/lib/auth/cookieOptions';
import { signCabinetToken } from '@/lib/auth/jwt';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { getClientIp } from '@/lib/auth/request';
import { normalizeEmail, validateEmail } from '@/lib/auth/password';

async function ensureVerificationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      code VARCHAR(6) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`verify-email:${ip}`, 20, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Слишком много попыток. Подождите.' }, { status: 429 });
    }

    let body: { email?: string; code?: string };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
    }

    const emailRaw = typeof body.email === 'string' ? body.email : '';
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';

    if (validateEmail(emailRaw)) {
      return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Код должен содержать 6 цифр' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    await ensureDatabase();
    await ensureVerificationTable();

    // Find the user
    const userRes = await pool.query(
      `SELECT id, email, COALESCE(display_name, '') AS name
       FROM cabinet_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const user = userRes.rows[0] as { id: number; email: string; name: string } | undefined;
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    // Check the code
    const verRes = await pool.query(
      `SELECT id FROM email_verifications
       WHERE user_id = $1 AND code = $2 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, code]
    );
    if (verRes.rows.length === 0) {
      return NextResponse.json({ error: 'Неверный или устаревший код' }, { status: 400 });
    }

    // Mark email as verified and delete used codes
    await pool.query(
      `UPDATE cabinet_users SET email_verified = TRUE WHERE id = $1`,
      [user.id]
    );
    await pool.query(
      `DELETE FROM email_verifications WHERE user_id = $1`,
      [user.id]
    );

    // Log in
    const token = await signCabinetToken(user.id, user.email);
    const jar = await cookies();
    jar.set(CABINET_COOKIE, token, cabinetSessionCookieOptions());

    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    console.error('auth/verify-email', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
