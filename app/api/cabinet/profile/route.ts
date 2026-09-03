import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureCabinetCoreSchema } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { parseBirthDate, validateBirthDate } from '@/lib/auth/birthDate';
import { normalizeDisplayName, validateDisplayName } from '@/lib/auth/displayName';

export async function GET() {
  try {
    const user = await getCabinetUserFromCookies();
    if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

    await ensureCabinetCoreSchema();
    const row = await pool.query<{ display_name: string; birth_date: string | null }>(
      `SELECT COALESCE(display_name, '') AS display_name, birth_date::text AS birth_date
       FROM cabinet_users WHERE id = $1 LIMIT 1`,
      [user.id]
    );
    const u = row.rows[0];
    return NextResponse.json({
      profile: {
        id: user.id,
        email: user.email,
        name: u?.display_name || user.name || '',
        birthDate: u?.birth_date ? u.birth_date.slice(0, 10) : null,
      },
    });
  } catch (e) {
    console.error('cabinet/profile GET', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCabinetUserFromCookies();
    if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

    let body: { name?: string; birthDate?: string | null };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
    }

    await ensureCabinetCoreSchema();

    const updates: string[] = [];
    const params: unknown[] = [];
    let n = 1;

    if (body.name !== undefined) {
      const nameErr = validateDisplayName(body.name);
      if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 });
      updates.push(`display_name = $${n++}`);
      params.push(normalizeDisplayName(body.name));
    }

    if (body.birthDate !== undefined) {
      if (body.birthDate === null || body.birthDate === '') {
        updates.push(`birth_date = NULL`);
      } else {
        const err = validateBirthDate(body.birthDate);
        if (err) return NextResponse.json({ error: err }, { status: 400 });
        updates.push(`birth_date = $${n++}::date`);
        params.push(parseBirthDate(body.birthDate));
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 });
    }

    params.push(user.id);
    await pool.query(`UPDATE cabinet_users SET ${updates.join(', ')} WHERE id = $${n}`, params);

    const row = await pool.query<{ display_name: string; birth_date: string | null }>(
      `SELECT COALESCE(display_name, '') AS display_name, birth_date::text AS birth_date
       FROM cabinet_users WHERE id = $1`,
      [user.id]
    );
    const u = row.rows[0];
    return NextResponse.json({
      ok: true,
      profile: {
        id: user.id,
        email: user.email,
        name: u?.display_name || '',
        birthDate: u?.birth_date ? u.birth_date.slice(0, 10) : null,
      },
    });
  } catch (e) {
    console.error('cabinet/profile PATCH', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
