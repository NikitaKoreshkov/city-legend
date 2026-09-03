import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signAdminToken } from '@/lib/admin/jwt';
import { ADMIN_TOKEN_COOKIE, ADMIN_COOKIE_MAX_AGE } from '@/lib/admin/constants';

export async function POST(request: Request) {
  try {
    await ensureDatabase();

    const body = (await request.json()) as { username?: unknown; password?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Логин и пароль обязательны' },
        { status: 400 }
      );
    }

    const result = await pool.query<{
      id: number;
      password: string;
      password_hash: string | null;
      is_active: boolean;
    }>(
      `SELECT id, password, password_hash, is_active
       FROM admin_users
       WHERE LOWER(TRIM(username)) = LOWER($1)`,
      [username]
    );

    const row = result.rows[0];
    if (!row || !row.is_active) {
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
    }

    let valid = false;
    const hash = row.password_hash?.trim();
    if (hash) {
      valid = await verifyPassword(password, hash);
      // Hash есть — plaintext больше не принимаем (даже если колонка password не пуста)
    } else {
      const plain = row.password?.trim() ?? '';
      if (plain && plain !== '*' && plain === password.trim()) {
        valid = true;
        const newHash = await hashPassword(password);
        await pool.query(
          `UPDATE admin_users SET password_hash = $1, password = '' WHERE id = $2`,
          [newHash, row.id]
        );
      }
    }

    if (!valid) {
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
    }

    // Всегда обнуляем plaintext после успешного входа
    await pool.query(
      `UPDATE admin_users SET password = '' WHERE id = $1 AND COALESCE(TRIM(password), '') <> ''`,
      [row.id]
    );

    const token = await signAdminToken(row.id);
    const response = NextResponse.json({ success: true });

    const isProd = process.env.NODE_ENV === 'production';

    response.cookies.set(ADMIN_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: ADMIN_COOKIE_MAX_AGE,
      path: '/',
    });

    response.cookies.delete('admin_session');

    return response;
  } catch (error) {
    console.error('Ошибка входа:', error);
    return NextResponse.json(
      { error: 'Ошибка сервера', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
