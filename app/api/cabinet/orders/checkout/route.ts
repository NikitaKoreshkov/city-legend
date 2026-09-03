import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase, ensureDeliveryQuotesSchema, ensureCabinetCoreSchema } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { formatRub } from '@/lib/cartPricing';
import {
  applyVariantInventoryDecrement,
  parseProductVariantConfig,
  type ProductVariantConfig,
} from '@/lib/productVariants';
import {
  cdekDefaultPackage,
  isCdekApiConfigured,
  isCdekDeliveryEnabled,
} from '@/lib/cdekConfig';
import { cdekCreateShipmentOrder, cdekPollTrackingNumber } from '@/lib/cdekClient';
import { resolveCheckoutCart } from '@/lib/cabinetCheckoutResolve';
import { lockAndValidateDeliveryQuote, type DeliveryQuoteRow } from '@/lib/deliveryQuoteValidate';
import { notifyStaffPaidOrder } from '@/lib/orderNotifyStaff';
import { notifyCustomerOrderPaid } from '@/lib/orderNotifyCustomer';

type CheckoutBody = {
  fullName?: string;
  phone?: string;
  email?: string;
  city?: string;
  street?: string;
  house?: string;
  apartment?: string;
  postalCode?: string;
  comment?: string;
  couponCode?: string;
  paymentConfirmationId?: number;
  expressAuctionId?: number;
  expressQuantity?: number;
  expressVariantId?: string;
};

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function validate(payload: CheckoutBody) {
  const fullName = clean(payload.fullName);
  const phone = clean(payload.phone);
  const email = clean(payload.email);
  const city = clean(payload.city);
  const street = clean(payload.street);
  const house = clean(payload.house);

  if (fullName.length < 3) return 'Укажите имя и фамилию';
  if (phone.length < 10) return 'Укажите корректный телефон';
  if (!email.includes('@')) return 'Укажите корректный e-mail';
  if (city.length < 2) return 'Укажите город';
  if (street.length < 2) return 'Укажите улицу';
  if (house.length < 1) return 'Укажите номер дома';
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const invalid = validate(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const paymentConfirmationId = Number(body.paymentConfirmationId || 0);
  if (!Number.isFinite(paymentConfirmationId) || paymentConfirmationId <= 0) {
    return NextResponse.json({ error: 'Требуется подтверждённая оплата' }, { status: 400 });
  }

  await ensureDatabase();
  await ensureCabinetCoreSchema();
  await ensureDeliveryQuotesSchema();
  const client = await pool.connect();
  let quoteRow: DeliveryQuoteRow | null = null;
  let orderIdForCdek: number | null = null;
  let referenceForCdek = '';
  let cdekItems: Parameters<typeof cdekCreateShipmentOrder>[0]['items'] = [];
  let cdekTariff = 0;
  try {
    await client.query('BEGIN');

    const resolved = await resolveCheckoutCart(client, user.id, {
      couponCode: body.couponCode,
      expressAuctionId: body.expressAuctionId,
      expressQuantity: body.expressQuantity,
      expressVariantId: body.expressVariantId,
    });
    if (!resolved.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        {
          error: resolved.error,
          unavailable: resolved.unavailable,
        },
        { status: 409 }
      );
    }

    const data = resolved.data;
    const {
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
    } = data;

    const paymentRes = await client.query(
      `SELECT id, amount_rub, status, used_at, expires_at, meta
       FROM cabinet_payment_confirmations
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [paymentConfirmationId, user.id]
    );
    if (paymentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Подтверждение оплаты не найдено' }, { status: 400 });
    }
    const payment = paymentRes.rows[0] as {
      id: number;
      amount_rub: string | number;
      status: string;
      used_at: Date | null;
      expires_at: Date | null;
      meta: unknown;
    };
    if (payment.status !== 'confirmed') {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Оплата не подтверждена' }, { status: 400 });
    }
    if (payment.used_at) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Подтверждение оплаты уже использовано' }, { status: 409 });
    }
    if (payment.expires_at && payment.expires_at.getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Истёк срок подтверждения оплаты' }, { status: 409 });
    }

    const meta =
      payment.meta && typeof payment.meta === 'object'
        ? (payment.meta as { deliveryQuoteId?: number })
        : {};
    const deliveryQuoteId = Number(meta.deliveryQuoteId || 0);

    let deliveryRub = 0;
    if (isCdekDeliveryEnabled()) {
      if (!Number.isFinite(deliveryQuoteId) || deliveryQuoteId <= 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Отсутствует расчёт доставки СДЭК' }, { status: 400 });
      }
      const v = await lockAndValidateDeliveryQuote(client, user.id, deliveryQuoteId, data);
      if (!v.ok) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: v.error }, { status: 409 });
      }
      quoteRow = v.quote;
      deliveryRub = Number(quoteRow.delivery_rub);
    }

    const expectedPay = finalRub + deliveryRub;
    if (Number(payment.amount_rub) !== expectedPay) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Сумма корзины или доставки изменилась. Подтвердите оплату повторно.' },
        { status: 409 }
      );
    }

    const paidTotalDisplay =
      totals.sumRub > 0 || totals.allPricesKnown ? formatRub(expectedPay) : 'Уточняется после проверки';
    const summaryLine =
      deliveryRub > 0
        ? `${finalCheckoutRows.length} позиций + доставка СДЭК`
        : `${finalCheckoutRows.length} позиций`;
    const cityLower = clean(body.city).toLowerCase();
    const etaDays =
      quoteRow?.period_max != null && quoteRow.period_max > 0
        ? quoteRow.period_max
        : cityLower.includes('моск') || cityLower.includes('питер') || cityLower.includes('санкт')
          ? 2
          : cityLower.includes('казан') || cityLower.includes('екатерин') || cityLower.includes('нижн')
            ? 3
            : 5;

    // Проверяем наличие колонки payment_confirmation_id (в старых БД может отсутствовать).
    const pcColCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'cabinet_orders' AND column_name = 'payment_confirmation_id'
    `);
    const hasPcCol = pcColCheck.rows.length > 0;
    if (!hasPcCol) {
      // Добавляем колонку прямо внутри транзакции (безопасно благодаря IF NOT EXISTS).
      await client.query(
        `ALTER TABLE cabinet_orders ADD COLUMN IF NOT EXISTS payment_confirmation_id INTEGER`
      );
    }

    const orderInsert = await client.query(
      `INSERT INTO cabinet_orders (
         user_id, status, reference_code, total_display, summary_line,
         customer_name, customer_phone, customer_email,
         delivery_city, delivery_street, delivery_house, delivery_apartment, delivery_postal_code, customer_comment,
         tracking_number, eta_days, progress_percent, can_cancel, can_return,
         coupon_code, discount_percent, discount_rub, subtotal_rub,
         loyalty_percent, loyalty_discount_rub,
         delivery_rub, delivery_tariff_rub, delivery_mode, cdek_pvz_code,
         payment_confirmation_id
       ) VALUES (
         $1, 'processing', $2, $3, $4,
         $5, $6, $7,
         $8, $9, $10, $11, $12, $13,
         $14, $15, $16, TRUE, FALSE,
         $17, $18, $19, $20, $21, $22,
         $23, $24, $25, $26,
         $27
       ) RETURNING id`,
      [
        user.id,
        '',
        paidTotalDisplay,
        summaryLine,
        clean(body.fullName),
        clean(body.phone),
        clean(body.email),
        clean(body.city),
        clean(body.street),
        clean(body.house),
        clean(body.apartment),
        clean(body.postalCode),
        clean(body.comment),
        null,
        etaDays,
        18,
        couponUsedCode,
        discountPercent,
        discountRub,
        totals.sumRub > 0 ? totals.sumRub : null,
        loyaltyPercent,
        loyaltyDiscountRub,
        deliveryRub > 0 ? deliveryRub : null,
        quoteRow &&
        quoteRow.delivery_tariff_rub != null &&
        String(quoteRow.delivery_tariff_rub).trim() !== ''
          ? Number(quoteRow.delivery_tariff_rub)
          : null,
        quoteRow ? quoteRow.mode : null,
        quoteRow?.pvz_code ?? null,
        paymentConfirmationId,
      ]
    );

    const orderId = orderInsert.rows[0].id as number;
    orderIdForCdek = orderId;
    const reference = `CL-${String(orderId).padStart(8, '0')}`;
    referenceForCdek = reference;
    await client.query(
      `UPDATE cabinet_orders
       SET reference_code = $2
       WHERE id = $1`,
      [orderId, reference]
    );

    const pendingVariantConfig = new Map<number, ProductVariantConfig>();

    for (const row of finalCheckoutRows) {
      await client.query(
        `INSERT INTO cabinet_order_items (
           order_id, auction_id, lot_name, unit_price_display, unit_price_rub, quantity, image_url,
           variant_id, variant_summary
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orderId,
          row.auctionId,
          row.lotName,
          row.price || 'Уточняется',
          row.unitPriceRub,
          row.quantity,
          row.image,
          row.variantId || '',
          row.variantSummary,
        ]
      );

      if (row.useDedicatedVariantInventory) {
        const locked = lockedMap.get(row.auctionId)!;
        const base = parseProductVariantConfig(locked.product_variants);
        if (!base) {
          throw new Error('product_variants_missing');
        }
        const cur =
          pendingVariantConfig.get(row.auctionId) ?? (JSON.parse(JSON.stringify(base)) as ProductVariantConfig);
        pendingVariantConfig.set(
          row.auctionId,
          applyVariantInventoryDecrement(cur, row.variantId, row.quantity)
        );
      } else {
        await client.query(
          `UPDATE auctions
           SET inventory_qty = CASE
                 WHEN inventory_qty IS NULL THEN NULL
                 ELSE GREATEST(COALESCE(inventory_qty, 0) - $2, 0)
               END,
               reserved_qty = CASE
                 WHEN inventory_qty IS NULL THEN COALESCE(reserved_qty, 0)
                 ELSE GREATEST(COALESCE(reserved_qty, 0) + $2, 0)
               END
           WHERE id = $1`,
          [row.auctionId, row.quantity]
        );
      }
    }

    for (const [aid, cfg] of pendingVariantConfig) {
      await client.query(`UPDATE auctions SET product_variants = $1::jsonb WHERE id = $2`, [
        JSON.stringify(cfg),
        aid,
      ]);
    }
    if (couponId && couponUsedCode) {
      await client.query(
        `INSERT INTO cabinet_coupon_usages (user_id, order_id, coupon_id, coupon_code, discount_percent, discount_rub)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, orderId, couponId, couponUsedCode, discountPercent, discountRub]
      );
      await client.query(
        `UPDATE cabinet_coupons
         SET uses_count = uses_count + 1,
             active = CASE WHEN max_uses IS NOT NULL AND uses_count + 1 >= max_uses THEN false ELSE active END
         WHERE id = $1`,
        [couponId]
      );
    }
    await client.query(
      `UPDATE cabinet_payment_confirmations
       SET used_at = CURRENT_TIMESTAMP, status = 'used'
       WHERE id = $1 AND user_id = $2`,
      [paymentConfirmationId, user.id]
    );

    for (const row of finalCheckoutRows) {
      const variantId = row.variantId || '';
      const dec = await client.query(
        `UPDATE cabinet_cart_items
         SET quantity = quantity - $3
         WHERE user_id = $1 AND auction_id = $2 AND variant_id = $4
           AND quantity > $3`,
        [user.id, row.auctionId, row.quantity, variantId]
      );
      if (!dec.rowCount) {
        await client.query(
          `DELETE FROM cabinet_cart_items
           WHERE user_id = $1 AND auction_id = $2 AND variant_id = $3`,
          [user.id, row.auctionId, variantId]
        );
      }
    }
    await client.query(
      `INSERT INTO cabinet_saved_addresses
       (user_id, label, full_name, phone, email, city, street, house, apartment, postal_code, comment, is_default)
       SELECT $1::int,
              'Основной адрес'::varchar(80),
              $2::varchar(160),
              $3::varchar(40),
              $4::varchar(160),
              $5::varchar(120),
              $6::varchar(180),
              $7::varchar(40),
              $8::varchar(40),
              $9::varchar(20),
              $10::text,
              TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM cabinet_saved_addresses
         WHERE user_id = $1::int
             AND city = $5::varchar(120)
             AND street = $6::varchar(180)
             AND house = $7::varchar(40)
       )`,
      [
        user.id,
        clean(body.fullName),
        clean(body.phone),
        clean(body.email),
        clean(body.city),
        clean(body.street),
        clean(body.house),
        clean(body.apartment),
        clean(body.postalCode),
        clean(body.comment),
      ]
    );

    if (quoteRow) {
      await client.query(`UPDATE cabinet_delivery_quotes SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, [
        quoteRow.id,
      ]);
    }

    const pkgW = cdekDefaultPackage().weightG;
    const n = Math.max(1, finalCheckoutRows.length);
    const perW = Math.max(100, Math.floor(pkgW / n));
    cdekItems = finalCheckoutRows.map((row, i) => ({
      name: row.lotName.slice(0, 200),
      wareKey: `${row.auctionId}-${row.variantId || '0'}-${i}`.slice(0, 50),
      cost: Math.max(1, row.unitPriceRub ?? 100) * row.quantity,
      weight: perW,
      amount: row.quantity,
    }));
    cdekTariff = quoteRow?.tariff_code ?? 0;

    await client.query('COMMIT');

    void notifyStaffPaidOrder({
      reference,
      customerName: clean(body.fullName),
      customerPhone: clean(body.phone),
      customerEmail: clean(body.email),
      totalDisplay: paidTotalDisplay,
      summaryLine,
      deliveryCity: clean(body.city),
      deliveryStreet: clean(body.street),
      deliveryHouse: clean(body.house),
      deliveryApartment: clean(body.apartment),
    }).catch((e) => console.error('[checkout] notifyStaffPaidOrder', e));

    void notifyCustomerOrderPaid({
      cabinetUserId: user.id,
      reference,
      totalDisplay: paidTotalDisplay,
      summaryLine,
      customerName: clean(body.fullName),
      customerPhone: clean(body.phone),
      customerEmail: clean(body.email) || user.email,
    }).catch((e) => console.error('[checkout] notifyCustomerOrderPaid', e));

    let trackingNumber: string | null = null;
    if (isCdekApiConfigured() && quoteRow && orderIdForCdek) {
      const receiverCode = quoteRow.receiver_city_code;
      if (receiverCode) {
        const streetLine = `${clean(body.street)}, д. ${clean(body.house)}${
          clean(body.apartment) ? `, кв. ${clean(body.apartment)}` : ''
        }`;
        const cdekRes = await cdekCreateShipmentOrder({
          number: referenceForCdek,
          tariffCode: cdekTariff,
          comment: clean(body.comment) || `Заказ ${referenceForCdek}`,
          recipientName: clean(body.fullName),
          recipientPhone: clean(body.phone),
          recipientEmail: clean(body.email),
          toLocation: {
            code: receiverCode,
            postalCode: clean(body.postalCode) || undefined,
            address: streetLine,
          },
          deliveryPoint: quoteRow.mode === 'pvz' && quoteRow.pvz_code ? quoteRow.pvz_code : null,
          items: cdekItems,
        });
        if (cdekRes.ok) {
          // Сразу сохраняем uuid заказа СДЭК, трек-номер может ещё не прийти
          await pool.query(
            `UPDATE cabinet_orders SET cdek_order_uuid = $2 WHERE id = $1`,
            [orderIdForCdek, cdekRes.uuid]
          );
          // Ждём до 24 сек, пока СДЭК присвоит трек-номер (обычно 3-15 сек)
          const polled = cdekRes.cdekNumber || await cdekPollTrackingNumber(cdekRes.uuid, { attempts: 8, intervalMs: 3000 });
          trackingNumber = polled || null;
          if (trackingNumber) {
            await pool.query(
              `UPDATE cabinet_orders SET tracking_number = $2 WHERE id = $1`,
              [orderIdForCdek, trackingNumber]
            );
          }
          console.log(`[cdek] order ${cdekRes.uuid} → tracking=${trackingNumber ?? 'pending'}`);
        } else {
          await pool.query(`UPDATE cabinet_orders SET cdek_error = $2 WHERE id = $1`, [
            orderIdForCdek,
            cdekRes.message.slice(0, 500),
          ]);
          console.error(`[cdek] create order failed: ${cdekRes.message}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      orderId: orderIdForCdek,
      reference: referenceForCdek,
      trackingNumber: trackingNumber || undefined,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('cabinet/orders/checkout', e);
    return NextResponse.json({ error: 'Ошибка оформления заказа' }, { status: 500 });
  } finally {
    client.release();
  }
}
