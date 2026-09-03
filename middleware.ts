import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_TOKEN_COOKIE } from '@/lib/admin/constants';

/**
 * Origin для редиректов за nginx.
 * При HOSTNAME=127.0.0.1 request.nextUrl становится localhost:3000 — браузер уезжает с прода.
 */
function publicOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (fromEnv) {
    try {
      const u = new URL(fromEnv);
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        return `${u.protocol}//${u.host}`;
      }
    } catch {
      /* ignore */
    }
  }

  const proto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  const host = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    ''
  )
    .split(',')[0]
    .trim();

  if (host && host !== 'localhost' && !host.startsWith('127.0.0.1')) {
    return `${proto}://${host}`;
  }

  return 'https://citylegend.art';
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_TOKEN_COOKIE)?.value;
  if (!token) {
    const login = new URL('/admin/login', publicOrigin(request));
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
