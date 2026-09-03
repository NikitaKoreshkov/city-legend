import { FormData as UndiciFormData } from 'undici';
import { maxApiFetch } from '@/lib/bots/maxTls';

const MAX_API_BASE =
  process.env.MAX_API_BASE_URL?.trim() || 'https://platform-api2.max.ru';

export type MaxMessageTarget = { chatId?: string; userId?: string };

function getToken(): string {
  const token = process.env.MAX_BOT_TOKEN?.trim();
  if (!token) throw new Error('MAX_BOT_TOKEN not set');
  return token;
}

function authHeaders(): Record<string, string> {
  return { Authorization: getToken(), 'Content-Type': 'application/json' };
}

function messagesQueryString(target: MaxMessageTarget): string {
  const p = new URLSearchParams();
  if (target.chatId) p.set('chat_id', target.chatId);
  else if (target.userId) p.set('user_id', target.userId);
  else throw new Error('Max target requires chatId or userId');
  return p.toString();
}

export async function maxSendHtml(
  target: MaxMessageTarget,
  html: string,
  options?: { extraAttachments?: unknown[]; attachments?: unknown[]; disableLinkPreview?: boolean }
): Promise<void> {
  const body: Record<string, unknown> = { format: 'html', text: html };
  const attachments = options?.attachments ?? options?.extraAttachments;
  if (attachments?.length) {
    body.attachments = attachments;
  }
  if (options?.disableLinkPreview) {
    body.disable_link_preview = true;
  }
  const res = await maxApiFetch(`${MAX_API_BASE}/messages?${messagesQueryString(target)}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Max sendMessage failed (${res.status}): ${await res.text()}`);
  }
}

export async function maxSendTyping(chatId: string): Promise<void> {
  await maxApiFetch(`${MAX_API_BASE}/chats/${encodeURIComponent(chatId)}/actions`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ action: 'typing' }),
  }).catch(() => {});
}

export async function maxAnswerCallback(callbackId: string): Promise<void> {
  await maxApiFetch(`${MAX_API_BASE}/answers?callback_id=${encodeURIComponent(callbackId)}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  }).catch(() => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Max image upload: POST /uploads?type=image → upload binary to returned url → use token in message.
 * @see https://dev.max.ru/docs-api/methods/POST/uploads
 */
export async function maxUploadImageToken(imageBuffer: Buffer): Promise<string> {
  const metaRes = await maxApiFetch(`${MAX_API_BASE}/uploads?type=image`, {
    method: 'POST',
    headers: { Authorization: getToken() },
  });
  if (!metaRes.ok) {
    throw new Error(`Max upload meta failed (${metaRes.status}): ${await metaRes.text()}`);
  }

  const meta = (await metaRes.json()) as { url?: string; token?: string };
  if (!meta.url) throw new Error('Max upload url missing');

  // iu.oneme.ru — multipart через undici FormData (глобальный FormData давал BAD_REQUEST).
  // Обычный fetch: хост загрузки не platform-api2, свой CA-agent не нужен.
  const form = new UndiciFormData();
  const blob = new Blob([Uint8Array.from(imageBuffer)], { type: 'image/png' });
  form.append('data', blob, 'qr.png');

  const uploadRes = await fetch(meta.url, {
    method: 'POST',
    body: form as unknown as BodyInit,
  });
  const uploadText = await uploadRes.text();
  if (!uploadRes.ok) {
    throw new Error(`Max upload binary failed (${uploadRes.status}): ${uploadText.slice(0, 300)}`);
  }

  const token = extractMaxImageToken(uploadText, meta);
  if (!token) {
    throw new Error(`Max upload token missing (response: ${uploadText.slice(0, 200) || 'empty'})`);
  }
  return token;
}

function extractMaxImageToken(
  uploadText: string,
  meta: { token?: string }
): string | undefined {
  if (uploadText.trim()) {
    try {
      const data = JSON.parse(uploadText) as {
        token?: string;
        photos?: Record<string, { token?: string }>;
      };
      if (data.token) return data.token;
      if (data.photos) {
        for (const photo of Object.values(data.photos)) {
          if (photo?.token) return photo.token;
        }
      }
    } catch {
      /* empty or non-json body */
    }
  }
  return meta.token;
}

/** Inline keyboard row with a clipboard button — copies coupon code on tap in Max. */
export function maxCouponClipboardAttachment(couponCode: string): unknown {
  const code = couponCode.trim().toUpperCase();
  return {
    type: 'inline_keyboard',
    payload: {
      buttons: [[{ type: 'clipboard', text: '📋 Скопировать код', payload: code }]],
    },
  };
}

async function maxSendImageMessage(
  target: MaxMessageTarget,
  imagePayload: { token: string } | { url: string },
  payload: Record<string, unknown>,
  extraAttachments?: unknown[]
): Promise<void> {
  const attachments: unknown[] = [{ type: 'image', payload: imagePayload }];
  if (extraAttachments?.length) attachments.push(...extraAttachments);

  const body = {
    ...payload,
    attachments,
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    const sendRes = await maxApiFetch(`${MAX_API_BASE}/messages?${messagesQueryString(target)}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (sendRes.ok) return;
    const errBody = await sendRes.text();
    if (attempt < 3 && errBody.includes('attachment.not.ready')) continue;
    throw new Error(`Max sendPhoto failed (${sendRes.status}): ${errBody}`);
  }
}

/** Uploads a PNG buffer and sends it as a photo with an optional caption. */
export async function maxSendPhoto(
  chatId: string,
  imageBuffer: Buffer,
  caption?: string
): Promise<void> {
  const token = await maxUploadImageToken(imageBuffer);
  await sleep(300);

  const payload: Record<string, unknown> = {};
  if (caption) {
    payload.format = 'html';
    payload.text = caption;
  }

  await maxSendImageMessage({ chatId }, { token }, payload);
}

/**
 * Картинка по публичному HTTPS URL (предпочтительно для QR-купонов).
 * @see attachments.payload.url в POST /messages
 */
export async function maxSendPhotoHtmlFromUrl(
  target: MaxMessageTarget,
  imageUrl: string,
  captionHtml: string,
  options?: { extraAttachments?: unknown[] }
): Promise<void> {
  const url = imageUrl.trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`Max image url must be https (got: ${url.slice(0, 80)})`);
  }
  await maxSendImageMessage(
    target,
    { url },
    { format: 'html', text: captionHtml },
    options?.extraAttachments
  );
}

/** Photo with HTML caption; uses chat_id or user_id. Upload via /uploads. */
export async function maxSendPhotoHtml(
  target: MaxMessageTarget,
  imageBuffer: Buffer,
  captionHtml: string,
  options?: { extraAttachments?: unknown[] }
): Promise<void> {
  const token = await maxUploadImageToken(imageBuffer);
  await sleep(300);
  await maxSendImageMessage(
    target,
    { token },
    { format: 'html', text: captionHtml },
    options?.extraAttachments
  );
}