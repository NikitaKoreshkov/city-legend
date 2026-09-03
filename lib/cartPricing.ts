/** Показ цены в каталоге и на карточке: без ведущего «От ». */
export function displayPriceLabel(price: string): string {
  const p = String(price || '').trim();
  const stripped = p.replace(/^От\s+/u, '').trim();
  return stripped || p;
}

export function parsePriceRub(priceStr: string): number | null {
  const digits = String(priceStr || '').replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

export function summarizeCartTotals(cart: { price: string; quantity: number }[]): {
  sumRub: number;
  allPricesKnown: boolean;
} {
  let sumRub = 0;
  let allPricesKnown = cart.length > 0;
  for (const row of cart) {
    const unit = parsePriceRub(row.price);
    if (unit === null) {
      allPricesKnown = false;
      continue;
    }
    sumRub += unit * row.quantity;
  }
  return { sumRub, allPricesKnown };
}

export function formatRub(amount: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(amount)}\u00A0₽`;
}

/** Непустая «цена до скидки» для отображения зачёркнутой суммы (акция). */
export function hasCompareAtPrice(compareAt: string | null | undefined): boolean {
  return String(compareAt ?? '').trim().length > 0;
}

/** Сумма к оплате за выбранное количество (карточка товара, корзина). */
export function displayLineTotalForQuantity(
  unitPrice: string,
  quantity: number
): { totalLabel: string; unitHint: string | null } {
  const qty = Math.max(1, Math.floor(quantity));
  const unit = displayPriceLabel(unitPrice);
  if (qty <= 1) {
    return { totalLabel: unit, unitHint: null };
  }
  const rub = parsePriceRub(unitPrice);
  if (rub != null) {
    return {
      totalLabel: formatRub(rub * qty),
      unitHint: `${unit} × ${qty} шт.`,
    };
  }
  return { totalLabel: unit, unitHint: `${qty} шт.` };
}
