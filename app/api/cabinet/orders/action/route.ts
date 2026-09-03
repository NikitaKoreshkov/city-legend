import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { fetchAuctionCartRow, resolveCartLineAvailability } from '@/lib/cabinetCartAvailability';
import {
  applyVariantInventoryIncrement,
  findVariantById,
  parseProductVariantConfig,
  type ProductVariantConfig,
} from '@/lib/productVariants';

type ActionBody = {
  orderId?: number;
  action?: 'cancel' | 'return' | 'repeat';
};

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const orderId = Number(body.orderId);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Некорректный orderId' }, { status: 400 });
  }
  if (body.action !== 'cancel' && body.action !== 'return' && body.action !== 'repeat') {
    return NextResponse.json({ error: 'Некорректное действие' }, { status: 400 });
  }

  await ensureDatabase();
  const currentRes = await pool.query(
    `SELECT id, status, can_cancel, can_return, COALESCE(progress_percent, 0) AS progress_percent
     FROM cabinet_orders
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [orderId, user.id]
  );

  if (currentRes.rows.length === 0) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 });
  }

  const current = currentRes.rows[0] as {
    status: string;
    can_cancel: boolean;
    can_return: boolean;
    progress_percent: number;
  };

  if (body.action === 'cancel') {
    const beforePacking = Number(current.progress_percent) < 35;
    const cancellableStatus = current.status === 'processing';
    if (!current.can_cancel || current.status === 'cancelled' || !beforePacking || !cancellableStatus) {
      return NextResponse.json(
        { error: 'После этапа комплектации отмена недоступна. После доставки можно оформить возврат.' },
        { status: 400 }
      );
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE cabinet_orders
         SET status = 'cancelled',
             can_cancel = FALSE,
             can_return = FALSE,
             progress_percent = 0,
             cancel_requested_at = CURRENT_TIMESTAMP,
             refund_status = 'refunded',
             refunded_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2`,
        [orderId, user.id]
      );
      const items = await client.query(
        `SELECT auction_id, quantity, variant_id
         FROM cabinet_order_items
         WHERE order_id = $1`,
        [orderId]
      );
      const variantRestore = new Map<number, ProductVariantConfig>();
      for (const row of items.rows as {
        auction_id: number | null;
        quantity: number;
        variant_id: string | null;
      }[]) {
        if (!row.auction_id) continue;
        const qty = Math.max(1, Number(row.quantity) || 1);
        const vid = String(row.variant_id ?? '').trim();
        const auc = await client.query(`SELECT product_variants FROM auctions WHERE id = $1 FOR UPDATE`, [
          row.auction_id,
        ]);
        const cfg = parseProductVariantConfig(auc.rows[0]?.product_variants);
        const variant = cfg && vid ? findVariantById(cfg, vid) : null;
        const dedicated = !!(variant && variant.inventory_qty != null);
        if (dedicated && cfg && vid) {
          const cur =
            variantRestore.get(row.auction_id) ?? (JSON.parse(JSON.stringify(cfg)) as ProductVariantConfig);
          variantRestore.set(row.auction_id, applyVariantInventoryIncrement(cur, vid, qty));
        } else {
          await client.query(
            `UPDATE auctions
             SET reserved_qty = GREATEST(COALESCE(reserved_qty, 0) - $2, 0),
                 inventory_qty = GREATEST(COALESCE(inventory_qty, 0) + $2, 0)
             WHERE id = $1 AND inventory_qty IS NOT NULL`,
            [row.auction_id, qty]
          );
        }
      }
      for (const [aid, cfg] of variantRestore) {
        await client.query(`UPDATE auctions SET product_variants = $1::jsonb WHERE id = $2`, [
          JSON.stringify(cfg),
          aid,
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('orders/action cancel', e);
      return NextResponse.json({ error: 'Ошибка отмены заказа' }, { status: 500 });
    } finally {
      client.release();
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'repeat') {
    const itemsRes = await pool.query(
      `SELECT oi.auction_id, oi.quantity, oi.variant_id
       FROM cabinet_order_items oi
       WHERE oi.order_id = $1`,
      [orderId]
    );
    if (itemsRes.rows.length === 0) {
      return NextResponse.json({ error: 'В заказе нет позиций для повтора' }, { status: 400 });
    }
    for (const row of itemsRes.rows as {
      auction_id: number | null;
      quantity: number;
      variant_id: string | null;
    }[]) {
      if (!row.auction_id) continue;
      const cartRow = await fetchAuctionCartRow(pool, row.auction_id);
      if (!cartRow || !cartRow.is_sellable) continue;
      const variantId = String(row.variant_id ?? '').trim();
      const resolved = resolveCartLineAvailability(cartRow, variantId);
      if ('error' in resolved) continue;
      const qty = Math.max(1, Math.min(99, Number(row.quantity) || 1));
      const maxToAdd = Math.min(qty, Math.max(0, resolved.available));
      if (maxToAdd <= 0) continue;
      await pool.query(
        `INSERT INTO cabinet_cart_items (user_id, auction_id, variant_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, auction_id, variant_id)
         DO UPDATE SET
           quantity = LEAST(cabinet_cart_items.quantity + EXCLUDED.quantity, 99),
           updated_at = CURRENT_TIMESTAMP`,
        [user.id, row.auction_id, variantId, maxToAdd]
      );
    }
    return NextResponse.json({ ok: true });
  }

  const returnAllowedStatus = current.status === 'delivered' || current.status === 'completed';
  if (!current.can_return || current.status === 'return_requested' || !returnAllowedStatus) {
    return NextResponse.json(
      { error: 'Возврат доступен после доставки заказа.' },
      { status: 400 }
    );
  }

  await pool.query(
    `UPDATE cabinet_orders
     SET status = 'return_requested',
         can_return = FALSE,
         return_requested_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2`,
    [orderId, user.id]
  );
  return NextResponse.json({ ok: true });
}
