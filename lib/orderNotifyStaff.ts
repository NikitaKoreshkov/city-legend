import { sendTelegramMessage } from '@/lib/bots/telegram';
import { maxSendHtml } from '@/lib/bots/max';

export type StaffOrderNotifyPayload = {
  reference: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  totalDisplay: string;
  summaryLine: string;
  deliveryCity: string;
  deliveryStreet: string;
  deliveryHouse: string;
  deliveryApartment: string;
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

function formatMessage(p: StaffOrderNotifyPayload): string {
  const addrParts = [p.deliveryCity, p.deliveryStreet, p.deliveryHouse]
    .map((x) => x.trim())
    .filter(Boolean);
  if (p.deliveryApartment.trim()) {
    addrParts.push(`кв./офис ${p.deliveryApartment.trim()}`);
  }
  const addrLine = addrParts.length ? `\nАдрес доставки: ${escapeHtml(addrParts.join(', '))}` : '';

  return (
    `<b>Оплачен заказ</b>\n` +
    `Номер: <code>${escapeHtml(p.reference)}</code>\n` +
    `Сумма: ${escapeHtml(p.totalDisplay)}\n` +
    `${escapeHtml(p.summaryLine)}\n\n` +
    `<b>Телефон:</b> ${escapeHtml(p.customerPhone)}\n` +
    `Имя: ${escapeHtml(p.customerName)}\n` +
    `Email: ${escapeHtml(p.customerEmail)}` +
    addrLine
  );
}

/**
 * Уведомления менеджерам в Telegram и Max (отдельные chat id через ORDER_NOTIFY_*).
 * Ошибки логируются, заказ не блокируются.
 */
export async function notifyStaffPaidOrder(p: StaffOrderNotifyPayload): Promise<void> {
  const text = formatMessage(p);
  const tgIds = parseChatIds(process.env.ORDER_NOTIFY_TELEGRAM_CHAT_IDS);
  const maxIds = parseChatIds(process.env.ORDER_NOTIFY_MAX_CHAT_IDS);

  const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (tgToken && tgIds.length) {
    await Promise.allSettled(
      tgIds.map(async (chatId) => {
        try {
          await sendTelegramMessage(chatId, text);
        } catch (e) {
          console.error('[notifyStaffPaidOrder] telegram', chatId, e);
        }
      })
    );
  }

  const maxToken = process.env.MAX_BOT_TOKEN?.trim();
  if (maxToken && maxIds.length) {
    await Promise.allSettled(
      maxIds.map(async (chatId) => {
        try {
          await maxSendHtml({ chatId }, text);
        } catch (e) {
          console.error('[notifyStaffPaidOrder] max', chatId, e);
        }
      })
    );
  }
}
