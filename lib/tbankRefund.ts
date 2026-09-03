import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import {
  tbankCancelPayment,
  type TbankReceipt,
  type TbankReceiptItem,
  type TbankTaxation,
  type TbankVat,
} from '@/lib/tbankAcquiring';

function isValidTaxation(s: string | undefined): s is TbankTaxation {
  return (
    s === 'osn' ||
    s === 'usn_income' ||
    s === 'usn_income_outcome' ||
    s === 'envd' ||
    s === 'esn' ||
    s === 'patent'
  );
}

function isValidVat(s: string | undefined): s is TbankVat {
  return (
    s === 'none' ||
    s === 'vat0' ||
    s === 'vat10' ||
    s === 'vat20' ||
    s === 'vat110' ||
    s === 'vat120' ||
    s === 'vat105' ||
    s === 'vat107'
  );
}

type OrderItemRow = {
  lot_name: string | null;
  unit_price_rub: string | number | null;
  quantity: number | string | null;
};

type OrderForRefund = {
  id: number;
  customer_email: string | null;
  delivery_rub: string | number | null;
  payment_confirmation_id: number | null;
};

/**
 * Возврат платежа через T-Bank Cancel API с формированием чека возврата.
 * Безопасно вызывать асинхронно: ошибки логируются, исключений не бросаем.
 *
 * @param orderId ID заказа в БД (cabinet_orders.id)
 * @returns true если возврат успешно инициирован, иначе false
 */
export async function refundOrderViaTbank(orderId: number): Promise<boolean> {
  const terminalKey = process.env.TBANK_TERMINAL_KEY?.trim();
  const password = process.env.TBANK_PASSWORD?.trim();
  if (!terminalKey || !password) {
    console.log(`[tbank-refund] order=${orderId}: TBANK_* not configured — skipping refund`);
    return false;
  }

  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    const orderRes = await client.query(
      `SELECT id, customer_email, delivery_rub, payment_confirmation_id
       FROM cabinet_orders WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      console.log(`[tbank-refund] order=${orderId}: not found`);
      return false;
    }
    const order = orderRes.rows[0] as OrderForRefund;
    if (!order.payment_confirmation_id) {
      console.log(`[tbank-refund] order=${orderId}: no payment_confirmation_id — skipping`);
      return false;
    }

    const pcRes = await client.query(
      `SELECT id, status, amount_rub, provider_payment_id, meta
       FROM cabinet_payment_confirmations WHERE id = $1 LIMIT 1`,
      [order.payment_confirmation_id]
    );
    if (pcRes.rows.length === 0) {
      console.log(`[tbank-refund] order=${orderId}: payment confirmation not found`);
      return false;
    }
    const pc = pcRes.rows[0] as {
      id: number;
      status: string;
      amount_rub: string | number;
      provider_payment_id: string;
      meta: { tbankPaymentId?: string; tbankRefundedAt?: string } | null;
    };
    if (pc.meta?.tbankRefundedAt) {
      console.log(`[tbank-refund] order=${orderId}: already refunded at ${pc.meta.tbankRefundedAt}`);
      return true;
    }
    const tbankPaymentId = pc.meta?.tbankPaymentId || pc.provider_payment_id;
    if (!tbankPaymentId || tbankPaymentId.startsWith('PAY-') || tbankPaymentId.startsWith('PENDING-')) {
      console.log(`[tbank-refund] order=${orderId}: no real T‑Bank PaymentId (DEMO mode?) — skipping`);
      return false;
    }

    const itemsRes = await client.query(
      `SELECT lot_name, unit_price_rub, quantity
       FROM cabinet_order_items WHERE order_id = $1 ORDER BY id`,
      [orderId]
    );
    const orderItems = itemsRes.rows as OrderItemRow[];

    const amountRub = Number(pc.amount_rub);
    const amountKopecks = Math.floor(amountRub * 100);
    const deliveryRub = Number(order.delivery_rub) || 0;
    const deliveryKopecks = Math.max(0, Math.floor(deliveryRub * 100));

    const taxRaw = process.env.TBANK_TAXATION?.trim().toLowerCase();
    const vatRaw = process.env.TBANK_VAT?.trim().toLowerCase();
    const Taxation: TbankTaxation = isValidTaxation(taxRaw) ? taxRaw : 'usn_income';
    const Tax: TbankVat = isValidVat(vatRaw) ? vatRaw : 'none';

    type Expanded = { name: string; basePriceKopecks: number };
    const expanded: Expanded[] = [];
    for (const it of orderItems) {
      const unit = Math.max(0, Math.floor(Number(it.unit_price_rub ?? 0) * 100));
      const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
      for (let i = 0; i < qty; i++) {
        expanded.push({
          name: (it.lot_name || 'Лот City Legend').slice(0, 128),
          basePriceKopecks: unit,
        });
      }
    }
    if (expanded.length === 0) {
      console.log(`[tbank-refund] order=${orderId}: no items for receipt`);
      return false;
    }
    const itemsTotal = amountKopecks - deliveryKopecks;
    const baseSum = expanded.reduce((s, e) => s + e.basePriceKopecks, 0);

    const items: TbankReceiptItem[] = [];
    let running = 0;
    if (baseSum === 0 || itemsTotal <= 0) {
      // Если по каким-то причинам не получилось — отдадим всё одной строкой "Заказ".
      items.push({
        Name: `Заказ City Legend №${orderId}`.slice(0, 128),
        Price: Math.max(0, itemsTotal),
        Quantity: 1,
        Amount: Math.max(0, itemsTotal),
        Tax,
        PaymentMethod: 'full_payment',
        PaymentObject: 'commodity',
      });
    } else {
      for (let i = 0; i < expanded.length; i++) {
        const isLast = i === expanded.length - 1;
        const scaled = isLast
          ? itemsTotal - running
          : Math.floor((expanded[i].basePriceKopecks * itemsTotal) / baseSum);
        running += scaled;
        items.push({
          Name: expanded[i].name,
          Price: scaled,
          Quantity: 1,
          Amount: scaled,
          Tax,
          PaymentMethod: 'full_payment',
          PaymentObject: 'commodity',
        });
      }
    }
    if (deliveryKopecks > 0) {
      items.push({
        Name: 'Доставка СДЭК по России',
        Price: deliveryKopecks,
        Quantity: 1,
        Amount: deliveryKopecks,
        Tax,
        PaymentMethod: 'full_payment',
        PaymentObject: 'service',
      });
    }

    const receipt: TbankReceipt = { Taxation, Items: items };
    if (order.customer_email && /.+@.+\..+/.test(order.customer_email)) {
      receipt.Email = order.customer_email;
    }

    const result = await tbankCancelPayment({
      terminalKey,
      password,
      paymentId: tbankPaymentId,
      receipt,
    });

    await client.query(
      `UPDATE cabinet_payment_confirmations
       SET meta = meta || $2::jsonb
       WHERE id = $1`,
      [
        pc.id,
        JSON.stringify({
          tbankRefundedAt: new Date().toISOString(),
          tbankRefundOk: result.ok,
          tbankRefundStatus: result.ok ? result.status : null,
          tbankRefundErrorCode: !result.ok ? result.errorCode ?? null : null,
          tbankRefundMessage: !result.ok ? result.message ?? null : null,
        }),
      ]
    );

    if (result.ok) {
      console.log(
        `[tbank-refund] order=${orderId}: OK status=${result.status} pid=${tbankPaymentId}`
      );
      return true;
    }
    console.error(
      `[tbank-refund] order=${orderId}: FAIL ${result.errorCode ?? ''} ${result.message}`
    );
    return false;
  } catch (e) {
    console.error(`[tbank-refund] order=${orderId}: exception`, e);
    return false;
  } finally {
    client?.release();
  }
}
