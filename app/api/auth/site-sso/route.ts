import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureBotCouponSchema } from '@/lib/db';
import { signCabinetToken } from '@/lib/auth/jwt';
import { CABINET_COOKIE } from '@/lib/auth/constants';
import { cabinetSessionCookieOptions } from '@/lib/auth/cookieOptions';
import { cookies } from 'next/headers';

/** Обмен одноразового токена из бота на cookie сессии сайта. */
export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: 'Неверный формат' }, { status: 400 });
  }

  const token = String(body.token || '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Токен не указан' }, { status: 400 });
  }

  await ensureBotCouponSchema();

  const row = await pool.query<{ cabinet_user_id: number; email: string }>(
    `DELETE FROM bot_site_sso_tokens t
     USING cabinet_users u
     WHERE t.token = $1
       AND t.expires_at > NOW()
       AND u.id = t.cabinet_user_id
     RETURNING t.cabinet_user_id, u.email`,
    [token]
  );

  if (row.rows.length === 0) {
    return NextResponse.json({ error: 'Ссылка входа устарела. Войдите вручную.' }, { status: 410 });
  }

  const { cabinet_user_id: userId, email } = row.rows[0];
  const jwt = await signCabinetToken(userId, email);
  const jar = await cookies();
  jar.set(CABINET_COOKIE, jwt, cabinetSessionCookieOptions());

  return NextResponse.json({
    ok: true,
    user: { id: userId, email },
  });
}
