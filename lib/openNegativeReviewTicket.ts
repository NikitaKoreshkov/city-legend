import pool from '@/lib/db';
import { notifyBotUser } from '@/lib/bots/notifyBotUser';

/**
 * Авто-тикет поддержки при оценке ≤2: тема «Негативный отзыв», привязка к review/order,
 * попытка проставить bot_platform/chat из привязанного аккаунта ЛК и уведомить клиента в боте.
 */
export async function openNegativeReviewTicket(params: {
  userId: number;
  reviewId: number;
  orderId: number;
  rating: number;
  lotTitle: string;
  reviewText: string;
}): Promise<number | null> {
  const topicRes = await pool.query<{ sla_minutes: number }>(
    `SELECT sla_minutes FROM cabinet_concierge_topics WHERE topic_key = 'review_negative' LIMIT 1`
  );
  if (!topicRes.rows.length) {
    console.warn('[openNegativeReviewTicket] topic review_negative missing');
    return null;
  }
  const sla = Number(topicRes.rows[0].sla_minutes || 30);
  const subject = `Отзыв ${params.rating}★ — ${params.lotTitle.slice(0, 120)}`;
  const client = await pool.connect();
  let botRow: { platform: string; platform_user_id: string } | null = null;
  try {
    await client.query('BEGIN');
    const ins = await client.query<{ id: number }>(
      `INSERT INTO cabinet_concierge_tickets
        (user_id, topic_key, status, priority, subject, order_id, assigned_manager_name,
         response_sla_minutes, first_response_due_at, last_customer_message_at, related_review_id)
       VALUES ($1, 'review_negative', 'open', 'high', $2, $3, 'Поддержка магазина', $4,
         CURRENT_TIMESTAMP + ($4::int * INTERVAL '1 minute'), CURRENT_TIMESTAMP, $5)
       RETURNING id`,
      [params.userId, subject, params.orderId, sla, params.reviewId]
    );
    const ticketId = ins.rows[0].id;

    const msg =
      `Оценка ${params.rating}/5 по «${params.lotTitle}».\n\nТекст отзыва:\n${params.reviewText}`;

    await client.query(
      `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message) VALUES ($1, 'customer', $2)`,
      [ticketId, msg]
    );
    await client.query(
      `INSERT INTO cabinet_concierge_messages (ticket_id, sender_type, message) VALUES ($1, 'system', $2)`,
      [
        ticketId,
        'Обращение открыто автоматически из негативного отзыва. Ответ менеджера клиент получит в Telegram или Max, если аккаунт привязан к боту.',
      ]
    );

    const sub = await client.query<{ platform: string; platform_user_id: string }>(
      `SELECT platform, platform_user_id FROM bot_subscribers
       WHERE is_active = TRUE AND cabinet_user_id = $1
       ORDER BY CASE platform WHEN 'telegram' THEN 0 ELSE 1 END, id DESC
       LIMIT 1`,
      [params.userId]
    );
    if (sub.rows.length) {
      botRow = sub.rows[0];
      await client.query(
        `UPDATE cabinet_concierge_tickets SET bot_platform = $2, bot_chat_id = $3 WHERE id = $1`,
        [ticketId, botRow.platform, botRow.platform_user_id]
      );
    }

    await client.query('COMMIT');

    if (botRow) {
      notifyBotUser({
        platform: botRow.platform as 'telegram' | 'max',
        botChatId: botRow.platform_user_id,
        managerName: 'Поддержка City Legend',
        message: `Мы увидели ваш отзыв (${params.rating}/5) по «${params.lotTitle.slice(0, 160)}». Напишите сюда, если хотите обсудить заказ — менеджер ответит в этом чате.`,
      }).catch((e) => console.error('[openNegativeReviewTicket notify]', e));
    }

    return ticketId;
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[openNegativeReviewTicket]', e);
    return null;
  } finally {
    client.release();
  }
}
