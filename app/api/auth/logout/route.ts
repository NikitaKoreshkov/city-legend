import { NextResponse } from 'next/server';
import { clearCabinetSessionOnResponse } from '@/lib/auth/cookieOptions';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearCabinetSessionOnResponse(response);
  return response;
}
