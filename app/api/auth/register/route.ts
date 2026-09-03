import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { normalizeDisplayName, validateDisplayName } from '@/lib/auth/displayName';
import {
  hashPassword,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { getClientIp } from '@/lib/auth/request';
import { sendVerificationEmail } from '@/lib/mailer';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 8;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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
  // Ensure email_verified column exists on cabinet_users (true for old users)
  await pool.query(`
    ALTER TABLE cabinet_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT TRUE
  `);
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`reg:${ip}`, MAX_PER_WINDOW, WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Слишком много попыток. Подождите немного.' },
        { status: 429 }
      );
    }

    let body: {
      email?: string;
      password?: string;
      passwordConfirm?: string;
      name?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
    }

    const nameRaw = typeof body.name === 'string' ? body.name : '';
    const emailRaw = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : '';

    const nameErr = validateDisplayName(nameRaw);
    if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 });
    const emailErr = validateEmail(emailRaw);
    if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 });
    const pwErr = validatePassword(password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
    if (password !== passwordConfirm) {
      return NextResponse.json({ error: 'Пароли не совпадают' }, { status: 400 });
    }

    const display_name = normalizeDisplayName(nameRaw);
    const email = normalizeEmail(emailRaw);
    await ensureDatabase();
    await ensureVerificationTable();

    const existing = await pool.query(
      'SELECT id, email_verified FROM cabinet_users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0] as { id: number; email_verified: boolean | null };
      // If they registered but never verified, allow re-registration (update password + resend code)
      if (row.email_verified === false) {
        const password_hash = await hashPassword(password);
        await pool.query(
          `UPDATE cabinet_users SET password_hash = $1, display_name = $2 WHERE id = $3`,
          [password_hash, display_name, row.id]
        );
        const code = generateCode();
        await pool.query(
          `DELETE FROM email_verifications WHERE user_id = $1`,
          [row.id]
        );
        await pool.query(
          `INSERT INTO email_verifications (user_id, code, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
          [row.id, code]
        );
        try { await sendVerificationEmail(email, code); } catch (e) {
          console.error('register mailer (re-send):', e);
        }
        return NextResponse.json({ pendingVerification: true, email });
      }
      return NextResponse.json({ error: 'Этот email уже зарегистрирован' }, { status: 409 });
    }

    const password_hash = await hashPassword(password);
    const insert = await pool.query(
      `INSERT INTO cabinet_users (email, password_hash, display_name, email_verified)
       VALUES ($1, $2, $3, FALSE)
       RETURNING id`,
      [email, password_hash, display_name]
    );
    const userId = insert.rows[0].id as number;

    const code = generateCode();
    await pool.query(
      `INSERT INTO email_verifications (user_id, code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [userId, code]
    );

    // Send email — don't fail registration if email fails
    try {
      await sendVerificationEmail(email, code);
    } catch (e) {
      console.error('register mailer:', e);
    }

    return NextResponse.json({ pendingVerification: true, email });
  } catch (e) {
    console.error('auth/register', e);
    if (e instanceof Error && e.message.includes('AUTH_SECRET')) {
      return NextResponse.json(
        { error: 'Сервер не настроен для входа (AUTH_SECRET)' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
