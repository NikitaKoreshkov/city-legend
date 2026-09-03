import { SignJWT, jwtVerify } from 'jose';
import { ADMIN_COOKIE_MAX_AGE } from './constants';

function getSecretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set in environment (min. 32 characters). Generate: openssl rand -base64 32'
    );
  }
  return new TextEncoder().encode(s);
}

/** В токене только идентификатор пользователя; роль подгружается из БД на каждый запрос. */
export async function signAdminToken(userId: number): Promise<string> {
  const key = getSecretKey();
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_COOKIE_MAX_AGE}s`)
    .sign(key);
}

export async function verifyAdminToken(token: string): Promise<{ sub: string } | null> {
  try {
    const key = getSecretKey();
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    const sub = payload.sub;
    if (!sub || typeof sub !== 'string') return null;
    return { sub };
  } catch {
    return null;
  }
}
