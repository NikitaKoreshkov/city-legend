import {
  resolveTelegramRelay,
  telegramApiFetch,
  telegramRelaySendPhotoBuffer,
} from './tgRelay';
import { FormData as TgFormData } from 'undici';

const TG_API = 'https://api.telegram.org';

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  return token;
}

async function tgCall(method: string, body: Record<string, unknown>): Promise<void> {
  const token = getToken();
  const res = await telegramApiFetch(`${TG_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: { ok?: boolean; description?: string } = {};
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    /* ignore */
  }
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed (${res.status}): ${data.description ?? text}`);
  }
}

export async function sendTelegramMessage(chatId: string, html: string): Promise<void> {
  await tgCall('sendMessage', {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/** Upload PNG buffer directly (relay JSON+base64 on prod, multipart otherwise). */
export async function sendTelegramPhotoBuffer(
  platformUserId: string,
  buffer: Buffer,
  caption: string
): Promise<void> {
  if (resolveTelegramRelay()) {
    const result = await telegramRelaySendPhotoBuffer(platformUserId, buffer, caption);
    if (!result.ok) {
      throw new Error(
        `Telegram sendPhoto failed (${result.status}): ${result.description ?? result.raw}`
      );
    }
    return;
  }

  const token = getToken();
  const form = new TgFormData();
  form.append('chat_id', platformUserId);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  const arrayBuf = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  form.append('photo', new Blob([arrayBuf], { type: 'image/png' }), 'qr.png');

  const res = await telegramApiFetch(`${TG_API}/bot${token}/sendPhoto`, {
    method: 'POST',
    body: form,
  });
  const text = await res.text();
  let data: { ok?: boolean; description?: string } = {};
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    /* ignore */
  }
  if (!res.ok || data.ok === false) {
    throw new Error(
      `Telegram sendPhoto failed (${res.status}): ${data.description ?? text}`
    );
  }
}

/** Sends a QR photo by public URL (works through JSON relay — no multipart). */
export async function sendTelegramCoupon(
  platformUserId: string,
  text: string,
  qrPublicUrl: string,
  couponCode: string
): Promise<void> {
  await tgCall('sendPhoto', {
    chat_id: platformUserId,
    photo: qrPublicUrl,
    caption: `${text}\n\nКупон: <code>${couponCode}</code>`,
    parse_mode: 'HTML',
  });
}
