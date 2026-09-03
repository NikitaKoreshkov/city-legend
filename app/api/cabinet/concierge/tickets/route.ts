import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { notifyStaffNewConciergeTicket } from '@/lib/conciergeNotifyStaff';

type CreateTicketBody = {
  topicKey?: string;
  subject?: string;
  message?: string;
  orderId?: number | null;
};

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function GET() {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();

  const [topicsRes, ticketsRes] = await Promise.all([
    pool.query(
      `SELECT topic_key, label, sla_minutes
       FROM cabinet_concierge_topics
       ORDER BY sort_order ASC, topic_key ASC`
    ),
    pool.query(
      `SELECT t.id, t.topic_key, t.status, t.priority, t.subject, t.order_id, t.assigned_manager_name,
              t.response_sla_minutes, t.first_response_due_at, t.created_at, t.updated_at, t.closed_at,
              tp.label AS topic_label,
              m.message AS last_message, m.sender_type AS last_sender_type, m.created_at AS last_message_at
       FROM cabinet_concierge_tickets t
       JOIN cabinet_concierge_topics tp ON tp.topic_key = t.topic_key
       LEFT JOIN LATERAL (
         SELECT message, sender_type, created_at
         FROM cabinet_concierge_messages cm
         WHERE cm.ticket_id = t.id
         ORDER BY cm.created_at DESC
         LIMIT 1
       ) m ON TRUE
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
      [user.id]
    ),
  ]);

  return NextResponse.json({
    topics: topicsRes.rows.map((r) => ({
      key: r.topic_key,
      label: r.label,
      slaMinutes: Number(r.sla_minutes || 30),
    })),
    tickets: ticketsRes.rows.map((r) => ({
      id: r.id,
      topicKey: r.topic_key,
      topicLabel: r.topic_label,
      status: r.status,
      priority: r.priority,
      subject: r.subject,
      orderId: r.order_id,
      assignedManagerName: r.assigned_manager_name || null,
      responseSlaMinutes: Number(r.response_sla_minutes || 30),
      firstResponseDueAt: r.first_response_due_at ? new Date(r.first_response_due_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
      lastMessage: r.last_message || null,
      lastSenderType: r.last_sender_type || null,
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();

  let body: CreateTicketBody;
  try {
    body = (await req.json()) as CreateTicketBody;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const topicKey = clean(body.topicKey);
  const subject = clean(body.subject);
  const message = clean(body.message);
  const orderId = body.orderId ? Number(body.orderId) : null;
  if (!topicKey) return NextResponse.json({ error: 'Выберите тему' }, { status: 400 });
  if (subject.length < 3) return NextResponse.json({ error: 'Укажите тему обращения' }, { status: 400 });
  if (message.length < 5) return NextResponse.json({ error: 'Опишите запрос подробнее' }, { status: 400 });
  if (orderId && (!Number.isFinite(orderId) || orderId <= 0)) {
    return NextResponse.json({ error: 'Некорректный номер заказа' }, { status: 400 });
  }

  const topicRes = await pool.query(
    `SELECT topic_key, sla_minutes, label
     FROM cabinet_concierge_topics
     WHERE topic_key = $1
     LIMIT 1`,
    [topicKey]
  );
  if (topicRes.rows.length === 0) {
    return NextResponse.json({ error: 'Тема не найдена' }, { status: 404 });
  }
  const topic = topicRes.rows[0] as { topic_key: string; sla_minutes: number; label: string };

  if (orderId) {
    const ord = await pool.query(`SELECT id FROM cabinet_orders WHERE id = $1 AND user_id = $2 LIMIT 1`, [orderId, user.id]);
    if (ord.rows.length === 0) {
      return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ticketRes = await client.query(
      `INSERT INTO cabinet_concierge_tickets
         (user_id, topic_key, status, priority, subject, order_id, assigned_manager_name,
          response_sla_minutes, first_response_due_at, last_customer_message_at)
       VALUES ($1, $2, 'open', 'normal', $3, $4, 'Premium Concierge', $5,
               CURRENT_TIMESTAMP + ($5::int * INTERVAL '1 minute'), CURRENT_TIMESTAMP)
       RETURNING id, created_at`,
      [user.id, topic.topic_key, subject, orderId, Number(topic.sla_minutes || 30)]
    );
    const ticketId = (ticketRes.rows[0] as { id: number }).id;
    await client.query(
      `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message)
       VALUES ($1, 'customer', $2)`,
      [ticketId, message]
    );
    await client.query(
      `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message)
       VALUES ($1, 'system', $2)`,
      [ticketId, `Спасибо, обращение принято. Тема: ${topic.label}. Мы ответим в пределах SLA.`]
    );
    await client.query('COMMIT');

    notifyStaffNewConciergeTicket({
      ticketId,
      topicLabel: topic.label,
      subject,
      customerName: user.name || user.email.split('@')[0] || 'Клиент',
      customerEmail: user.email,
      messagePreview: message,
      source: 'site',
    }).catch((e) => console.error('[concierge/tickets POST notify]', e));

    return NextResponse.json({ ok: true, ticketId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('concierge/tickets POST', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  } finally {
    client.release();
  }
}
