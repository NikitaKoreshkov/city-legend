import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }
  const fullName = clean(body.fullName);
  const phone = clean(body.phone);
  const email = clean(body.email);
  const city = clean(body.city);
  const street = clean(body.street);
  const house = clean(body.house);
  if (fullName.length < 3 || phone.length < 7 || !email.includes('@') || city.length < 2 || street.length < 2 || house.length < 1) {
    return NextResponse.json({ error: 'Заполните обязательные поля адреса' }, { status: 400 });
  }
  const label = clean(body.label) || 'Адрес';
  const isDefault = Boolean(body.isDefault);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isDefault) {
      await client.query(`UPDATE cabinet_saved_addresses SET is_default = FALSE WHERE user_id = $1`, [user.id]);
    }
    const ins = await client.query(
      `INSERT INTO cabinet_saved_addresses
      (user_id, label, full_name, phone, email, city, street, house, apartment, postal_code, comment, is_default)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id`,
      [
        user.id,
        label,
        fullName,
        phone,
        email,
        city,
        street,
        house,
        clean(body.apartment),
        clean(body.postalCode),
        clean(body.comment),
        isDefault,
      ]
    );
    await client.query('COMMIT');
    return NextResponse.json({ ok: true, id: (ins.rows[0] as { id: number }).id });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('cabinet/addresses POST', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();
  const id = Number(req.nextUrl.searchParams.get('id') || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Некорректный id адреса' }, { status: 400 });
  }
  await pool.query(`DELETE FROM cabinet_saved_addresses WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }
  const id = Number(body.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Некорректный id адреса' }, { status: 400 });
  }
  const fullName = clean(body.fullName);
  const phone = clean(body.phone);
  const email = clean(body.email);
  const city = clean(body.city);
  const street = clean(body.street);
  const house = clean(body.house);
  if (fullName.length < 3 || phone.length < 7 || !email.includes('@') || city.length < 2 || street.length < 2 || house.length < 1) {
    return NextResponse.json({ error: 'Заполните обязательные поля адреса' }, { status: 400 });
  }
  const isDefault = Boolean(body.isDefault);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isDefault) {
      await client.query(`UPDATE cabinet_saved_addresses SET is_default = FALSE WHERE user_id = $1`, [user.id]);
    }
    const upd = await client.query(
      `UPDATE cabinet_saved_addresses
       SET label = $3,
           full_name = $4,
           phone = $5,
           email = $6,
           city = $7,
           street = $8,
           house = $9,
           apartment = $10,
           postal_code = $11,
           comment = $12,
           is_default = $13
       WHERE id = $1 AND user_id = $2`,
      [
        id,
        user.id,
        clean(body.label) || 'Адрес',
        fullName,
        phone,
        email,
        city,
        street,
        house,
        clean(body.apartment),
        clean(body.postalCode),
        clean(body.comment),
        isDefault,
      ]
    );
    if (!upd.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Адрес не найден' }, { status: 404 });
    }
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('cabinet/addresses PATCH', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  } finally {
    client.release();
  }
}
