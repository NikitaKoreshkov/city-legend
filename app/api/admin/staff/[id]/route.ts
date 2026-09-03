import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { parseAdminRole, type AdminRole } from '@/lib/admin/roles';

async function countOtherActiveSuperAdmins(excludeId: number): Promise<number> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM admin_users
     WHERE role = 'super_admin' AND is_active = TRUE AND id <> $1`,
    [excludeId]
  );
  return parseInt(r.rows[0]?.c ?? '0', 10) || 0;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi('staff.manage');
  if (auth instanceof NextResponse) return auth;

  const { id: idParam } = await context.params;
  const id = parseInt(idParam, 10);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: 'Некорректный идентификатор' }, { status: 400 });
  }

  try {
    await ensureDatabase();

    const cur = await pool.query<{
      id: number;
      role: string;
      is_active: boolean;
    }>(`SELECT id, role, is_active FROM admin_users WHERE id = $1`, [id]);
    const row = cur.rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
    }

    let body: {
      displayName?: unknown;
      role?: unknown;
      is_active?: unknown;
      password?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
    }

    const nextRole = body.role !== undefined ? parseAdminRole(body.role) : null;
    const nextActive =
      body.is_active === undefined ? undefined : Boolean(body.is_active);

    if (nextRole === null && body.role !== undefined) {
      return NextResponse.json({ error: 'Некорректная роль' }, { status: 400 });
    }

    const wasSuper = row.role === 'super_admin';
    const willBeSuper = nextRole !== null ? nextRole === 'super_admin' : wasSuper;
    const willBeActive = nextActive !== undefined ? nextActive : row.is_active;

    if (wasSuper && (!willBeSuper || !willBeActive)) {
      const others = await countOtherActiveSuperAdmins(id);
      if (others < 1) {
        return NextResponse.json(
          {
            error:
              'Нельзя снять последнего главного администратора: назначьте другого super_admin или создайте новую учётную запись.',
          },
          { status: 400 }
        );
      }
    }

    if (auth.id === id && nextActive === false) {
      return NextResponse.json({ error: 'Нельзя деактивировать свою учётную запись' }, { status: 400 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (typeof body.displayName === 'string') {
      const dn = body.displayName.trim().slice(0, 200);
      updates.push(`display_name = $${p++}`);
      values.push(dn || null);
    }

    if (nextRole !== null) {
      updates.push(`role = $${p++}`);
      values.push(nextRole as AdminRole);
    }

    if (nextActive !== undefined) {
      updates.push(`is_active = $${p++}`);
      values.push(willBeActive);
    }

    if (typeof body.password === 'string' && body.password.length > 0) {
      const pwErr = validatePassword(body.password);
      if (pwErr) {
        return NextResponse.json({ error: pwErr }, { status: 400 });
      }
      const h = await hashPassword(body.password);
      updates.push(`password_hash = $${p++}`);
      values.push(h);
      updates.push(`password = $${p++}`);
      values.push('*');
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 });
    }

    values.push(id);
    await pool.query(
      `UPDATE admin_users SET ${updates.join(', ')} WHERE id = $${p}`,
      values
    );

    const fresh = await pool.query(
      `SELECT id, username, display_name, role, is_active, created_at
       FROM admin_users WHERE id = $1`,
      [id]
    );

    return NextResponse.json({ staff: fresh.rows[0] });
  } catch (e) {
    console.error('admin staff patch', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
