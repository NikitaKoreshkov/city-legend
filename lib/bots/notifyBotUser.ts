/**
 * Send a manager reply to a user via the bot they originally used.
 * Called from the admin concierge ticket API after saving a manager message.
 */
import { telegramApiFetch } from '@/lib/bots/tgRelay';
import { maxSendHtml } from '@/lib/bots/max';

export async function notifyBotUser(params: {
  platform: 'telegram' | 'max';
  botChatId: string;
  managerName: string;
  message: string;
}): Promise<void> {
  const { platform, botChatId, managerName, message } = params;

  if (platform === 'telegram') {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
    const text = `💬 <b>Ответ от ${managerName}</b>\n\n${escapeHtml(message)}`;
    await telegramApiFetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: Number(botChatId), text, parse_mode: 'HTML' }),
      }
    );
    return;
  }

  if (platform === 'max') {
    const text = `💬 <b>Ответ от ${managerName}</b>\n\n${message}`;
    await maxSendHtml({ chatId: botChatId }, text);
    return;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
