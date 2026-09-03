import { cookies } from 'next/headers';
import pool, { ensureDatabase } from '@/lib/db';
import { CABINET_COOKIE } from './constants';
import { verifyCabinetToken } from './jwt';

export type CabinetUserRow = {
  id: number;
  email: string;
  name: string;
};

export async function getCabinetUserFromCookies(): Promise<CabinetUserRow | null> {
  const jar = await cookies();
  const token = jar.get(CABINET_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyCabinetToken(token);
  if (!payload) {
    jar.delete(CABINET_COOKIE);
    return null;
  }

  const userId = parseInt(payload.sub, 10);
  if (Number.isNaN(userId)) return null;

  await ensureDatabase();
  const result = await pool.query(
    `SELECT id, email, COALESCE(display_name, '') AS name
     FROM cabinet_users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = result.rows[0] as
    | { id: number; email: string; name: string }
    | undefined;
  if (!row) {
    jar.delete(CABINET_COOKIE);
    return null;
  }

  return { id: row.id, email: row.email, name: row.name || '' };
}
