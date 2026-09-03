import { NextResponse } from 'next/server';
import { getSiteShell } from '@/lib/siteShell';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const shell = await getSiteShell();
    return NextResponse.json(shell, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (e) {
    console.error('site-shell GET:', e);
    return NextResponse.json(
      { error: 'Недоступно' },
      { status: 503 }
    );
  }
}
