import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

type TopicRow = {
  topic_key: string;
  label: string;
  sla_minutes: number;
  sort_order: number;
};

export async function GET() {
  const auth = await requireAdminApi('support.tickets');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();
  const res = await pool.query<TopicRow>(
    `SELECT topic_key, label, sla_minutes, sort_order
     FROM cabinet_concierge_topics
     ORDER BY sort_order ASC, topic_key ASC`
  );
  return NextResponse.json({
    topics: res.rows.map((r) => ({
      topicKey: r.topic_key,
      label: r.label,
      slaMinutes: Number(r.sla_minutes),
      sortOrder: Number(r.sort_order),
    })),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdminApi('support.tickets');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();

  let body: { topics?: { topicKey: string; label: string; slaMinutes: number; sortOrder: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const topics = body.topics;
  if (!Array.isArray(topics) || topics.length === 0) {
    return NextResponse.json({ error: 'Список тем пуст' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of topics) {
      const key = typeof t.topicKey === 'string' ? t.topicKey.trim() : '';
      const label = typeof t.label === 'string' ? t.label.trim() : '';
      const sla = Number(t.slaMinutes);
      const sort = Number(t.sortOrder);
      if (!key || !label) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Ключ и название темы обязательны' }, { status: 400 });
      }
      if (!Number.isFinite(sla) || sla < 1 || sla > 1440) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: `Некорректный SLA для «${label}»` }, { status: 400 });
      }
      await client.query(
        `UPDATE cabinet_concierge_topics
         SET label = $2, sla_minutes = $3, sort_order = $4
         WHERE topic_key = $1`,
        [key, label, Math.round(sla), Number.isFinite(sort) ? Math.round(sort) : 0]
      );
    }
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('admin/concierge/topics PUT', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  } finally {
    client.release();
  }
}
