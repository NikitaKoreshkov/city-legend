import type { NextRequest } from 'next/server';

export function getClientIp(request: Request | NextRequest): string {
  const h = request.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
