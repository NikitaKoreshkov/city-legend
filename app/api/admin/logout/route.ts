import { NextResponse } from 'next/server';
import { ADMIN_TOKEN_COOKIE } from '@/lib/admin/constants';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(ADMIN_TOKEN_COOKIE);
  response.cookies.delete('admin_session');
  return response;
}
