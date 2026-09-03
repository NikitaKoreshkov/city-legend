import type { NextResponse } from 'next/server';
import { CABINET_COOKIE, CABINET_COOKIE_MAX_AGE } from './constants';

function useSecureCookies(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().toLowerCase();
  return site.startsWith('https://');
}

/** Общий домен cookie — сессия видна и на citylegend.art, и на www (nginx редиректит www → apex). */
export function cabinetCookieDomain(): string | undefined {
  const explicit = process.env.CABINET_COOKIE_DOMAIN?.trim();
  if (explicit) return explicit;

  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  try {
    const host = new URL(site).hostname.toLowerCase();
    if (host === 'citylegend.art' || host.endsWith('.citylegend.art')) {
      return '.citylegend.art';
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function cabinetSessionCookieOptions() {
  const opts: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    maxAge: number;
    path: '/';
    domain?: string;
  } = {
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: 'lax',
    maxAge: CABINET_COOKIE_MAX_AGE,
    path: '/',
  };
  const domain = cabinetCookieDomain();
  if (domain) opts.domain = domain;
  return opts;
}

export function setCabinetSessionOnResponse(response: NextResponse, token: string): void {
  response.cookies.set(CABINET_COOKIE, token, cabinetSessionCookieOptions());
}

export function clearCabinetSessionOnResponse(response: NextResponse): void {
  response.cookies.set(CABINET_COOKIE, '', { ...cabinetSessionCookieOptions(), maxAge: 0 });
}

export function clearCabinetSessionInStore(
  jar: { delete: (opts: { name: string; path: string; domain?: string }) => void }
): void {
  const opts = cabinetSessionCookieOptions();
  jar.delete({
    name: CABINET_COOKIE,
    path: opts.path,
    ...(opts.domain ? { domain: opts.domain } : {}),
  });
}
