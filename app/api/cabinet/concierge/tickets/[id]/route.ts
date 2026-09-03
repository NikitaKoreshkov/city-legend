import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';

type SendMessageBody = { message?: string };

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();

  const params = await ctx.params;
  const id = Number(params.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Некорректный id тикета' }, { status: 400 });
  }

  const ticketRes = await pool.query(
    `SELECT t.id, t.topic_key, t.status, t.priority, t.subject, t.order_id, t.assigned_manager_name,
            t.response_sla_minutes, t.first_response_due_at, t.created_at, t.updated_at, t.closed_at,
            tp.label AS topic_label
     FROM cabinet_concierge_tickets t
     JOIN cabinet_concierge_topics tp ON tp.topic_key = t.topic_key
     WHERE t.id = $1 AND t.user_id = $2
     LIMIT 1`,
    [id, user.id]
  );
  if (ticketRes.rows.length === 0) {
    return NextResponse.json({ error: 'Тикет не найден' }, { status: 404 });
  }

  const msgRes = await pool.query(
    `SELECT id, sender_type, message, created_at
     FROM cabinet_concierge_messages
     WHERE ticket_id = $1
     ORDER BY created_at ASC, id ASC`,
    [id]
  );
  const t = ticketRes.rows[0] as {
    id: number;
    topic_key: string;
    topic_label: string;
    status: string;
    priority: string;
    subject: string;
    order_id: number | null;
    assigned_manager_name: string | null;
    response_sla_minutes: number;
    first_response_due_at: Date | null;
    created_at: Date;
    updated_at: Date;
    closed_at: Date | null;
  };
  return NextResponse.json({
    ticket: {
      id: t.id,
      topicKey: t.topic_key,
      topicLabel: t.topic_label,
      status: t.status,
      priority: t.priority,
      subject: t.subject,
      orderId: t.order_id,
      assignedManagerName: t.assigned_manager_name || null,
      responseSlaMinutes: Number(t.response_sla_minutes || 30),
      firstResponseDueAt: t.first_response_due_at ? t.first_response_due_at.toISOString() : null,
      createdAt: t.created_at.toISOString(),
      updatedAt: t.updated_at.toISOString(),
      closedAt: t.closed_at ? t.closed_at.toISOString() : null,
    },
    messages: msgRes.rows.map((m) => ({
      id: m.id,
      senderType: m.sender_type,
      message: m.message,
      createdAt: new Date(m.created_at).toISOString(),
    })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();

  const params = await ctx.params;
  const id = Number(params.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Некорректный id тикета' }, { status: 400 });
  }

  let body: SendMessageBody;
  try {
    body = (await req.json()) as SendMessageBody;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }
  const message = clean(body.message);
  if (message.length < 2) {
    return NextResponse.json({ error: 'Сообщение слишком короткое' }, { status: 400 });
  }

  const ticketRes = await pool.query(
    `SELECT id, status
     FROM cabinet_concierge_tickets
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, user.id]
  );
  if (ticketRes.rows.length === 0) {
    return NextResponse.json({ error: 'Тикет не найден' }, { status: 404 });
  }
  const ticket = ticketRes.rows[0] as { id: number; status: string };
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return NextResponse.json({ error: 'Тикет закрыт. Создайте новое обращение.' }, { status: 400 });
  }

  await pool.query(
    `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message)
     VALUES ($1, 'customer', $2)`,
    [id, message]
  );
  await pool.query(
    `UPDATE cabinet_concierge_tickets
     SET status = CASE WHEN status = 'waiting_customer' THEN 'open' ELSE status END,
         updated_at = CURRENT_TIMESTAMP,
         last_customer_message_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id]
  );

  return NextResponse.json({ ok: true });
}
