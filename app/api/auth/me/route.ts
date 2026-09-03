import { NextResponse } from 'next/server';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';

export async function GET() {
  try {
    const user = await getCabinetUserFromCookies();
    return NextResponse.json({ user: user ? { id: user.id, email: user.email, name: user.name } : null });
  } catch (e) {
    console.error('auth/me', e);
    return NextResponse.json({ user: null });
  }
}
