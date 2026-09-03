import path from 'path';
import fs from 'fs/promises';
import pool, { ensureDatabase } from '@/lib/db';
import { generateCouponQR } from './qr';
import { sendTelegramCoupon, sendTelegramPhotoBuffer } from './telegram';
import { maxSendHtml, maxSendPhotoHtml, maxSendPhotoHtmlFromUrl } from './max';
import type { Platform } from './register';

export type { Platform };

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://citylegend.art').replace(/\/$/, '');
}

export function getPromoUrl(couponCode: string): string {
  return `${getSiteUrl()}/promo?code=${encodeURIComponent(couponCode.trim().toUpperCase())}`;
}

/** Saves PNG to public/uploads/qr and returns buffers + URLs. */
export async function saveCouponQrPublic(couponCode: string): Promise<{
  buffer: Buffer;
  qrUrl: string;
  promoUrl: string;
}> {
  const code = couponCode.trim().toUpperCase();
  const buffer = await generateCouponQR(code);
  const siteUrl = getSiteUrl();
  const uploadsBase = process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), 'public');
  const uploadsDir = path.join(uploadsBase, 'uploads', 'qr');
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, `${code}.png`), buffer);
  return {
    buffer,
    qrUrl: `${siteUrl}/uploads/qr/${code}.png`,
    promoUrl: getPromoUrl(code),
  };
}

export function buildCouponDeliveryCaption(
  messageText: string,
  couponCode: string,
  options?: { discountPercent?: number; promoUrl?: string }
): string {
  const lines = [messageText.trim()];
  lines.push('');
  lines.push(`Купон: <code>${couponCode.toUpperCase()}</code>`);
  if (options?.discountPercent != null && options.discountPercent > 0) {
    lines.push(`Скидка: <b>${options.discountPercent}%</b>`);
  }
  lines.push('');
  lines.push('Введите код на сайте при оплате или отсканируйте QR.');
  if (options?.promoUrl) {
    lines.push(`🔗 <a href="${options.promoUrl}">Активировать на сайте</a>`);
  }
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}

export function generateCouponCode(prefix = 'PROMO'): string {
  const p = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'PROMO';
  let code = `${p}-`;
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function resolveCouponForDelivery(options: {
  mode: 'existing' | 'create';
  couponCode?: string;
  title?: string;
  discountPercent?: number;
  minTotalRub?: number;
  expiryDays?: number;
  codePrefix?: string;
}): Promise<{ couponId: number; code: string; discountPercent: number }> {
  await ensureDatabase();

  if (options.mode === 'existing') {
    const code = String(options.couponCode || '').trim().toUpperCase();
    if (!code) throw new Error('COUPON_CODE_REQUIRED');
    const row = await pool.query<{
      id: number;
      code: string;
      discount_percent: number;
      active: boolean;
      expires_at: Date | null;
    }>(
      `SELECT id, code, discount_percent, active, expires_at
       FROM cabinet_coupons WHERE UPPER(code) = $1 LIMIT 1`,
      [code]
    );
    if (row.rows.length === 0) throw new Error('COUPON_NOT_FOUND');
    const c = row.rows[0];
    if (!c.active) throw new Error('COUPON_INACTIVE');
    if (c.expires_at && c.expires_at.getTime() < Date.now()) throw new Error('COUPON_EXPIRED');
    return { couponId: c.id, code: c.code.toUpperCase(), discountPercent: c.discount_percent };
  }

  const discountPercent = Math.min(100, Math.max(1, Number(options.discountPercent) || 10));
  const minTotalRub = Math.max(0, Number(options.minTotalRub) || 0);
  const expiryDays = Math.max(1, Number(options.expiryDays) || 30);
  const title = (options.title || 'Персональный купон').trim();
  const prefix = (options.codePrefix || 'PROMO').trim();

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCouponCode(prefix);
    const result = await pool.query<{ id: number }>(
      `INSERT INTO cabinet_coupons
         (code, title, discount_percent, min_total_rub, expires_at, active)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::INTERVAL, TRUE)
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [code, title, discountPercent, minTotalRub, String(expiryDays)]
    );
    if (result.rows.length > 0) {
      return { couponId: result.rows[0].id, code, discountPercent };
    }
  }
  throw new Error('COUPON_GENERATE_FAILED');
}

export async function recordCouponSend(
  subscriberId: number,
  couponId: number | null,
  couponCode: string
): Promise<void> {
  await pool.query(
    `INSERT INTO bot_coupon_sends (subscriber_id, coupon_id, coupon_code)
     VALUES ($1, $2, $3)`,
    [subscriberId, couponId, couponCode.toUpperCase()]
  );
}

export type BotSubscriberRow = {
  id: number;
  platform: Platform;
  platform_user_id: string;
  first_name: string;
  phone: string;
  phone_key: string | null;
  cabinet_user_id: number | null;
  is_active: boolean;
  registered_at: string;
};

export async function getSubscriberById(id: number): Promise<BotSubscriberRow | null> {
  await ensureDatabase();
  const res = await pool.query<BotSubscriberRow>(
    `SELECT id, platform, platform_user_id, first_name, phone, phone_key, cabinet_user_id, is_active, registered_at
     FROM bot_subscribers WHERE id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function getSubscribersByCabinetUserId(cabinetUserId: number): Promise<BotSubscriberRow[]> {
  await ensureDatabase();
  const res = await pool.query<BotSubscriberRow>(
    `SELECT id, platform, platform_user_id, first_name, phone, cabinet_user_id, is_active, registered_at
     FROM bot_subscribers
     WHERE cabinet_user_id = $1 AND is_active = TRUE
     ORDER BY registered_at DESC`,
    [cabinetUserId]
  );
  return res.rows;
}

/** Delivers QR + caption to one bot subscriber. */
export async function deliverCouponToSubscriber(params: {
  platform: Platform;
  platformUserId: string;
  couponCode: string;
  messageText: string;
  discountPercent?: number;
  /** Prefer buffer upload (reliable); falls back to public URL for TG if omitted. */
  qrBuffer?: Buffer;
  qrPublicUrl?: string;
}): Promise<void> {
  const code = params.couponCode.toUpperCase();
  const promoUrl = getPromoUrl(code);
  const caption = buildCouponDeliveryCaption(params.messageText, code, {
    discountPercent: params.discountPercent,
    promoUrl,
  });

  let buffer = params.qrBuffer;
  let qrUrl = params.qrPublicUrl;
  if (buffer == null || !qrUrl) {
    const saved = await saveCouponQrPublic(code);
    buffer = buffer ?? saved.buffer;
    qrUrl = qrUrl ?? saved.qrUrl;
  }

  if (params.platform === 'telegram') {
    if (buffer) {
      await sendTelegramPhotoBuffer(params.platformUserId, buffer, caption);
    } else if (qrUrl) {
      await sendTelegramCoupon(params.platformUserId, params.messageText, qrUrl, code);
    } else {
      throw new Error('QR delivery failed');
    }
    return;
  }

  if (params.platform === 'max') {
    // Публичный HTTPS URL — Max скачивает сам; multipart на iu.oneme.ru часто BAD_REQUEST.
    if (qrUrl && /^https:\/\//i.test(qrUrl)) {
      await maxSendPhotoHtmlFromUrl({ userId: params.platformUserId }, qrUrl, caption);
      return;
    }
    await maxSendPhotoHtml({ userId: params.platformUserId }, buffer!, caption);
    return;
  }

  throw new Error('UNKNOWN_PLATFORM');
}

/** Sends plain text to subscriber (no coupon). */
export async function deliverTextToSubscriber(params: {
  platform: Platform;
  platformUserId: string;
  text: string;
}): Promise<void> {
  if (params.platform === 'telegram') {
    const { sendTelegramMessage } = await import('./telegram');
    await sendTelegramMessage(params.platformUserId, params.text);
    return;
  }
  if (params.platform === 'max') {
    await maxSendHtml({ userId: params.platformUserId }, params.text);
    return;
  }
  throw new Error('UNKNOWN_PLATFORM');
}

export interface SendCouponToSubscriberInput {
  subscriberId: number;
  messageText?: string;
  mode: 'existing' | 'create';
  couponCode?: string;
  title?: string;
  discountPercent?: number;
  minTotalRub?: number;
  expiryDays?: number;
  codePrefix?: string;
}

export async function sendCouponToSubscriber(input: SendCouponToSubscriberInput): Promise<{
  couponCode: string;
  discountPercent: number;
}> {
  const sub = await getSubscriberById(input.subscriberId);
  if (!sub) throw new Error('SUBSCRIBER_NOT_FOUND');
  if (!sub.is_active) throw new Error('SUBSCRIBER_INACTIVE');

  const resolved = await resolveCouponForDelivery({
    mode: input.mode,
    couponCode: input.couponCode,
    title: input.title,
    discountPercent: input.discountPercent,
    minTotalRub: input.minTotalRub,
    expiryDays: input.expiryDays,
    codePrefix: input.codePrefix,
  });

  const { buffer, qrUrl } = await saveCouponQrPublic(resolved.code);
  const messageText =
    input.messageText?.trim() ||
    `🎁 <b>Персональный купон</b> от City Legend`;

  await deliverCouponToSubscriber({
    platform: sub.platform as Platform,
    platformUserId: sub.platform_user_id,
    couponCode: resolved.code,
    messageText,
    discountPercent: resolved.discountPercent,
    qrBuffer: buffer,
    qrPublicUrl: qrUrl,
  });

  await recordCouponSend(sub.id, resolved.couponId, resolved.code);

  return { couponCode: resolved.code, discountPercent: resolved.discountPercent };
}

/** QR immediately after bot registration (does not consume daily «Мой купон» quota semantics — sets last_qr_sent_at). */
export async function deliverRegistrationCouponQr(params: {
  platform: Platform;
  platformUserId: string;
  subscriberId: number;
  couponCode: string;
  firstName: string;
  qrBuffer: Buffer;
  discountPercent?: number;
}): Promise<void> {
  const messageText =
    `🎉 <b>${params.firstName}</b>, ваш купон на скидку <b>${params.discountPercent ?? 10}%</b>`;

  await deliverCouponToSubscriber({
    platform: params.platform,
    platformUserId: params.platformUserId,
    couponCode: params.couponCode,
    messageText,
    discountPercent: params.discountPercent ?? 10,
    qrBuffer: params.qrBuffer,
  });

  await pool.query(`UPDATE bot_subscribers SET last_qr_sent_at = NOW() WHERE id = $1`, [
    params.subscriberId,
  ]);
}
