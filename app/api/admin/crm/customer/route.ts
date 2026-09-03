import { NextResponse } from 'next/server';
import pool, { ensureBotCouponSchema, ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';

export async function GET(request: Request) {
  const auth = await requireAdminApi('crm.view');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    await ensureBotCouponSchema();
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    if (!id || !Number.isFinite(id)) {
      return NextResponse.json({ error: 'id обязателен' }, { status: 400 });
    }

    const [userRes, ordersRes] = await Promise.all([
      pool.query(`
        SELECT id, email, NULLIF(TRIM(display_name),'') AS display_name, created_at
        FROM cabinet_users WHERE id = $1
      `, [id]),
      pool.query(`
        SELECT o.id, o.status, o.reference_code, o.total_display, o.subtotal_rub,
               o.created_at, o.tracking_number, o.coupon_code, o.discount_rub,
               o.loyalty_percent, o.loyalty_discount_rub,
               o.delivery_city, o.customer_name, o.customer_phone, o.customer_email,
               o.delivery_rub, o.delivery_mode, o.cdek_pvz_code, o.cdek_order_uuid,
               o.cdek_last_status_code, o.cdek_last_status_at
        FROM cabinet_orders o
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC
      `, [id]),
    ]);

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    // Fetch order items for all orders
    const orderIds = (ordersRes.rows as { id: number }[]).map(r => r.id);
    const itemsByOrder: Record<number, unknown[]> = {};
    if (orderIds.length > 0) {
      const itemsRes = await pool.query(`
        SELECT oi.order_id, oi.lot_name AS product_name, oi.quantity,
               oi.unit_price_display, oi.unit_price_rub, oi.variant_summary
        FROM cabinet_order_items oi WHERE oi.order_id = ANY($1)
        ORDER BY oi.order_id ASC, oi.id ASC
      `, [orderIds]);
      for (const row of itemsRes.rows as { order_id: number }[]) {
        if (!itemsByOrder[row.order_id]) itemsByOrder[row.order_id] = [];
        itemsByOrder[row.order_id].push(row);
      }
    }

    type OrderRow = { id: number; status: string; subtotal_rub: number | null };
    const orders = (ordersRes.rows as OrderRow[]).map(o => ({
      ...o,
      items: itemsByOrder[o.id] ?? [],
    }));

    const confirmedOrders = orders.filter(
      (o) => !['cancelled', 'refunded'].includes(o.status)
    );
    const totalSpent = confirmedOrders.reduce(
      (s, o) => s + Number(o.subtotal_rub ?? 0), 0
    );
    const avgOrder = confirmedOrders.length > 0 ? Math.round(totalSpent / confirmedOrders.length) : 0;

    return NextResponse.json({
      user: userRes.rows[0],
      orders,
      stats: {
        orders_all: orders.length,
        orders_confirmed: confirmedOrders.length,
        total_spent: totalSpent,
        avg_order: avgOrder,
      },
      bot_subscribers: (
        await pool.query<{
          id: number;
          platform: string;
          first_name: string;
          phone: string;
          is_active: boolean;
          is_vip: boolean;
          manager_notes: string;
          registered_at: string;
        }>(
          `SELECT id, platform, first_name, phone, is_active,
                  COALESCE(is_vip, FALSE) AS is_vip,
                  COALESCE(manager_notes, '') AS manager_notes,
                  registered_at
           FROM bot_subscribers
           WHERE cabinet_user_id = $1
           ORDER BY registered_at DESC`,
          [id]
        )
      ).rows,
    });
  } catch (e) {
    console.error('[CRM customer API]', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
