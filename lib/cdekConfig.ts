/** Конфигурация СДЭК API v2 (учётные данные только из env). */

export function cdekApiBase(): string {
  const raw = process.env.CDEK_API_BASE?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return process.env.CDEK_USE_SANDBOX === '1' || process.env.CDEK_USE_SANDBOX === 'true'
    ? 'https://api.edu.cdek.ru/v2'
    : 'https://api.cdek.ru/v2';
}

/**
 * Полная конфигурация API СДЭК (для поиска городов/ПВЗ и создания заказов
 * в личном кабинете СДЭК после оплаты).
 */
export function isCdekApiConfigured(): boolean {
  const id = process.env.CDEK_CLIENT_ID?.trim();
  const secret = process.env.CDEK_CLIENT_SECRET?.trim();
  const sender =
    process.env.CDEK_SENDER_CITY_CODE?.trim() ||
    process.env.CDEK_SENDER_CITY?.trim() ||
    process.env.CDEK_SENDER_ADDRESS?.trim();
  return !!(id && secret && sender);
}

/**
 * Доставка СДЭК включена в корзине?
 *
 * По умолчанию — да. Чтобы выключить (например, для самовывоза), задайте
 * `CDEK_DELIVERY_DISABLED=1` в .env.
 */
export function isCdekDeliveryEnabled(): boolean {
  const flag = (process.env.CDEK_DELIVERY_DISABLED || '').trim().toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') return false;
  return true;
}

/**
 * Обратная совместимость: ранее использовался `isCdekConfigured()` для всего сразу.
 * Теперь это выровнено с `isCdekApiConfigured()` — нужны полные ключи СДЭК.
 */
export function isCdekConfigured(): boolean {
  return isCdekApiConfigured();
}

/** Запасная фиксированная цена только если API СДЭК не подключён (по умолчанию 300 ₽). */
export function cdekFlatDeliveryRub(): number {
  const raw = Number(process.env.CDEK_FIXED_DELIVERY_RUB);
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return 300;
}

/**
 * Брать цену доставки из калькулятора СДЭК (рекомендуется).
 * Если `CDEK_FIXED_DELIVERY_ONLY=1` — всегда фикс из `CDEK_FIXED_DELIVERY_RUB`.
 */
export function cdekPreferRealTariffPrice(): boolean {
  const flag = (process.env.CDEK_FIXED_DELIVERY_ONLY || '').trim().toLowerCase();
  return !(flag === '1' || flag === 'true' || flag === 'yes');
}

export function cdekDefaultPackage(): {
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
} {
  return {
    weightG: Math.max(100, Math.floor(Number(process.env.CDEK_DEFAULT_WEIGHT_G || 350))),
    lengthCm: Math.max(1, Math.floor(Number(process.env.CDEK_DEFAULT_LENGTH_CM || 20))),
    widthCm: Math.max(1, Math.floor(Number(process.env.CDEK_DEFAULT_WIDTH_CM || 15))),
    heightCm: Math.max(1, Math.floor(Number(process.env.CDEK_DEFAULT_HEIGHT_CM || 10))),
  };
}

export function cdekTariffDoor(): number {
  return Math.floor(Number(process.env.CDEK_TARIFF_WAREHOUSE_DOOR || 136));
}

export function cdekTariffPvz(): number {
  return Math.floor(Number(process.env.CDEK_TARIFF_WAREHOUSE_WAREHOUSE || 137));
}
