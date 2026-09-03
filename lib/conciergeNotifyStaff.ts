import pool from '@/lib/db';
import { sendTelegramMessage } from '@/lib/bots/telegram';
import { maxSendHtml } from '@/lib/bots/max';
import { getSiteUrl } from '@/lib/bots/couponDeliver';

export type NewConciergeTicketNotify = {
  ticketId: number;
  topicLabel: string;
  subject: string;
  customerName: string;
  customerEmail: string;
  messagePreview: string;
  source: 'site' | 'telegram' | 'max' | 'review';
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseChatIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function staffChatIds(): { tg: string[]; max: string[] } {
  const tg =
    parseChatIds(process.env.CONCIERGE_NOTIFY_TELEGRAM_CHAT_IDS) ||
    parseChatIds(process.env.ORDER_NOTIFY_TELEGRAM_CHAT_IDS);
  const max =
    parseChatIds(process.env.CONCIERGE_NOTIFY_MAX_CHAT_IDS) ||
    parseChatIds(process.env.ORDER_NOTIFY_MAX_CHAT_IDS);
  return { tg, max };
}

function formatTicketMessage(p: NewConciergeTicketNotify): string {
  const sourceLabel = {
    site: 'Сайт',
    telegram: 'Telegram',
    max: 'Max',
    review: 'Негативный отзыв',
  }[p.source];
  const adminUrl = `${getSiteUrl()}/admin/concierge`;
  const preview = p.messagePreview.trim().slice(0, 500);

  return (
    `<b>Новое обращение #${p.ticketId}</b>\n` +
    `Источник: ${sourceLabel}\n` +
    `Тема: ${escapeHtml(p.topicLabel)}\n` +
    `Заголовок: ${escapeHtml(p.subject)}\n\n` +
    `Клиент: ${escapeHtml(p.customerName || '—')}\n` +
    `Email: ${escapeHtml(p.customerEmail || '—')}\n\n` +
    `${escapeHtml(preview)}\n\n` +
    `<a href="${adminUrl}">Открыть в админке</a>`
  );
}

export async function fetchConciergeCustomerInfo(
  userId: number
): Promise<{ name: string; email: string }> {
  const res = await pool.query<{ email: string; display_name: string | null }>(
    `SELECT email, display_name FROM cabinet_users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = res.rows[0];
  const email = row?.email?.trim() || '—';
  const name = row?.display_name?.trim() || email.split('@')[0] || 'Клиент';
  return { name, email };
}

/**
 * Уведомления менеджерам о новом тикете поддержки.
 * CONCIERGE_NOTIFY_* или fallback на ORDER_NOTIFY_*.
 */
export async function notifyStaffNewConciergeTicket(p: NewConciergeTicketNotify): Promise<void> {
  const text = formatTicketMessage(p);
  const { tg, max } = staffChatIds();

  const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (tgToken && tg.length) {
    await Promise.allSettled(
      tg.map(async (chatId) => {
        try {
          await sendTelegramMessage(chatId, text);
        } catch (e) {
          console.error('[notifyStaffNewConciergeTicket] telegram', chatId, e);
        }
      })
    );
  }

  const maxToken = process.env.MAX_BOT_TOKEN?.trim();
  if (maxToken && max.length) {
    await Promise.allSettled(
      max.map(async (chatId) => {
        try {
          await maxSendHtml({ chatId }, text);
        } catch (e) {
          console.error('[notifyStaffNewConciergeTicket] max', chatId, e);
        }
      })
    );
  }
}
