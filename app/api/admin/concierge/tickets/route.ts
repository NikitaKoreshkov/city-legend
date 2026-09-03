import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { notifyBotUser } from '@/lib/bots/notifyBotUser';
import { fetchActiveAssignees, resolveAssigneeLabel } from '@/lib/admin/assignees';

type AdminTicketBody = {
  ticketId?: number;
  status?: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  message?: string;
  managerName?: string;
  assigneeAdminId?: number | null;
};

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parseAssigneeId(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export async function GET() {
  const auth = await requireAdminApi('support.tickets');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();
  const [ticketsRes, assignees] = await Promise.all([
    pool.query(
      `SELECT t.id, t.user_id, u.email AS user_email, t.topic_key, tp.label AS topic_label,
              t.status, t.priority, t.subject, t.order_id, t.related_review_id,
              t.assigned_manager_name, t.assignee_admin_id,
              COALESCE(NULLIF(TRIM(au.display_name), ''), au.username) AS assignee_label,
              t.response_sla_minutes, t.first_response_due_at, t.created_at, t.updated_at, t.closed_at,
              m.message AS last_message, m.sender_type AS last_sender_type, m.created_at AS last_message_at
       FROM cabinet_concierge_tickets t
       LEFT JOIN cabinet_users u ON u.id = t.user_id
       LEFT JOIN cabinet_concierge_topics tp ON tp.topic_key = t.topic_key
       LEFT JOIN admin_users au ON au.id = t.assignee_admin_id
       LEFT JOIN LATERAL (
         SELECT message, sender_type, created_at
         FROM cabinet_concierge_messages cm
         WHERE cm.ticket_id = t.id
         ORDER BY cm.created_at DESC
         LIMIT 1
       ) m ON TRUE
       ORDER BY t.created_at DESC`
    ),
    fetchActiveAssignees(),
  ]);
  return NextResponse.json({
    assignees,
    tickets: ticketsRes.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email || null,
      topicKey: r.topic_key,
      topicLabel: r.topic_label || r.topic_key || '—',
      status: r.status,
      priority: r.priority,
      subject: r.subject,
      orderId: r.order_id,
      relatedReviewId: r.related_review_id != null ? Number(r.related_review_id) : null,
      assignedManagerName: r.assigned_manager_name || null,
      assigneeAdminId: r.assignee_admin_id != null ? Number(r.assignee_admin_id) : null,
      assigneeLabel: r.assignee_label || null,
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
  const auth = await requireAdminApi('support.tickets');
  if (auth instanceof NextResponse) return auth;
  await ensureDatabase();

  let body: AdminTicketBody;
  try {
    body = (await req.json()) as AdminTicketBody;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const ticketId = Number(body.ticketId || 0);
  const status = body.status;
  const message = clean(body.message);
  const assigneeAdminId = parseAssigneeId(body.assigneeAdminId);
  let managerName = clean(body.managerName);
  if (!Number.isFinite(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: 'Некорректный ticketId' }, { status: 400 });
  }

  if (assigneeAdminId !== undefined) {
    if (assigneeAdminId != null) {
      const label = await resolveAssigneeLabel(assigneeAdminId);
      if (!label) {
        return NextResponse.json({ error: 'Исполнитель не найден' }, { status: 400 });
      }
      if (!managerName) managerName = label;
    }
  }

  if (!managerName) managerName = 'Менеджер';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query(`SELECT id FROM cabinet_concierge_tickets WHERE id = $1 LIMIT 1`, [ticketId]);
    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Тикет не найден' }, { status: 404 });
    }

    if (message) {
      await client.query(
        `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message)
         VALUES ($1, 'manager', $2)`,
        [ticketId, message]
      );
    }

    if (assigneeAdminId !== undefined) {
      await client.query(
        `UPDATE cabinet_concierge_tickets
         SET status = COALESCE($2, status),
             assignee_admin_id = $3,
             assigned_manager_name = $4,
             updated_at = CURRENT_TIMESTAMP,
             last_manager_message_at = CASE WHEN $5 <> '' THEN CURRENT_TIMESTAMP ELSE last_manager_message_at END,
             closed_at = CASE WHEN $2 IN ('resolved', 'closed') THEN CURRENT_TIMESTAMP ELSE closed_at END
         WHERE id = $1`,
        [ticketId, status || null, assigneeAdminId, managerName, message]
      );
    } else {
      await client.query(
        `UPDATE cabinet_concierge_tickets
         SET status = COALESCE($2, status),
             assigned_manager_name = $3,
             updated_at = CURRENT_TIMESTAMP,
             last_manager_message_at = CASE WHEN $4 <> '' THEN CURRENT_TIMESTAMP ELSE last_manager_message_at END,
             closed_at = CASE WHEN $2 IN ('resolved', 'closed') THEN CURRENT_TIMESTAMP ELSE closed_at END
         WHERE id = $1`,
        [ticketId, status || null, managerName, message]
      );
    }
    await client.query('COMMIT');

    // Notify via bot (fire-and-forget)
    if (message) {
      const botRow = await pool.query<{ bot_platform: string; bot_chat_id: string }>(
        `SELECT bot_platform, bot_chat_id FROM cabinet_concierge_tickets WHERE id = $1 LIMIT 1`,
        [ticketId]
      );
      const row = botRow.rows[0];
      if (row?.bot_platform && row?.bot_chat_id) {
        notifyBotUser({
          platform: row.bot_platform as 'telegram' | 'max',
          botChatId: row.bot_chat_id,
          managerName,
          message,
        }).catch(e => console.error('[notifyBotUser]', e));
      }
    }

    // Notify via bot when ticket is resolved/closed (even without a message)
    if (status === 'resolved' || status === 'closed') {
      const botRow = await pool.query<{ bot_platform: string; bot_chat_id: string }>(
        `SELECT bot_platform, bot_chat_id FROM cabinet_concierge_tickets WHERE id = $1 LIMIT 1`,
        [ticketId]
      );
      const row = botRow.rows[0];
      if (row?.bot_platform && row?.bot_chat_id) {
        const statusText = status === 'resolved' ? 'решено' : 'закрыто';
        notifyBotUser({
          platform: row.bot_platform as 'telegram' | 'max',
          botChatId: row.bot_chat_id,
          managerName,
          message: message || `Ваше обращение #${ticketId} ${statusText}. Если появятся новые вопросы — напишите снова 🙂`,
        }).catch(e => console.error('[notifyBotUser close]', e));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('admin/concierge/tickets POST', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  } finally {
    client.release();
  }
}
