const PLACEHOLDER_AVAILABILITY = 'Уточняйте наличие';

/** Доступно к продаже по учёту склада; `null` — остаток не ведём (не показываем число). */
export function computeAvailableUnits(
  inventoryQty: number | null | undefined,
  reservedQty: number | null | undefined
): number | null {
  if (inventoryQty == null) return null;
  const inv = Number(inventoryQty);
  const res = Number(reservedQty ?? 0);
  if (!Number.isFinite(inv)) return null;
  return Math.max(0, Math.floor(inv - (Number.isFinite(res) ? res : 0)));
}

/**
 * Строка под ценой в каталоге / карточке:
 * — обычно пусто;
 * — при остатке < 20 шт. (если остаток ведётся) — «N шт.»;
 * — если заданы реальные сроки (не плейсхолдер) — показываем их.
 */
export function catalogAvailabilityLine(
  auctionDates: string | null | undefined,
  inventoryQty: number | null | undefined,
  reservedQty: number | null | undefined
): string | null {
  const d = (auctionDates || '').trim();
  const avail = computeAvailableUnits(inventoryQty, reservedQty);
  const lowStock = avail != null && avail < 20;

  if (d && d !== PLACEHOLDER_AVAILABILITY) {
    return d;
  }
  if (lowStock) {
    return `${avail} шт.`;
  }
  return null;
}

export { PLACEHOLDER_AVAILABILITY };
