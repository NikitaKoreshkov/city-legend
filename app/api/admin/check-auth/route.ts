import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/apiAuth';

export async function GET() {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}

