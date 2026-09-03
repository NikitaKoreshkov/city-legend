import crypto from 'crypto';
import pool, { ensureBotCouponSchema } from '@/lib/db';
import { getSiteUrl } from '@/lib/bots/couponDeliver';
import { buildCabinetCartDeepLink } from '@/lib/promoDeepLink';

/** Одноразовый токен входа на сайт после авторизации в боте (15 мин). */
export async function createBotSiteSsoToken(cabinetUserId: number): Promise<string> {
  await ensureBotCouponSchema();
  const token = crypto.randomBytes(24).toString('hex');
  await pool.query(
    `INSERT INTO bot_site_sso_tokens (token, cabinet_user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [token, cabinetUserId]
  );
  return token;
}

export function buildBotSiteDeepLink(options?: {
  ssoToken?: string;
  couponCode?: string;
}): string {
  const params = new URLSearchParams({ cabinet: '1', view: 'cart' });
  const coupon = options?.couponCode?.trim().toUpperCase();
  if (coupon) params.set('coupon', coupon);
  if (options?.ssoToken) params.set('sso', options.ssoToken);
  return `${getSiteUrl()}${buildCabinetCartDeepLink(coupon).replace(/^\//, '/?').replace('/?', '/?')}` 
    ? `${getSiteUrl()}/?${params.toString()}`
    : `${getSiteUrl()}/?${params.toString()}`;
}

/** Ссылка на корзину: с авто-входом для авторизованного в боте клиента. */
export async function buildBotSiteCartUrl(options: {
  cabinetUserId?: number | null;
  couponCode?: string | null;
}): Promise<string> {
  const coupon = options.couponCode?.trim().toUpperCase() || undefined;
  if (options.cabinetUserId) {
    const ssoToken = await createBotSiteSsoToken(options.cabinetUserId);
    return buildBotSiteDeepLink({ ssoToken, couponCode: coupon });
  }
  if (coupon) {
    const { getPromoUrl } = await import('@/lib/bots/couponDeliver');
    return getPromoUrl(coupon);
  }
  return `${getSiteUrl()}${buildCabinetCartDeepLink()}`;
}
