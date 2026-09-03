import pool from '@/lib/db';
import { sendTelegramMessage } from '@/lib/bots/telegram';
import { maxSendHtml } from '@/lib/bots/max';
import { sendOrderPaidEmail } from '@/lib/mailer';

export type CustomerOrderNotifyPayload = {
  cabinetUserId: number;
  reference: string;
  totalDisplay: string;
  summaryLine: string;
  customerName: string;
  customerPhone: string;
  /** Email из формы заказа или ЛК */
  customerEmail?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatCustomerMessage(p: CustomerOrderNotifyPayload): string {
  return (
    `✅ <b>Заказ оплачен</b>\n\n` +
    `Номер: <code>${escapeHtml(p.reference)}</code>\n` +
    `Сумма: ${escapeHtml(p.totalDisplay)}\n` +
    `${escapeHtml(p.summaryLine)}\n\n` +
    `Телефон в заказе: ${escapeHtml(p.customerPhone)}\n` +
    `Имя: ${escapeHtml(p.customerName)}\n\n` +
    `Спасибо за покупку! Статус можно посмотреть в личном кабинете на сайте.`
  );
}

/**
 * Уведомление покупателю об оплате: email + Telegram / Max (если ЛК привязан к боту).
 */
export async function notifyCustomerOrderPaid(p: CustomerOrderNotifyPayload): Promise<void> {
  let email = (p.customerEmail || '').trim();
  if (!email) {
    const u = await pool.query<{ email: string }>(
      `SELECT email FROM cabinet_users WHERE id = $1 LIMIT 1`,
      [p.cabinetUserId]
    );
    email = (u.rows[0]?.email || '').trim();
  }

  const notifyTasks: Promise<unknown>[] = [];

  if (email.includes('@')) {
    notifyTasks.push(
      sendOrderPaidEmail({
        to: email,
        customerName: p.customerName,
        reference: p.reference,
        totalDisplay: p.totalDisplay,
        summaryLine: p.summaryLine,
      }).catch((e) => {
        console.error('[notifyCustomerOrderPaid] email', email, e);
      })
    );
  }

  const subs = await pool.query<{ platform: string; platform_user_id: string }>(
    `SELECT platform, platform_user_id FROM bot_subscribers
     WHERE is_active = TRUE AND cabinet_user_id = $1`,
    [p.cabinetUserId]
  );

  if (subs.rows.length > 0) {
    const text = formatCustomerMessage(p);
    const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const maxToken = process.env.MAX_BOT_TOKEN?.trim();

    for (const row of subs.rows) {
      notifyTasks.push(
        (async () => {
          try {
            if (row.platform === 'telegram' && tgToken) {
              await sendTelegramMessage(row.platform_user_id, text);
            } else if (row.platform === 'max' && maxToken) {
              await maxSendHtml({ chatId: row.platform_user_id }, text);
            }
          } catch (e) {
            console.error('[notifyCustomerOrderPaid]', row.platform, row.platform_user_id, e);
          }
        })()
      );
    }
  }

  await Promise.allSettled(notifyTasks);
}
