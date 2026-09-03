import pool, { ensureBotCouponSchema } from '@/lib/db';
import { deliverTextToSubscriber } from './couponDeliver';
import type { Platform } from './register';
import { applyBroadcastTemplate } from './templateVars';

export type TriggerSettings = {
  abandoned_cart_enabled: boolean;
  abandoned_cart_hours: number;
  abandoned_cart_text: string | null;
  post_purchase_enabled: boolean;
  post_purchase_days: number;
  post_purchase_text: string | null;
  birthday_enabled: boolean;
  birthday_text: string | null;
};

export async function getTriggerSettings(): Promise<TriggerSettings> {
  await ensureBotCouponSchema();
  const res = await pool.query<TriggerSettings>(`SELECT * FROM bot_trigger_settings WHERE id = 1`);
  return (
    res.rows[0] ?? {
      abandoned_cart_enabled: false,
      abandoned_cart_hours: 24,
      abandoned_cart_text: null,
      post_purchase_enabled: false,
      post_purchase_days: 7,
      post_purchase_text: null,
      birthday_enabled: false,
      birthday_text: null,
    }
  );
}

export async function updateTriggerSettings(patch: Partial<TriggerSettings>): Promise<void> {
  await ensureBotCouponSchema();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    fields.push(`${key} = $${i++}`);
    values.push(val);
  }
  if (fields.length === 0) return;
  fields.push('updated_at = NOW()');
  await pool.query(`UPDATE bot_trigger_settings SET ${fields.join(', ')} WHERE id = 1`, values);
}

async function markTriggerSent(triggerType: string, subscriberId: number, refKey: string): Promise<void> {
  await pool.query(
    `INSERT INTO bot_trigger_sent (trigger_type, subscriber_id, ref_key)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [triggerType, subscriberId, refKey]
  );
}

export async function runBotTriggers(): Promise<{ sent: number; errors: number }> {
  await ensureBotCouponSchema();
  const settings = await getTriggerSettings();
  let sent = 0;
  let errors = 0;

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://citylegend.art').replace(/\/$/, '');

  if (settings.abandoned_cart_enabled) {
    const hours = Math.max(1, settings.abandoned_cart_hours);
    const textTemplate =
      settings.abandoned_cart_text?.trim() ||
      '{имя}, в корзине остались изделия. Завершите заказ: ' + siteUrl + '/?cabinet=1';
    const rows = await pool.query<{
      subscriber_id: number;
      platform: Platform;
      platform_user_id: string;
      first_name: string;
      user_id: number;
    }>(
      `SELECT bs.id AS subscriber_id, bs.platform, bs.platform_user_id, bs.first_name, c.user_id
       FROM bot_subscribers bs
       JOIN cabinet_users cu ON cu.id = bs.cabinet_user_id
       JOIN cabinet_cart c ON c.user_id = cu.id
       WHERE bs.is_active = TRUE AND bs.cabinet_user_id IS NOT NULL
         AND jsonb_array_length(c.items::jsonb) > 0
         AND c.updated_at <= NOW() - ($1::int * INTERVAL '1 hour')
         AND c.updated_at >= NOW() - INTERVAL '7 days'`,
      [hours]
    );
    for (const row of rows.rows) {
      const refKey = `cart:${row.user_id}:${Math.floor(Date.now() / (hours * 3600_000))}`;
      try {
        const dup = await pool.query(
          `SELECT 1 FROM bot_trigger_sent WHERE trigger_type = 'abandoned_cart' AND subscriber_id = $1 AND ref_key = $2`,
          [row.subscriber_id, refKey]
        );
        if (dup.rows.length) continue;
        await deliverTextToSubscriber({
          platform: row.platform,
          platformUserId: row.platform_user_id,
          text: applyBroadcastTemplate(textTemplate, { firstName: row.first_name }),
        });
        await markTriggerSent('abandoned_cart', row.subscriber_id, refKey);
        sent++;
      } catch (e) {
        console.error('[Trigger abandoned_cart]', e);
        errors++;
      }
    }
  }

  if (settings.post_purchase_enabled) {
    const days = Math.max(1, settings.post_purchase_days);
    const textTemplate =
      settings.post_purchase_text?.trim() ||
      '{имя}, спасибо за покупку! Как вам изделие? Напишите нам — мы всегда на связи.';
    const rows = await pool.query<{
      subscriber_id: number;
      platform: Platform;
      platform_user_id: string;
      first_name: string;
      order_id: number;
    }>(
      `SELECT bs.id AS subscriber_id, bs.platform, bs.platform_user_id, bs.first_name, o.id AS order_id
       FROM bot_subscribers bs
       JOIN cabinet_orders o ON o.user_id = bs.cabinet_user_id
       WHERE bs.is_active = TRUE
         AND o.status IN ('paid', 'delivered', 'completed', 'processing')
         AND o.created_at::date = (CURRENT_DATE - ($1::int * INTERVAL '1 day'))::date`,
      [days]
    );
    for (const row of rows.rows) {
      const refKey = `order:${row.order_id}`;
      try {
        const dup = await pool.query(
          `SELECT 1 FROM bot_trigger_sent WHERE trigger_type = 'post_purchase' AND subscriber_id = $1 AND ref_key = $2`,
          [row.subscriber_id, refKey]
        );
        if (dup.rows.length) continue;
        await deliverTextToSubscriber({
          platform: row.platform,
          platformUserId: row.platform_user_id,
          text: applyBroadcastTemplate(textTemplate, { firstName: row.first_name }),
        });
        await markTriggerSent('post_purchase', row.subscriber_id, refKey);
        sent++;
      } catch (e) {
        console.error('[Trigger post_purchase]', e);
        errors++;
      }
    }
  }

  if (settings.birthday_enabled) {
    const textTemplate =
      settings.birthday_text?.trim() ||
      '🎂 {имя}, команда City Legend поздравляет с днём рождения! Пусть этот год будет особенным.';
    const rows = await pool.query<{
      subscriber_id: number;
      platform: Platform;
      platform_user_id: string;
      first_name: string;
      user_id: number;
    }>(
      `SELECT bs.id AS subscriber_id, bs.platform, bs.platform_user_id, bs.first_name, cu.id AS user_id
       FROM bot_subscribers bs
       JOIN cabinet_users cu ON cu.id = bs.cabinet_user_id
       WHERE bs.is_active = TRUE
         AND cu.birth_date IS NOT NULL
         AND to_char(cu.birth_date, 'MM-DD') = to_char(CURRENT_DATE, 'MM-DD')`
    );
    for (const row of rows.rows) {
      const refKey = `bday:${new Date().getFullYear()}:${row.user_id}`;
      try {
        const dup = await pool.query(
          `SELECT 1 FROM bot_trigger_sent WHERE trigger_type = 'birthday' AND subscriber_id = $1 AND ref_key = $2`,
          [row.subscriber_id, refKey]
        );
        if (dup.rows.length) continue;
        await deliverTextToSubscriber({
          platform: row.platform,
          platformUserId: row.platform_user_id,
          text: applyBroadcastTemplate(textTemplate, { firstName: row.first_name }),
        });
        await markTriggerSent('birthday', row.subscriber_id, refKey);
        sent++;
      } catch (e) {
        console.error('[Trigger birthday]', e);
        errors++;
      }
    }
  }

  return { sent, errors };
}
