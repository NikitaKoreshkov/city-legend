import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Публичный lightweight health-check для UptimeRobot / cron.
 * Без секретов и внутренних деталей.
 */
export async function GET() {
  const ts = new Date().toISOString();
  try {
    await pool.query('SELECT 1');
    return NextResponse.json(
      { ok: true, db: true, ts },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: false, ts },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}
