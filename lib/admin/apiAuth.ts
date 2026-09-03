import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import pool, { ensureDatabase } from '@/lib/db';
import { ADMIN_TOKEN_COOKIE } from './constants';
import { verifyAdminToken } from './jwt';
import {
  type AdminPermission,
  type AdminRole,
  hasAnyPermission,
  hasPermission,
  parseAdminRole,
  permissionsForRole,
} from './roles';

export type AdminSessionUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: AdminRole;
  permissions: AdminPermission[];
};

/**
 * Загружает текущего администратора по JWT (роль всегда из БД).
 */
export async function getAdminSession(): Promise<AdminSessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
    if (!token) return null;

    const payload = await verifyAdminToken(token);
    if (!payload?.sub) return null;

    const id = parseInt(payload.sub, 10);
    if (!Number.isFinite(id) || id < 1) return null;

    await ensureDatabase();

    const result = await pool.query<{
      id: number;
      username: string;
      display_name: string | null;
      role: string;
      is_active: boolean;
    }>(
      `SELECT id, username, display_name, role, is_active
       FROM admin_users WHERE id = $1 LIMIT 1`,
      [id]
    );

    const row = result.rows[0];
    if (!row || !row.is_active) return null;

    const role = parseAdminRole(row.role);
    if (!role) return null;

    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role,
      permissions: permissionsForRole(role),
    };
  } catch {
    return null;
  }
}

/** Любая активная JWT-сессия администратора (для legacy API без granular permissions). */
export async function isAdminAuthenticated(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

export async function requireAdminApi(
  permission: AdminPermission
): Promise<AdminSessionUser | NextResponse> {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role, permission)) {
    return NextResponse.json(
      { error: 'Недостаточно прав для этого действия', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }
  return user;
}

/** Для upload и других точек, где допустимо несколько ролей. */
export async function requireAdminApiAny(
  permissions: readonly AdminPermission[]
): Promise<AdminSessionUser | NextResponse> {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasAnyPermission(user.role, permissions)) {
    return NextResponse.json(
      { error: 'Недостаточно прав для этого действия', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }
  return user;
}
