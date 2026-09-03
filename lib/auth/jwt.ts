import { SignJWT, jwtVerify } from 'jose';
import { CABINET_COOKIE_MAX_AGE } from './constants';

export type CabinetJwtPayload = {
  sub: string;
  email: string;
};

function getSecretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set in environment (min. 32 characters). Generate: openssl rand -base64 32'
    );
  }
  return new TextEncoder().encode(s);
}

export async function signCabinetToken(userId: number, email: string): Promise<string> {
  const key = getSecretKey();
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${CABINET_COOKIE_MAX_AGE}s`)
    .sign(key);
}

export async function verifyCabinetToken(
  token: string
): Promise<CabinetJwtPayload | null> {
  try {
    const key = getSecretKey();
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    const sub = payload.sub;
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}
