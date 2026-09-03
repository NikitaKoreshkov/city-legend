import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { getClientIp } from '@/lib/auth/request';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`reset-pw:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Слишком много попыток. Подождите.' }, { status: 429 });
    }

    let body: { token?: string; password?: string; passwordConfirm?: string };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : '';

    if (!token) {
      return NextResponse.json({ error: 'Токен не указан' }, { status: 400 });
    }
    const pwErr = validatePassword(password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
    if (password !== passwordConfirm) {
      return NextResponse.json({ error: 'Пароли не совпадают' }, { status: 400 });
    }

    await ensureDatabase();

    const tokenRes = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token = $1 AND used = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    if (tokenRes.rows.length === 0) {
      return NextResponse.json({ error: 'Ссылка недействительна или уже использована' }, { status: 400 });
    }

    const { id: tokenId, user_id: userId } = tokenRes.rows[0] as { id: number; user_id: number };
    const password_hash = await hashPassword(password);

    await pool.query(
      `UPDATE cabinet_users SET password_hash = $1 WHERE id = $2`,
      [password_hash, userId]
    );
    await pool.query(
      `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`,
      [tokenId]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('auth/reset-password', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// GET — just validate the token so the UI can show the form or error
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || '';
    if (!token) {
      return NextResponse.json({ valid: false });
    }
    await ensureDatabase();
    const res = await pool.query(
      `SELECT id FROM password_reset_tokens
       WHERE token = $1 AND used = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    return NextResponse.json({ valid: res.rows.length > 0 });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
