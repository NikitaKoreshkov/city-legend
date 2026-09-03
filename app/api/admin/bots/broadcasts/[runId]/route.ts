import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { getBroadcastRun } from '@/lib/bots/broadcastEngine';

type RouteCtx = { params: Promise<{ runId: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  const runId = Number((await ctx.params).runId);
  if (!Number.isFinite(runId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const data = await getBroadcastRun(runId);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
