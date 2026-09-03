import { NextResponse } from 'next/server';
import crypto from 'crypto';
import pool, { ensureDatabase } from '@/lib/db';
import { sendPasswordResetEmail, userFacingMailError } from '@/lib/mailer';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { getClientIp } from '@/lib/auth/request';
import { normalizeEmail, validateEmail } from '@/lib/auth/password';

async function ensureResetTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`forgot-pw:${ip}`, 5, 15 * 60 * 1000)) {
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
    await ensureResetTable();

    const userRes = await pool.query(
      `SELECT id, email FROM cabinet_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    // Always respond the same way regardless of whether user exists
    if (userRes.rows.length > 0) {
      const userId = userRes.rows[0].id as number;
      const toEmail = String(userRes.rows[0].email ?? email).trim().toLowerCase();
      const token = crypto.randomBytes(32).toString('hex');

      // Invalidate old tokens for this user
      await pool.query(
        `UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
        [userId]
      );

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [userId, token]
      );

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://citylegend.art';
      const resetUrl = `${siteUrl}/reset-password?token=${token}`;

      try {
        await sendPasswordResetEmail(toEmail, resetUrl);
      } catch (e) {
        console.error('forgot-password mailer:', e);
        return NextResponse.json({ error: userFacingMailError(e) }, { status: 503 });
      }
    } else {
      console.info('[forgot-password] no cabinet user for requested email');
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('auth/forgot-password', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
