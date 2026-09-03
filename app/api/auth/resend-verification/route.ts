import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/mailer';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { getClientIp } from '@/lib/auth/request';
import { normalizeEmail, validateEmail } from '@/lib/auth/password';

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`resend-ver:${ip}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Слишком много попыток. Подождите.' }, { status: 429 });
    }

    let body: { email?: string };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
    }

    const emailRaw = typeof body.email === 'string' ? body.email : '';
    if (validateEmail(emailRaw)) {
      return NextResponse.json({ error: 'Некорректный email' }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    await ensureDatabase();

    const userRes = await pool.query(
      `SELECT id FROM cabinet_users
       WHERE LOWER(email) = LOWER($1) AND (email_verified IS NULL OR email_verified = FALSE)
       LIMIT 1`,
      [email]
    );
    // Don't reveal whether user exists — always return ok
    if (userRes.rows.length > 0) {
      const userId = userRes.rows[0].id as number;
      const code = generateCode();
      await pool.query(
        `INSERT INTO email_verifications (user_id, code, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
        [userId, code]
      );
      try {
        await sendVerificationEmail(email, code);
      } catch (e) {
        console.error('resend-verification mailer:', e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('auth/resend-verification', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
