import type { Pool } from 'pg';
import {
  availableUnitsForVariant,
  findVariantById,
  hasActiveVariantConfig,
  parseProductVariantConfig,
  type ProductVariant,
  type ProductVariantConfig,
} from '@/lib/productVariants';

export type AuctionCartRow = {
  id: number;
  is_sellable: boolean;
  inventory_qty: number | null;
  reserved_qty: number | null;
  product_variants: unknown;
};

export async function fetchAuctionCartRow(pool: Pool, auctionId: number): Promise<AuctionCartRow | null> {
  const lot = await pool.query(
    `SELECT id,
            COALESCE(is_sellable, TRUE) AS is_sellable,
            inventory_qty,
            COALESCE(reserved_qty, 0) AS reserved_qty,
            product_variants
     FROM auctions
     WHERE id = $1
     LIMIT 1`,
    [auctionId]
  );
  if (lot.rows.length === 0) return null;
  return lot.rows[0] as AuctionCartRow;
}

export function resolveCartLineAvailability(
  row: AuctionCartRow,
  variantId: string
): { error: string; status: number } | { available: number; config: ProductVariantConfig | null; variant: ProductVariant | null } {
  const vid = String(variantId || '').trim();
  const config = parseProductVariantConfig(row.product_variants);
  const active = hasActiveVariantConfig(config);

  if (active && !vid) {
    return { error: 'Выберите вариант товара (размер, металл и т.д.)', status: 400 };
  }
  if (!active && vid) {
    return { error: 'Некорректный запрос корзины', status: 400 };
  }

  let variant: ProductVariant | null = null;
  if (active && config) {
    variant = findVariantById(config, vid);
    if (!variant) {
      return { error: 'Вариант товара не найден', status: 400 };
    }
  }

  const available = availableUnitsForVariant(
    config,
    variant,
    row.inventory_qty,
    row.reserved_qty
  );

  return { available, config, variant };
}
