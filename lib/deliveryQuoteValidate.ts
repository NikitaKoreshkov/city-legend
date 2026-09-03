import type { PoolClient } from 'pg';
import type { ResolvedCheckout } from '@/lib/cabinetCheckoutResolve';

export type DeliveryQuoteRow = {
  id: number;
  user_id: number;
  goods_rub: string | number;
  delivery_rub: string | number;
  delivery_tariff_rub: string | number | null;
  tariff_code: number;
  mode: string;
  pvz_code: string | null;
  receiver_city_code: number | null;
  to_city: string;
  to_postal_code: string | null;
  to_street: string | null;
  to_house: string | null;
  to_apartment: string | null;
  cart_signature: string;
  coupon_code_upper: string;
  express_json: unknown | null;
  period_min: number | null;
  period_max: number | null;
  expires_at: Date;
  used_at: Date | null;
};

/** Проверка строки расчёта доставки против уже посчитанной корзины (один проход resolve). */
export async function lockAndValidateDeliveryQuote(
  client: PoolClient,
  userId: number,
  quoteId: number,
  resolved: ResolvedCheckout
): Promise<{ ok: true; quote: DeliveryQuoteRow } | { ok: false; error: string }> {
  const q = await client.query(
    `SELECT * FROM cabinet_delivery_quotes WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [quoteId, userId]
  );
  if (q.rows.length === 0) return { ok: false, error: 'Расчёт доставки не найден' };
  const quote = q.rows[0] as DeliveryQuoteRow;
  if (quote.used_at) return { ok: false, error: 'Расчёт доставки уже использован' };
  if (quote.expires_at && new Date(quote.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Истёк срок расчёта доставки — обновите расчёт' };
  }
  if (Number(quote.goods_rub) !== resolved.finalRub) {
    return { ok: false, error: 'Состав заказа или скидки изменились. Пересчитайте доставку.' };
  }
  if (quote.cart_signature !== resolved.cartSignature) {
    return { ok: false, error: 'Состав заказа изменился. Пересчитайте доставку.' };
  }
  return { ok: true, quote };
}
