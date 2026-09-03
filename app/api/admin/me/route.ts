import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/apiAuth';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type AdminRole } from '@/lib/admin/roles';

export async function GET() {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role as AdminRole],
      roleDescription: ROLE_DESCRIPTIONS[user.role as AdminRole],
      permissions: user.permissions,
    },
  });
}
