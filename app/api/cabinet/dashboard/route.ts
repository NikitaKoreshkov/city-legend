import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { formatRub } from '@/lib/cartPricing';
import {
  buildVariantSummary,
  findVariantById,
  hasActiveVariantConfig,
  parseProductVariantConfig,
} from '@/lib/productVariants';
import { nextLoyaltyTier, pickLoyaltyTierForSpent } from '@/lib/volumeLoyalty';
import { estimateReadingMinutes } from '@/lib/blogReadingTime';

type Segment = 'new' | 'active' | 'vip';
type AbBucket = 'A' | 'B';

function detectSegment(ordersCount: number, spentRub: number): Segment {
  if (ordersCount >= 5 || spentRub >= 50000) return 'vip';
  if (ordersCount >= 1) return 'active';
  return 'new';
}

function scoreBySegment(target: string | null, segment: Segment): number {
  const normalized = (target || 'all').toLowerCase();
  if (normalized === 'all') return 1;
  return normalized === segment ? 4 : -4;
}

function scoreByAbBucket(target: string | null, bucket: AbBucket): number {
  const normalized = (target || 'all').toUpperCase();
  if (normalized === 'ALL') return 1;
  return normalized === bucket ? 2 : -2;
}

export async function GET() {
  try {
    const user = await getCabinetUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
    }

    await ensureDatabase();

    const [newsRes, promoRes, ordersRes, cartRes, favRes, reviewsRes, copyRes, tiersRes, addressesRes, conciergeTopicsRes, conciergeTicketsRes] = await Promise.all([
      pool.query(
        `SELECT id, title, excerpt, sort_order, created_at, image_url, details_url, target_segment, ab_bucket,
                COALESCE(NULLIF(TRIM(category), ''), 'Бутик') AS category,
                COALESCE(body, '') AS body
         FROM cabinet_site_news
         ORDER BY sort_order ASC, id ASC`
      ),
      pool.query(
        `SELECT id, title, subtitle, promo_code, discount_label, active, valid_until, sort_order, created_at, details_url, target_segment, ab_bucket
         FROM cabinet_promotions
         WHERE active = TRUE
         ORDER BY sort_order ASC, id ASC`
      ),
      pool.query(
        `SELECT id, status, reference_code, total_display, summary_line, created_at,
                tracking_number, eta_days, progress_percent, can_cancel, can_return,
                refund_status, refunded_at,
                coupon_code, discount_percent, discount_rub, subtotal_rub,
                COALESCE(loyalty_percent, 0) AS loyalty_percent,
                COALESCE(loyalty_discount_rub, 0) AS loyalty_discount_rub,
                customer_name, customer_phone, customer_email,
                delivery_city, delivery_street, delivery_house, delivery_apartment, delivery_postal_code, customer_comment
         FROM cabinet_orders
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [user.id]
      ),
      pool.query(
        `SELECT c.auction_id, c.variant_id, c.quantity, c.updated_at,
                a.name AS lot_name, a.starting_price, a.images, a.product_variants
         FROM cabinet_cart_items c
         LEFT JOIN auctions a ON a.id = c.auction_id
         WHERE c.user_id = $1
         ORDER BY c.updated_at DESC`,
        [user.id]
      ),
      pool.query(
        `SELECT f.auction_id, f.created_at,
                a.name AS lot_name, a.starting_price, a.images
         FROM cabinet_favorites f
         LEFT JOIN auctions a ON a.id = f.auction_id
         WHERE f.user_id = $1
         ORDER BY f.created_at DESC`,
        [user.id]
      ),
      pool.query(
        `SELECT id, order_item_id, auction_id, lot_title, review_text, likes_count, dislikes_count, created_at,
                rating
         FROM cabinet_user_reviews
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [user.id]
      ),
      pool.query(`SELECT key, value FROM cabinet_cms_copy`),
      pool.query(
        `SELECT id, sort_order, from_rub, label, percent
         FROM cabinet_loyalty_tiers
         ORDER BY sort_order ASC, id ASC`
      ),
      pool.query(
        `SELECT id, label, full_name, phone, email, city, street, house, apartment, postal_code, comment, is_default
         FROM cabinet_saved_addresses
         WHERE user_id = $1
         ORDER BY is_default DESC, id DESC`,
        [user.id]
      ),
      pool.query(
        `SELECT topic_key, label, sla_minutes
         FROM cabinet_concierge_topics
         ORDER BY sort_order ASC, topic_key ASC`
      ),
      pool.query(
        `SELECT t.id, t.topic_key, t.status, t.priority, t.subject, t.order_id, t.assigned_manager_name,
                t.response_sla_minutes, t.first_response_due_at, t.created_at, t.updated_at, t.closed_at,
                tp.label AS topic_label,
                m.message AS last_message, m.sender_type AS last_sender_type, m.created_at AS last_message_at
         FROM cabinet_concierge_tickets t
         JOIN cabinet_concierge_topics tp ON tp.topic_key = t.topic_key
         LEFT JOIN LATERAL (
           SELECT message, sender_type, created_at
           FROM cabinet_concierge_messages cm
           WHERE cm.ticket_id = t.id
           ORDER BY cm.created_at DESC
           LIMIT 1
         ) m ON TRUE
         WHERE t.user_id = $1
         ORDER BY t.created_at DESC`,
        [user.id]
      ),
    ]);

    const cabinetCopy = Object.fromEntries(
      (copyRes.rows as { key: string; value: string }[]).map((r) => [r.key, r.value])
    ) as Record<string, string>;

    const reviewIds = (reviewsRes.rows as { id: number }[]).map((r) => r.id);
    const repliesMap: Record<number, { id: number; text: string; created_at: string }[]> = {};
    if (reviewIds.length > 0) {
      const rep = await pool.query(
        `SELECT id, review_id, reply_text, created_at
         FROM cabinet_review_replies
         WHERE review_id = ANY($1::int[])
         ORDER BY created_at ASC`,
        [reviewIds]
      );
      for (const r of rep.rows as {
        id: number;
        review_id: number;
        reply_text: string;
        created_at: Date;
      }[]) {
        if (!repliesMap[r.review_id]) repliesMap[r.review_id] = [];
        repliesMap[r.review_id].push({
          id: r.id,
          text: r.reply_text,
          created_at: r.created_at.toISOString(),
        });
      }
    }

    const reviews = (reviewsRes.rows as {
      id: number;
      order_item_id: number | null;
      auction_id: number | null;
      lot_title: string;
      review_text: string;
      likes_count: number;
      dislikes_count: number;
      created_at: Date;
      rating: number | null;
    }[]).map((r) => ({
      id: r.id,
      orderItemId: r.order_item_id,
      auctionId: r.auction_id,
      lotTitle: r.lot_title,
      text: r.review_text,
      likes: r.likes_count,
      dislikes: r.dislikes_count,
      rating: r.rating != null && r.rating >= 1 && r.rating <= 5 ? r.rating : null,
      createdAt: r.created_at.toISOString(),
      replies: repliesMap[r.id] ?? [],
    }));

    const favorites = (favRes.rows as {
      auction_id: number;
      created_at: Date;
      lot_name: string | null;
      starting_price: string | null;
      images: string[] | null;
    }[]).map((r) => ({
      auctionId: r.auction_id,
      lotName: r.lot_name || `Лот #${r.auction_id}`,
      price: r.starting_price || '',
      image: r.images?.[0] || null,
      addedAt: r.created_at.toISOString(),
    }));

    const cart = (cartRes.rows as {
      auction_id: number;
      variant_id: string | null;
      quantity: number;
      updated_at: Date;
      lot_name: string | null;
      starting_price: string | null;
      images: string[] | null;
      product_variants: unknown;
    }[]).map((r) => {
      const variantId = String(r.variant_id ?? '').trim();
      const config = parseProductVariantConfig(r.product_variants);
      let price = r.starting_price || '';
      let image: string | null = r.images?.[0] || null;
      let variantSummary: string | null = null;
      if (variantId && hasActiveVariantConfig(config)) {
        const v = findVariantById(config!, variantId);
        if (v) {
          price = v.starting_price || price;
          if (v.images && v.images.length > 0) image = v.images[0]!;
          variantSummary = buildVariantSummary(config!, v) || null;
        }
      }
      return {
        auctionId: r.auction_id,
        variantId,
        variantSummary,
        quantity: r.quantity,
        lotName: r.lot_name || `Лот #${r.auction_id}`,
        price,
        image,
        updatedAt: r.updated_at.toISOString(),
      };
    });

    const orders = (ordersRes.rows as {
      id: number;
      status: string;
      reference_code: string | null;
      total_display: string;
      summary_line: string | null;
      created_at: Date;
      tracking_number: string | null;
      eta_days: number | null;
      progress_percent: number | null;
      can_cancel: boolean;
      can_return: boolean;
      refund_status: string | null;
      refunded_at: Date | null;
      coupon_code: string | null;
      discount_percent: number | null;
      discount_rub: string | number | null;
      subtotal_rub: string | number | null;
      loyalty_percent: number | string | null;
      loyalty_discount_rub: string | number | null;
      customer_name: string | null;
      customer_phone: string | null;
      customer_email: string | null;
      delivery_city: string | null;
      delivery_street: string | null;
      delivery_house: string | null;
      delivery_apartment: string | null;
      delivery_postal_code: string | null;
      customer_comment: string | null;
    }[]).map((o) => ({
      id: o.id,
      status: o.status,
      reference: o.reference_code,
      total: o.total_display,
      summary: o.summary_line,
      createdAt: o.created_at.toISOString(),
      trackingNumber: o.tracking_number,
      etaDays: o.eta_days ?? null,
      progressPercent: typeof o.progress_percent === 'number' ? o.progress_percent : 0,
      canCancel: !!o.can_cancel,
      canReturn: !!o.can_return,
      refundStatus: o.refund_status,
      refundedAt: o.refunded_at ? o.refunded_at.toISOString() : null,
      couponCode: o.coupon_code ?? null,
      discountPercent: Number(o.discount_percent || 0),
      discountRub: Number(o.discount_rub || 0),
      loyaltyPercent: Number(o.loyalty_percent || 0),
      loyaltyDiscountRub: Number(o.loyalty_discount_rub || 0),
      subtotalRub: o.subtotal_rub != null ? Number(o.subtotal_rub) : null,
      subtotalDisplay: o.subtotal_rub != null ? formatRub(Number(o.subtotal_rub)) : null,
      customer: {
        name: o.customer_name ?? '',
        phone: o.customer_phone ?? '',
        email: o.customer_email ?? '',
      },
      delivery: {
        city: o.delivery_city ?? '',
        street: o.delivery_street ?? '',
        house: o.delivery_house ?? '',
        apartment: o.delivery_apartment ?? '',
        postalCode: o.delivery_postal_code ?? '',
        comment: o.customer_comment ?? '',
      },
      items: [] as {
        id: number;
        auctionId: number | null;
        lotName: string;
        unitPrice: string;
        quantity: number;
        image: string | null;
      }[],
    }));

    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      const itemsRes = await pool.query(
        `SELECT oi.id, oi.order_id, oi.auction_id, oi.lot_name, oi.unit_price_display, oi.quantity,
                COALESCE(oi.image_url, a.images[1]) AS image_url
         FROM cabinet_order_items oi
         LEFT JOIN auctions a ON a.id = oi.auction_id
         WHERE order_id = ANY($1::int[])
         ORDER BY oi.id ASC`,
        [orderIds]
      );
      const byOrder = new Map<number, (typeof orders)[number]['items']>();
      for (const item of itemsRes.rows as {
        id: number;
        order_id: number;
        auction_id: number | null;
        lot_name: string;
        unit_price_display: string;
        quantity: number;
        image_url: string | null;
      }[]) {
        const arr = byOrder.get(item.order_id) ?? [];
        arr.push({
          id: item.id,
          auctionId: item.auction_id,
          lotName: item.lot_name,
          unitPrice: item.unit_price_display,
          quantity: item.quantity,
          image: item.image_url,
        });
        byOrder.set(item.order_id, arr);
      }
      for (const order of orders) {
        order.items = byOrder.get(order.id) ?? [];
      }
    }

    const qualifyingOrders = orders.filter((o) => o.status !== 'cancelled');
    const spentRub = qualifyingOrders.reduce((acc, o) => acc + (o.subtotalRub ?? 0), 0);
    const segment = detectSegment(qualifyingOrders.length, spentRub);
    const abBucket: AbBucket = user.id % 2 === 0 ? 'A' : 'B';

    const news = (newsRes.rows as {
      id: number;
      title: string;
      excerpt: string;
      sort_order: number;
      created_at: Date;
      image_url: string | null;
      details_url: string | null;
      target_segment: string | null;
      ab_bucket: string | null;
      category: string;
      body: string;
    }[])
      .map((n) => ({
      id: n.id,
      title: n.title,
      excerpt: n.excerpt,
      category: n.category,
      readingMinutes: estimateReadingMinutes(`${n.excerpt}\n${n.body}`),
      createdAt: n.created_at.toISOString(),
      imageUrl: n.image_url || null,
      detailsUrl: n.details_url || `/news/${n.id}`,
      targetSegment: n.target_segment || 'all',
      abBucket: n.ab_bucket || 'all',
      score:
        scoreBySegment(n.target_segment, segment) +
        scoreByAbBucket(n.ab_bucket, abBucket) +
        Math.max(0, 100 - n.sort_order),
    }))
      .sort((a, b) => b.score - a.score);

    const promotions = (promoRes.rows as {
      id: number;
      title: string;
      subtitle: string | null;
      promo_code: string | null;
      discount_label: string | null;
      valid_until: Date | null;
      details_url: string | null;
      target_segment: string | null;
      ab_bucket: string | null;
    }[])
      .map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      code: p.promo_code,
      discountLabel: p.discount_label,
      validUntil: p.valid_until ? p.valid_until.toISOString().slice(0, 10) : null,
      detailsUrl: p.details_url || `/promotions/${p.id}`,
      targetSegment: p.target_segment || 'all',
      abBucket: p.ab_bucket || 'all',
      score:
        scoreBySegment(p.target_segment, segment) +
        scoreByAbBucket(p.ab_bucket, abBucket) +
        (p.promo_code ? 2 : 0),
    }))
      .sort((a, b) => b.score - a.score);

    const bestOffer = promotions[0]
      ? {
          promotionId: promotions[0].id,
          title: promotions[0].title,
          code: promotions[0].code,
          discountLabel: promotions[0].discountLabel,
          detailsUrl: promotions[0].detailsUrl,
          reason:
            segment === 'vip'
              ? 'Подобрано по вашему high-value профилю'
              : segment === 'active'
                ? 'Подобрано по истории ваших заказов'
                : 'Подобрано для первого заказа',
        }
      : null;

    const loyaltyTiers = (tiersRes.rows as {
      id: number;
      from_rub: string | number;
      label: string;
      percent: number;
    }[]).map((r) => ({
      id: r.id,
      fromRub: Number(r.from_rub),
      label: r.label,
      percent: r.percent,
    }));

    const activeLoyaltyTier = pickLoyaltyTierForSpent(spentRub, loyaltyTiers);
    const upcomingTier = nextLoyaltyTier(spentRub, loyaltyTiers);
    const rubToNext = upcomingTier ? Math.max(0, upcomingTier.fromRub - spentRub) : null;

    const volumeLoyalty = {
      headline: cabinetCopy.loyalty_headline ?? '',
      spentHint:
        orders.length === 0
          ? (cabinetCopy.loyalty_spent_hint_no_orders ?? '')
          : (cabinetCopy.loyalty_spent_hint_has_orders ?? ''),
      tiers: loyaltyTiers,
      spentRub,
      activePercent: activeLoyaltyTier?.percent ?? 0,
      currentTier:
        activeLoyaltyTier != null
          ? `Ваш уровень: ${activeLoyaltyTier.label} — скидка ${activeLoyaltyTier.percent}% к каждому заказу`
          : null,
      nextTierLabel: upcomingTier?.label ?? null,
      nextTierPercent: upcomingTier?.percent ?? null,
      rubToNextTier: rubToNext,
    };

    const excludedIds = new Set<number>();
    for (const c of cart) excludedIds.add(c.auctionId);
    for (const f of favorites) excludedIds.add(f.auctionId);
    const excluded = Array.from(excludedIds);
    const preferredCatsRes = await pool.query(
      `WITH base AS (
         SELECT a.category_id, a.category
         FROM cabinet_cart_items ci
         JOIN auctions a ON a.id = ci.auction_id
         WHERE ci.user_id = $1
         UNION ALL
         SELECT a.category_id, a.category
         FROM cabinet_favorites cf
         JOIN auctions a ON a.id = cf.auction_id
         WHERE cf.user_id = $1
         UNION ALL
         SELECT a.category_id, a.category
         FROM cabinet_order_items oi
         JOIN cabinet_orders o ON o.id = oi.order_id AND o.user_id = $1
         JOIN auctions a ON a.id = oi.auction_id
       )
       SELECT category_id, category, COUNT(*)::int AS c
       FROM base
       GROUP BY category_id, category
       ORDER BY c DESC
       LIMIT 4`,
      [user.id]
    );
    const prefCatIds = (preferredCatsRes.rows as { category_id: number | null }[])
      .map((r) => r.category_id)
      .filter((v): v is number => typeof v === 'number');
    const prefCatNames = (preferredCatsRes.rows as { category: string | null }[])
      .map((r) => (r.category || '').trim())
      .filter((v) => !!v);
    const suggestedRes = await pool.query(
      `SELECT id, name, starting_price, images
       FROM auctions
       WHERE
         ($1::int[] IS NULL OR NOT (id = ANY($1::int[])))
         AND (
           ($2::int[] IS NOT NULL AND category_id = ANY($2::int[]))
           OR
           ($3::text[] IS NOT NULL AND category = ANY($3::text[]))
         )
       ORDER BY id DESC
       LIMIT 8`,
      [
        excluded.length > 0 ? excluded : null,
        prefCatIds.length > 0 ? prefCatIds : null,
        prefCatNames.length > 0 ? prefCatNames : null,
      ]
    );
    const suggestedRows = [...(suggestedRes.rows as {
      id: number;
      name: string;
      starting_price: string | null;
      images: string[] | null;
    }[])];
    if (suggestedRows.length < 8) {
      const fallbackRes = await pool.query(
        `SELECT id, name, starting_price, images
         FROM auctions
         WHERE ($1::int[] IS NULL OR NOT (id = ANY($1::int[])))
         ORDER BY id DESC
         LIMIT $2`,
        [excluded.length > 0 ? excluded : null, 8 - suggestedRows.length]
      );
      const taken = new Set<number>(suggestedRows.map((r) => r.id));
      for (const row of fallbackRes.rows as typeof suggestedRows) {
        if (!taken.has(row.id)) suggestedRows.push(row);
      }
    }
    const suggested = suggestedRows.map((r) => ({
      auctionId: r.id,
      lotName: r.name,
      price: r.starting_price || '',
      image: r.images?.[0] || null,
    }));

    const savedAddresses = (addressesRes.rows as {
      id: number;
      label: string;
      full_name: string;
      phone: string;
      email: string;
      city: string;
      street: string;
      house: string;
      apartment: string | null;
      postal_code: string | null;
      comment: string | null;
      is_default: boolean;
    }[]).map((a) => ({
      id: a.id,
      label: a.label,
      fullName: a.full_name,
      phone: a.phone,
      email: a.email,
      city: a.city,
      street: a.street,
      house: a.house,
      apartment: a.apartment || '',
      postalCode: a.postal_code || '',
      comment: a.comment || '',
      isDefault: !!a.is_default,
    }));
    const conciergeTopics = (conciergeTopicsRes.rows as {
      topic_key: string;
      label: string;
      sla_minutes: number;
    }[]).map((r) => ({
      key: r.topic_key,
      label: r.label,
      slaMinutes: Number(r.sla_minutes || 30),
    }));
    const conciergeTickets = (conciergeTicketsRes.rows as {
      id: number;
      topic_key: string;
      topic_label: string;
      status: string;
      priority: string;
      subject: string;
      order_id: number | null;
      assigned_manager_name: string | null;
      response_sla_minutes: number;
      first_response_due_at: Date | null;
      created_at: Date;
      updated_at: Date;
      closed_at: Date | null;
      last_message: string | null;
      last_sender_type: string | null;
      last_message_at: Date | null;
    }[]).map((t) => ({
      id: t.id,
      topicKey: t.topic_key,
      topicLabel: t.topic_label,
      status: t.status,
      priority: t.priority,
      subject: t.subject,
      orderId: t.order_id,
      assignedManagerName: t.assigned_manager_name || null,
      responseSlaMinutes: Number(t.response_sla_minutes || 30),
      firstResponseDueAt: t.first_response_due_at ? t.first_response_due_at.toISOString() : null,
      createdAt: t.created_at.toISOString(),
      updatedAt: t.updated_at.toISOString(),
      closedAt: t.closed_at ? t.closed_at.toISOString() : null,
      lastMessage: t.last_message || null,
      lastSenderType: t.last_sender_type || null,
      lastMessageAt: t.last_message_at ? t.last_message_at.toISOString() : null,
    }));

    return NextResponse.json({
      user,
      marketing: {
        segment,
        abBucket,
      },
      cabinetCopy,
      news,
      promotions,
      bestOffer,
      orders,
      cart,
      favorites,
      reviews,
      volumeLoyalty,
      savedAddresses,
      conciergeTopics,
      conciergeTickets,
      suggested,
    });
  } catch (e) {
    console.error('cabinet/dashboard', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
