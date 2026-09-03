import pool, { ensureBotCouponSchema } from '@/lib/db';

const STOP_PATTERNS = [
  /^стоп\s*рассыл/i,
  /^stop\s*mail/i,
  /^\/stop$/,
  /^отписаться/i,
  /^unsubscribe/i,
];

export function isUnsubscribeMessage(text: string): boolean {
  const t = text.trim();
  return STOP_PATTERNS.some((re) => re.test(t));
}

export async function unsubscribeBotUser(platform: 'telegram' | 'max', platformUserId: string): Promise<boolean> {
  await ensureBotCouponSchema();
  const res = await pool.query(
    `UPDATE bot_subscribers SET is_active = FALSE
     WHERE platform = $1 AND platform_user_id = $2 AND is_active = TRUE
     RETURNING id`,
    [platform, platformUserId]
  );
  return res.rowCount !== null && res.rowCount > 0;
}

export async function resubscribeBotUser(platform: 'telegram' | 'max', platformUserId: string): Promise<boolean> {
  await ensureBotCouponSchema();
  const res = await pool.query(
    `UPDATE bot_subscribers SET is_active = TRUE
     WHERE platform = $1 AND platform_user_id = $2
     RETURNING id`,
    [platform, platformUserId]
  );
  return res.rowCount !== null && res.rowCount > 0;
}
