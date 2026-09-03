import { formatRub, parsePriceRub } from '@/lib/cartPricing';

/** Значение внутри группы (например «Золото 750 пробы»). */
export type ProductOptionValue = {
  id: string;
  label: string;
  hint?: string;
};

/** Группа опций: металл, размер, длина цепи и т.д. */
export type ProductOptionGroup = {
  key: string;
  name: string;
  order: number;
  values: ProductOptionValue[];
};

/** Один SKU: комбинация опций + цена + остаток. */
export type ProductVariant = {
  id: string;
  selection: Record<string, string>;
  sku?: string;
  starting_price: string;
  compare_at_price?: string | null;
  /**
   * Остаток только этого SKU. `null` / отсутствует — общий пул с карточки лота (inventory_qty − reserved_qty).
   */
  inventory_qty?: number | null;
  /** Свои фото варианта; пусто — галерея лота */
  images?: string[] | null;
};

export type ProductVariantConfig = {
  groups: ProductOptionGroup[];
  variants: ProductVariant[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function parseProductVariantConfig(raw: unknown): ProductVariantConfig | null {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isPlainObject(obj)) return null;
  const groupsRaw = obj.groups;
  const variantsRaw = obj.variants;
  if (!Array.isArray(groupsRaw) || !Array.isArray(variantsRaw)) return null;
  if (groupsRaw.length === 0 || variantsRaw.length === 0) return null;

  const groups: ProductOptionGroup[] = [];
  for (const g of groupsRaw) {
    if (!isPlainObject(g)) continue;
    const key = String(g.key || '').trim();
    const name = String(g.name || '').trim();
    const order = Number(g.order);
    const valuesRaw = g.values;
    if (!key || !name || !Array.isArray(valuesRaw)) continue;
    const values: ProductOptionValue[] = [];
    for (const val of valuesRaw) {
      if (!isPlainObject(val)) continue;
      const id = String(val.id || '').trim();
      const label = String(val.label || '').trim();
      if (!id || !label) continue;
      const hint = val.hint != null ? String(val.hint).trim() : '';
      values.push({ id, label, hint: hint || undefined });
    }
    if (values.length === 0) continue;
    groups.push({
      key,
      name,
      order: Number.isFinite(order) ? order : groups.length,
      values,
    });
  }

  const variants: ProductVariant[] = [];
  for (const v of variantsRaw) {
    if (!isPlainObject(v)) continue;
    const id = String(v.id || '').trim();
    const sel = v.selection;
    if (!id || !isPlainObject(sel)) continue;
    const selection: Record<string, string> = {};
    for (const [k, val] of Object.entries(sel)) {
      const ks = k.trim();
      const vs = String(val ?? '').trim();
      if (ks && vs) selection[ks] = vs;
    }
    const starting_price = String(v.starting_price ?? '').trim();
    if (!starting_price) continue;
    const compareRaw = v.compare_at_price;
    const compare_at_price =
      compareRaw == null || String(compareRaw).trim() === '' ? null : String(compareRaw).trim();
    let inventory_qty: number | null | undefined;
    if (v.inventory_qty === null || v.inventory_qty === undefined) {
      inventory_qty = null;
    } else {
      const n = Number(v.inventory_qty);
      inventory_qty = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    }
    let images: string[] | null | undefined;
    if (Array.isArray(v.images) && v.images.length > 0) {
      images = v.images.map((u) => String(u)).filter(Boolean);
    } else {
      images = v.images === null ? null : undefined;
    }
    variants.push({
      id,
      selection,
      sku: v.sku != null ? String(v.sku).trim() || undefined : undefined,
      starting_price,
      compare_at_price,
      inventory_qty,
      images,
    });
  }

  if (groups.length === 0 || variants.length === 0) return null;
  return { groups, variants };
}

export function hasActiveVariantConfig(config: ProductVariantConfig | null): boolean {
  return !!config && config.groups.length > 0 && config.variants.length > 0;
}

export function sortedGroups(config: ProductVariantConfig): ProductOptionGroup[] {
  return [...config.groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function findVariantById(config: ProductVariantConfig | null, variantId: string): ProductVariant | null {
  if (!config || !variantId.trim()) return null;
  return config.variants.find((v) => v.id === variantId) ?? null;
}

export function findVariantBySelection(
  config: ProductVariantConfig,
  selection: Record<string, string>
): ProductVariant | null {
  const keys = sortedGroups(config).map((g) => g.key);
  return (
    config.variants.find((v) => keys.every((k) => (v.selection[k] || '') === (selection[k] || ''))) ?? null
  );
}

export function buildVariantSummary(config: ProductVariantConfig, variant: ProductVariant): string {
  const parts: string[] = [];
  for (const g of sortedGroups(config)) {
    const vid = variant.selection[g.key];
    if (!vid) continue;
    const val = g.values.find((x) => x.id === vid);
    if (val) parts.push(val.label);
  }
  return parts.join(' · ');
}

/** Доступно единиц с учётом варианта и общего остатка лота. */
export function availableUnitsForVariant(
  config: ProductVariantConfig | null,
  variant: ProductVariant | null,
  auctionInventoryQty: number | null | undefined,
  auctionReservedQty: number | null | undefined
): number {
  const shared =
    auctionInventoryQty == null
      ? 9999
      : Math.max(0, Math.floor(Number(auctionInventoryQty) - Number(auctionReservedQty ?? 0)));

  if (!variant) return shared;
  if (variant.inventory_qty == null) return shared;
  return Math.max(0, Math.floor(Number(variant.inventory_qty)));
}

export function listingPriceFromAuction(row: {
  starting_price?: string | null;
  compare_at_price?: string | null;
  product_variants?: unknown;
}): { startingPrice: string; compareAtPrice: string | null; pricePrefix: string } {
  const config = parseProductVariantConfig(row.product_variants);
  if (!hasActiveVariantConfig(config)) {
    return {
      startingPrice: String(row.starting_price || '').trim(),
      compareAtPrice: row.compare_at_price != null ? String(row.compare_at_price).trim() || null : null,
      pricePrefix: '',
    };
  }
  let minRub = Infinity;
  let minVariant: ProductVariant | null = null;
  for (const v of config!.variants) {
    const rub = parsePriceRub(v.starting_price);
    if (rub != null && rub < minRub) {
      minRub = rub;
      minVariant = v;
    }
  }
  if (!Number.isFinite(minRub) || minRub === Infinity) {
    return {
      startingPrice: String(row.starting_price || '').trim(),
      compareAtPrice: row.compare_at_price != null ? String(row.compare_at_price).trim() || null : null,
      pricePrefix: '',
    };
  }
  const compare =
    minVariant && hasCompareForListing(minVariant)
      ? String(minVariant.compare_at_price || '').trim() || null
      : null;
  return {
    startingPrice: formatRub(minRub),
    compareAtPrice: compare,
    pricePrefix: 'от ',
  };
}

function hasCompareForListing(v: ProductVariant): boolean {
  return String(v.compare_at_price ?? '').trim().length > 0;
}

export function validateVariantConfigForSave(config: ProductVariantConfig): string | null {
  if (config.groups.length === 0 || config.variants.length === 0) {
    return 'Добавьте хотя бы одну группу опций и один вариант SKU';
  }
  const keys = sortedGroups(config).map((g) => g.key);
  const keySet = new Set(keys);
  if (keySet.size !== keys.length) return 'Ключи групп опций должны быть уникальными';

  for (const g of config.groups) {
    const ids = new Set<string>();
    for (const val of g.values) {
      if (ids.has(val.id)) return `Дублируется id значения в группе «${g.name}»`;
      ids.add(val.id);
    }
  }

  const variantIds = new Set<string>();
  for (const v of config.variants) {
    if (!v.id.trim()) return 'У каждого варианта должен быть id';
    if (variantIds.has(v.id)) return 'Id вариантов SKU не должны повторяться';
    variantIds.add(v.id);
    for (const k of keys) {
      const picked = v.selection[k];
      if (!picked) return `В варианте ${v.sku || v.id} не выбрано значение для группы «${k}»`;
      const g = config.groups.find((x) => x.key === k);
      if (!g?.values.some((x) => x.id === picked)) {
        return `Некорректное значение опции в варианте ${v.sku || v.id}`;
      }
    }
    const extraKeys = Object.keys(v.selection).filter((k) => !keySet.has(k));
    if (extraKeys.length) return 'В варианте есть лишние ключи опций';
  }

  const signatures = new Set<string>();
  for (const v of config.variants) {
    const sig = keys.map((k) => `${k}:${v.selection[k]}`).join('|');
    if (signatures.has(sig)) return 'Две строки SKU с одинаковой комбинацией опций';
    signatures.add(sig);
  }

  return null;
}

/** Список value id, доступных для группы при частичном выборе (как в магазинах). */
export function availableValueIdsForGroup(
  config: ProductVariantConfig,
  groupKey: string,
  partialSelection: Record<string, string>
): Set<string> {
  const keys = sortedGroups(config).map((g) => g.key);
  const allowed = new Set<string>();
  for (const v of config.variants) {
    let ok = true;
    for (const k of keys) {
      if (k === groupKey) continue;
      const want = partialSelection[k];
      if (!want) continue;
      if ((v.selection[k] || '') !== want) {
        ok = false;
        break;
      }
    }
    if (ok) allowed.add(v.selection[groupKey] || '');
  }
  return allowed;
}

export function defaultSelection(config: ProductVariantConfig): Record<string, string> {
  const v0 = config.variants[0];
  const sel: Record<string, string> = {};
  for (const g of sortedGroups(config)) {
    sel[g.key] = v0.selection[g.key] || g.values[0]?.id || '';
  }
  return sel;
}

export function applyVariantInventoryDecrement(
  config: ProductVariantConfig,
  variantId: string,
  qty: number
): ProductVariantConfig {
  const q = Math.max(1, Math.floor(qty));
  const next: ProductVariantConfig = JSON.parse(JSON.stringify(config)) as ProductVariantConfig;
  const v = next.variants.find((x) => x.id === variantId);
  if (!v) throw new Error('variant_not_found');
  if (v.inventory_qty == null) return next;
  const cur = Math.floor(Number(v.inventory_qty));
  if (cur < q) throw new Error('insufficient_variant_stock');
  v.inventory_qty = Math.max(0, cur - q);
  return next;
}

/** Возврат остатка при отмене заказа (только для SKU с собственным inventory_qty). */
export function applyVariantInventoryIncrement(
  config: ProductVariantConfig,
  variantId: string,
  qty: number
): ProductVariantConfig {
  const q = Math.max(1, Math.floor(qty));
  const next: ProductVariantConfig = JSON.parse(JSON.stringify(config)) as ProductVariantConfig;
  const v = next.variants.find((x) => x.id === variantId);
  if (!v || v.inventory_qty == null) return next;
  v.inventory_qty = Math.floor(Number(v.inventory_qty)) + q;
  return next;
}
