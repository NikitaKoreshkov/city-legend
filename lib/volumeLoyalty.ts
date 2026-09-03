/** Пороги скидки за накопленный объём покупок (таблица cabinet_loyalty_tiers). */

export type LoyaltyTier = {
  id?: number;
  fromRub: number;
  label: string;
  percent: number;
};

/** Активный уровень: максимальный порог from_rub, уже достигнутый суммой spentRub. */
export function pickLoyaltyTierForSpent(spentRub: number, tiers: LoyaltyTier[]): LoyaltyTier | null {
  if (!tiers.length || spentRub < 0) return null;
  const sorted = [...tiers].sort((a, b) => a.fromRub - b.fromRub);
  let best: LoyaltyTier | null = null;
  for (const t of sorted) {
    if (spentRub >= t.fromRub && Number(t.percent) > 0) best = t;
  }
  return best;
}

/** Следующий порог для подсказки «осталось N ₽». */
export function nextLoyaltyTier(spentRub: number, tiers: LoyaltyTier[]): LoyaltyTier | null {
  const sorted = [...tiers].sort((a, b) => a.fromRub - b.fromRub);
  for (const t of sorted) {
    if (spentRub < t.fromRub) return t;
  }
  return null;
}

export function loyaltyDiscountRubFromSubtotal(subtotalRub: number, loyaltyPercent: number): number {
  if (subtotalRub <= 0 || loyaltyPercent <= 0) return 0;
  const p = Math.max(0, Math.min(90, Math.floor(Number(loyaltyPercent) || 0)));
  return Math.floor((subtotalRub * p) / 100);
}
