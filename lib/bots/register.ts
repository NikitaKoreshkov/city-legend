import pool, { ensureBotCouponSchema, ensureDatabase } from '@/lib/db';
import { generateCouponQR } from './qr';
import { normalizePhoneKey } from './phone';
import bcrypt from 'bcryptjs';

export type Platform = 'telegram' | 'max';

export interface RegisterResult {
  isNew: boolean;
  subscriberId: number;
  cabinetUserId?: number;
  couponCode: string;
  qrBuffer: Buffer;
  firstName: string;
}

function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BOT-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function registerBotUser(params: {
  platform: Platform;
  platformUserId: string;
  firstName: string;
  phone: string;
  email?: string;
  passwordPlain?: string;
}): Promise<RegisterResult> {
  await ensureDatabase();
  await ensureBotCouponSchema();

  const firstName = params.firstName.trim() || 'Гость';
  const phoneKey = normalizePhoneKey(params.phone);
  if (!phoneKey) throw new Error('PHONE_INVALID');

  const email = params.email?.trim().toLowerCase() || undefined;

  const existing = await pool.query<{
    id: number;
    cabinet_user_id: number | null;
    coupon_code: string | null;
  }>(
    `SELECT bs.id, bs.cabinet_user_id, cc.code AS coupon_code
     FROM bot_subscribers bs
     LEFT JOIN LATERAL (
       SELECT c.code FROM bot_coupon_sends bcs
       JOIN cabinet_coupons c ON c.id = bcs.coupon_id
       WHERE bcs.subscriber_id = bs.id
       ORDER BY bcs.sent_at DESC LIMIT 1
     ) cc ON TRUE
     WHERE bs.platform = $1 AND bs.platform_user_id = $2
     LIMIT 1`,
    [params.platform, params.platformUserId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    let couponCode = row.coupon_code?.trim().toUpperCase() || '';
    if (!couponCode) {
      const created = await createBotCoupon();
      couponCode = created.code;
      await pool.query(
        `INSERT INTO bot_coupon_sends (subscriber_id, coupon_id, coupon_code)
         VALUES ($1, $2, $3)`,
        [row.id, created.id, couponCode]
      );
    }

    if (email && params.passwordPlain) {
      const cabinetUserId = await linkOrCreateCabinetUser({
        email,
        passwordPlain: params.passwordPlain,
        firstName,
        phone: params.phone,
        phoneKey,
        existingCabinetUserId: row.cabinet_user_id,
      });
      if (cabinetUserId !== row.cabinet_user_id) {
        await pool.query(`UPDATE bot_subscribers SET cabinet_user_id = $1 WHERE id = $2`, [
          cabinetUserId,
          row.id,
        ]);
      }
      return {
        isNew: false,
        subscriberId: row.id,
        cabinetUserId,
        couponCode,
        qrBuffer: await generateCouponQR(couponCode),
        firstName,
      };
    }

    return {
      isNew: false,
      subscriberId: row.id,
      cabinetUserId: row.cabinet_user_id ?? undefined,
      couponCode,
      qrBuffer: await generateCouponQR(couponCode),
      firstName,
    };
  }

  const phoneConflict = await pool.query(
    `SELECT id FROM bot_subscribers WHERE phone_key = $1 AND is_active = TRUE LIMIT 1`,
    [phoneKey]
  );
  if (phoneConflict.rows.length > 0) throw new Error('PHONE_TAKEN');

  let cabinetUserId: number | undefined;
  if (email && params.passwordPlain) {
    cabinetUserId = await linkOrCreateCabinetUser({
      email,
      passwordPlain: params.passwordPlain,
      firstName,
      phone: params.phone,
      phoneKey,
    });
  }

  const sub = await pool.query<{ id: number }>(
    `INSERT INTO bot_subscribers (platform, platform_user_id, first_name, phone, phone_key, cabinet_user_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING id`,
    [params.platform, params.platformUserId, firstName, params.phone, phoneKey, cabinetUserId ?? null]
  );
  const subscriberId = sub.rows[0].id;

  const coupon = await createBotCoupon();
  await pool.query(
    `INSERT INTO bot_coupon_sends (subscriber_id, coupon_id, coupon_code)
     VALUES ($1, $2, $3)`,
    [subscriberId, coupon.id, coupon.code]
  );

  return {
    isNew: true,
    subscriberId,
    cabinetUserId,
    couponCode: coupon.code,
    qrBuffer: await generateCouponQR(coupon.code),
    firstName,
  };
}

async function createBotCoupon(): Promise<{ id: number; code: string }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCouponCode();
    const result = await pool.query<{ id: number }>(
      `INSERT INTO cabinet_coupons
         (code, title, discount_percent, min_total_rub, expires_at, active)
       VALUES ($1, $2, 10, 0, NOW() + INTERVAL '365 days', TRUE)
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [code, 'Купон бота City Legend']
    );
    if (result.rows.length > 0) {
      return { id: result.rows[0].id, code };
    }
  }
  throw new Error('COUPON_GENERATE_FAILED');
}

async function linkOrCreateCabinetUser(params: {
  email: string;
  passwordPlain: string;
  firstName: string;
  phone: string;
  phoneKey: string;
  existingCabinetUserId?: number | null;
}): Promise<number> {
  const emailTaken = await pool.query(
    `SELECT id FROM cabinet_users WHERE LOWER(email) = $1 LIMIT 1`,
    [params.email]
  );
  if (emailTaken.rows.length > 0) {
    const id = emailTaken.rows[0].id as number;
    if (params.existingCabinetUserId && params.existingCabinetUserId === id) {
      const hash = await bcrypt.hash(params.passwordPlain, 10);
      await pool.query(`UPDATE cabinet_users SET password_hash = $1 WHERE id = $2`, [hash, id]);
      return id;
    }
    throw new Error('EMAIL_TAKEN');
  }

  const hash = await bcrypt.hash(params.passwordPlain, 10);
  const created = await pool.query<{ id: number }>(
    `INSERT INTO cabinet_users (email, password_hash, display_name, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [params.email, hash, params.firstName, params.phone]
  );
  return created.rows[0].id;
}
