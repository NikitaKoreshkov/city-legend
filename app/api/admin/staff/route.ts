import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { validateEmail, validatePassword } from '@/lib/auth/password';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { ADMIN_ROLES, type AdminRole, parseAdminRole } from '@/lib/admin/roles';

export async function GET() {
  const auth = await requireAdminApi('staff.manage');
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDatabase();
    const result = await pool.query<{
      id: number;
      username: string;
      display_name: string | null;
      role: string;
      is_active: boolean;
      created_at: Date;
    }>(
      `SELECT id, username, display_name, role, is_active, created_at
       FROM admin_users
       ORDER BY created_at ASC`
    );
    return NextResponse.json({ staff: result.rows });
  } catch (e) {
    console.error('admin staff list', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi('staff.manage');
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDatabase();
    let body: {
      username?: unknown;
      password?: unknown;
      displayName?: unknown;
      role?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
    }

    const usernameRaw = typeof body.username === 'string' ? body.username : '';
    const emailErr = validateEmail(usernameRaw);
    if (emailErr) {
      return NextResponse.json({ error: emailErr }, { status: 400 });
    }

    const password = typeof body.password === 'string' ? body.password : '';
    const pwErr = validatePassword(password);
    if (pwErr) {
      return NextResponse.json({ error: pwErr }, { status: 400 });
    }

    const role = parseAdminRole(body.role);
    if (!role) {
      return NextResponse.json({ error: 'Укажите корректную роль' }, { status: 400 });
    }

    const displayName =
      typeof body.displayName === 'string' && body.displayName.trim()
        ? body.displayName.trim().slice(0, 200)
        : null;

    const username = usernameRaw.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const insert = await pool.query(
      `INSERT INTO admin_users (username, password, password_hash, role, display_name, is_active)
       VALUES ($1, '*', $2, $3, $4, TRUE)
       RETURNING id, username, display_name, role, is_active, created_at`,
      [username, passwordHash, role, displayName]
    );

    return NextResponse.json({ staff: insert.rows[0] }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Пользователь с таким логином уже есть' }, { status: 409 });
    }
    console.error('admin staff create', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
