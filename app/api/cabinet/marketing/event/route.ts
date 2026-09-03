import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';

type EventBody = {
  eventName?: string;
  entityType?: 'promotion' | 'news';
  entityId?: number;
  segment?: string;
  abBucket?: string;
  meta?: Record<string, unknown>;
};

function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  let body: EventBody;
  try {
    body = (await req.json()) as EventBody;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const eventName = cleanName(body.eventName);
  const entityType = body.entityType === 'promotion' || body.entityType === 'news' ? body.entityType : null;
  const entityId = Number(body.entityId || 0);
  const segment = typeof body.segment === 'string' ? body.segment.trim().toLowerCase() : 'all';
  const abBucket = typeof body.abBucket === 'string' ? body.abBucket.trim().toUpperCase() : 'A';
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};

  if (!eventName || !entityType || !Number.isFinite(entityId) || entityId <= 0) {
    return NextResponse.json({ error: 'Некорректные поля события' }, { status: 400 });
  }

  await ensureDatabase();
  await pool.query(
    `INSERT INTO cabinet_marketing_events
      (user_id, event_name, entity_type, entity_id, segment, ab_bucket, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [user.id, eventName, entityType, entityId, segment || 'all', abBucket || 'A', JSON.stringify(meta)]
  );

  return NextResponse.json({ ok: true });
}
