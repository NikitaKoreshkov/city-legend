import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { summarizeCartTotals } from '@/lib/cartPricing';
import { loyaltyDiscountRubFromSubtotal, pickLoyaltyTierForSpent } from '@/lib/volumeLoyalty';
import {
  findVariantById,
  hasActiveVariantConfig,
  parseProductVariantConfig,
  type ProductVariantConfig,
} from '@/lib/productVariants';
import { parsePriceRub } from '@/lib/cartPricing';
import {
  applyVariantInventoryDecrement,
  buildVariantSummary,
} from '@/lib/productVariants';

export type CheckoutResolveInput = {
  couponCode?: string;
  expressAuctionId?: number;
  expressQuantity?: number;
  expressVariantId?: string;
};

export type ResolvedCheckoutRow = {
  auctionId: number;
  quantity: number;
  lotName: string;
  price: string;
  image: string | null;
  unitPriceRub: number | null;
  variantId: string;
  variantSummary: string | null;
  useDedicatedVariantInventory: boolean;
};

export type ResolvedCheckout = {
  finalCheckoutRows: ResolvedCheckoutRow[];
  totals: ReturnType<typeof summarizeCartTotals>;
  finalRub: number;
  loyaltyPercent: number;
  loyaltyDiscountRub: number;
  discountPercent: number;
  discountRub: number;
  couponId: number | null;
  couponUsedCode: string | null;
  lockedMap: Map<
    number,
    {
      id: number;
      name: string | null;
      starting_price: string | null;
      images: string[] | null;
      product_variants: unknown;
      is_sellable: boolean;
      inventory_qty: number | null;
      reserved_qty: number;
    }
  >;
  cartSignature: string;
};

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function buildCartSignature(
  rows: { auctionId: number; variantId: string; quantity: number }[]
): string {
  const sorted = [...rows].sort(
    (a, b) =>
      a.auctionId - b.auctionId || a.variantId.localeCompare(b.variantId) || a.quantity - b.quantity
  );
  const s = sorted.map((r) => `${r.auctionId}:${r.variantId}:${r.quantity}`).join('|');
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Блокировка корзины и расчёт суммы как в checkout (до проверки оплаты).
 */
export async function resolveCheckoutCart(
  client: PoolClient,
  userId: number,
  input: CheckoutResolveInput
): Promise<{ ok: true; data: ResolvedCheckout } | { ok: false; error: string; unavailable?: string[] }> {
  const cartRes = await client.query(
    `SELECT c.auction_id, c.variant_id, c.quantity,
            a.name AS lot_name, a.starting_price, a.images, a.product_variants
     FROM cabinet_cart_items c
     LEFT JOIN auctions a ON a.id = c.auction_id
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC`,
    [userId]
  );

  if (cartRes.rows.length === 0) {
    return { ok: false, error: 'Корзина пуста' };
  }

  let cartRows = (cartRes.rows as {
    auction_id: number;
    variant_id: string | null;
    quantity: number;
    lot_name: string | null;
    starting_price: string | null;
    images: string[] | null;
    product_variants: unknown;
  }[]).map((r) => ({
    auctionId: r.auction_id,
    variantId: String(r.variant_id ?? '').trim(),
    quantity: r.quantity,
    lotName: r.lot_name || `Лот #${r.auction_id}`,
    price: r.starting_price || '',
    image: r.images?.[0] || null,
    product_variants: r.product_variants,
  }));

  const rawExpressAid = input.expressAuctionId;
  const rawExpressQty = input.expressQuantity;
  const rawExpressVid = input.expressVariantId;
  let expressAuctionId: number | null = null;
  let expressQuantity: number | null = null;
  let expressVariantId: string | null = null;
  if (rawExpressAid != null && rawExpressQty != null) {
    const aid = Number(rawExpressAid);
    const eq = Number(rawExpressQty);
    if (Number.isFinite(aid) && aid >= 1 && Number.isFinite(eq) && eq >= 1 && eq <= 99) {
      expressAuctionId = Math.floor(aid);
      expressQuantity = Math.floor(eq);
      expressVariantId = rawExpressVid != null ? String(rawExpressVid).trim() : '';
    }
  }
  if (expressAuctionId != null && expressQuantity != null) {
    const line = cartRows.find(
      (r) =>
        r.auctionId === expressAuctionId && (r.variantId || '') === (expressVariantId ?? '')
    );
    if (!line) {
      return { ok: false, error: 'Товар не найден в корзине' };
    }
    if (line.quantity < expressQuantity) {
      return { ok: false, error: 'Недостаточно товара в корзине' };
    }
    cartRows = [{ ...line, quantity: expressQuantity }];
  }

  const auctionIds = [...new Set(cartRows.map((r) => r.auctionId))];
  const lockedLotsRes = await client.query(
    `SELECT id, name, starting_price, images, product_variants,
            COALESCE(is_sellable, TRUE) AS is_sellable,
            inventory_qty,
            COALESCE(reserved_qty, 0) AS reserved_qty
     FROM auctions
     WHERE id = ANY($1::int[])
     FOR UPDATE`,
    [auctionIds]
  );
  const lockedMap = new Map<
    number,
    {
      id: number;
      name: string | null;
      starting_price: string | null;
      images: string[] | null;
      product_variants: unknown;
      is_sellable: boolean;
      inventory_qty: number | null;
      reserved_qty: number;
    }
  >();
  for (const row of lockedLotsRes.rows as {
    id: number;
    name: string | null;
    starting_price: string | null;
    images: string[] | null;
    product_variants: unknown;
    is_sellable: boolean;
    inventory_qty: number | null;
    reserved_qty: number;
  }[]) {
    lockedMap.set(row.id, row);
  }

  const sharedPoolRemaining = new Map<number, number>();
  const variantPoolSim = new Map<string, number>();

  const unavailable: string[] = [];
  const checkoutRows = cartRows.map((row) => {
    const locked = lockedMap.get(row.auctionId);
    if (!locked) {
      unavailable.push(`${row.lotName}: товар больше не найден`);
      return null;
    }
    if (!locked.is_sellable) {
      unavailable.push(`${row.lotName}: товар недоступен для покупки`);
      return null;
    }

    const config = parseProductVariantConfig(locked.product_variants);
    const active = hasActiveVariantConfig(config);
    if (active && !row.variantId) {
      unavailable.push(`${row.lotName}: не выбран вариант`);
      return null;
    }
    if (!active && row.variantId) {
      unavailable.push(`${row.lotName}: некорректная позиция корзины`);
      return null;
    }

    const variant = active && config ? findVariantById(config, row.variantId) : null;
    if (active && !variant) {
      unavailable.push(`${row.lotName}: вариант недоступен`);
      return null;
    }

    const priceStr = variant ? variant.starting_price : locked.starting_price || row.price;
    const displayPrice = priceStr;
    const img =
      variant?.images && variant.images.length > 0
        ? variant.images[0]!
        : locked.images?.[0] || row.image || null;

    const summary = active && config && variant ? buildVariantSummary(config, variant) : null;
    const baseName = locked.name || row.lotName;
    const lotName = summary ? `${baseName} — ${summary}` : baseName;

    const useDedicated = !!(variant && variant.inventory_qty != null);
    let avail: number;
    if (useDedicated && variant) {
      const k = `${row.auctionId}::${variant.id}`;
      if (!variantPoolSim.has(k)) {
        variantPoolSim.set(k, Math.max(0, Math.floor(Number(variant.inventory_qty))));
      }
      avail = variantPoolSim.get(k)!;
    } else {
      if (!sharedPoolRemaining.has(row.auctionId)) {
        const pool =
          locked.inventory_qty == null
            ? 9999
            : Math.max(0, Number(locked.inventory_qty) - Number(locked.reserved_qty));
        sharedPoolRemaining.set(row.auctionId, pool);
      }
      avail = sharedPoolRemaining.get(row.auctionId)!;
    }

    if (row.quantity > avail) {
      unavailable.push(`${lotName}: доступно ${avail} шт.`);
      return null;
    }

    if (useDedicated) {
      variantPoolSim.set(`${row.auctionId}::${variant!.id}`, avail - row.quantity);
    } else {
      sharedPoolRemaining.set(row.auctionId, avail - row.quantity);
    }

    return {
      auctionId: row.auctionId,
      quantity: row.quantity,
      lotName,
      price: displayPrice,
      image: img,
      unitPriceRub: parsePriceRub(displayPrice),
      variantId: row.variantId || '',
      variantSummary: summary,
      useDedicatedVariantInventory: useDedicated,
    };
  });

  if (unavailable.length > 0 || checkoutRows.some((r) => !r)) {
    return {
      ok: false,
      error: 'Часть товаров недоступна. Обновите корзину.',
      unavailable,
    };
  }
  const finalCheckoutRows = checkoutRows.filter((r): r is NonNullable<typeof r> => !!r);

  const totals = summarizeCartTotals(finalCheckoutRows);

  const [spentRes, loyaltyTiersRes] = await Promise.all([
    client.query(
      `SELECT COALESCE(SUM(subtotal_rub), 0)::bigint AS s
       FROM cabinet_orders
       WHERE user_id = $1 AND status <> 'cancelled' AND subtotal_rub IS NOT NULL`,
      [userId]
    ),
    client.query(
      `SELECT from_rub, label, percent
       FROM cabinet_loyalty_tiers
       ORDER BY sort_order ASC, id ASC`
    ),
  ]);
  const spentBefore = Number((spentRes.rows[0] as { s: string | number }).s) || 0;
  const tierList = (loyaltyTiersRes.rows as {
    from_rub: string | number;
    label: string;
    percent: number;
  }[]).map((r) => ({
    fromRub: Number(r.from_rub),
    label: r.label,
    percent: Number(r.percent),
  }));
  const activeLoyaltyTier = pickLoyaltyTierForSpent(spentBefore, tierList);
  let loyaltyPercent = 0;
  let loyaltyDiscountRub = 0;
  if (activeLoyaltyTier && totals.sumRub > 0) {
    loyaltyPercent = Math.max(0, Math.min(90, Math.floor(Number(activeLoyaltyTier.percent) || 0)));
    loyaltyDiscountRub = loyaltyDiscountRubFromSubtotal(totals.sumRub, loyaltyPercent);
  }

  const couponCode = clean(input.couponCode).toUpperCase();
  let discountPercent = 0;
  let discountRub = 0;
  let couponId: number | null = null;
  let couponUsedCode: string | null = null;
  if (couponCode) {
    const cpRes = await client.query(
      `SELECT id, code, discount_percent, min_total_rub, expires_at, active, max_uses, uses_count
       FROM cabinet_coupons
       WHERE UPPER(code) = $1
       LIMIT 1`,
      [couponCode]
    );
    if (cpRes.rows.length === 0) {
      return { ok: false, error: 'Купон не найден' };
    }
    const cp = cpRes.rows[0] as {
      id: number;
      code: string;
      discount_percent: number;
      min_total_rub: string | number;
      expires_at: Date | null;
      active: boolean;
      max_uses: number | null;
      uses_count: number;
    };
    if (!cp.active) {
      return { ok: false, error: 'Купон неактивен' };
    }
    if (cp.expires_at && cp.expires_at.getTime() < Date.now()) {
      return { ok: false, error: 'Срок действия купона истёк' };
    }
    if (cp.max_uses !== null && cp.uses_count >= cp.max_uses) {
      return { ok: false, error: 'Купон уже был использован' };
    }
    const minTotalRub = Number(cp.min_total_rub || 0);
    if (totals.sumRub < minTotalRub) {
      return {
        ok: false,
        error: `Минимальная сумма для купона: ${new Intl.NumberFormat('ru-RU').format(minTotalRub)} ₽`,
      };
    }
    discountPercent = Math.max(0, Math.min(90, Number(cp.discount_percent) || 0));
    discountRub = Math.floor((totals.sumRub * discountPercent) / 100);
    couponId = cp.id;
    couponUsedCode = cp.code.toUpperCase();
  }
  const finalRub = Math.max(0, totals.sumRub - loyaltyDiscountRub - discountRub);

  const cartSignature = buildCartSignature(
    finalCheckoutRows.map((r) => ({
      auctionId: r.auctionId,
      variantId: r.variantId || '',
      quantity: r.quantity,
    }))
  );

  return {
    ok: true,
    data: {
      finalCheckoutRows,
      totals,
      finalRub,
      loyaltyPercent,
      loyaltyDiscountRub,
      discountPercent,
      discountRub,
      couponId,
      couponUsedCode,
      lockedMap,
      cartSignature,
    },
  };
}

export { applyVariantInventoryDecrement, parseProductVariantConfig };
export type { ProductVariantConfig };
