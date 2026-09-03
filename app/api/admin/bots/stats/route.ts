import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { getBotsStats } from '@/lib/bots/subscribersAdmin';

export async function GET(_req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  try {
    const stats = await getBotsStats();
    return NextResponse.json({ stats });
  } catch (err) {
    console.error('[Admin Bots stats]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
