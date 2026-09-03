import { NextResponse } from 'next/server';
import { getResolvedLegal } from '@/lib/siteLegal';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const legal = await getResolvedLegal();
    return NextResponse.json(legal, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (e) {
    console.error('site-legal GET:', e);
    return NextResponse.json(
      { error: 'Недоступно' },
      { status: 503 }
    );
  }
}
