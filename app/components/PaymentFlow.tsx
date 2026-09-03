'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatRub, summarizeCartTotals } from '@/lib/cartPricing';
import type { CdekCitySuggestion, CdekPvzPoint } from '@/lib/cdekClient';
import { loyaltyDiscountRubFromSubtotal } from '@/lib/volumeLoyalty';
import {
  readCheckoutCustomerDraft,
  writeCheckoutCustomerDraft,
  type CheckoutCustomerDraft,
} from '@/lib/checkoutCustomerDraft';

// Панель СДЭК тянет за собой Leaflet (~150KB) — лениво грузим только когда форма видна.
const CdekDeliveryPanel = dynamic(
  () => import('@/app/components/CdekDeliveryPanel').then((m) => m.CdekDeliveryPanel),
  {
    ssr: false,
    loading: () => (
      <div
        className="mt-6 pt-6 border-t border-gray-200 text-[11px] text-gray-400"
        style={{ fontFamily: 'var(--font-open-sans)' }}
      >
        Загружаем модуль доставки СДЭК…
      </div>
    ),
  }
);

type CartRow = {
  auctionId: number;
  variantId?: string;
  quantity: number;
  lotName: string;
  price: string;
  image: string | null;
};
type SavedAddress = {
  id: number;
  label: string;
  fullName: string;
  phone: string;
  email: string;
  city: string;
  street: string;
  house: string;
  comment: string;
  isDefault: boolean;
};

function qtyTpl(price: string, qty: number) {
  return `${price} · ${qty} шт.`;
}

type UrlExpress = { auctionId: number; qty: number; variantId: string } | null;

export type PaymentReturnState = { ok: boolean; pcid: number } | null;

const CL_PAYMENT_SUCCESS_KEY = 'cl_payment_success';
const CL_PAYMENT_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;

function persistCheckoutSuccess(payload: {
  refCode: string;
  paymentReference: string;
  trackingNumber: string;
}) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CL_PAYMENT_SUCCESS_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

function readCheckoutSuccess():
  | { refCode: string; paymentReference: string; trackingNumber: string }
  | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CL_PAYMENT_SUCCESS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as {
      refCode?: string;
      paymentReference?: string;
      trackingNumber?: string;
      ts?: number;
    };
    if (!s.ts || Date.now() - s.ts > CL_PAYMENT_SUCCESS_TTL_MS || !s.refCode) {
      sessionStorage.removeItem(CL_PAYMENT_SUCCESS_KEY);
      return null;
    }
    return {
      refCode: s.refCode,
      paymentReference: s.paymentReference || '',
      trackingNumber: s.trackingNumber || '',
    };
  } catch {
    sessionStorage.removeItem(CL_PAYMENT_SUCCESS_KEY);
    return null;
  }
}

function PaymentFlowInner({
  embedded,
  urlExpress,
  paymentReturn,
}: {
  embedded?: boolean;
  urlExpress: UrlExpress;
  paymentReturn?: PaymentReturnState;
}) {
  const router = useRouter();
  const bankReturnHandled = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauth, setUnauth] = useState(false);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [removingLineKey, setRemovingLineKey] = useState<string | null>(null);
  const [method, setMethod] = useState<'secure_link' | 'concierge'>('secure_link');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    title: string;
    discountPercent: number;
    minTotalRub: number;
    expiresAt: string | null;
  } | null>(null);
  const [volumeLoyaltyPercent, setVolumeLoyaltyPercent] = useState(0);
  const [customer, setCustomer] = useState({
    fullName: '',
    phone: '',
    email: '',
    city: '',
    street: '',
    house: '',
    comment: '',
  });

  const [cdekEnabled, setCdekEnabled] = useState(false);
  const [cdekApiAvailable, setCdekApiAvailable] = useState(false);
  const [flatDeliveryRub, setFlatDeliveryRub] = useState(0);
  const [cdekCityQuery, setCdekCityQuery] = useState('');
  const [cdekCityResults, setCdekCityResults] = useState<CdekCitySuggestion[]>([]);
  const [cdekCityLoading, setCdekCityLoading] = useState(false);
  const [selectedCdekCity, setSelectedCdekCity] = useState<CdekCitySuggestion | null>(null);
  const [pvzPoints, setPvzPoints] = useState<CdekPvzPoint[]>([]);
  const [cdekPvzLoading, setCdekPvzLoading] = useState(false);
  const [pvzCode, setPvzCode] = useState('');
  const [deliveryQuoteId, setDeliveryQuoteId] = useState<number | null>(null);
  const [deliveryRub, setDeliveryRub] = useState(0);
  const [deliveryPeriodMin, setDeliveryPeriodMin] = useState<number | null>(null);
  const [deliveryPeriodMax, setDeliveryPeriodMax] = useState<number | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [cabinetUserId, setCabinetUserId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cabinet/dashboard', { credentials: 'include' });
      if (res.status === 401) {
        setUnauth(true);
        setCart([]);
        return;
      }
      const j = await res.json();
      setUnauth(false);
      const cartArr = Array.isArray(j.cart) ? j.cart : [];
      setCart(cartArr);
      if (cartArr.length > 0) {
        // Если в корзине есть товары, всегда показываем обычный flow оплаты.
        // Это убирает "залипание" экрана успешной оплаты при повторном заходе на /payment.
        setDone(false);
        setRefCode('');
        setPaymentReference('');
        setTrackingNumber('');
        sessionStorage.removeItem(CL_PAYMENT_SUCCESS_KEY);
      } else {
        const snap = readCheckoutSuccess();
        if (snap) {
          setRefCode(snap.refCode);
          setPaymentReference(snap.paymentReference);
          setTrackingNumber(snap.trackingNumber);
          setDone(true);
        }
      }
      const vol = j.volumeLoyalty as { activePercent?: number } | undefined;
      setVolumeLoyaltyPercent(Number(vol?.activePercent) > 0 ? Math.floor(Number(vol?.activePercent)) : 0);
      const userId = typeof j.user?.id === 'number' ? j.user.id : null;
      setCabinetUserId(userId);
      const addresses = Array.isArray(j.savedAddresses) ? (j.savedAddresses as SavedAddress[]) : [];
      const preferred = addresses.find((a) => a.isDefault) || addresses[0] || null;
      const lastOrder = Array.isArray(j.orders) && j.orders.length > 0 ? j.orders[0] : null;
      const draft = userId ? readCheckoutCustomerDraft(userId) : null;

      const baseCustomer: CheckoutCustomerDraft = {
        fullName: '',
        phone: '',
        email: typeof j.user?.email === 'string' ? j.user.email : '',
        city: '',
        street: '',
        house: '',
        comment: '',
      };

      if (preferred) {
        baseCustomer.fullName = preferred.fullName || '';
        baseCustomer.phone = preferred.phone || '';
        baseCustomer.email = preferred.email || baseCustomer.email;
        baseCustomer.city = preferred.city || '';
        baseCustomer.street = preferred.street || '';
        baseCustomer.house = preferred.house || '';
        baseCustomer.comment = preferred.comment || '';
      } else if (lastOrder && typeof lastOrder === 'object') {
        const o = lastOrder as {
          customer_name?: string;
          customer_phone?: string;
          customer_email?: string;
          delivery_city?: string;
          delivery_street?: string;
          delivery_house?: string;
          customer_comment?: string;
        };
        baseCustomer.fullName = o.customer_name || (typeof j.user?.name === 'string' ? j.user.name : '');
        baseCustomer.phone = o.customer_phone || '';
        baseCustomer.email = o.customer_email || baseCustomer.email;
        baseCustomer.city = o.delivery_city || '';
        baseCustomer.street = o.delivery_street || '';
        baseCustomer.house = o.delivery_house || '';
        baseCustomer.comment = o.customer_comment || '';
      } else if (j.user) {
        baseCustomer.fullName = typeof j.user.name === 'string' ? j.user.name : '';
      }

      if (draft) {
        setCustomer({
          fullName: draft.fullName || baseCustomer.fullName,
          phone: draft.phone || baseCustomer.phone,
          email: draft.email || baseCustomer.email,
          city: draft.city || baseCustomer.city,
          street: draft.street || baseCustomer.street,
          house: draft.house || baseCustomer.house,
          comment: draft.comment || baseCustomer.comment,
        });
      } else {
        setCustomer(baseCustomer);
      }
      try {
        const st = await fetch('/api/cabinet/delivery/status', { credentials: 'include' });
        const sj = (await st.json().catch(() => ({}))) as {
          cdekEnabled?: boolean;
          cdekApiAvailable?: boolean;
          flatDeliveryRub?: number;
        };
        setCdekEnabled(!!sj.cdekEnabled);
        setCdekApiAvailable(!!sj.cdekApiAvailable);
        setFlatDeliveryRub(
          Number.isFinite(sj.flatDeliveryRub) && Number(sj.flatDeliveryRub) >= 0
            ? Math.floor(Number(sj.flatDeliveryRub))
            : 0
        );
      } catch {
        setCdekEnabled(false);
        setCdekApiAvailable(false);
        setFlatDeliveryRub(0);
      }
    } catch {
      setUnauth(true);
      setCart([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (unauth || !cabinetUserId) return;
    const t = window.setTimeout(() => {
      writeCheckoutCustomerDraft(cabinetUserId, customer);
    }, 400);
    return () => window.clearTimeout(t);
  }, [customer, cabinetUserId, unauth]);

  useEffect(() => {
    const forceFresh = () => {
      setDone(false);
      setRefCode('');
      setPaymentReference('');
      setTrackingNumber('');
      setSubmitError('');
      void load();
    };
    window.addEventListener('paymentFlowForceFresh', forceFresh as EventListener);
    return () => {
      window.removeEventListener('paymentFlowForceFresh', forceFresh as EventListener);
    };
  }, [load]);

  useEffect(() => {
    if (!cdekEnabled || !cdekApiAvailable) {
      setCdekCityResults([]);
      return;
    }
    const q = cdekCityQuery.trim();
    if (q.length < 1) {
      setCdekCityResults([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      (async () => {
        setCdekCityLoading(true);
        try {
          const res = await fetch(
            `/api/cabinet/delivery/cities?q=${encodeURIComponent(q)}&country=RU`,
            { credentials: 'include' }
          );
          const j = (await res.json().catch(() => ({}))) as { cities?: CdekCitySuggestion[] };
          if (!cancelled) setCdekCityResults(Array.isArray(j.cities) ? j.cities : []);
        } catch {
          if (!cancelled) setCdekCityResults([]);
        } finally {
          if (!cancelled) setCdekCityLoading(false);
        }
      })();
    }, 380);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cdekEnabled, cdekApiAvailable, cdekCityQuery]);

  useEffect(() => {
    if (!cdekEnabled || !cdekApiAvailable || !selectedCdekCity) {
      setPvzPoints([]);
      return;
    }
    let cancelled = false;
    setCdekPvzLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/cabinet/delivery/pvz?cityCode=${selectedCdekCity.code}`, {
          credentials: 'include',
        });
        const j = (await res.json().catch(() => ({}))) as {
          points?: CdekPvzPoint[];
        };
        if (!cancelled && Array.isArray(j.points)) setPvzPoints(j.points);
        else if (!cancelled) setPvzPoints([]);
      } catch {
        if (!cancelled) setPvzPoints([]);
      } finally {
        if (!cancelled) setCdekPvzLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cdekEnabled, cdekApiAvailable, selectedCdekCity]);

  useEffect(() => {
    if (paymentReturn?.ok && !done) {
      setSubmitting(true);
    }
  }, [paymentReturn, done]);

  // Возврат с FailURL банка: на практике редирект «fail» бывает и при удачной оплате
  // (задержка вебхука, сценарий демо). Сначала опрашиваем /api/cabinet/payments/status (GetState),
  // и только при реальном non-confirmed показываем отмену.
  const FAIL_STATUS_POLLS = 45;
  const FAIL_POLL_MS = 2000;
  useEffect(() => {
    if (!paymentReturn || paymentReturn.ok) return;
    const key = `fail-${paymentReturn.pcid}`;
    if (bankReturnHandled.current === key) return;
    const pcid = paymentReturn.pcid;
    let cancelled = false;
    let lastStatus: string | undefined;
    (async () => {
      setSubmitting(true);
      setSubmitError('');
      for (let i = 0; i < FAIL_STATUS_POLLS && !cancelled; i++) {
        const st = await fetch(
          `/api/cabinet/payments/status?paymentConfirmationId=${pcid}`,
          { credentials: 'include' }
        );
        if (st.status === 401) {
          bankReturnHandled.current = key;
          setSubmitting(false);
          setSubmitError(
            'Сессия входа в личный кабинет завершилась. Войдите снова и оформите заказ. Если деньги были списаны — заказ всё равно появится в кабинете автоматически после подтверждения от банка.'
          );
          return;
        }
        const sj = (await st.json().catch(() => ({}))) as { status?: string };
        lastStatus = sj.status;
        if (cancelled) return;
        if (sj.status === 'confirmed') {
          bankReturnHandled.current = key;
          setSubmitting(false);
          router.replace(`/payment?payment=ok&pcid=${pcid}`, { scroll: false });
          return;
        }
        await new Promise((r) => setTimeout(r, FAIL_POLL_MS));
      }
      if (cancelled) return;
      bankReturnHandled.current = key;
      sessionStorage.removeItem('cl_pending_checkout');
      setSubmitting(false);
      if (lastStatus === 'pending') {
        setSubmitError(
          'Платёж пока обрабатывается банком. Если деньги были списаны — заказ автоматически появится в разделе «Мои заказы» в течение нескольких минут. Если списания не было — оформите заказ заново.'
        );
      } else if (lastStatus === 'rejected') {
        setSubmitError(
          'Банк не принял платёж. Деньги не были списаны. Попробуйте оплатить другой картой или повторите попытку.'
        );
      } else {
        setSubmitError('Оплата не была завершена. Деньги не списаны. Вы можете оформить заказ снова.');
      }
      router.replace('/payment', { scroll: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentReturn, router]);

  useEffect(() => {
    if (!paymentReturn?.ok || paymentReturn.pcid <= 0) return;
    const lockKey = `cl_bank_ok_${paymentReturn.pcid}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(lockKey)) return;

    let cancelled = false;
    (async () => {
      const raw = sessionStorage.getItem('cl_pending_checkout');
      if (!raw) {
        setSubmitError('Сессия оплаты не найдена. Оформите заказ ещё раз.');
        router.replace('/payment', { scroll: false });
        return;
      }
      type PendingCheckout = {
        paymentConfirmationId: number;
        customer: Record<string, string>;
        couponCode: string;
        express?: { auctionId: number; qty: number; variantId: string };
      };
      let pending: PendingCheckout;
      try {
        pending = JSON.parse(raw) as PendingCheckout;
      } catch {
        setSubmitError('Не удалось восстановить данные заказа.');
        router.replace('/payment', { scroll: false });
        return;
      }
      if (pending.paymentConfirmationId !== paymentReturn.pcid) {
        setSubmitError('Несовпадение данных платежа.');
        router.replace('/payment', { scroll: false });
        return;
      }

      sessionStorage.setItem(lockKey, '1');
      setSubmitError('');
      setSubmitting(true);

      for (let i = 0; i < 90 && !cancelled; i++) {
        const st = await fetch(
          `/api/cabinet/payments/status?paymentConfirmationId=${pending.paymentConfirmationId}`,
          { credentials: 'include' }
        );
        const sj = (await st.json().catch(() => ({}))) as { status?: string };
        if (sj.status === 'confirmed') break;
        await new Promise((r) => setTimeout(r, 2000));
      }

      const stFinal = await fetch(
        `/api/cabinet/payments/status?paymentConfirmationId=${pending.paymentConfirmationId}`,
        { credentials: 'include' }
      );
      const sjFinal = (await stFinal.json().catch(() => ({}))) as { status?: string };
      if (cancelled) return;

      if (sjFinal.status !== 'confirmed') {
        setSubmitError(
          'Банк ещё не подтвердил оплату. Проверьте раздел «Мои заказы» позже или напишите в поддержку.'
        );
        setSubmitting(false);
        router.replace('/payment', { scroll: false });
        return;
      }

      const checkoutBody: Record<string, unknown> = {
        ...pending.customer,
        couponCode: pending.couponCode || '',
        paymentConfirmationId: pending.paymentConfirmationId,
      };
      if (pending.express) {
        checkoutBody.expressAuctionId = pending.express.auctionId;
        checkoutBody.expressQuantity = pending.express.qty;
        checkoutBody.expressVariantId = pending.express.variantId;
      }

      const res = await fetch('/api/cabinet/orders/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutBody),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        reference?: string;
        trackingNumber?: string;
      };
      if (cancelled) return;
      if (!res.ok) {
        setSubmitError(j.error || 'Не удалось оформить заказ');
        setSubmitting(false);
        return;
      }

      sessionStorage.removeItem('cl_pending_checkout');
      setRefCode((j.reference || '').toUpperCase());
      setPaymentReference(String(pending.paymentConfirmationId));
      setTrackingNumber((j.trackingNumber || '').toUpperCase());
      persistCheckoutSuccess({
        refCode: (j.reference || '').toUpperCase(),
        paymentReference: String(pending.paymentConfirmationId),
        trackingNumber: (j.trackingNumber || '').toUpperCase(),
      });
      setDone(true);
      setCart([]);
      setSubmitting(false);
      router.replace('/payment', { scroll: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentReturn, router]);

  const isExpress = Boolean(!embedded && urlExpress);
  const expressAuctionId = urlExpress?.auctionId ?? null;
  const expressQty = urlExpress?.qty ?? null;
  const expressVariantId = urlExpress?.variantId ?? '';

  const cartLineKey = (r: CartRow) => `${r.auctionId}:${r.variantId ?? ''}`;

  const displayCart = useMemo(() => {
    if (!isExpress || expressAuctionId == null || expressQty == null) return cart;
    const line = cart.find(
      (r) => r.auctionId === expressAuctionId && (r.variantId ?? '') === expressVariantId
    );
    if (!line) return [];
    return [{ ...line, quantity: Math.min(line.quantity, expressQty) }];
  }, [cart, isExpress, expressAuctionId, expressQty, expressVariantId]);

  useEffect(() => {
    if (!isExpress || expressAuctionId == null) {
      window.dispatchEvent(new CustomEvent('paymentExpressCloseMode', { detail: { active: false } }));
      return;
    }
    const returnHref = `/collection/${expressAuctionId}`;
    window.dispatchEvent(
      new CustomEvent('paymentExpressCloseMode', { detail: { active: true, returnHref } })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('paymentExpressCloseMode', { detail: { active: false } }));
    };
  }, [isExpress, expressAuctionId]);

  const totals = summarizeCartTotals(displayCart);
  const loyaltyRub =
    volumeLoyaltyPercent > 0 && totals.sumRub > 0
      ? loyaltyDiscountRubFromSubtotal(totals.sumRub, volumeLoyaltyPercent)
      : 0;
  const couponDiscountRub = appliedCoupon
    ? Math.floor((totals.sumRub * appliedCoupon.discountPercent) / 100)
    : 0;
  const goodsPayRub = Math.max(0, totals.sumRub - loyaltyRub - couponDiscountRub);
  const previewDeliveryRub = cdekEnabled && deliveryQuoteId != null ? deliveryRub : 0;
  const payTotalRub = goodsPayRub + previewDeliveryRub;

  useEffect(() => {
    setDeliveryQuoteId(null);
    setDeliveryRub(0);
    setDeliveryPeriodMin(null);
    setDeliveryPeriodMax(null);
    setQuoteError('');
  }, [
    appliedCoupon?.code,
    customer.city,
    customer.street,
    customer.house,
    pvzCode,
    selectedCdekCity?.code,
    volumeLoyaltyPercent,
    totals.sumRub,
    cdekEnabled,
    cdekApiAvailable,
  ]);

  // Адрес валиден, если введены поля (с PVZ — обязательно выбран ПВЗ).
  const addressFieldsOk = cdekEnabled
    ? cdekApiAvailable
      ? selectedCdekCity != null &&
        pvzCode.length > 0 &&
        customer.street.trim().length >= 2 &&
        customer.house.trim().length >= 1
      : customer.city.trim().length >= 2 &&
        customer.street.trim().length >= 2 &&
        customer.house.trim().length >= 1
    : customer.city.trim().length >= 2 &&
      customer.street.trim().length >= 2 &&
      customer.house.trim().length >= 1;

  const customerRequiredValid =
    customer.fullName.trim().length >= 3 &&
    customer.phone.trim().length >= 10 &&
    customer.email.includes('@') &&
    addressFieldsOk;

  // Если доставка СДЭК включена — обязателен успешный расчёт (сумма на сервере должна совпадать).
  const cdekQuoteOk = !cdekEnabled || deliveryQuoteId != null;

  // Авторасчёт доставки: как только все обязательные поля заполнены и нет
  // активного расчёта — запрашиваем котировку. Так делается в реальных магазинах:
  // пользователю не нужно нажимать «Рассчитать», доставка сама подставляется.
  const fetchDeliveryQuote = useCallback(async () => {
    if (!cdekEnabled) return;
    setQuoteLoading(true);
    setQuoteError('');
    try {
      const res = await fetch('/api/cabinet/delivery/quote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: cdekApiAvailable ? 'pvz' : 'door',
          pvzCode: cdekApiAvailable ? pvzCode : undefined,
          receiverCityCode: selectedCdekCity?.code,
          couponCode: appliedCoupon?.code || '',
          city: customer.city,
          street: customer.street,
          house: customer.house,
          expressAuctionId: isExpress && expressAuctionId != null ? expressAuctionId : undefined,
          expressQuantity: isExpress && expressQty != null ? expressQty : undefined,
          expressVariantId: isExpress ? expressVariantId : undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        quoteId?: number;
        deliveryRub?: number;
        periodMin?: number | null;
        periodMax?: number | null;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setQuoteError('Сессия истекла — войдите в кабинет и обновите страницу.');
          setUnauth(true);
        } else {
          setQuoteError(j.error || 'Не удалось рассчитать доставку');
        }
        setDeliveryQuoteId(null);
        setDeliveryRub(0);
        setDeliveryPeriodMin(null);
        setDeliveryPeriodMax(null);
        return;
      }
      setDeliveryQuoteId(typeof j.quoteId === 'number' ? j.quoteId : null);
      setDeliveryRub(Math.max(0, Math.floor(Number(j.deliveryRub || 0))));
      const pMin = j.periodMin;
      const pMax = j.periodMax;
      setDeliveryPeriodMin(typeof pMin === 'number' && Number.isFinite(pMin) ? pMin : null);
      setDeliveryPeriodMax(typeof pMax === 'number' && Number.isFinite(pMax) ? pMax : null);
    } catch {
      setQuoteError('Не удалось рассчитать доставку');
      setDeliveryQuoteId(null);
      setDeliveryRub(0);
      setDeliveryPeriodMin(null);
      setDeliveryPeriodMax(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [
    cdekEnabled,
    cdekApiAvailable,
    pvzCode,
    selectedCdekCity?.code,
    appliedCoupon?.code,
    customer.city,
    customer.street,
    customer.house,
    isExpress,
    expressAuctionId,
    expressQty,
    expressVariantId,
  ]);

  // Auto‑quote: при включённой доставке и валидном адресе запрашиваем расчёт без
  // нажатия кнопки. Срабатывает один раз на каждый набор данных (deliveryQuoteId
  // сбрасывается в зависимостях выше).
  useEffect(() => {
    if (!cdekEnabled) return;
    if (deliveryQuoteId != null) return;
    if (quoteLoading) return;
    if (!addressFieldsOk) return;
    void fetchDeliveryQuote();
  }, [cdekEnabled, deliveryQuoteId, quoteLoading, addressFieldsOk, fetchDeliveryQuote]);

  const removeCartLine = async (auctionId: number, variantId = '') => {
    if (isExpress) return;
    const key = `${auctionId}:${variantId}`;
    setRemovingLineKey(key);
    try {
      const q = new URLSearchParams({ auctionId: String(auctionId) });
      if (variantId) q.set('variantId', variantId);
      const res = await fetch(`/api/cabinet/cart?${q.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) await load();
    } finally {
      setRemovingLineKey(null);
    }
  };

  const handleSecureRequest = async () => {
    if (!agreed || displayCart.length === 0) return;
    if (cdekEnabled && !cdekQuoteOk) {
      setSubmitError(
        quoteError || 'Дождитесь расчёта доставки СДЭК (выберите город и пункт выдачи).'
      );
      return;
    }
    setSubmitError('');
    setSubmitting(true);
    let redirectingToBank = false;
    try {
      const payRes = await fetch('/api/cabinet/payments/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'secure_link',
          amountRub: payTotalRub,
          currency: 'RUB',
          deliveryQuoteId: cdekEnabled ? deliveryQuoteId ?? undefined : undefined,
          couponCode: appliedCoupon?.code || '',
          expressAuctionId: isExpress && expressAuctionId != null ? expressAuctionId : undefined,
          expressQuantity: isExpress && expressQty != null ? expressQty : undefined,
          expressVariantId: isExpress ? expressVariantId : undefined,
        }),
      });
      const payJson = (await payRes.json().catch(() => ({}))) as {
        error?: string;
        flow?: 'redirect' | 'instant';
        paymentConfirmationId?: number;
        paymentUrl?: string;
        paymentReference?: string;
      };
      if (!payRes.ok || !payJson.paymentConfirmationId) {
        const errMsg = payJson.error || 'Не удалось подготовить оплату';
        setSubmitError(errMsg);
        // Если квота истекла или изменилась — сбрасываем, авторасчёт пересчитает
        if (/расчёт|доставк/i.test(errMsg)) {
          setDeliveryQuoteId(null);
          setDeliveryRub(0);
          setQuoteError('');
        }
        setSubmitting(false);
        return;
      }

      if (payJson.flow === 'redirect' && payJson.paymentUrl) {
        const draft = {
          paymentConfirmationId: payJson.paymentConfirmationId,
          customer: { ...customer },
          couponCode: appliedCoupon?.code || '',
          deliveryQuoteId: cdekEnabled ? deliveryQuoteId : undefined,
          express:
            isExpress && expressAuctionId != null && expressQty != null
              ? { auctionId: expressAuctionId, qty: expressQty, variantId: expressVariantId }
              : undefined,
        };
        sessionStorage.setItem('cl_pending_checkout', JSON.stringify(draft));
        redirectingToBank = true;
        window.location.assign(payJson.paymentUrl);
        return;
      }

      const checkoutBody: Record<string, unknown> = {
        ...customer,
        couponCode: appliedCoupon?.code || '',
        paymentConfirmationId: payJson.paymentConfirmationId,
      };
      if (isExpress && expressAuctionId != null && expressQty != null) {
        checkoutBody.expressAuctionId = expressAuctionId;
        checkoutBody.expressQuantity = expressQty;
        checkoutBody.expressVariantId = expressVariantId;
      }

      const res = await fetch('/api/cabinet/orders/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutBody),
      });
      const j = (await res.json()) as {
        error?: string;
        reference?: string;
        trackingNumber?: string;
      };
      if (!res.ok) {
        setSubmitError(j.error || 'Не удалось оформить заказ');
        setSubmitting(false);
        return;
      }
      setRefCode((j.reference || '').toUpperCase());
      setPaymentReference((payJson.paymentReference || '').toUpperCase());
      setTrackingNumber((j.trackingNumber || '').toUpperCase());
      persistCheckoutSuccess({
        refCode: (j.reference || '').toUpperCase(),
        paymentReference: (payJson.paymentReference || '').toUpperCase(),
        trackingNumber: (j.trackingNumber || '').toUpperCase(),
      });
      setDone(true);
      setCart([]);
    } catch {
      setSubmitError('Сервер недоступен. Повторите попытку позже.');
    } finally {
      if (!redirectingToBank) setSubmitting(false);
    }
  };

  const applyCoupon = async () => {
    const code = couponCodeInput.trim().toUpperCase();
    if (!code) {
      setAppliedCoupon(null);
      return;
    }
    setCouponLoading(true);
    try {
      const res = await fetch('/api/cabinet/coupons/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, totalRub: totals.sumRub }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        coupon?: {
          code: string;
          title: string;
          discountPercent: number;
          minTotalRub: number;
          expiresAt: string | null;
        };
      };
      if (!res.ok || !j.coupon) {
        setAppliedCoupon(null);
        setSubmitError(j.error || 'Купон недоступен');
        return;
      }
      setSubmitError('');
      setAppliedCoupon(j.coupon);
      setCouponCodeInput(j.coupon.code);
    } catch {
      setSubmitError('Не удалось проверить купон');
    } finally {
      setCouponLoading(false);
    }
  };

  const shellClass = embedded
    ? 'flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-2xl mx-auto'
    : 'w-full max-w-2xl mx-auto pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] sm:px-6 py-8 sm:py-16';

  const scrollClass = embedded
    ? 'flex-1 min-h-0 overflow-y-auto overscroll-y-contain pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] sm:px-6 py-5 sm:py-6 md:py-8'
    : '';

  const inner = (
    <>
      <header
        className={
          embedded
            ? 'shrink-0 pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))] sm:px-6 pt-[max(1rem,env(safe-area-inset-top,0px))] sm:pt-4 pb-2 border-b border-gray-200/80'
            : 'mb-6 sm:mb-10 text-center'
        }
      >
        <p
          className="text-[10px] uppercase tracking-[0.22em] mb-2"
          style={{
            fontFamily: 'var(--font-open-sans)',
            color: 'var(--color-marble-grey-regular)',
          }}
        >
          CITY LEGEND
        </p>
        <h1
          className="text-2xl sm:text-3xl font-normal italic"
          style={{
            fontFamily: 'var(--font-playfair-display)',
            color: 'var(--color-classic-black)',
            letterSpacing: '0.02em',
          }}
        >
          Оплата заказа
        </h1>
        <p
          className="text-xs text-gray-500 mt-3 max-w-md mx-auto leading-relaxed"
          style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.03em' }}
        >
          Защищённая сессия. Данные банковской карты не сохраняются на наших серверах — обработка выполняется
          сертифицированным платёжным провайдером по стандарту PCI DSS.
        </p>
      </header>

      <div className={embedded ? scrollClass : ''}>
        <div className="space-y-6 sm:space-y-8 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] sm:pb-12">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-10 h-10 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin"
                  aria-hidden
                />
                <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Загрузка корзины…
                </p>
              </div>
            </div>
          ) : paymentReturn && !paymentReturn.ok && submitting && !done ? (
            <div className="flex justify-center py-20">
              <div className="flex flex-col items-center gap-5 text-center max-w-sm px-4">
                <div
                  className="w-10 h-10 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin"
                  aria-hidden
                />
                <p className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Уточняем у банка статус оплаты…
                </p>
                <p className="text-xs text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Банк ещё не сообщил окончательный результат. Это занимает до 1–2 минут — в это время не закрывайте
                  страницу. Если деньги были списаны, заказ оформится автоматически.
                </p>
              </div>
            </div>
          ) : paymentReturn?.ok && submitting && !done ? (
            <div className="flex justify-center py-20">
              <div className="flex flex-col items-center gap-5 text-center max-w-sm px-4">
                <div
                  className="w-10 h-10 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin"
                  aria-hidden
                />
                <p className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Оформляем ваш заказ…
                </p>
                <p className="text-xs text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Оплата получена. Готовим номер заказа и передаём посылку в службу доставки. Обычно занимает несколько
                  секунд.
                </p>
              </div>
            </div>
          ) : unauth ? (
            <div
              className="border border-gray-200/90 bg-white/80 backdrop-blur-sm p-8 text-center"
              style={{ boxShadow: '0 24px 48px -28px rgba(11, 42, 36, 0.12)' }}
            >
              <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Войдите в личный кабинет, чтобы оформить оплату выбранных товаров.
              </p>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('openCabinetPanel'))}
                    className="text-[11px] uppercase tracking-[0.18em] w-full sm:w-auto min-h-[44px] px-8 py-3.5 sm:min-h-0 bg-[#0b2a24] text-white border border-[#0b2a24] hover:bg-transparent hover:text-[#0b2a24] transition-colors touch-manipulation active:opacity-90"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                Войти в кабинет
              </button>
            </div>
          ) : done ? (
            <div
              className="border border-[#0b2a24]/20 bg-[#0b2a24]/[0.03] p-8 sm:p-10 text-center"
              style={{ boxShadow: '0 28px 56px -32px rgba(11, 42, 36, 0.2)' }}
            >
              <div className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-[#0b2a24] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0b2a24" strokeWidth="1.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2
                className="text-xl sm:text-2xl font-normal italic mb-3"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                Оплата прошла, заказ оформлен
              </h2>
              <p className="text-sm text-gray-600 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Номер заказа:{' '}
                <strong className="text-[#0b2a24] tracking-wide">{refCode}</strong>
              </p>
              {paymentReference ? (
                <p className="text-xs text-gray-500 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Платёж: <strong className="text-[#0b2a24] tracking-wide">{paymentReference}</strong>
                </p>
              ) : null}
              {trackingNumber ? (
                <p className="text-xs text-gray-500 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Трек СДЭК: <strong className="text-[#0b2a24] tracking-wide">{trackingNumber}</strong>
                </p>
              ) : null}
              <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Состав заказа, адрес доставки и статус можно посмотреть в личном кабинете. При необходимости поддержка
                свяжется с вами по контактам из заказа.
              </p>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
                className="mt-8 w-full sm:w-auto min-h-[44px] sm:min-h-0 text-[11px] uppercase tracking-[0.16em] px-8 py-3.5 border border-[#0b2a24] text-[#0b2a24] hover:bg-[#0b2a24] hover:text-white transition-colors touch-manipulation active:opacity-90"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Связаться с поддержкой
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.setItem('cl_cabinet_pending_view', 'cabinet-orders');
                  } catch {
                    /* sessionStorage недоступен */
                  }
                  window.dispatchEvent(new CustomEvent('openCabinetPanel'));
                  window.setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('openCabinetOrdersView'));
                  }, 60);
                }}
                className="mt-3 w-full sm:w-auto min-h-[44px] sm:min-h-0 text-[11px] uppercase tracking-[0.16em] px-8 py-3.5 bg-[#0b2a24] text-white border border-[#0b2a24] hover:bg-transparent hover:text-[#0b2a24] transition-colors touch-manipulation active:opacity-90"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Перейти в мои заказы
              </button>
            </div>
          ) : cart.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-gray-300">
              <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Корзина пуста — добавьте товары в кабинете, затем вернитесь к оплате.
              </p>
              <Link
                href="/collection"
                className="text-[11px] uppercase tracking-[0.16em] text-[#0b2a24] border-b border-[#0b2a24] pb-0.5"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Перейти в каталог
              </Link>
            </div>
          ) : isExpress && displayCart.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-amber-200/90 bg-amber-50/40 px-4">
              <p className="text-sm text-gray-700 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Этого товара нет в корзине. Вернитесь на страницу артикула и нажмите «Оформить сейчас» ещё раз или перейдите в
                каталог.
              </p>
              <Link
                href={expressAuctionId != null ? `/collection/${expressAuctionId}` : '/collection'}
                className="text-[11px] uppercase tracking-[0.16em] text-[#0b2a24] border-b border-[#0b2a24] pb-0.5"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                К товару
              </Link>
            </div>
          ) : (
            <>
              <div
                className="flex flex-wrap gap-3 p-4 border border-gray-200/90 bg-white/60"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-gray-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b2a24" strokeWidth="1.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  TLS 1.3
                </div>
                <span className="text-gray-300">|</span>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-gray-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b2a24" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Шифрование
                </div>
                <span className="text-gray-300">|</span>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-gray-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0b2a24" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  Проверка заказа
                </div>
              </div>

              <section>
                <h2
                  className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-4"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Состав заказа
                </h2>
                <ul className="space-y-3 border border-gray-200/90 divide-y divide-gray-100">
                  {displayCart.map((row) => (
                    <li key={cartLineKey(row)} className="flex gap-4 p-4 bg-white/50 items-start">
                      <div className="w-14 h-14 bg-gray-100 shrink-0 overflow-hidden">
                        {row.image ? (
                          <img
                            src={row.image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                          {row.lotName}
                        </p>
                        <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {qtyTpl(row.price, row.quantity)}
                        </p>
                      </div>
                      {!isExpress ? (
                        <button
                          type="button"
                          disabled={removingLineKey === cartLineKey(row)}
                          onClick={() => void removeCartLine(row.auctionId, row.variantId ?? '')}
                          className="shrink-0 -mr-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:mr-0 flex items-center justify-center p-2 text-gray-400 hover:text-red-700 transition-colors disabled:opacity-40 touch-manipulation active:opacity-70"
                          aria-label="Убрать из заказа"
                        >
                          {removingLineKey === cartLineKey(row) ? (
                            <span
                              className="inline-block w-4 h-4 border border-current border-t-transparent rounded-full animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M3 6h18M8 6V4h8v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h8z" strokeLinecap="round" />
                              <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 pt-5 border-t border-gray-200 space-y-2">
                  {cdekEnabled ? (
                    <>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span style={{ fontFamily: 'var(--font-open-sans)' }}>Товары</span>
                        <span style={{ fontFamily: 'var(--font-playfair-display)' }}>
                          {totals.sumRub > 0 || totals.allPricesKnown ? formatRub(goodsPayRub) : '—'}
                        </span>
                      </div>
                      {deliveryQuoteId ? (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span style={{ fontFamily: 'var(--font-open-sans)' }}>Доставка СДЭК</span>
                          <span style={{ fontFamily: 'var(--font-playfair-display)' }}>
                            {formatRub(deliveryRub)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-sm text-gray-500">
                          <span style={{ fontFamily: 'var(--font-open-sans)' }}>Доставка СДЭК</span>
                          <span style={{ fontFamily: 'var(--font-playfair-display)' }}>
                            {quoteLoading
                              ? 'считаем…'
                              : quoteError
                                ? 'ошибка расчёта'
                                : addressFieldsOk
                                  ? 'считаем…'
                                  : 'после выбора ПВЗ'}
                          </span>
                        </div>
                      )}
                    </>
                  ) : null}
                  <div className="flex justify-between items-baseline gap-4">
                    <span
                      className="text-sm uppercase tracking-[0.14em] text-gray-500"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {cdekEnabled ? 'К оплате' : 'Итого'}
                    </span>
                    <span
                      className="text-xl sm:text-2xl text-[#0b2a24]"
                      style={{ fontFamily: 'var(--font-playfair-display)' }}
                    >
                      {totals.sumRub > 0 || totals.allPricesKnown ? formatRub(payTotalRub) : '—'}
                    </span>
                  </div>
                </div>
                {loyaltyRub > 0 ? (
                  <p className="text-[11px] text-emerald-800 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Скидка за объём покупок: {volumeLoyaltyPercent}% (−{formatRub(loyaltyRub)})
                  </p>
                ) : null}
                {appliedCoupon ? (
                  <p className="text-[11px] text-emerald-700 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Купон `{appliedCoupon.code}`: -{appliedCoupon.discountPercent}% (−{formatRub(couponDiscountRub)})
                  </p>
                ) : null}
                {!totals.allPricesKnown && totals.sumRub > 0 ? (
                  <p className="text-[10px] text-gray-500 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Часть позиций без числовой цены в каталоге — точную сумму подтвердит поддержка.
                  </p>
                ) : null}
              </section>

              <section>
                <h2
                  className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-4"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Купон
                </h2>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={couponCodeInput}
                    onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                    placeholder="Код купона"
                    className="flex-1 h-11 px-4 border border-gray-300 bg-white/90 text-sm focus:outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                  <button
                    type="button"
                    disabled={couponLoading}
                    onClick={() => void applyCoupon()}
                    className="min-h-[44px] sm:min-h-0 shrink-0 h-11 px-4 text-[10px] uppercase tracking-[0.14em] border border-[#0b2a24] text-[#0b2a24] hover:bg-[#0b2a24] hover:text-white transition-colors disabled:opacity-40 touch-manipulation sm:w-auto w-full"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    {couponLoading ? 'Проверка...' : 'Применить'}
                  </button>
                </div>
              </section>

              <section>
                <h2
                  className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-4"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Способ оплаты
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMethod('secure_link')}
                    className={`text-left p-5 border transition-all duration-300 touch-manipulation active:scale-[0.99] sm:active:scale-100 ${
                      method === 'secure_link'
                        ? 'border-[#0b2a24] bg-[#0b2a24]/[0.04] shadow-[0_12px_32px_-16px_rgba(11,42,36,0.35)]'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#0b2a24] mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Рекомендуем
                    </p>
                    <p className="text-base italic mb-1" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                      Защищённая ссылка
                    </p>
                    <p className="text-xs text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Оплата картой на странице банка или платёжного шлюза — без ввода реквизитов на сайте бутика.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('concierge')}
                    className={`text-left p-5 border transition-all duration-300 touch-manipulation active:scale-[0.99] sm:active:scale-100 ${
                      method === 'concierge'
                        ? 'border-[#0b2a24] bg-[#0b2a24]/[0.04]'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <p className="text-base italic mb-1" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                      Поддержка
                    </p>
                    <p className="text-xs text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Счёт для юрлица, рассрочка, индивидуальные условия — обсудим в переписке или звонке.
                    </p>
                  </button>
                </div>
              </section>

              {method === 'secure_link' ? (
                <section
                  className="border border-gray-200/90 p-6 sm:p-8 bg-gradient-to-b from-white to-[#faf9f7]"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}
                >
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-[#0b2a24]/10 flex items-center justify-center">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b2a24" strokeWidth="1.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-normal italic mb-2" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                        Как это устроено
                      </h3>
                      <p className="text-xs text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        После подтверждения мы проверяем наличие товаров и отправляем одноразовую защищённую ссылку. Полный номер
                        карты вы вводите только в интерфейсе банка или эквайера — он не проходит через наш сайт.
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mb-6 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    После нажатия кнопки ниже вы перейдёте на защищённую страницу банка (T‑Bank) для ввода карты или СБП — без
                    передачи реквизитов через наш сайт.
                  </p>
                  <div className="mb-6">
                    <h3
                      className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-4"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      Контактные данные и адрес доставки
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={customer.fullName}
                        onChange={(e) => setCustomer((prev) => ({ ...prev, fullName: e.target.value }))}
                        placeholder="Имя и фамилия *"
                        className="sm:col-span-2 h-11 px-4 border border-gray-300 bg-white/90 text-sm focus:outline-none focus:border-[#0b2a24]"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      />
                      <input
                        type="tel"
                        value={customer.phone}
                        onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="Телефон *"
                        className="h-11 px-4 border border-gray-300 bg-white/90 text-sm focus:outline-none focus:border-[#0b2a24]"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      />
                      <input
                        type="email"
                        value={customer.email}
                        onChange={(e) => setCustomer((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="E-mail *"
                        className="h-11 px-4 border border-gray-300 bg-white/90 text-sm focus:outline-none focus:border-[#0b2a24]"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      />
                      {!cdekEnabled || !cdekApiAvailable ? (
                        <>
                          <input
                            type="text"
                            value={customer.city}
                            onChange={(e) => setCustomer((prev) => ({ ...prev, city: e.target.value }))}
                            placeholder="Город *"
                            className="h-11 px-4 border border-gray-300 bg-white/90 text-sm focus:outline-none focus:border-[#0b2a24]"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          />
                          <input
                            type="text"
                            value={customer.street}
                            onChange={(e) => setCustomer((prev) => ({ ...prev, street: e.target.value }))}
                            placeholder="Улица *"
                            className="h-11 px-4 border border-gray-300 bg-white/90 text-sm focus:outline-none focus:border-[#0b2a24]"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          />
                          <input
                            type="text"
                            value={customer.house}
                            onChange={(e) => setCustomer((prev) => ({ ...prev, house: e.target.value }))}
                            placeholder="Дом *"
                            className="h-11 px-4 border border-gray-300 bg-white/90 text-sm focus:outline-none focus:border-[#0b2a24]"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          />
                        </>
                      ) : (
                        <p
                          className="sm:col-span-2 text-xs text-gray-600 leading-relaxed py-2 border border-dashed border-gray-200 px-3 bg-white/60"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Город и адрес доставки задаются выбором пункта выдачи СДЭК ниже (как в маркетплейсах: страна → город →
                          пункт).
                        </p>
                      )}
                      <textarea
                        value={customer.comment}
                        onChange={(e) => setCustomer((prev) => ({ ...prev, comment: e.target.value }))}
                        placeholder="Комментарий к доставке и оплате"
                        className="sm:col-span-2 min-h-24 px-4 py-3 border border-gray-300 bg-white/90 text-sm focus:outline-none focus:border-[#0b2a24] resize-y"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      />
                    </div>
                    {!customerRequiredValid ? (
                      <p className="text-[10px] text-gray-500 mt-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Для продолжения заполните обязательные поля, отмеченные *.
                      </p>
                    ) : null}
                    {cdekEnabled && cdekApiAvailable ? (
                      <CdekDeliveryPanel
                        cityQuery={cdekCityQuery}
                        onCityQueryChange={(q) => {
                          if (selectedCdekCity) {
                            setSelectedCdekCity(null);
                            setPvzCode('');
                            setCustomer((prev) => ({ ...prev, city: '', street: '', house: '' }));
                          }
                          setCdekCityQuery(q);
                        }}
                        cityResults={cdekCityResults}
                        cityLoading={cdekCityLoading}
                        selectedCity={selectedCdekCity}
                        onSelectCity={(c) => {
                          setCdekCityResults([]);
                          setCdekCityQuery('');
                          setSelectedCdekCity(c);
                          const reg = c.region ? `, ${c.region}` : '';
                          setCustomer((prev) => ({
                            ...prev,
                            city: `${c.city}${reg}`,
                            street: '',
                            house: '',
                          }));
                          setPvzCode('');
                        }}
                        onResetCitySelection={() => {
                          setSelectedCdekCity(null);
                          setCdekCityQuery('');
                          setCdekCityResults([]);
                          setPvzCode('');
                          setCustomer((prev) => ({ ...prev, city: '', street: '', house: '' }));
                        }}
                        pvzPoints={pvzPoints}
                        pvzLoading={cdekPvzLoading}
                        pvzCode={pvzCode}
                        onSelectPvz={(p) => {
                          setPvzCode(p.code);
                          setCustomer((prev) => ({
                            ...prev,
                            street: p.address?.trim() ? p.address : 'ПВЗ СДЭК',
                            house: p.code,
                          }));
                        }}
                        quoteLoading={quoteLoading}
                        quotedDeliveryRub={deliveryQuoteId != null ? deliveryRub : null}
                        periodMin={deliveryPeriodMin}
                        periodMax={deliveryPeriodMax}
                        quoteError={quoteError}
                        hasQuote={deliveryQuoteId != null}
                      />
                    ) : null}
                    {cdekEnabled && !cdekApiAvailable ? (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <h3
                          className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-3"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Доставка СДЭК — только Россия
                        </h3>
                        <p
                          className="text-[11px] text-gray-600 leading-relaxed"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Укажите город и адрес — стоимость доставки рассчитается по тарифам СДЭК
                          {flatDeliveryRub > 0
                            ? ` (если калькулятор недоступен — ориентир ${formatRub(flatDeliveryRub)})`
                            : ''}
                          .
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-1 w-4 h-4 border-gray-400 text-[#0b2a24] focus:ring-[#0b2a24]"
                      style={{ accentColor: '#0b2a24' }}
                    />
                    <span className="text-xs text-gray-600 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Я согласен с{' '}
                      <Link href="/terms-of-use" className="text-[#0b2a24] underline-offset-2 hover:underline">
                        условиями
                      </Link>{' '}
                      и{' '}
                      <Link href="/privacy-policy" className="text-[#0b2a24] underline-offset-2 hover:underline">
                        политикой конфиденциальности
                      </Link>
                      . Понимаю, что окончательное списание происходит после подтверждения заказа поддержкой.
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={!agreed || !customerRequiredValid || submitting || !cdekQuoteOk}
                    onClick={() => void handleSecureRequest()}
                    className="mt-8 w-full min-h-[48px] sm:min-h-0 py-4 text-[11px] uppercase tracking-[0.2em] bg-[#0b2a24] text-white border border-[#0b2a24] hover:bg-transparent hover:text-[#0b2a24] transition-all duration-500 disabled:opacity-40 disabled:pointer-events-none touch-manipulation active:opacity-90"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    {submitting ? 'Обработка…' : 'Перейти к оплате и создать заказ'}
                  </button>
                  {submitError ? (
                    <p className="text-[11px] text-red-700 mt-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      {submitError}
                    </p>
                  ) : null}
                </section>
              ) : (
                <section className="border border-gray-200/90 p-6 sm:p-8 bg-white/70">
                  <p className="text-sm text-gray-700 mb-6 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Передадим корзину в поддержку: подготовим счёт, договор или способ оплаты, удобный для вас.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
                    className="w-full min-h-[48px] sm:min-h-0 py-4 text-[11px] uppercase tracking-[0.18em] border border-[#0b2a24] text-[#0b2a24] hover:bg-[#0b2a24] hover:text-white transition-colors touch-manipulation active:opacity-90"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Открыть поддержку
                  </button>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );

  return <div className={shellClass}>{inner}</div>;
}

function PaymentFlowFromSearchParams() {
  const searchParams = useSearchParams();
  const urlExpress = useMemo(() => {
    if (searchParams.get('express') !== '1') return null;
    const aid = Number(searchParams.get('auctionId'));
    const q = Number(searchParams.get('qty'));
    if (!Number.isFinite(aid) || aid < 1) return null;
    if (!Number.isFinite(q) || q < 1 || q > 99) return null;
    const variantId = String(searchParams.get('variantId') ?? '').trim();
    return { auctionId: Math.floor(aid), qty: Math.floor(q), variantId };
  }, [searchParams]);

  const paymentReturn = useMemo((): PaymentReturnState => {
    const p = searchParams.get('payment');
    const pcid = Math.floor(Number(searchParams.get('pcid') || ''));
    if (!Number.isFinite(pcid) || pcid < 1) return null;
    if (p === 'ok') return { ok: true, pcid };
    if (p === 'fail') return { ok: false, pcid };
    return null;
  }, [searchParams]);

  return <PaymentFlowInner embedded={false} urlExpress={urlExpress} paymentReturn={paymentReturn} />;
}

export function PaymentFlow({ embedded }: { embedded?: boolean }) {
  if (embedded) {
    return <PaymentFlowInner embedded urlExpress={null} paymentReturn={null} />;
  }
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-2xl mx-auto px-4 py-20 flex justify-center">
          <div
            className="w-10 h-10 border-2 border-[#0b2a24] border-t-transparent rounded-full animate-spin"
            aria-hidden
          />
        </div>
      }
    >
      <PaymentFlowFromSearchParams />
    </Suspense>
  );
}
