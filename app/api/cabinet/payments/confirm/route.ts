import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import pool, { ensureDatabase, ensureDeliveryQuotesSchema } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import {
  tbankInitPayment,
  type TbankReceipt,
  type TbankReceiptItem,
  type TbankTaxation,
  type TbankVat,
} from '@/lib/tbankAcquiring';
import { isCdekDeliveryEnabled } from '@/lib/cdekConfig';
import { resolveCheckoutCart, type ResolvedCheckout } from '@/lib/cabinetCheckoutResolve';
import { lockAndValidateDeliveryQuote } from '@/lib/deliveryQuoteValidate';

export const dynamic = 'force-dynamic';

type ConfirmBody = {
  method?: 'secure_link' | 'card' | 'sbp';
  amountRub?: number;
  currency?: string;
  deliveryQuoteId?: number;
  couponCode?: string;
  expressAuctionId?: number;
  expressQuantity?: number;
  expressVariantId?: string;
};

function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

type ResolvedSummary = {
  resolved: ResolvedCheckout;
  deliveryRub: number;
};

async function validateCdekAndResolve(
  userId: number,
  amountRub: number,
  body: ConfirmBody
): Promise<{ ok: true; summary: ResolvedSummary } | { ok: false; error: string }> {
  const cdekOn = isCdekDeliveryEnabled();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resolved = await resolveCheckoutCart(client, userId, {
      couponCode: body.couponCode,
      expressAuctionId: body.expressAuctionId,
      expressQuantity: body.expressQuantity,
      expressVariantId: body.expressVariantId,
    });
    if (!resolved.ok) {
      await client.query('ROLLBACK');
      return { ok: false, error: resolved.error };
    }
    let deliveryRub = 0;
    if (cdekOn) {
      const qid = Number(body.deliveryQuoteId || 0);
      if (!Number.isFinite(qid) || qid <= 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'Рассчитайте доставку СДЭК перед оплатой.' };
      }
      const v = await lockAndValidateDeliveryQuote(client, userId, qid, resolved.data);
      if (!v.ok) {
        await client.query('ROLLBACK');
        return { ok: false, error: v.error };
      }
      deliveryRub = Number(v.quote.delivery_rub);
      if (!Number.isFinite(deliveryRub) || deliveryRub <= 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'Некорректный расчёт доставки. Пересчитайте доставку СДЭК.' };
      }
    }
    await client.query('ROLLBACK');

    const expected = resolved.data.finalRub + deliveryRub;
    if (amountRub !== expected) {
      return {
        ok: false,
        error: 'Сумма к оплате не совпадает с расчётом. Обновите страницу и пересчитайте доставку.',
      };
    }
    return { ok: true, summary: { resolved: resolved.data, deliveryRub } };
  } finally {
    client.release();
  }
}

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

function buildReceipt(
  email: string | undefined,
  resolved: ResolvedCheckout,
  amountKopecks: number,
  deliveryRub: number
): TbankReceipt | null {
  const taxRaw = process.env.TBANK_TAXATION?.trim().toLowerCase();
  const vatRaw = process.env.TBANK_VAT?.trim().toLowerCase();
  const Taxation: TbankTaxation = isValidTaxation(taxRaw) ? taxRaw : 'usn_income';
  const Tax: TbankVat = isValidVat(vatRaw) ? vatRaw : 'none';

  const deliveryKopecks = Math.max(0, Math.floor(deliveryRub * 100));
  const itemsTotal = amountKopecks - deliveryKopecks;
  if (itemsTotal < 0) return null;

  // Разворачиваем каждую позицию по штучно (Quantity=1 для каждого пункта чека —
  // так Price × Quantity = Amount всегда совпадает в копейках без округлений).
  type Expanded = { name: string; basePriceKopecks: number };
  const expanded: Expanded[] = [];
  for (const row of resolved.finalCheckoutRows) {
    const unit = Math.max(0, Math.floor(((row.unitPriceRub ?? 0) as number) * 100));
    const qty = Math.max(1, Math.floor(row.quantity || 1));
    for (let i = 0; i < qty; i++) {
      expanded.push({ name: row.lotName || 'Лот City Legend', basePriceKopecks: unit });
    }
  }
  if (expanded.length === 0) return null;

  const baseSum = expanded.reduce((s, e) => s + e.basePriceKopecks, 0);
  const items: TbankReceiptItem[] = [];
  let running = 0;

  if (baseSum === 0) {
    // Распределяем сумму поровну, если базовых цен нет (на всякий случай).
    const per = Math.floor(itemsTotal / expanded.length);
    for (let i = 0; i < expanded.length; i++) {
      const isLast = i === expanded.length - 1;
      const v = isLast ? itemsTotal - running : per;
      running += v;
      items.push({
        Name: expanded[i].name.slice(0, 128),
        Price: v,
        Quantity: 1,
        Amount: v,
        Tax,
        PaymentMethod: 'full_payment',
        PaymentObject: 'commodity',
      });
    }
  } else {
    // Пропорционально масштабируем базовые цены, чтобы сумма позиций ровно
    // совпала с (amount − delivery). Остаток после Math.floor накидываем в последнюю позицию.
    for (let i = 0; i < expanded.length; i++) {
      const isLast = i === expanded.length - 1;
      const scaled = isLast
        ? itemsTotal - running
        : Math.floor((expanded[i].basePriceKopecks * itemsTotal) / baseSum);
      running += scaled;
      items.push({
        Name: expanded[i].name.slice(0, 128),
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
  if (email && /.+@.+\..+/.test(email)) receipt.Email = email;
  // Если e‑mail невалидный — Email не передаём (Phone у нас не собирается на этом шаге).
  return receipt;
}

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const method = body.method === 'card' || body.method === 'sbp' ? body.method : 'secure_link';
  const amountRub = Math.floor(Number(body.amountRub || 0));
  const currency = (body.currency || 'RUB').toUpperCase();

  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return NextResponse.json({ error: 'Некорректная сумма платежа' }, { status: 400 });
  }
  if (currency !== 'RUB') {
    return NextResponse.json({ error: 'Поддерживается только RUB' }, { status: 400 });
  }

  await ensureDatabase();
  await ensureDeliveryQuotesSchema();

  const validation = await validateCdekAndResolve(user.id, amountRub, body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const summary = validation.summary;

  const terminalKey = process.env.TBANK_TERMINAL_KEY?.trim();
  const password = process.env.TBANK_PASSWORD?.trim();

  const metaPayload = {
    deliveryQuoteId: body.deliveryQuoteId ?? null,
  };

  /** Режим разработки без ключей — прежнее поведение (мгновенное «подтверждение»). */
  if (!terminalKey || !password) {
    const providerPaymentId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const res = await pool.query(
      `INSERT INTO cabinet_payment_confirmations
        (user_id, method, amount_rub, currency, provider_payment_id, status, confirmed_at, expires_at, meta)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '20 minutes', $6::jsonb)
       RETURNING id, provider_payment_id`,
      [user.id, method, amountRub, currency, providerPaymentId, JSON.stringify(metaPayload)]
    );
    const row = res.rows[0] as { id: number; provider_payment_id: string };
    return NextResponse.json({
      ok: true,
      flow: 'instant' as const,
      paymentConfirmationId: row.id,
      paymentReference: row.provider_payment_id,
    });
  }

  const placeholderId = `PENDING-${randomUUID()}`;
  const insert = await pool.query(
    `INSERT INTO cabinet_payment_confirmations
      (user_id, method, amount_rub, currency, provider_payment_id, status, confirmed_at, expires_at, meta)
     VALUES ($1, $2, $3, $4, $5, 'pending', NULL, CURRENT_TIMESTAMP + INTERVAL '45 minutes', $6::jsonb)
     RETURNING id`,
    [user.id, method, amountRub, currency, placeholderId, JSON.stringify(metaPayload)]
  );
  const confirmationId = (insert.rows[0] as { id: number }).id;
  // OrderId в T‑Bank должен быть уникален на терминал при каждом Init; CL-{id} почти всегда уникален,
  // но суффикс снимает риск «дубля» при повторных попытках/требованиях банка (ошибка «дублирование OrderId»).
  const orderId = `CL-${confirmationId}-${randomBytes(4).toString('hex')}`;
  const base = siteBaseUrl();
  const notificationUrl = `${base}/api/payments/tbank/notification`;
  const successUrl = `${base}/payment?payment=ok&pcid=${confirmationId}`;
  const failUrl = `${base}/payment?payment=fail&pcid=${confirmationId}`;

  const amountKopecks = amountRub * 100;
  const receipt = buildReceipt(user.email, summary.resolved, amountKopecks, summary.deliveryRub);

  const init = await tbankInitPayment({
    terminalKey,
    password,
    amountKopecks,
    orderId,
    description: `City Legend — заказ №${orderId}`,
    successUrl,
    failUrl,
    notificationUrl,
    receipt: receipt ?? undefined,
  });

  if (!init.ok) {
    await pool.query(`DELETE FROM cabinet_payment_confirmations WHERE id = $1 AND user_id = $2`, [
      confirmationId,
      user.id,
    ]);
    let message = init.message || 'Не удалось создать платёж';
    if (init.errorCode === '204' || /неверный токен/i.test(message)) {
      message += ' Проверьте в Т‑Бизнес пару терминала для интернет-эквайринга (не пароль с экрана настройки виджета).';
    }
    return NextResponse.json(
      { error: message, code: init.errorCode },
      { status: 422 }
    );
  }

  await pool.query(
    `UPDATE cabinet_payment_confirmations
     SET provider_payment_id = $1,
         meta = $2::jsonb
     WHERE id = $3 AND user_id = $4`,
    [
      init.paymentId,
      JSON.stringify({
        tbankPaymentId: init.paymentId,
        orderId: init.orderId,
        ...metaPayload,
      }),
      confirmationId,
      user.id,
    ]
  );

  return NextResponse.json({
    ok: true,
    flow: 'redirect' as const,
    paymentConfirmationId: confirmationId,
    paymentUrl: init.paymentUrl,
  });
}
