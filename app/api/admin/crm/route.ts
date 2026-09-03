import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import { cdekDeleteOrder } from '@/lib/cdekClient';
import { refundOrderViaTbank } from '@/lib/tbankRefund';
import { isCdekApiConfigured } from '@/lib/cdekConfig';

function periodDays(p: string | null): number {
  const n = Number(p);
  return [7, 30, 90, 365].includes(n) ? n : 30;
}

export async function GET(request: Request) {
  const auth = await requireAdminApi('crm.view');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const { searchParams } = new URL(request.url);
    const period = periodDays(searchParams.get('period'));

    const [
      kpiRes,
      kpiPrevRes,
      chartRes,
      statusRes,
      productsRes,
      customersRes,
      couponsRes,
      recentRes,
      ordersAllRes,
      monthlyRes,
      newCustomersChartRes,
      assigneesRes,
    ] = await Promise.all([
      // ── KPI current period ───────────────────────────────────────────────
      pool.query(`
        SELECT
          COALESCE(SUM(subtotal_rub), 0) AS revenue_all,
          COALESCE(SUM(CASE WHEN created_at > NOW() - ($1||' days')::INTERVAL THEN subtotal_rub ELSE 0 END), 0) AS revenue_period,
          COUNT(*) AS orders_all,
          COUNT(CASE WHEN created_at > NOW() - ($1||' days')::INTERVAL THEN 1 END) AS orders_period,
          COALESCE(AVG(CASE WHEN subtotal_rub > 0 THEN subtotal_rub END), 0) AS avg_order_all,
          COALESCE(AVG(CASE WHEN created_at > NOW() - ($1||' days')::INTERVAL AND subtotal_rub > 0 THEN subtotal_rub END), 0) AS avg_order_period,
          COALESCE(SUM(COALESCE(discount_rub,0)), 0) AS coupon_discounts_total,
          COALESCE(SUM(COALESCE(loyalty_discount_rub,0)), 0) AS loyalty_discounts_total,
          COALESCE(SUM(CASE WHEN created_at > NOW() - ($1||' days')::INTERVAL THEN COALESCE(discount_rub,0) ELSE 0 END), 0) AS coupon_discounts_period,
          COALESCE(SUM(CASE WHEN created_at > NOW() - ($1||' days')::INTERVAL THEN COALESCE(loyalty_discount_rub,0) ELSE 0 END), 0) AS loyalty_discounts_period
        FROM cabinet_orders
        WHERE status NOT IN ('cancelled','refunded')
      `, [period]),

      // ── KPI previous period (for % delta) ───────────────────────────────
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN created_at BETWEEN NOW() - ($1||' days')::INTERVAL * 2
                                               AND NOW() - ($1||' days')::INTERVAL
                       THEN subtotal_rub ELSE 0 END), 0) AS revenue_prev,
          COUNT(CASE WHEN created_at BETWEEN NOW() - ($1||' days')::INTERVAL * 2
                                         AND NOW() - ($1||' days')::INTERVAL THEN 1 END) AS orders_prev,
          COALESCE(AVG(CASE WHEN created_at BETWEEN NOW() - ($1||' days')::INTERVAL * 2
                                               AND NOW() - ($1||' days')::INTERVAL
                            AND subtotal_rub > 0 THEN subtotal_rub END), 0) AS avg_order_prev
        FROM cabinet_orders
        WHERE status NOT IN ('cancelled','refunded')
      `, [period]),

      // ── Revenue + orders by day ──────────────────────────────────────────
      pool.query(`
        SELECT
          TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date,
          COALESCE(SUM(subtotal_rub), 0) AS revenue,
          COUNT(*) AS orders_count
        FROM cabinet_orders
        WHERE created_at > NOW() - ($1||' days')::INTERVAL
          AND status NOT IN ('cancelled','refunded')
          AND subtotal_rub IS NOT NULL
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) ASC
      `, [period]),

      // ── Orders by status ────────────────────────────────────────────────
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM cabinet_orders
        GROUP BY status ORDER BY count DESC
      `),

      // ── Top 10 products ─────────────────────────────────────────────────
      pool.query(`
        SELECT
          oi.auction_id,
          oi.lot_name AS product_name,
          SUM(oi.quantity) AS units_sold,
          COALESCE(SUM(oi.quantity * oi.unit_price_rub), 0) AS revenue
        FROM cabinet_order_items oi
        JOIN cabinet_orders o ON o.id = oi.order_id
        WHERE o.status NOT IN ('cancelled','refunded')
        GROUP BY oi.auction_id, oi.lot_name
        ORDER BY units_sold DESC LIMIT 10
      `),

      // ── Customers ───────────────────────────────────────────────────────
      pool.query(`
        SELECT
          u.id, u.email,
          NULLIF(TRIM(u.display_name), '') AS display_name,
          u.created_at AS registered_at,
          COUNT(o.id) AS orders_count,
          COALESCE(SUM(o.subtotal_rub), 0) AS total_spent,
          COALESCE(AVG(CASE WHEN o.subtotal_rub > 0 THEN o.subtotal_rub END), 0) AS avg_order,
          MAX(o.created_at) AS last_order_date,
          COUNT(CASE WHEN o.created_at > NOW() - INTERVAL '30 days' THEN 1 END) AS orders_30d
        FROM cabinet_users u
        LEFT JOIN cabinet_orders o
          ON o.user_id = u.id AND o.status NOT IN ('cancelled','refunded')
        GROUP BY u.id, u.email, u.display_name, u.created_at
        ORDER BY total_spent DESC
      `),

      // ── Coupon usage ────────────────────────────────────────────────────
      pool.query(`
        SELECT coupon_code, COUNT(*) AS usage_count, SUM(discount_rub) AS total_discount
        FROM cabinet_orders
        WHERE coupon_code IS NOT NULL AND TRIM(coupon_code) != ''
          AND status NOT IN ('cancelled','refunded')
        GROUP BY coupon_code ORDER BY usage_count DESC LIMIT 10
      `),

      // ── Recent 10 orders ────────────────────────────────────────────────
      pool.query(`
        SELECT o.id, o.status, o.reference_code, o.total_display, o.created_at,
               o.customer_name, o.subtotal_rub, u.email AS user_email
        FROM cabinet_orders o LEFT JOIN cabinet_users u ON u.id = o.user_id
        ORDER BY o.created_at DESC LIMIT 10
      `),

      // ── All orders for Orders tab ────────────────────────────────────────
      pool.query(`
        SELECT o.id, o.status, o.reference_code, o.total_display, o.summary_line,
               o.created_at, o.tracking_number, o.eta_days, o.progress_percent,
               o.can_cancel, o.can_return, o.refund_status,
               o.coupon_code, o.discount_percent, o.discount_rub, o.subtotal_rub,
               o.loyalty_percent, o.loyalty_discount_rub,
               o.customer_name, o.customer_phone, o.customer_email,
               o.delivery_city, o.delivery_street, o.delivery_house,
               o.delivery_apartment, o.delivery_postal_code, o.customer_comment,
               o.delivery_rub, o.delivery_mode, o.cdek_pvz_code, o.cdek_order_uuid,
               o.cdek_error, o.cdek_last_status_code, o.cdek_last_status_at,
               o.delivery_tariff_rub,
               o.crm_assignee_admin_id, o.crm_due_at, o.crm_priority, o.crm_internal_notes,
               COALESCE(NULLIF(TRIM(au.display_name), ''), au.username) AS crm_assignee_label,
               u.email AS user_email
        FROM cabinet_orders o
        LEFT JOIN cabinet_users u ON u.id = o.user_id
        LEFT JOIN admin_users au ON au.id = o.crm_assignee_admin_id
        ORDER BY o.created_at DESC
      `),

      // ── Monthly revenue (last 12 months) ────────────────────────────────
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(subtotal_rub), 0) AS revenue,
          COUNT(*) AS orders_count
        FROM cabinet_orders
        WHERE created_at > NOW() - INTERVAL '12 months'
          AND status NOT IN ('cancelled','refunded')
          AND subtotal_rub IS NOT NULL
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at) ASC
      `),

      // ── New customers by day (current period) ───────────────────────────
      pool.query(`
        SELECT
          TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date,
          COUNT(*) AS new_customers
        FROM cabinet_users
        WHERE created_at > NOW() - ($1||' days')::INTERVAL
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) ASC
      `, [period]),

      pool.query(`
        SELECT id,
               COALESCE(NULLIF(TRIM(display_name), ''), username) AS label
        FROM admin_users
        WHERE is_active = TRUE
        ORDER BY label ASC
      `),
    ]);

    // Attach order items
    const orderIds = (ordersAllRes.rows as { id: number }[]).map(r => r.id);
    const itemsByOrder: Record<number, unknown[]> = {};
    if (orderIds.length > 0) {
      const itemsRes = await pool.query(`
        SELECT oi.order_id, oi.auction_id, oi.quantity, oi.unit_price_display,
               oi.variant_summary, oi.lot_name AS product_name
        FROM cabinet_order_items oi WHERE oi.order_id = ANY($1)
        ORDER BY oi.order_id ASC, oi.id ASC
      `, [orderIds]);
      for (const row of itemsRes.rows as { order_id: number }[]) {
        if (!itemsByOrder[row.order_id]) itemsByOrder[row.order_id] = [];
        itemsByOrder[row.order_id].push(row);
      }
    }
    const orders = (ordersAllRes.rows as { id: number }[]).map(o => ({
      ...o,
      items: itemsByOrder[o.id] ?? [],
    }));

    // Compute deltas
    const kpi = kpiRes.rows[0];
    const prev = kpiPrevRes.rows[0];
    function delta(curr: number, prv: number) {
      if (prv === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prv) / prv) * 100);
    }

    // Segment customers
    type CustomerRow = {
      orders_count: string;
      total_spent: string;
      orders_30d: string;
      [key: string]: unknown;
    };
    const customers = (customersRes.rows as CustomerRow[]).map(c => {
      const cnt = Number(c.orders_count);
      const spent = Number(c.total_spent);
      const recent = Number(c.orders_30d);
      let segment: 'new' | 'active' | 'vip' = 'new';
      if (cnt >= 5 || spent >= 50000) segment = 'vip';
      else if (cnt >= 1) segment = 'active';
      const rfm_r = recent > 0 ? 3 : cnt > 0 ? 2 : 1;
      const rfm_f = cnt >= 10 ? 5 : cnt >= 5 ? 4 : cnt >= 3 ? 3 : cnt >= 1 ? 2 : 1;
      const rfm_m = spent >= 100000 ? 5 : spent >= 50000 ? 4 : spent >= 20000 ? 3 : spent >= 5000 ? 2 : 1;
      return { ...c, segment, rfm_r, rfm_f, rfm_m, rfm: rfm_r + rfm_f + rfm_m };
    });

    const segmentCounts = customers.reduce((acc, c) => {
      acc[c.segment] = (acc[c.segment] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // New customers count this period
    const newCustomersTotal = newCustomersChartRes.rows.reduce(
      (s, r) => s + Number(r.new_customers), 0
    );

    return NextResponse.json({
      period,
      kpi: {
        revenue_all: Number(kpi.revenue_all),
        revenue_period: Number(kpi.revenue_period),
        revenue_prev: Number(prev.revenue_prev),
        revenue_delta: delta(Number(kpi.revenue_period), Number(prev.revenue_prev)),
        orders_all: Number(kpi.orders_all),
        orders_period: Number(kpi.orders_period),
        orders_prev: Number(prev.orders_prev),
        orders_delta: delta(Number(kpi.orders_period), Number(prev.orders_prev)),
        avg_order: Math.round(Number(kpi.avg_order_all)),
        avg_order_period: Math.round(Number(kpi.avg_order_period)),
        avg_order_prev: Math.round(Number(prev.avg_order_prev)),
        avg_order_delta: delta(Math.round(Number(kpi.avg_order_period)), Math.round(Number(prev.avg_order_prev))),
        coupon_discounts_total: Number(kpi.coupon_discounts_total),
        loyalty_discounts_total: Number(kpi.loyalty_discounts_total),
        coupon_discounts_period: Number(kpi.coupon_discounts_period),
        loyalty_discounts_period: Number(kpi.loyalty_discounts_period),
        customers_total: customers.length,
        customers_new_period: newCustomersTotal,
      },
      chart: chartRes.rows.map(r => ({
        date: r.date as string,
        revenue: Number(r.revenue),
        orders: Number(r.orders_count),
      })),
      statuses: statusRes.rows.map(r => ({
        status: r.status as string,
        count: Number(r.count),
      })),
      products: productsRes.rows.map(r => ({
        auction_id: r.auction_id as number | null,
        product_name: r.product_name as string,
        units_sold: Number(r.units_sold),
        revenue: Number(r.revenue),
      })),
      customers,
      segments: segmentCounts,
      coupons: couponsRes.rows.map(r => ({
        coupon_code: r.coupon_code as string,
        usage_count: Number(r.usage_count),
        total_discount: Number(r.total_discount),
      })),
      recent_orders: recentRes.rows,
      orders,
      monthly: monthlyRes.rows.map(r => ({
        month: r.month as string,
        revenue: Number(r.revenue),
        orders_count: Number(r.orders_count),
      })),
      new_customers_chart: newCustomersChartRes.rows.map(r => ({
        date: r.date as string,
        new_customers: Number(r.new_customers),
      })),
      assignees: (assigneesRes.rows as { id: number; label: string }[]).map((r) => ({
        id: Number(r.id),
        label: String(r.label ?? ''),
      })),
    });
  } catch (e) {
    console.error('[CRM API]', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi('crm.view');
  if (auth instanceof NextResponse) return auth;
  try {
    await ensureDatabase();
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'id обязателен' }, { status: 400 });

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const { status, tracking_number, eta_days, progress_percent } = body;

    if (status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(status);
    }
    if (tracking_number !== undefined) {
      fields.push(`tracking_number = $${idx++}`);
      values.push(tracking_number);
    }
    if (eta_days !== undefined) {
      fields.push(`eta_days = $${idx++}`);
      values.push(eta_days);
    }
    if (progress_percent !== undefined) {
      fields.push(`progress_percent = $${idx++}`);
      values.push(progress_percent);
    }

    if ('crm_assignee_admin_id' in body) {
      const v = body.crm_assignee_admin_id;
      fields.push(`crm_assignee_admin_id = $${idx++}`);
      if (v === null || v === '') {
        values.push(null);
      } else {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json({ error: 'Некорректный исполнитель' }, { status: 400 });
        }
        values.push(n);
      }
    }

    if ('crm_due_at' in body) {
      const v = body.crm_due_at;
      fields.push(`crm_due_at = $${idx++}`);
      if (v === null || v === '') {
        values.push(null);
      } else {
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Некорректная дата дедлайна' }, { status: 400 });
        }
        values.push(d.toISOString());
      }
    }

    if ('crm_priority' in body) {
      const allowed = new Set(['low', 'normal', 'high', 'urgent']);
      const p = String(body.crm_priority ?? 'normal').toLowerCase();
      fields.push(`crm_priority = $${idx++}`);
      values.push(allowed.has(p) ? p : 'normal');
    }

    if ('crm_internal_notes' in body) {
      const raw = body.crm_internal_notes;
      const s =
        typeof raw === 'string'
          ? raw.trim().slice(0, 8000)
          : raw === null
            ? ''
            : String(raw ?? '').trim().slice(0, 8000);
      fields.push(`crm_internal_notes = $${idx++}`);
      values.push(s ? s : null);
    }

    if (fields.length === 0) return NextResponse.json({ error: 'Нет полей' }, { status: 400 });

    const prev = await pool.query(
      `SELECT status, cdek_order_uuid FROM cabinet_orders WHERE id = $1`,
      [id]
    );
    const prevStatus = (prev.rows[0] as { status?: string })?.status;
    const cdekUuid = (prev.rows[0] as { cdek_order_uuid?: string | null })?.cdek_order_uuid;

    values.push(id);
    await pool.query(`UPDATE cabinet_orders SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    const cancelStatuses = ['cancelled', 'refunded'];
    if (
      status !== undefined &&
      cancelStatuses.includes(String(status)) &&
      prevStatus && !cancelStatuses.includes(prevStatus)
    ) {
      if (cdekUuid && isCdekApiConfigured()) {
        const r = await cdekDeleteOrder(cdekUuid);
        console.log(`[crm] CDEK cancel order ${cdekUuid}: ${r.ok ? 'OK' : r.message}`);
      }
      refundOrderViaTbank(id).catch(() => {/* логируется внутри */});
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
