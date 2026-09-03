import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { cdekDeleteOrder } from '@/lib/cdekClient';
import { refundOrderViaTbank } from '@/lib/tbankRefund';
import { isCdekApiConfigured } from '@/lib/cdekConfig';

export async function GET() {
  const auth = await requireAdminApi('orders.view');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const [ordersRes, itemsRes] = await Promise.all([
      pool.query(`
        SELECT o.id, o.status, o.reference_code, o.total_display, o.summary_line,
               o.created_at, o.tracking_number, o.eta_days, o.progress_percent,
               o.can_cancel, o.can_return, o.refund_status, o.refunded_at,
               o.coupon_code, o.discount_percent, o.discount_rub, o.subtotal_rub,
               o.loyalty_percent, o.loyalty_discount_rub,
               o.customer_name, o.customer_phone, o.customer_email,
               o.delivery_city, o.delivery_street, o.delivery_house,
               o.delivery_apartment, o.delivery_postal_code, o.customer_comment,
               o.delivery_rub, o.delivery_mode, o.cdek_pvz_code, o.cdek_order_uuid,
               o.cdek_error, o.cdek_last_status_code, o.cdek_last_status_at,
               u.email AS user_email
        FROM cabinet_orders o
        LEFT JOIN cabinet_users u ON u.id = o.user_id
        ORDER BY o.created_at DESC
      `),
      pool.query(`
        SELECT oi.order_id, oi.auction_id, oi.quantity, oi.unit_price_display,
               oi.variant_summary, a.name AS product_name
        FROM cabinet_order_items oi
        LEFT JOIN auctions a ON a.id = oi.auction_id
        ORDER BY oi.order_id ASC, oi.id ASC
      `),
    ]);

    const itemsByOrder: Record<number, typeof itemsRes.rows> = {};
    for (const row of itemsRes.rows) {
      const oid = row.order_id as number;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(row);
    }

    const orders = ordersRes.rows.map(o => ({
      ...o,
      items: itemsByOrder[o.id as number] ?? [],
    }));

    return NextResponse.json({ orders });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi('orders.view');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { id, status, tracking_number, eta_days, progress_percent } = await request.json();
    if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 });

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }
    if (tracking_number !== undefined) { fields.push(`tracking_number = $${idx++}`); values.push(tracking_number); }
    if (eta_days !== undefined) { fields.push(`eta_days = $${idx++}`); values.push(eta_days); }
    if (progress_percent !== undefined) { fields.push(`progress_percent = $${idx++}`); values.push(progress_percent); }

    if (fields.length === 0) return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 });

    // Нужно знать предыдущий статус и uuid СДЭК до обновления
    const prev = await pool.query(
      `SELECT status, cdek_order_uuid FROM cabinet_orders WHERE id = $1`,
      [id]
    );
    const prevStatus = (prev.rows[0] as { status?: string })?.status;
    const cdekUuid = (prev.rows[0] as { cdek_order_uuid?: string | null })?.cdek_order_uuid;

    values.push(id);
    await pool.query(
      `UPDATE cabinet_orders SET ${fields.join(', ')} WHERE id = $${idx}`,
      values,
    );

    // Если статус меняется на «Отменён» / «Возвращён» — отменяем заявку в СДЭК
    // и инициируем возврат средств в банк с формированием чека возврата.
    const cancelStatuses = ['cancelled', 'refunded'];
    if (
      status !== undefined &&
      cancelStatuses.includes(status) &&
      prevStatus && !cancelStatuses.includes(prevStatus)
    ) {
      if (cdekUuid && isCdekApiConfigured()) {
        const r = await cdekDeleteOrder(cdekUuid);
        console.log(`[orders] CDEK cancel order ${cdekUuid}: ${r.ok ? 'OK' : r.message}`);
      }
      refundOrderViaTbank(id).catch(() => {/* логируется внутри */});
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
