import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import {
  getBotsStats,
  querySubscribers,
  subscribersToCsv,
  type SubscriberListFilters,
} from '@/lib/bots/subscribersAdmin';

function parseFilters(req: NextRequest): SubscriberListFilters {
  const sp = req.nextUrl.searchParams;
  return {
    q: sp.get('q') ?? undefined,
    platform: (sp.get('platform') as 'telegram' | 'max' | 'all') ?? 'all',
    includeInactive: sp.get('includeInactive') === '1',
    hasCabinet: sp.get('hasCabinet') === '1' ? true : sp.get('hasCabinet') === '0' ? false : undefined,
    noCouponDays: sp.get('noCouponDays') ? Number(sp.get('noCouponDays')) : undefined,
    registeredFrom: sp.get('registeredFrom') ?? undefined,
    registeredTo: sp.get('registeredTo') ?? undefined,
    segment: (sp.get('segment') as SubscriberListFilters['segment']) ?? undefined,
    vipOnly: sp.get('vipOnly') === '1',
  };
}

/** GET ?export=csv | stats=1 | list filters */
export async function GET(req: NextRequest) {
  const auth = await requireAdminApi('bots.manage');
  if (auth instanceof NextResponse) return auth;

  try {
    if (req.nextUrl.searchParams.get('stats') === '1') {
      const stats = await getBotsStats();
      return NextResponse.json({ stats });
    }

    const filters = parseFilters(req);
    const subscribers = await querySubscribers(filters);

    if (req.nextUrl.searchParams.get('export') === 'csv') {
      const csv = subscribersToCsv(subscribers);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="bot-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const groupByPhone = req.nextUrl.searchParams.get('groupByPhone') === '1';
    if (groupByPhone) {
      const groups = new Map<string, typeof subscribers>();
      for (const s of subscribers) {
        const key = s.phone_key || `id:${s.id}`;
        const g = groups.get(key) ?? [];
        g.push(s);
        groups.set(key, g);
      }
      return NextResponse.json({
        subscribers,
        groups: Array.from(groups.entries()).map(([phoneKey, members]) => ({
          phoneKey,
          phone: members[0]?.phone ?? '',
          members,
          dualPlatform: new Set(members.map((m) => m.platform)).size > 1,
        })),
      });
    }

    return NextResponse.json({ subscribers });
  } catch (err) {
    console.error('[Admin Bots GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
