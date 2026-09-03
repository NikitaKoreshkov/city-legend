import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { getTriggerSettings, updateTriggerSettings } from '@/lib/bots/triggers';

export async function GET() {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  const settings = await getTriggerSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  await updateTriggerSettings(body as Parameters<typeof updateTriggerSettings>[0]);
  return NextResponse.json({ ok: true, settings: await getTriggerSettings() });
}
