'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PROMO_COUPON_STORAGE_KEY, CABINET_PENDING_VIEW_KEY, CABINET_RESTORE_VIEW_KEY, readPromoCouponFromStorage, persistCabinetRestoreView, readCabinetRestoreView } from '@/lib/promoDeepLink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatRub, summarizeCartTotals } from '@/lib/cartPricing';
import { loyaltyDiscountRubFromSubtotal } from '@/lib/volumeLoyalty';

function tpl(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''
  );
}

type DashboardPayload = {
  user: { id: number; email: string; name: string; birthDate?: string | null };
  cabinetCopy: Record<string, string>;
  news: {
    id: number;
    title: string;
    excerpt: string;
    category: string;
    readingMinutes: number;
    createdAt: string;
    imageUrl: string | null;
    detailsUrl: string;
    targetSegment: string;
    abBucket: string;
    score: number;
  }[];
  promotions: {
    id: number;
    title: string;
    subtitle: string | null;
    code: string | null;
    discountLabel: string | null;
    validUntil: string | null;
    detailsUrl: string;
    targetSegment: string;
    abBucket: string;
    score: number;
  }[];
  marketing: {
    segment: string;
    abBucket: string;
  };
  bestOffer: {
    promotionId: number;
    title: string;
    code: string | null;
    discountLabel: string | null;
    detailsUrl: string;
    reason: string;
  } | null;
  orders: {
    id: number;
    status: string;
    reference: string | null;
    total: string;
    summary: string | null;
    createdAt: string;
    trackingNumber: string | null;
    deliveryRub: number | null;
    deliveryMode: string | null;
    cdekPvzCode: string | null;
    cdekOrderUuid: string | null;
    cdekError: string | null;
    etaDays: number | null;
    progressPercent: number;
    canCancel: boolean;
    canReturn: boolean;
    refundStatus: string | null;
    refundedAt: string | null;
    couponCode: string | null;
    discountPercent: number;
    discountRub: number;
    loyaltyPercent: number;
    loyaltyDiscountRub: number;
    subtotalRub: number | null;
    subtotalDisplay: string | null;
    customer: {
      name: string;
      phone: string;
      email: string;
    };
    delivery: {
      city: string;
      street: string;
      house: string;
      apartment: string;
      postalCode: string;
      comment: string;
    };
    items: {
      id: number;
      auctionId: number | null;
      lotName: string;
      unitPrice: string;
      quantity: number;
      image: string | null;
    }[];
  }[];
  cart: {
    auctionId: number;
    variantId?: string;
    variantSummary?: string | null;
    quantity: number;
    lotName: string;
    price: string;
    image: string | null;
    updatedAt: string;
  }[];
  favorites: {
    auctionId: number;
    lotName: string;
    price: string;
    image: string | null;
    addedAt: string;
  }[];
  reviews: {
    id: number;
    orderItemId: number | null;
    auctionId: number | null;
    lotTitle: string;
    text: string;
    likes: number;
    dislikes: number;
    rating: number | null;
    createdAt: string;
    moderationHidden: boolean;
    moderationReason: string | null;
    replies: { id: number; text: string; created_at: string }[];
  }[];
  volumeLoyalty: {
    headline: string;
    spentHint: string;
    tiers: { id: number; fromRub: number; label: string; percent: number }[];
    spentRub: number;
    activePercent: number;
    currentTier: string | null;
    nextTierLabel: string | null;
    nextTierPercent: number | null;
    rubToNextTier: number | null;
  };
  savedAddresses: {
    id: number;
    label: string;
    fullName: string;
    phone: string;
    email: string;
    city: string;
    street: string;
    house: string;
    apartment: string;
    postalCode: string;
    comment: string;
    isDefault: boolean;
  }[];
  conciergeTopics: {
    key: string;
    label: string;
    slaMinutes: number;
  }[];
  conciergeTickets: {
    id: number;
    topicKey: string;
    topicLabel: string;
    status: string;
    priority: string;
    subject: string;
    orderId: number | null;
    assignedManagerName: string | null;
    responseSlaMinutes: number;
    firstResponseDueAt: string | null;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    lastMessage: string | null;
    lastSenderType: string | null;
    lastMessageAt: string | null;
  }[];
  suggested: {
    auctionId: number;
    lotName: string;
    price: string;
    image: string | null;
  }[];
};

type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: number; text: string; tone: ToastTone };

/** Порядок меню: покупки → история → маркетинг → отзывы → поддержка → настройки */
const NAV_IDS = [
  'cabinet-cart',
  'cabinet-favorites',
  'cabinet-orders',
  'cabinet-promo',
  'cabinet-news',
  'cabinet-reviews',
  'cabinet-concierge',
  'cabinet-settings',
] as const;

const APPLIED_COUPON_STORAGE_KEY = 'citylegend_applied_coupon';

type StoredAppliedCoupon = {
  code: string;
  title: string;
  discountPercent: number;
  minTotalRub: number;
  expiresAt: string | null;
};

function persistAppliedCouponStorage(coupon: StoredAppliedCoupon): void {
  try {
    sessionStorage.setItem(APPLIED_COUPON_STORAGE_KEY, JSON.stringify(coupon));
  } catch {
    /* ignore */
  }
}

function clearAppliedCouponStorage(): void {
  try {
    sessionStorage.removeItem(APPLIED_COUPON_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function readAppliedCouponStorage(): StoredAppliedCoupon | null {
  try {
    const raw = sessionStorage.getItem(APPLIED_COUPON_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAppliedCoupon;
    if (!parsed?.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

type CabinetViewId = (typeof NAV_IDS)[number];

function navCopyKey(id: CabinetViewId): string {
  return `nav_${id.replace(/^cabinet-/, '').replace(/-/g, '_')}`;
}

function sectionCopyKeys(id: CabinetViewId) {
  const s = id.replace(/^cabinet-/, '').replace(/-/g, '_');
  return { eyebrowKey: `section_${s}_eyebrow` as const, titleKey: `section_${s}_title` as const };
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function parseDiscountPercent(label: string | null | undefined): number {
  if (!label) return 0;
  const m = label.match(/(\d{1,2})\s*%/);
  if (!m) return 0;
  const pct = Number(m[1]);
  return Number.isFinite(pct) ? Math.max(0, Math.min(90, pct)) : 0;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}д ${h}ч ${m}м`;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function orderStatusLabel(status: string) {
  switch (status) {
    case 'processing':
      return 'В обработке';
    case 'shipped':
      return 'Передан в доставку';
    case 'delivered':
      return 'Доставлен';
    case 'completed':
      return 'Завершён';
    case 'cancelled':
      return 'Отменён';
    case 'return_requested':
      return 'Запрошен возврат';
    case 'returned':
      return 'Возврат выполнен';
    default:
      return status;
  }
}

function orderStatusTone(status: string) {
  switch (status) {
    case 'processing':
      return { badge: 'border-amber-300 bg-amber-50 text-amber-800', card: 'border-l-4 border-l-amber-400', progress: '#d97706' };
    case 'shipped':
      return { badge: 'border-sky-300 bg-sky-50 text-sky-800', card: 'border-l-4 border-l-sky-400', progress: '#0284c7' };
    case 'delivered':
      return { badge: 'border-emerald-300 bg-emerald-50 text-emerald-800', card: 'border-l-4 border-l-emerald-400', progress: '#059669' };
    case 'completed':
      return { badge: 'border-[#0b2a24]/30 bg-[#0b2a24]/10 text-[#0b2a24]', card: 'border-l-4 border-l-[#0b2a24]', progress: '#0b2a24' };
    case 'cancelled':
      return { badge: 'border-rose-300 bg-rose-50 text-rose-800', card: 'border-l-4 border-l-rose-400', progress: '#e11d48' };
    case 'return_requested':
      return { badge: 'border-violet-300 bg-violet-50 text-violet-800', card: 'border-l-4 border-l-violet-400', progress: '#7c3aed' };
    case 'returned':
      return { badge: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800', card: 'border-l-4 border-l-fuchsia-400', progress: '#c026d3' };
    default:
      return { badge: 'border-gray-300 bg-gray-50 text-gray-700', card: 'border-l-4 border-l-gray-300', progress: '#0b2a24' };
  }
}

function conciergeStatusLabel(status: string) {
  switch (status) {
    case 'open':
      return 'Открыт';
    case 'in_progress':
      return 'В работе';
    case 'waiting_customer':
      return 'Ждём вас';
    case 'resolved':
      return 'Решён';
    case 'closed':
      return 'Закрыт';
    default:
      return status;
  }
}

function ViewFrame({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="border border-gray-200/80 bg-white/90 backdrop-blur-sm px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10"
      style={{ boxShadow: '0 20px 40px -28px rgba(11, 42, 36, 0.15)' }}
    >
      {eyebrow && (
        <p
          className="text-[10px] uppercase tracking-[0.2em] mb-3"
          style={{
            fontFamily: 'var(--font-open-sans)',
            color: 'var(--color-marble-grey-regular)',
          }}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className="text-xl md:text-2xl font-normal italic mb-6"
        style={{
          fontFamily: 'var(--font-playfair-display)',
          color: 'var(--color-classic-black)',
          letterSpacing: '0.02em',
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

type Props = {
  user: { id: number; email: string; name: string; birthDate?: string | null };
  onLogout: () => void;
};

export default function CabinetDashboard({ user, onLogout }: Props) {
  const router = useRouter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [view, setView] = useState<CabinetViewId>(() => {
    if (typeof window !== 'undefined') {
      try {
        const pending = sessionStorage.getItem(CABINET_PENDING_VIEW_KEY);
        if (pending && (NAV_IDS as readonly string[]).includes(pending)) {
          sessionStorage.removeItem(CABINET_PENDING_VIEW_KEY);
          sessionStorage.setItem(CABINET_RESTORE_VIEW_KEY, pending);
          return pending as CabinetViewId;
        }
        const restored = readCabinetRestoreView();
        if (restored && (NAV_IDS as readonly string[]).includes(restored)) {
          return restored as CabinetViewId;
        }
      } catch {
        /* sessionStorage недоступен — не критично */
      }
    }
    return 'cabinet-cart';
  });
  const [favoriteQtyById, setFavoriteQtyById] = useState<Record<number, number>>({});
  const [favAddLoadingId, setFavAddLoadingId] = useState<number | null>(null);
  const [favAddedFeedback, setFavAddedFeedback] = useState<{
    auctionId: number;
    totalInCart: number;
    addedQty: number;
  } | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [orderActionLoadingId, setOrderActionLoadingId] = useState<number | null>(null);
  const [cartQtyLoadingKey, setCartQtyLoadingKey] = useState<string | null>(null);
  const [clearCartLoading, setClearCartLoading] = useState(false);
  const [newsQuery, setNewsQuery] = useState('');
  const [newsCategory, setNewsCategory] = useState<'all' | string>('all');
  const [promoOnlyWithCode, setPromoOnlyWithCode] = useState(false);
  const [reviewsSort, setReviewsSort] = useState<'new' | 'useful'>('new');
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | string>('all');
  const [orderStatusMenuOpen, setOrderStatusMenuOpen] = useState(false);
  const [profileBirthDate, setProfileBirthDate] = useState(user.birthDate ?? '');
  const [profileName, setProfileName] = useState(user.name ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    title: string;
    discountPercent: number;
    minTotalRub: number;
    expiresAt: string | null;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [selectedFavorites, setSelectedFavorites] = useState<Record<number, boolean>>({});
  const [bulkFavoritesLoading, setBulkFavoritesLoading] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [saveAddressLoading, setSaveAddressLoading] = useState(false);
  const [addressEditId, setAddressEditId] = useState<number | null>(null);
  const [addressEditForm, setAddressEditForm] = useState({
    label: '',
    fullName: '',
    phone: '',
    email: '',
    city: '',
    street: '',
    house: '',
    apartment: '',
    postalCode: '',
    comment: '',
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [conciergeTopicKey, setConciergeTopicKey] = useState<string>('product_selection');
  const [conciergeOrderId, setConciergeOrderId] = useState<number | null>(null);
  const [conciergeSubject, setConciergeSubject] = useState('');
  const [conciergeMessage, setConciergeMessage] = useState('');
  const [conciergeCreating, setConciergeCreating] = useState(false);
  const [conciergeSelectedTicketId, setConciergeSelectedTicketId] = useState<number | null>(null);
  const [conciergeTicketDetails, setConciergeTicketDetails] = useState<{
    ticket: DashboardPayload['conciergeTickets'][number];
    messages: { id: number; senderType: string; message: string; createdAt: string }[];
  } | null>(null);
  const [conciergeLoadingDetails, setConciergeLoadingDetails] = useState(false);
  const [conciergeReply, setConciergeReply] = useState('');
  const [conciergeSendingReply, setConciergeSendingReply] = useState(false);
  const [conciergeTopicMenuOpen, setConciergeTopicMenuOpen] = useState(false);
  const [conciergeOrderMenuOpen, setConciergeOrderMenuOpen] = useState(false);
  const [reviewDraftByOrderItem, setReviewDraftByOrderItem] = useState<Record<number, string>>({});
  const [reviewRatingByOrderItem, setReviewRatingByOrderItem] = useState<Record<number, number>>({});
  const [reviewSendingOrderItemId, setReviewSendingOrderItemId] = useState<number | null>(null);
  const [reviewDeletingId, setReviewDeletingId] = useState<number | null>(null);
  const favAddedClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef(1);
  const couponQrPrefillDone = useRef(false);
  const orderStatusMenuRef = useRef<HTMLDivElement | null>(null);
  const conciergeTopicMenuRef = useRef<HTMLDivElement | null>(null);
  const conciergeOrderMenuRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/cabinet/dashboard', { credentials: 'include' });
      if (res.status === 401) {
        onLogout();
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setErr(typeof json.error === 'string' ? json.error : 'Ошибка загрузки');
        setLoading(false);
        return;
      }
      setData(json as DashboardPayload);
    } catch {
      setErr('Нет соединения');
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    persistCabinetRestoreView(view);
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data) couponQrPrefillDone.current = false;
  }, [data]);

  useEffect(() => {
    return () => {
      if (favAddedClearRef.current) clearTimeout(favAddedClearRef.current);
    };
  }, []);

  useEffect(() => {
    const openOrders = () => setView('cabinet-orders');
    const openConciergeView = () => setView('cabinet-concierge');
    const openCartView = () => setView('cabinet-cart');
    window.addEventListener('openCabinetOrdersView', openOrders);
    window.addEventListener('openCabinetConciergeView', openConciergeView);
    window.addEventListener('openCabinetCartView', openCartView);
    return () => {
      window.removeEventListener('openCabinetOrdersView', openOrders);
      window.removeEventListener('openCabinetConciergeView', openConciergeView);
      window.removeEventListener('openCabinetCartView', openCartView);
    };
  }, []);

  useEffect(() => {
    const def = data?.savedAddresses.find((a) => a.isDefault) || data?.savedAddresses[0];
    setSelectedAddressId(def?.id ?? null);
  }, [data?.savedAddresses]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (orderStatusMenuRef.current && !orderStatusMenuRef.current.contains(e.target as Node)) {
        setOrderStatusMenuOpen(false);
      }
      if (conciergeTopicMenuRef.current && !conciergeTopicMenuRef.current.contains(e.target as Node)) {
        setConciergeTopicMenuOpen(false);
      }
      if (conciergeOrderMenuRef.current && !conciergeOrderMenuRef.current.contains(e.target as Node)) {
        setConciergeOrderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    setProfileBirthDate(data?.user?.birthDate ?? user.birthDate ?? '');
    setProfileName(data?.user?.name ?? user.name ?? '');
  }, [data?.user?.birthDate, data?.user?.name, user.birthDate, user.name]);

  const saveProfileSettings = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const res = await fetch('/api/cabinet/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: profileName.trim(),
          birthDate: profileBirthDate.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileMsg(typeof d.error === 'string' ? d.error : 'Не удалось сохранить');
        return;
      }
      setProfileMsg('Сохранено');
      if (d.profile?.birthDate !== undefined) {
        setProfileBirthDate(d.profile.birthDate ?? '');
      }
      if (d.profile?.name !== undefined) {
        setProfileName(d.profile.name ?? '');
      }
      if (data) {
        setData({
          ...data,
          user: {
            ...data.user,
            name: d.profile?.name ?? data.user.name,
            birthDate: d.profile?.birthDate ?? data.user.birthDate,
          },
        });
      }
    } catch {
      setProfileMsg('Ошибка сети');
    } finally {
      setProfileSaving(false);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const trackMarketingEvent = useCallback(
    (eventName: string, entityType: 'promotion' | 'news', entityId: number, meta?: Record<string, unknown>) => {
      const segment = data?.marketing?.segment || 'all';
      const abBucket = data?.marketing?.abBucket || 'A';
      void fetch('/api/cabinet/marketing/event', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName,
          entityType,
          entityId,
          segment,
          abBucket,
          meta: meta || {},
        }),
      }).catch(() => {});
    },
    [data?.marketing?.abBucket, data?.marketing?.segment]
  );

  useEffect(() => {
    if (!data) return;
    if (view === 'cabinet-news') {
      (data.news || []).slice(0, 3).forEach((n) => {
        trackMarketingEvent('news_impression', 'news', n.id, { score: n.score });
      });
    }
    if (view === 'cabinet-promo') {
      (data.promotions || []).slice(0, 3).forEach((p) => {
        trackMarketingEvent('promo_impression', 'promotion', p.id, { score: p.score });
      });
    }
  }, [data, view, trackMarketingEvent]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
      pushToast('Промокод скопирован', 'success');
      const p = (data?.promotions || []).find((x) => (x.code || '').toUpperCase() === code.toUpperCase());
      if (p) trackMarketingEvent('promo_copy_code', 'promotion', p.id, { code: p.code });
    } catch {
      setCopiedCode(null);
      pushToast('Не удалось скопировать код', 'error');
    }
  };

  const pushToast = (text: string, tone: ToastTone = 'info') => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  };

  const deleteOwnReview = async (reviewId: number) => {
    if (!window.confirm('Удалить ваш отзыв безвозвратно?')) return;
    setReviewDeletingId(reviewId);
    try {
      const res = await fetch(`/api/cabinet/reviews?id=${reviewId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      let json: { error?: string } = {};
      try {
        json = (await res.json()) as { error?: string };
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        pushToast(typeof json.error === 'string' ? json.error : 'Не удалось удалить отзыв', 'error');
        return;
      }
      pushToast('Отзыв удалён', 'success');
      await load();
    } finally {
      setReviewDeletingId(null);
    }
  };

  useEffect(() => {
    if (!data || loading || appliedCoupon) return;
    const stored = readAppliedCouponStorage();
    if (!stored) return;
    setAppliedCoupon(stored);
    setAppliedPromoCode(stored.code);
    setPromoCodeInput(stored.code);
  }, [data, loading, appliedCoupon]);

  /** После перехода с /promo?code= — применить купон в корзине (нужна авторизация) */
  useEffect(() => {
    if (!data || loading || couponQrPrefillDone.current) return;
    const code = readPromoCouponFromStorage();
    if (!code) return;

    setPromoCodeInput(code);
    setView('cabinet-cart');
    const cartTotals = summarizeCartTotals(data.cart);
    setCouponLoading(true);
    void fetch('/api/cabinet/coupons/validate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, totalRub: cartTotals.sumRub }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          pushToast(j.error || 'Купон недоступен', 'error');
          return;
        }
        const j = (await res.json()) as {
          coupon?: {
            code: string;
            title: string;
            discountPercent: number;
            minTotalRub: number;
            expiresAt: string | null;
          };
        };
        if (j.coupon) {
          couponQrPrefillDone.current = true;
          try {
            sessionStorage.removeItem(PROMO_COUPON_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          setAppliedCoupon(j.coupon);
          setAppliedPromoCode(j.coupon.code);
          persistAppliedCouponStorage(j.coupon);
          pushToast(`Купон из QR: ${j.coupon.title}`, 'success');
        }
      })
      .finally(() => setCouponLoading(false));
    // pushToast стабилен по смыслу для этого одноразового сценария
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading]);

  const closeCabinetOverlay = () => {
    window.dispatchEvent(new CustomEvent('closeCabinetPanel'));
  };

  const removeFavorite = async (auctionId: number) => {
    try {
      const res = await fetch('/api/cabinet/favorites', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId }),
      });
      if (res.ok) {
        pushToast('Убрали из избранного', 'info');
        await load();
      }
    } catch {
      /* ignore */
    }
  };

  const cartLineKey = (auctionId: number, variantId?: string) => `${auctionId}:${variantId ?? ''}`;

  const removeFromCart = async (auctionId: number, variantId = '') => {
    try {
      const q = new URLSearchParams({ auctionId: String(auctionId) });
      if (variantId) q.set('variantId', variantId);
      const res = await fetch(`/api/cabinet/cart?${q.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        pushToast('Позиция удалена из корзины', 'info');
        await load();
      }
    } catch {
      /* ignore */
    }
  };

  const updateCartQuantity = async (auctionId: number, quantity: number, variantId = '') => {
    const next = Math.max(1, Math.min(99, Math.floor(quantity)));
    setCartQtyLoadingKey(cartLineKey(auctionId, variantId));
    try {
      const res = await fetch('/api/cabinet/cart', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId, quantity: next, variantId }),
      });
      if (res.ok) await load();
    } catch {
      /* ignore */
    } finally {
      setCartQtyLoadingKey(null);
    }
  };

  const clearCart = async () => {
    setClearCartLoading(true);
    try {
      const res = await fetch('/api/cabinet/cart', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        pushToast('Корзина очищена', 'info');
        await load();
      }
    } catch {
      /* ignore */
    } finally {
      setClearCartLoading(false);
    }
  };

  const getFavoriteQty = (auctionId: number) => {
    const q = favoriteQtyById[auctionId];
    return q != null && q >= 1 ? Math.min(99, q) : 1;
  };

  const setFavoriteQty = (auctionId: number, next: number) => {
    setFavoriteQtyById((prev) => ({
      ...prev,
      [auctionId]: Math.min(99, Math.max(1, Math.floor(next))),
    }));
  };

  const addFavoriteToCart = async (auctionId: number) => {
    const qty = getFavoriteQty(auctionId);
    setFavAddLoadingId(auctionId);
    try {
      const res = await fetch('/api/cabinet/cart', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId, quantity: qty }),
      });
      const j = (await res.json()) as { quantity?: number; error?: string };
      if (res.ok) {
        const totalInCart = typeof j.quantity === 'number' ? j.quantity : qty;
        if (favAddedClearRef.current) clearTimeout(favAddedClearRef.current);
        setFavAddedFeedback({
          auctionId,
          totalInCart,
          addedQty: qty,
        });
        pushToast('Товар добавлен в корзину', 'success');
        favAddedClearRef.current = setTimeout(() => {
          setFavAddedFeedback(null);
          favAddedClearRef.current = null;
        }, 2800);
        await load();
      }
    } catch {
      /* ignore */
    } finally {
      setFavAddLoadingId(null);
    }
  };

  const orderAction = async (orderId: number, action: 'cancel' | 'return' | 'repeat') => {
    setOrderActionLoadingId(orderId);
    try {
      const res = await fetch('/api/cabinet/orders/action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      });
      if (res.ok) {
        if (action === 'cancel') pushToast('Заказ отменён', 'success');
        if (action === 'return') pushToast('Запрос на возврат отправлен', 'success');
        if (action === 'repeat') pushToast('Позиции заказа добавлены в корзину', 'success');
        await load();
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        pushToast(j.error || 'Действие недоступно', 'error');
      }
    } catch {
      /* ignore */
    } finally {
      setOrderActionLoadingId(null);
    }
  };

  const buyAgainAndCheckout = async (orderId: number) => {
    setOrderActionLoadingId(orderId);
    try {
      const res = await fetch('/api/cabinet/orders/action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action: 'repeat' }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        pushToast(j.error || 'Не удалось повторить заказ', 'error');
        return;
      }
      pushToast('Позиции добавлены, открываю оплату', 'success');
      await load();
      closeCabinetOverlay();
      try {
        sessionStorage.removeItem('cl_payment_success');
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('paymentFlowForceFresh'));
      router.push('/payment');
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setOrderActionLoadingId(null);
    }
  };

  const moveCartToFavorites = async (auctionId: number, variantId = '') => {
    setCartQtyLoadingKey(cartLineKey(auctionId, variantId));
    try {
      const favRes = await fetch('/api/cabinet/favorites', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId }),
      });
      if (!favRes.ok) {
        pushToast('Не удалось добавить в избранное', 'error');
        return;
      }
      const q = new URLSearchParams({ auctionId: String(auctionId) });
      if (variantId) q.set('variantId', variantId);
      const rmRes = await fetch(`/api/cabinet/cart?${q.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!rmRes.ok) {
        pushToast('Добавлено в избранное, но не удалено из корзины', 'error');
      } else {
        pushToast('Переместили в избранное', 'success');
      }
      await load();
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setCartQtyLoadingKey(null);
    }
  };

  const addSelectedFavoritesToCart = async () => {
    const ids = d.favorites.map((f) => f.auctionId).filter((id) => selectedFavorites[id]);
    if (ids.length === 0) {
      pushToast('Выберите позиции в избранном', 'info');
      return;
    }
    setBulkFavoritesLoading(true);
    try {
      for (const id of ids) {
        await fetch('/api/cabinet/cart', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auctionId: id, quantity: getFavoriteQty(id) }),
        });
      }
      pushToast(`Добавлено в корзину: ${ids.length}`, 'success');
      await load();
    } catch {
      pushToast('Ошибка при массовом добавлении', 'error');
    } finally {
      setBulkFavoritesLoading(false);
    }
  };

  const saveSelectedAddressFromCart = async () => {
    const selected = d.savedAddresses.find((a) => a.id === selectedAddressId);
    if (!selected) {
      pushToast('Выберите адрес', 'info');
      return;
    }
    setSaveAddressLoading(true);
    try {
      const res = await fetch('/api/cabinet/addresses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selected,
          isDefault: true,
          label: selected.label || 'Адрес по умолчанию',
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        pushToast(j.error || 'Не удалось сохранить адрес', 'error');
        return;
      }
      pushToast('Адрес выбран по умолчанию', 'success');
      await load();
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setSaveAddressLoading(false);
    }
  };

  const startAddressEdit = (id: number) => {
    const a = d.savedAddresses.find((x) => x.id === id);
    if (!a) return;
    setAddressEditId(id);
    setAddressEditForm({
      label: a.label || '',
      fullName: a.fullName || '',
      phone: a.phone || '',
      email: a.email || '',
      city: a.city || '',
      street: a.street || '',
      house: a.house || '',
      apartment: a.apartment || '',
      postalCode: a.postalCode || '',
      comment: a.comment || '',
    });
  };

  const saveAddressEdit = async () => {
    if (!addressEditId) return;
    setSaveAddressLoading(true);
    try {
      const res = await fetch('/api/cabinet/addresses', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: addressEditId,
          ...addressEditForm,
          isDefault: selectedAddressId === addressEditId,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        pushToast(j.error || 'Не удалось обновить адрес', 'error');
        return;
      }
      pushToast('Адрес обновлён', 'success');
      setAddressEditId(null);
      await load();
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setSaveAddressLoading(false);
    }
  };

  const deleteAddress = async (id: number) => {
    setSaveAddressLoading(true);
    try {
      const res = await fetch(`/api/cabinet/addresses?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        pushToast('Не удалось удалить адрес', 'error');
        return;
      }
      pushToast('Адрес удалён', 'info');
      if (selectedAddressId === id) setSelectedAddressId(null);
      if (addressEditId === id) setAddressEditId(null);
      await load();
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setSaveAddressLoading(false);
    }
  };

  const loadConciergeTicket = useCallback(async (ticketId: number) => {
    setConciergeLoadingDetails(true);
    try {
      const res = await fetch(`/api/cabinet/concierge/tickets/${ticketId}`, {
        credentials: 'include',
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        ticket?: DashboardPayload['conciergeTickets'][number];
        messages?: { id: number; senderType: string; message: string; createdAt: string }[];
      };
      if (!res.ok || !j.ticket) {
        pushToast(j.error || 'Не удалось загрузить тикет', 'error');
        return;
      }
      setConciergeTicketDetails({
        ticket: j.ticket,
        messages: Array.isArray(j.messages) ? j.messages : [],
      });
      setConciergeSelectedTicketId(ticketId);
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setConciergeLoadingDetails(false);
    }
  }, []);

  const createConciergeTicket = async () => {
    const subject = conciergeSubject.trim();
    const message = conciergeMessage.trim();
    if (!conciergeTopicKey) {
      pushToast('Выберите тему обращения', 'error');
      return;
    }
    if (subject.length < 3) {
      pushToast('Укажите тему обращения', 'error');
      return;
    }
    if (message.length < 5) {
      pushToast('Опишите запрос подробнее', 'error');
      return;
    }
    setConciergeCreating(true);
    try {
      const res = await fetch('/api/cabinet/concierge/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicKey: conciergeTopicKey,
          subject,
          message,
          orderId: conciergeOrderId || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ticketId?: number };
      if (!res.ok || !j.ticketId) {
        pushToast(j.error || 'Не удалось создать тикет', 'error');
        return;
      }
      pushToast('Тикет создан', 'success');
      setConciergeSubject('');
      setConciergeMessage('');
      await load();
      await loadConciergeTicket(j.ticketId);
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setConciergeCreating(false);
    }
  };

  const sendConciergeReply = async () => {
    const text = conciergeReply.trim();
    if (!conciergeSelectedTicketId) return;
    if (text.length < 2) {
      pushToast('Сообщение слишком короткое', 'error');
      return;
    }
    setConciergeSendingReply(true);
    try {
      const res = await fetch(`/api/cabinet/concierge/tickets/${conciergeSelectedTicketId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        pushToast(j.error || 'Не удалось отправить сообщение', 'error');
        return;
      }
      setConciergeReply('');
      await loadConciergeTicket(conciergeSelectedTicketId);
      await load();
      pushToast('Сообщение отправлено', 'success');
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setConciergeSendingReply(false);
    }
  };

  const submitOrderItemReview = async (orderId: number, orderItemId: number) => {
    const text = (reviewDraftByOrderItem[orderItemId] || '').trim();
    const rating = reviewRatingByOrderItem[orderItemId];
    if (rating == null || rating < 1 || rating > 5) {
      pushToast('Выберите оценку звёздами', 'error');
      return;
    }
    if (text.length < 5) {
      pushToast('Минимум 5 символов в отзыве', 'error');
      return;
    }
    setReviewSendingOrderItemId(orderItemId);
    try {
      const res = await fetch('/api/cabinet/reviews', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, orderItemId, text, rating }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        pushToast(j.error || 'Не удалось сохранить отзыв', 'error');
        return;
      }
      pushToast('Отзыв сохранён', 'success');
      setReviewDraftByOrderItem((prev) => ({ ...prev, [orderItemId]: '' }));
      setReviewRatingByOrderItem((prev) => {
        const next = { ...prev };
        delete next[orderItemId];
        return next;
      });
      await load();
    } catch {
      pushToast('Ошибка сети', 'error');
    } finally {
      setReviewSendingOrderItemId(null);
    }
  };

  const applyPromoFromPromoSection = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    const previousCode = appliedCoupon?.code || appliedPromoCode || '';
    const fallback = promoMap.get(normalized);
    setPromoCodeInput(normalized);
    setAppliedPromoCode(normalized);
    if (fallback) {
      setAppliedCoupon({
        code: normalized,
        title: 'Акция из раздела "Акции"',
        discountPercent: fallback.discountPercent,
        minTotalRub: 0,
        expiresAt: null,
      });
    } else {
      setAppliedCoupon(null);
    }
    setView('cabinet-cart');
    const p = (data?.promotions || []).find((x) => (x.code || '').toUpperCase() === normalized);
    if (p) trackMarketingEvent('promo_apply_from_list', 'promotion', p.id, { code: normalized });
    if (previousCode && previousCode !== normalized) {
      pushToast(`Акция заменена: ${previousCode} -> ${normalized}`, 'info');
    } else {
      pushToast(`Промокод ${normalized} применён к корзине`, 'success');
    }
  };

  const promoMap = useMemo(() => {
    const m = new Map<string, { code: string; discountPercent: number }>();
    const promotions = data?.promotions ?? [];
    for (const p of promotions) {
      if (!p.code) continue;
      m.set(p.code.trim().toUpperCase(), {
        code: p.code.trim().toUpperCase(),
        discountPercent: parseDiscountPercent(p.discountLabel),
      });
    }
    return m;
  }, [data?.promotions]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const orders = data?.orders ?? [];
    return orders.filter((o) => {
      if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
      if (!q) return true;
      const haystack = [o.reference ?? '', o.total, o.summary ?? '', ...o.items.map((i) => i.lotName)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.orders, orderSearch, orderStatusFilter]);
  const blogCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of data?.news ?? []) {
      if (n.category?.trim()) set.add(n.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [data?.news]);

  const filteredNews = useMemo(() => {
    let list = [...(data?.news ?? [])];
    if (newsCategory !== 'all') {
      list = list.filter((n) => (n.category || '').trim() === newsCategory);
    }
    const q = newsQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((n) =>
        `${n.title} ${n.excerpt} ${n.category}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data?.news, newsQuery, newsCategory]);
  const filteredPromotions = useMemo(() => {
    const list = data?.promotions ?? [];
    if (!promoOnlyWithCode) return list;
    return list.filter((p) => !!p.code);
  }, [data?.promotions, promoOnlyWithCode]);
  const promoOfDay = useMemo(() => {
    const list = data?.promotions ?? [];
    const withDate = list
      .filter((p) => !!p.validUntil)
      .map((p) => ({ p, ts: new Date(`${p.validUntil}T23:59:59`).getTime() }))
      .filter((x) => Number.isFinite(x.ts) && x.ts > nowTs)
      .sort((a, b) => a.ts - b.ts);
    return withDate[0] || null;
  }, [data?.promotions, nowTs]);
  const sortedReviews = useMemo(() => {
    const list = [...(data?.reviews ?? [])];
    if (reviewsSort === 'useful') {
      return list.sort((a, b) => b.likes - a.likes || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data?.reviews, reviewsSort]);
  const reviewedOrderItemIds = useMemo(() => {
    const s = new Set<number>();
    for (const r of data?.reviews ?? []) {
      if (typeof r.orderItemId === 'number' && r.orderItemId > 0) s.add(r.orderItemId);
    }
    return s;
  }, [data?.reviews]);
  const orderStatusOptions: { value: string; label: string }[] = [
    { value: 'all', label: 'Все статусы' },
    { value: 'processing', label: 'В обработке' },
    { value: 'shipped', label: 'Передан в доставку' },
    { value: 'delivered', label: 'Доставлен' },
    { value: 'completed', label: 'Завершён' },
    { value: 'cancelled', label: 'Отменён' },
    { value: 'return_requested', label: 'Запрошен возврат' },
    { value: 'returned', label: 'Возврат выполнен' },
  ];
  const orderStatusFilterLabel =
    orderStatusOptions.find((o) => o.value === orderStatusFilter)?.label ?? 'Все статусы';

  if (loading && !data) {
    return (
      <div className="flex flex-1 min-h-0 w-full items-center justify-center py-20">
        <p
          className="text-[11px] uppercase tracking-[0.22em] text-gray-400"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          Загрузка кабинета…
        </p>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="flex flex-1 min-h-0 w-full flex-col items-center justify-center py-16 px-4">
        <p className="text-sm text-red-800 mb-6" style={{ fontFamily: 'var(--font-open-sans)' }}>
          {err}
        </p>
        <button
          type="button"
          onClick={load}
          className="text-xs uppercase tracking-widest text-[#0b2a24] border border-[#0b2a24] px-6 py-3 hover:bg-[#0b2a24] hover:text-white transition-colors"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!data) return null;

  const d = data;
  const c = d.cabinetCopy ?? {};
  const navItems = NAV_IDS.map((id) => ({ id, label: c[navCopyKey(id)] ?? id }));
  const promoDiscountPercent = appliedCoupon?.discountPercent ?? (appliedPromoCode ? promoMap.get(appliedPromoCode)?.discountPercent ?? 0 : 0);

  const navItemBase =
    'w-full text-left block text-[10px] uppercase tracking-[0.16em] transition-colors py-2.5 md:py-2 border-l-2 md:-ml-px md:pl-4';
  const navItemInactive = `${navItemBase} text-gray-500 border-transparent hover:text-[#0b2a24] hover:border-[#0b2a24]/40`;
  const navItemActive = `${navItemBase} text-[#0b2a24] border-[#0b2a24] font-medium`;

  const navItemMobileBase =
    'whitespace-nowrap px-3 py-2 text-[10px] uppercase tracking-[0.14em] transition-colors border-b-2';
  const navItemMobileInactive = `${navItemMobileBase} text-gray-500 border-transparent hover:text-[#0b2a24] hover:border-[#0b2a24]/40`;
  const navItemMobileActive = `${navItemMobileBase} text-[#0b2a24] border-[#0b2a24] font-medium`;

  const renderPanel = () => {
    switch (view) {
      case 'cabinet-news': {
        const sk = sectionCopyKeys('cabinet-news');
        return (
          <ViewFrame title={c[sk.titleKey] ?? ''} eyebrow={c[sk.eyebrowKey]}>
            <div className="mb-4 text-[11px] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Сегмент: <strong className="text-[#0b2a24] uppercase">{d.marketing.segment}</strong> · A/B: <strong className="text-[#0b2a24]">{d.marketing.abBucket}</strong>
            </div>
            <div className="mb-5">
              <input
                type="text"
                value={newsQuery}
                onChange={(e) => setNewsQuery(e.target.value)}
                placeholder="Поиск по новостям"
                className="w-full h-10 px-3 border border-gray-300 bg-white text-sm focus:outline-none focus:border-[#0b2a24]"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              />
            </div>
            {loading ? (
              <ul className="space-y-6 animate-pulse">
                {Array.from({ length: 2 }).map((_, i) => (
                  <li key={`news-skeleton-${i}`} className="grid md:grid-cols-2 border border-gray-200/90 overflow-hidden">
                    <div className="aspect-[4/3] bg-gray-200" />
                    <div className="p-6 md:p-8 space-y-3">
                      <div className="h-3 w-28 bg-gray-200" />
                      <div className="h-6 w-3/4 bg-gray-200" />
                      <div className="h-4 w-full bg-gray-200" />
                      <div className="h-4 w-5/6 bg-gray-200" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : filteredNews.length === 0 ? (
              <p
                className="text-sm text-gray-500"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {newsQuery ? 'По запросу ничего не найдено.' : (c.empty_news ?? '')}
              </p>
            ) : (
            <ul className="space-y-10 md:space-y-12">
              {filteredNews.map((n, i) => (
                <li key={n.id}>
                  <article className="grid gap-0 md:grid-cols-2 border border-gray-200/90 overflow-hidden bg-[#faf9f7]/50">
                    <div
                      className={`relative aspect-[4/3] md:aspect-auto md:min-h-[220px] bg-gray-100 ${
                        i % 2 === 1 ? 'md:order-2' : 'md:order-1'
                      }`}
                    >
                      {n.imageUrl ? (
                        <img
                          src={n.imageUrl}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[#0b2a24]/10 to-gray-200" />
                      )}
                    </div>
                    <div
                      className={`p-6 md:p-8 flex flex-col justify-center ${
                        i % 2 === 1 ? 'md:order-1' : 'md:order-2'
                      }`}
                    >
                      <p
                        className="text-[10px] uppercase tracking-widest text-gray-400 mb-3"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {i === 0 ? 'Новинка · ' : ''}{formatDate(n.createdAt)}
                      </p>
                      <h3
                        className="text-lg md:text-xl font-normal italic mb-3"
                        style={{ fontFamily: 'var(--font-playfair-display)' }}
                      >
                        {n.title}
                      </h3>
                      <p
                        className="text-sm text-gray-600 leading-relaxed"
                        style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                      >
                        {n.excerpt}
                      </p>
                      <div className="mt-4">
                        <Link
                          href={n.detailsUrl}
                          onClick={() => {
                            closeCabinetOverlay();
                            trackMarketingEvent('news_open_details', 'news', n.id, { source: 'list' });
                          }}
                          className="inline-block text-[10px] uppercase tracking-[0.14em] px-3 py-2 border border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Читать подробнее
                        </Link>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
            )}
          </ViewFrame>
        );
      }

      case 'cabinet-promo': {
        const sk = sectionCopyKeys('cabinet-promo');
        return (
          <ViewFrame title={c[sk.titleKey] ?? ''} eyebrow={c[sk.eyebrowKey]}>
            {d.bestOffer ? (
              <div className="mb-5 p-4 border border-emerald-300/70 bg-emerald-50/60">
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-800 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Best Offer
                </p>
                <p className="text-sm text-emerald-900" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                  {d.bestOffer.title} {d.bestOffer.discountLabel ? `· ${d.bestOffer.discountLabel}` : ''}
                </p>
                <p className="text-[11px] text-emerald-800 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {d.bestOffer.reason}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.bestOffer.code ? (
                    <button
                      type="button"
                      onClick={() => applyPromoFromPromoSection(d.bestOffer!.code!)}
                      className="text-[10px] uppercase tracking-[0.14em] px-3 py-2 border border-emerald-700 text-emerald-900 hover:bg-emerald-900 hover:text-white transition-colors"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      Применить best offer
                    </button>
                  ) : null}
                  <Link
                    href={d.bestOffer.detailsUrl}
                    onClick={() => {
                      closeCabinetOverlay();
                      trackMarketingEvent('promo_open_details', 'promotion', d.bestOffer!.promotionId, {
                        source: 'best_offer',
                      });
                    }}
                    className="text-[10px] uppercase tracking-[0.14em] px-3 py-2 border border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Детали акции
                  </Link>
                </div>
              </div>
            ) : null}
            {promoOfDay ? (
              <div className="mb-5 p-4 border border-[#0b2a24]/20 bg-[#0b2a24]/[0.04]">
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#0b2a24] mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Акция дня
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                    {promoOfDay.p.title}
                  </p>
                  <p className="text-xs text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    До конца: <strong>{formatCountdown(promoOfDay.ts - nowTs)}</strong>
                  </p>
                </div>
              </div>
            ) : null}
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-[11px] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Действующие персональные предложения
              </p>
              <button
                type="button"
                onClick={() => setPromoOnlyWithCode((v) => !v)}
                className={`text-[10px] uppercase tracking-[0.14em] px-3 py-2 border transition-colors ${
                  promoOnlyWithCode
                    ? 'border-[#0b2a24] bg-[#0b2a24] text-white'
                    : 'border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24]'
                }`}
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Только с кодом
              </button>
            </div>
            {loading ? (
            <div className="grid gap-6 md:grid-cols-2 animate-pulse">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={`promo-skeleton-${i}`} className="p-6 border border-gray-200/90 bg-[#faf9f7] space-y-3">
                  <div className="h-3 w-20 bg-gray-200" />
                  <div className="h-6 w-3/4 bg-gray-200" />
                  <div className="h-4 w-full bg-gray-200" />
                  <div className="h-4 w-2/3 bg-gray-200" />
                  <div className="h-8 w-32 bg-gray-200 mt-4" />
                </div>
              ))}
            </div>
            ) : filteredPromotions.length === 0 ? (
              <p
                className="text-sm text-gray-500"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {promoOnlyWithCode ? 'Промо с кодом сейчас нет.' : (c.empty_promo ?? '')}
              </p>
            ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {filteredPromotions.map((p) => (
                <div
                  key={p.id}
                  className="p-6 bg-[#faf9f7] border border-gray-200/90 flex flex-col"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span
                      className="text-[10px] uppercase tracking-[0.15em] text-[#0b2a24]"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {p.discountLabel || c.promo_fallback_discount || ''}
                    </span>
                    {p.validUntil && (
                      <span className="text-[10px] text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        {tpl(c.promo_valid_until_tpl ?? '', { date: p.validUntil })}
                      </span>
                    )}
                  </div>
                  <h3
                    className="text-lg font-normal italic mb-2"
                    style={{ fontFamily: 'var(--font-playfair-display)' }}
                  >
                    {p.title}
                  </h3>
                  {p.subtitle && (
                    <p
                      className="text-xs text-gray-600 mb-4 flex-1 leading-relaxed"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {p.subtitle}
                    </p>
                  )}
                  {p.code ? (
                    <div className="mt-auto flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyCode(p.code!)}
                        className="text-left text-xs uppercase tracking-widest py-2 px-3 border border-[#0b2a24] text-[#0b2a24] hover:bg-[#0b2a24] hover:text-white transition-colors w-fit"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {copiedCode === p.code
                          ? (c.promo_copied ?? '')
                          : tpl(c.promo_code_label_tpl ?? '', { code: p.code ?? '' })}
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPromoFromPromoSection(p.code!)}
                        className="text-left text-xs uppercase tracking-widest py-2 px-3 border border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors w-fit"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        Применить в корзине
                      </button>
                      <Link
                        href={p.detailsUrl}
                        onClick={() => {
                          closeCabinetOverlay();
                          trackMarketingEvent('promo_open_details', 'promotion', p.id, { source: 'list' });
                        }}
                        className="text-left text-xs uppercase tracking-widest py-2 px-3 border border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors w-fit"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        Подробнее
                      </Link>
                    </div>
                  ) : (
                    <span
                      className="text-[10px] text-gray-400 uppercase tracking-widest mt-auto"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {c.promo_no_code ?? ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
            )}
          </ViewFrame>
        );
      }

      case 'cabinet-orders': {
        const sk = sectionCopyKeys('cabinet-orders');
        return (
          <ViewFrame title={c[sk.titleKey] ?? ''} eyebrow={c[sk.eyebrowKey]}>
            <p
              className="text-xs text-gray-600 mb-6 leading-relaxed max-w-2xl"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {d.volumeLoyalty.spentHint}
            </p>
            <p
              className="text-[11px] text-gray-500 mb-5 leading-relaxed max-w-2xl"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Отмена заказа доступна только до этапа комплектации. В этом случае деньги автоматически возвращаются на карту.
              После комплектации отмена закрывается — после получения можно оформить возврат товара.
            </p>
            <div className="mb-8 p-5 bg-[#0b2a24]/[0.03] border border-[#0b2a24]/15">
              <h3
                className="text-sm font-normal italic mb-3 text-[#0b2a24]"
                style={{ fontFamily: 'var(--font-playfair-display)' }}
              >
                {d.volumeLoyalty.headline}
              </h3>
              <p className="text-xs text-gray-700 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Накоплено по подтверждённым заказам (без отменённых):{' '}
                <strong className="text-[#0b2a24]">{formatRub(d.volumeLoyalty.spentRub)}</strong>
              </p>
              {d.volumeLoyalty.currentTier ? (
                <p className="text-xs text-emerald-800 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {d.volumeLoyalty.currentTier}
                </p>
              ) : (
                <p className="text-xs text-gray-600 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Скидка по объёму начнёт действовать после первого оформленного заказа с известной суммой в истории.
                </p>
              )}
              {d.volumeLoyalty.rubToNextTier != null &&
              d.volumeLoyalty.rubToNextTier > 0 &&
              d.volumeLoyalty.nextTierLabel ? (
                <p className="text-[11px] text-gray-500 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  До уровня «{d.volumeLoyalty.nextTierLabel}»
                  {d.volumeLoyalty.nextTierPercent != null ? ` (${d.volumeLoyalty.nextTierPercent}%)` : ''} осталось{' '}
                  {formatRub(d.volumeLoyalty.rubToNextTier)}.
                </p>
              ) : null}
              <ul className="space-y-2">
                {d.volumeLoyalty.tiers.map((t) => {
                  const achieved = d.volumeLoyalty.spentRub >= t.fromRub;
                  return (
                    <li
                      key={t.id}
                      className={`flex justify-between text-xs ${achieved ? 'text-[#0b2a24] font-medium' : 'text-gray-700'}`}
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      <span>
                        {tpl(c.loyalty_row_left_tpl ?? '{label}', { label: t.label })}
                        {achieved ? ' ✓' : ''}
                      </span>
                      <span className={achieved ? 'text-emerald-800' : 'text-[#0b2a24] font-medium'}>
                        {tpl(c.loyalty_row_right_tpl ?? '{percent}', { percent: t.percent })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Поиск по номеру, сумме или лоту"
                className="sm:col-span-2 h-10 px-3 border border-gray-300 bg-white text-sm focus:outline-none focus:border-[#0b2a24]"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              />
              <div className="relative" ref={orderStatusMenuRef}>
                <button
                  type="button"
                  onClick={() => setOrderStatusMenuOpen((v) => !v)}
                  className="w-full h-10 px-3 border border-gray-300 bg-white text-sm focus:outline-none focus:border-[#0b2a24] text-left flex items-center justify-between"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                  aria-haspopup="listbox"
                  aria-expanded={orderStatusMenuOpen}
                >
                  <span className="truncate">{orderStatusFilterLabel}</span>
                  <span className={`ml-2 text-xs transition-transform ${orderStatusMenuOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {orderStatusMenuOpen ? (
                  <div className="absolute z-20 mt-1 w-full border border-gray-300 bg-white shadow-lg">
                    <ul role="listbox" className="max-h-64 overflow-auto py-1">
                      {orderStatusOptions.map((opt) => {
                        const active = opt.value === orderStatusFilter;
                        return (
                          <li key={opt.value}>
                            <button
                              type="button"
                              onClick={() => {
                                setOrderStatusFilter(opt.value);
                                setOrderStatusMenuOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                active ? 'bg-[#0b2a24] text-white' : 'text-gray-700 hover:bg-gray-100'
                              }`}
                              style={{ fontFamily: 'var(--font-open-sans)' }}
                              role="option"
                              aria-selected={active}
                            >
                              {opt.label}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
            {filteredOrders.length === 0 ? (
              <p className="text-sm text-gray-500 italic" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                {orderSearch || orderStatusFilter !== 'all' ? 'Заказы не найдены по фильтру.' : (c.empty_orders ?? '')}
              </p>
            ) : (
              <ul className="space-y-4">
                {filteredOrders.map((o) => {
                  const tone = orderStatusTone(o.status);
                  const timeline = [
                    { key: 'created', label: 'Создан', date: o.createdAt, active: true },
                    {
                      key: 'pack',
                      label: 'Комплектация',
                      date: addDays(o.createdAt, 1),
                      active: o.status !== 'cancelled',
                    },
                    {
                      key: 'shipping',
                      label: 'Доставка',
                      date: addDays(o.createdAt, 3),
                      active: ['shipped', 'delivered', 'completed', 'return_requested', 'returned'].includes(o.status),
                    },
                    {
                      key: 'finish',
                      label: 'Завершение',
                      date: addDays(o.createdAt, Math.max(4, o.etaDays ?? 5)),
                      active: ['completed', 'delivered', 'return_requested', 'returned'].includes(o.status),
                    },
                  ];
                  const orderSavingsRub = (o.discountRub ?? 0) + (o.loyaltyDiscountRub ?? 0);
                  const hasDiscountBreakdown = orderSavingsRub > 0 && o.subtotalDisplay;
                  return (
                  <li key={o.id} className={`border border-gray-200/90 bg-white/70 ${tone.card}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId((prev) => (prev === o.id ? null : o.id))}
                      className="w-full px-4 py-4 sm:px-5 text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        {hasDiscountBreakdown ? (
                          <div className="flex flex-wrap items-baseline gap-2">
                            <p
                              className="text-xs text-gray-600 line-through sm:text-gray-400"
                              style={{ fontFamily: 'var(--font-open-sans)' }}
                            >
                              {o.subtotalDisplay}
                            </p>
                            <p className="text-sm" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                              {o.total}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                            {o.total}
                          </p>
                        )}
                        {o.loyaltyDiscountRub > 0 ? (
                          <p className="text-[11px] text-emerald-800 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            Скидка за объём: −{formatRub(o.loyaltyDiscountRub)}
                            {o.loyaltyPercent > 0 ? ` (${o.loyaltyPercent}%)` : ''}
                          </p>
                        ) : null}
                        {o.discountPercent > 0 ? (
                          <p className="text-[11px] text-emerald-700 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            Промокод {o.couponCode ? `${o.couponCode}: ` : ''}−{o.discountPercent}% (−{formatRub(o.discountRub)})
                          </p>
                        ) : null}
                        {o.summary ? (
                          <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            {o.summary}
                          </p>
                        ) : null}
                        {o.reference ? (
                          <p className="text-[11px] text-gray-600 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            {c.orders_ref_prefix ?? 'Заказ: '}
                            <strong className="text-[#0b2a24]">{o.reference}</strong>
                          </p>
                        ) : null}
                      </div>
                      <div className="sm:text-right">
                        <span
                          className={`inline-flex text-[10px] uppercase tracking-[0.13em] px-2.5 py-1 border ${tone.badge}`}
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          {orderStatusLabel(o.status)}
                        </span>
                        <p className="text-xs text-gray-500 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {formatDate(o.createdAt)}
                        </p>
                      </div>
                    </button>

                    {expandedOrderId === o.id ? (
                      <div className="border-t border-gray-200/90 px-4 py-4 sm:px-5 sm:py-5 space-y-5">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            Путь заказа
                          </p>
                          <div className="h-2 bg-gray-100 border border-gray-200 relative">
                            <div
                              className="h-full"
                              style={{
                                width: `${Math.max(0, Math.min(100, o.progressPercent))}%`,
                                backgroundColor: tone.progress,
                              }}
                            />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-gray-500 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            {timeline.map((s) => (
                              <div key={s.key} className="min-w-0">
                                <p className={s.active ? 'text-[#0b2a24]' : ''}>{s.label}</p>
                                <p className="truncate">{formatDate(s.date)}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="text-xs text-gray-600 space-y-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            <p>
                              Трек-номер (СДЭК):{' '}
                              <strong className="text-[#0b2a24]">{o.trackingNumber || 'Будет присвоен'}</strong>
                            </p>
                            {o.trackingNumber ? (
                              <p>
                                <a
                                  href={`https://www.cdek.ru/tracking?order_id=${encodeURIComponent(o.trackingNumber)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#0b2a24] underline underline-offset-2"
                                >
                                  Отследить на сайте СДЭК
                                </a>
                              </p>
                            ) : null}
                            {o.deliveryRub != null && o.deliveryRub > 0 ? (
                              <p>
                                Стоимость доставки:{' '}
                                <strong className="text-[#0b2a24]">{formatRub(o.deliveryRub)}</strong>
                              </p>
                            ) : null}
                            {o.deliveryMode ? (
                              <p>
                                Способ доставки:{' '}
                                <strong className="text-[#0b2a24]">
                                  {o.deliveryMode === 'pvz' ? 'Пункт выдачи СДЭК' : 'Курьер СДЭК'}
                                </strong>
                                {o.cdekPvzCode ? ` · код ПВЗ ${o.cdekPvzCode}` : ''}
                              </p>
                            ) : null}
                            {o.cdekError ? (
                              <p className="text-amber-900 bg-amber-50/80 border border-amber-200/80 px-2 py-1.5 rounded-sm">
                                Заказ создан; передача в СДЭК потребует внимания менеджера: {o.cdekError}
                              </p>
                            ) : null}
                            <p>
                              Осталось до доставки:{' '}
                              <strong className="text-[#0b2a24]">
                                {o.etaDays != null ? `${o.etaDays} дн.` : 'Уточняется'}
                              </strong>
                            </p>
                            <p>
                              Получатель: <strong className="text-[#0b2a24]">{o.customer.name || '—'}</strong>
                            </p>
                            <p>
                              Контакт: <strong className="text-[#0b2a24]">{o.customer.phone || '—'}</strong>
                            </p>
                          </div>
                          <div className="text-xs text-gray-600 space-y-1.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            <p>
                              Адрес: <strong className="text-[#0b2a24]">{`${o.delivery.city}, ${o.delivery.street}, ${o.delivery.house}`}</strong>
                            </p>
                            {o.delivery.apartment ? (
                              <p>
                                Кв./офис: <strong className="text-[#0b2a24]">{o.delivery.apartment}</strong>
                              </p>
                            ) : null}
                            {o.delivery.postalCode ? (
                              <p>
                                Индекс: <strong className="text-[#0b2a24]">{o.delivery.postalCode}</strong>
                              </p>
                            ) : null}
                            {o.delivery.comment ? (
                              <p>
                                Комментарий: <strong className="text-[#0b2a24]">{o.delivery.comment}</strong>
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {o.status === 'cancelled' ? (
                          <div
                            className="text-xs border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2.5"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            Возврат средств на карту оформлен
                            {o.refundedAt ? ` · ${formatDate(o.refundedAt)}` : ''}.
                          </div>
                        ) : null}

                        <div>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            Позиции
                          </p>
                          <ul className="space-y-2">
                            {o.items.map((item) => (
                              <li key={item.id} className="flex items-center gap-3 border border-gray-100 p-2.5">
                                <div className="w-12 h-12 bg-gray-100 overflow-hidden shrink-0">
                                  {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : null}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm truncate" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                                    {item.lotName}
                                  </p>
                                  <p className="text-[11px] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                                    {item.unitPrice} · {item.quantity} шт.
                                  </p>
                                  {o.status === 'completed' ? (
                                    reviewedOrderItemIds.has(item.id) ? (
                                      <p className="text-[10px] text-emerald-700 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                                        Отзыв по товару уже оставлен
                                      </p>
                                    ) : (
                                      <div className="mt-2 space-y-2">
                                        <p className="text-[10px] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                                          Оценка
                                        </p>
                                        <div className="flex items-center gap-0.5" role="group" aria-label="Оценка от 1 до 5">
                                          {[1, 2, 3, 4, 5].map((star) => {
                                            const selected = (reviewRatingByOrderItem[item.id] ?? 0) >= star;
                                            return (
                                              <button
                                                key={star}
                                                type="button"
                                                aria-label={`${star} из 5`}
                                                aria-pressed={selected}
                                                onClick={() =>
                                                  setReviewRatingByOrderItem((prev) => ({
                                                    ...prev,
                                                    [item.id]: star,
                                                  }))
                                                }
                                                className="p-1 min-w-9 min-h-9 flex items-center justify-center text-2xl leading-none text-[#0b2a24] hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2a24]/40 rounded"
                                              >
                                                <span className={selected ? 'text-[#0b2a24]' : 'text-gray-300'}>★</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                        {reviewRatingByOrderItem[item.id] == null ? (
                                          <p className="text-[10px] text-amber-800/90" style={{ fontFamily: 'var(--font-open-sans)' }}>
                                            Нажмите на звёзды, чтобы выбрать оценку
                                          </p>
                                        ) : null}
                                        <textarea
                                          value={reviewDraftByOrderItem[item.id] || ''}
                                          onChange={(e) =>
                                            setReviewDraftByOrderItem((prev) => ({
                                              ...prev,
                                              [item.id]: e.target.value,
                                            }))
                                          }
                                          placeholder="Оставьте отзыв о товаре (минимум 5 символов)"
                                          className="w-full min-h-16 px-2.5 py-2 border border-gray-300 bg-white text-xs focus:outline-none focus:border-[#0b2a24] resize-y"
                                          style={{ fontFamily: 'var(--font-open-sans)' }}
                                        />
                                        <button
                                          type="button"
                                          disabled={
                                            reviewSendingOrderItemId === item.id ||
                                            reviewRatingByOrderItem[item.id] == null ||
                                            reviewRatingByOrderItem[item.id]! < 1 ||
                                            (reviewDraftByOrderItem[item.id] || '').trim().length < 5
                                          }
                                          onClick={() => void submitOrderItemReview(o.id, item.id)}
                                          className="text-[10px] uppercase tracking-[0.14em] px-3 py-2 border border-[#0b2a24] text-[#0b2a24] hover:bg-[#0b2a24] hover:text-white transition-colors disabled:opacity-40"
                                          style={{ fontFamily: 'var(--font-open-sans)' }}
                                        >
                                          {reviewSendingOrderItemId === item.id ? 'Сохраняем...' : 'Оставить отзыв'}
                                        </button>
                                      </div>
                                    )
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={orderActionLoadingId === o.id}
                            onClick={() => void buyAgainAndCheckout(o.id)}
                            className="text-[10px] uppercase tracking-[0.14em] px-4 py-2.5 border border-[#0b2a24] bg-[#0b2a24] text-white hover:bg-transparent hover:text-[#0b2a24] transition-colors disabled:opacity-40"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            Купить снова
                          </button>
                          <button
                            type="button"
                            disabled={orderActionLoadingId === o.id}
                            onClick={() => void orderAction(o.id, 'repeat')}
                            className="text-[10px] uppercase tracking-[0.14em] px-4 py-2.5 border border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors disabled:opacity-40"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            Повторить заказ
                          </button>
                          {o.canCancel ? (
                            <button
                              type="button"
                              disabled={orderActionLoadingId === o.id}
                              onClick={() => void orderAction(o.id, 'cancel')}
                              className="text-[10px] uppercase tracking-[0.14em] px-4 py-2.5 border border-red-300 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
                              style={{ fontFamily: 'var(--font-open-sans)' }}
                            >
                              Отменить заказ
                            </button>
                          ) : null}
                          {o.canReturn ? (
                            <button
                              type="button"
                              disabled={orderActionLoadingId === o.id}
                              onClick={() => void orderAction(o.id, 'return')}
                              className="text-[10px] uppercase tracking-[0.14em] px-4 py-2.5 border border-[#0b2a24] text-[#0b2a24] hover:bg-[#0b2a24] hover:text-white transition-colors disabled:opacity-40"
                              style={{ fontFamily: 'var(--font-open-sans)' }}
                            >
                              Вернуть заказ
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
                })}
              </ul>
            )}
          </ViewFrame>
        );
      }

      case 'cabinet-cart': {
        const sk = sectionCopyKeys('cabinet-cart');
        const cartTotals = summarizeCartTotals(d.cart);
        const volumePct = d.volumeLoyalty.activePercent ?? 0;
        const loyaltyRub =
          volumePct > 0 && cartTotals.sumRub > 0
            ? loyaltyDiscountRubFromSubtotal(cartTotals.sumRub, volumePct)
            : 0;
        const couponRub =
          promoDiscountPercent > 0 ? Math.floor((cartTotals.sumRub * promoDiscountPercent) / 100) : 0;
        const totalAfterDiscount = Math.max(0, cartTotals.sumRub - loyaltyRub - couponRub);
        return (
          <ViewFrame title={c[sk.titleKey] ?? ''} eyebrow={c[sk.eyebrowKey]}>
            {appliedCoupon ? (
              <div
                className="mb-5 p-4 border border-emerald-200 bg-emerald-50/90"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-800 mb-1">
                  Купон активирован
                </p>
                <p className="text-sm text-emerald-950">
                  <span className="font-medium">{appliedCoupon.title}</span>
                  {' · '}
                  код <code className="text-[13px] bg-white/80 px-1.5 py-0.5">{appliedCoupon.code}</code>
                  {' · '}
                  скидка <strong>{appliedCoupon.discountPercent}%</strong>
                </p>
                <p className="text-xs text-emerald-800/90 mt-2 leading-relaxed">
                  {d.cart.length === 0
                    ? 'Добавьте товар в корзину — скидка автоматически учтётся при оплате.'
                    : 'Скидка будет учтена в итоге заказа ниже.'}
                </p>
                {appliedCoupon.minTotalRub > 0 ? (
                  <p className="text-[11px] text-emerald-800/80 mt-1">
                    Минимальная сумма заказа: {formatRub(appliedCoupon.minTotalRub)}
                  </p>
                ) : null}
              </div>
            ) : couponLoading ? (
              <p className="mb-4 text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Проверяем купон из QR…
              </p>
            ) : null}
            {d.cart.length === 0 ? (
              <p className="text-sm text-gray-500 mb-4" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {c.empty_cart ?? ''}
              </p>
            ) : (
              <ul className="space-y-4">
                {d.cart.map((row) => (
                  <li
                    key={cartLineKey(row.auctionId, row.variantId)}
                    className="border border-gray-100 p-3 sm:p-4"
                  >
                    {/* Верхняя строка: фото + название + цена. На всех экранах одинаково. */}
                    <Link
                      href={`/collection/${row.auctionId}`}
                      onClick={closeCabinetOverlay}
                      className="flex gap-3 sm:gap-4 items-start hover:opacity-90 transition-opacity"
                    >
                      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 shrink-0 overflow-hidden">
                        {row.image ? (
                          <img
                            src={row.image}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className="text-sm sm:text-base line-clamp-2 block leading-snug"
                          style={{ fontFamily: 'var(--font-playfair-display)' }}
                        >
                          {row.lotName}
                        </span>
                        {row.variantSummary ? (
                          <span
                            className="text-[11px] text-gray-500 mt-1 block tracking-wide"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            {row.variantSummary}
                          </span>
                        ) : null}
                        <p
                          className="text-xs sm:text-sm text-gray-700 mt-2 font-medium"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          {row.price} ₽
                        </p>
                      </div>
                    </Link>

                    {/* Нижняя строка: счётчик + действия. На мобиле растягивается на ширину. */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2 sm:gap-3">
                      <div className="flex h-9 border border-gray-300 bg-white shrink-0">
                        <button
                          type="button"
                          aria-label="Меньше"
                          disabled={cartQtyLoadingKey === cartLineKey(row.auctionId, row.variantId)}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void updateCartQuantity(row.auctionId, row.quantity - 1, row.variantId ?? '');
                          }}
                          className="flex w-9 items-center justify-center text-base text-gray-800 hover:bg-gray-50 disabled:opacity-40 transition-colors border-r border-gray-300 leading-none"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          disabled={cartQtyLoadingKey === cartLineKey(row.auctionId, row.variantId)}
                          value={row.quantity}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (Number.isNaN(v)) return;
                            void updateCartQuantity(row.auctionId, v, row.variantId ?? '');
                          }}
                          className="w-12 h-full px-0 py-0 text-center text-sm tabular-nums text-gray-900 border-0 outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-40"
                        />
                        <button
                          type="button"
                          aria-label="Больше"
                          disabled={cartQtyLoadingKey === cartLineKey(row.auctionId, row.variantId)}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void updateCartQuantity(row.auctionId, row.quantity + 1, row.variantId ?? '');
                          }}
                          className="flex w-9 items-center justify-center text-base text-gray-800 hover:bg-gray-50 disabled:opacity-40 transition-colors border-l border-gray-300 leading-none"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={cartQtyLoadingKey === cartLineKey(row.auctionId, row.variantId)}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void removeFromCart(row.auctionId, row.variantId ?? '');
                        }}
                        className="flex-1 min-w-[110px] h-9 text-[10px] uppercase tracking-widest text-gray-500 border border-gray-300 px-3 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors disabled:opacity-40"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {c.cart_remove ?? 'Убрать'}
                      </button>
                      <button
                        type="button"
                        disabled={cartQtyLoadingKey === cartLineKey(row.auctionId, row.variantId)}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void moveCartToFavorites(row.auctionId, row.variantId ?? '');
                        }}
                        className="flex-1 min-w-[110px] h-9 text-[10px] uppercase tracking-widest text-[#0b2a24] border border-[#0b2a24]/40 px-3 hover:border-[#0b2a24] hover:bg-[#0b2a24]/5 transition-colors disabled:opacity-40"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        В избранное
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 pt-5 border-t border-gray-200/90">
                <div className="mb-5 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="Промокод"
                    className="h-10 px-3 border border-gray-300 bg-white text-sm focus:outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                  <button
                    type="button"
                    disabled={couponLoading}
                    onClick={() => {
                      const code = promoCodeInput.trim().toUpperCase();
                      if (!code) {
                        setAppliedPromoCode('');
                        setAppliedCoupon(null);
                        clearAppliedCouponStorage();
                        pushToast('Промокод очищен', 'info');
                        return;
                      }
                      setCouponLoading(true);
                      void fetch('/api/cabinet/coupons/validate', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, totalRub: cartTotals.sumRub }),
                      })
                        .then(async (res) => {
                          if (!res.ok) {
                            const j = (await res.json().catch(() => ({}))) as { error?: string };
                            pushToast(j.error || 'Купон недоступен', 'error');
                            return;
                          }
                          const j = (await res.json()) as {
                            coupon?: StoredAppliedCoupon;
                          };
                          if (j.coupon) {
                            if (appliedCoupon && appliedCoupon.code !== j.coupon.code) {
                              pushToast(`Купон заменён: ${appliedCoupon.code} -> ${j.coupon.code}`, 'info');
                            }
                            setAppliedCoupon(j.coupon);
                            setAppliedPromoCode(j.coupon.code);
                            persistAppliedCouponStorage(j.coupon);
                            pushToast(`Купон применён: ${j.coupon.title}`, 'success');
                            return;
                          }
                          const fallback = promoMap.get(code);
                          if (!fallback) {
                            pushToast('Купон не найден', 'error');
                            return;
                          }
                          if (appliedCoupon && appliedCoupon.code !== code) {
                            pushToast(`Купон заменён: ${appliedCoupon.code} -> ${code}`, 'info');
                          }
                          const promoCoupon: StoredAppliedCoupon = {
                            code,
                            title: 'Промо',
                            discountPercent: fallback.discountPercent,
                            minTotalRub: 0,
                            expiresAt: null,
                          };
                          setAppliedPromoCode(code);
                          setAppliedCoupon(promoCoupon);
                          persistAppliedCouponStorage(promoCoupon);
                          pushToast('Промокод применён', 'success');
                        })
                        .finally(() => setCouponLoading(false));
                    }}
                    className="h-10 px-4 border border-[#0b2a24] text-[#0b2a24] text-[10px] uppercase tracking-[0.14em] hover:bg-[#0b2a24] hover:text-white transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    {couponLoading ? 'Проверка...' : 'Применить'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mb-5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  На один заказ можно применить только одну акцию/купон.
                </p>
                {d.cart.length > 0 && (cartTotals.sumRub > 0 || cartTotals.allPricesKnown) ? (
                  <>
                    <p
                      className="text-xl sm:text-2xl font-normal tracking-wide text-[#0b2a24]"
                      style={{ fontFamily: 'var(--font-playfair-display)' }}
                    >
                      {(c.cart_total_label ?? 'Итого').trim()}
                      {': '}
                      <span className="whitespace-nowrap">{formatRub(cartTotals.sumRub)}</span>
                    </p>
                    {loyaltyRub > 0 ? (
                      <p className="text-xs text-emerald-800 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Скидка за объём покупок: {volumePct}% (−{formatRub(loyaltyRub)})
                      </p>
                    ) : null}
                    {appliedCoupon && promoDiscountPercent > 0 ? (
                      <p className="text-xs text-emerald-700 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Промокод `{appliedCoupon.code}`: скидка {promoDiscountPercent}% (−{formatRub(couponRub)})
                      </p>
                    ) : null}
                    {loyaltyRub + couponRub > 0 ? (
                      <>
                        <div className="mt-1 flex flex-wrap items-baseline gap-2">
                          <span
                            className="text-sm text-gray-600 line-through sm:text-gray-400"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            {formatRub(cartTotals.sumRub)}
                          </span>
                          <span
                            className="text-lg text-[#0b2a24]"
                            style={{ fontFamily: 'var(--font-playfair-display)' }}
                          >
                            {formatRub(totalAfterDiscount)}
                          </span>
                        </div>
                        {appliedCoupon && promoDiscountPercent > 0 ? (
                          <p className="text-[11px] text-gray-500 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            Учтена акция по купону: {appliedCoupon.title}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {!cartTotals.allPricesKnown ? (
                      <p
                        className="text-[10px] text-gray-500 mt-2 max-w-xl leading-relaxed"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {c.cart_total_partial_note ?? ''}
                      </p>
                    ) : null}
                  </>
                ) : d.cart.length > 0 ? (
                  <p
                    className="text-xs text-gray-500 max-w-xl leading-relaxed"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    {c.cart_total_unavailable ?? ''}
                  </p>
                ) : null}
              </div>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
              {d.cart.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      closeCabinetOverlay();
                      try {
                        sessionStorage.removeItem('cl_payment_success');
                      } catch {
                        /* ignore */
                      }
                      window.dispatchEvent(new CustomEvent('paymentFlowForceFresh'));
                      router.push('/payment');
                    }}
                    className="inline-flex justify-center items-center px-8 py-4 bg-[#0b2a24] text-white border border-[#0b2a24] text-[11px] uppercase tracking-[0.14em] hover:bg-transparent hover:text-[#0b2a24] transition-colors text-center cursor-pointer"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    {c.cart_checkout ?? 'Перейти к оплате'}
                  </button>
                  <button
                    type="button"
                    disabled={clearCartLoading}
                    onClick={() => void clearCart()}
                    className="inline-flex justify-center items-center px-6 py-4 border border-gray-300 text-[10px] uppercase tracking-[0.14em] text-gray-600 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors disabled:opacity-40"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Очистить корзину
                  </button>
                </>
              ) : null}
              <Link
                href="/collection"
                onClick={closeCabinetOverlay}
                className="inline-block text-[10px] uppercase tracking-[0.15em] text-[#0b2a24] border-b border-[#0b2a24] pb-0.5 self-start sm:self-center"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {c.link_catalog ?? ''}
              </Link>
            </div>
            {d.suggested.length > 0 ? (
              <div className="mt-8 pt-6 border-t border-gray-200/90">
                <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Похожие товары
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {d.suggested.slice(0, 4).map((s) => (
                    <li key={`cart-s-${s.auctionId}`} className="border border-gray-100 p-2.5">
                      <Link href={`/collection/${s.auctionId}`} onClick={closeCabinetOverlay} className="flex items-center gap-3 hover:opacity-90 transition-opacity">
                        <div className="w-12 h-12 bg-gray-100 overflow-hidden">{s.image ? <img src={s.image} alt="" className="w-full h-full object-cover" /> : null}</div>
                        <div className="min-w-0">
                          <p className="text-sm truncate" style={{ fontFamily: 'var(--font-playfair-display)' }}>{s.lotName}</p>
                          <p className="text-[11px] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>{s.price}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ViewFrame>
        );
      }

      case 'cabinet-reviews': {
        const sk = sectionCopyKeys('cabinet-reviews');
        const totalLikes = sortedReviews.reduce((acc, r) => acc + r.likes, 0);
        const totalDislikes = sortedReviews.reduce((acc, r) => acc + r.dislikes, 0);
        return (
          <ViewFrame title={c[sk.titleKey] ?? ''} eyebrow={c[sk.eyebrowKey]}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-gray-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Рейтинг откликов: <strong className="text-[#0b2a24]">{totalLikes}</strong> полезных ·{' '}
                <strong>{totalDislikes}</strong> нейтральных
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReviewsSort('new')}
                  className={`text-[10px] uppercase tracking-[0.14em] px-3 py-2 border ${
                    reviewsSort === 'new'
                      ? 'border-[#0b2a24] bg-[#0b2a24] text-white'
                      : 'border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24]'
                  }`}
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Сначала новые
                </button>
                <button
                  type="button"
                  onClick={() => setReviewsSort('useful')}
                  className={`text-[10px] uppercase tracking-[0.14em] px-3 py-2 border ${
                    reviewsSort === 'useful'
                      ? 'border-[#0b2a24] bg-[#0b2a24] text-white'
                      : 'border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24]'
                  }`}
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Сначала полезные
                </button>
              </div>
            </div>
            {sortedReviews.length === 0 ? (
              <p className="text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {c.empty_reviews ?? ''}
              </p>
            ) : (
              <ul className="space-y-10">
                {sortedReviews.map((r) => (
                  <li key={r.id} className="border-b border-gray-100 pb-10 last:border-0">
                    <p
                      className="text-[10px] uppercase tracking-widest text-gray-400 mb-2"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {formatDate(r.createdAt)} · {r.lotTitle}
                    </p>
                    {r.rating != null && r.rating >= 1 && r.rating <= 5 ? (
                      <p className="text-base tracking-[0.2em] text-[#0b2a24] mb-2" aria-hidden>
                        {'★'.repeat(r.rating)}
                        {'☆'.repeat(5 - r.rating)}
                      </p>
                    ) : null}
                    {r.moderationHidden ? (
                      <div
                        className="mb-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        Отзыв скрыт с сайта модератором и не показывается другим покупателям.
                        {r.moderationReason ? (
                          <>
                            {' '}
                            Комментарий: <span className="italic">{r.moderationReason}</span>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <p
                      className="text-sm text-gray-800 leading-relaxed mb-4"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {r.text}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      <button
                        type="button"
                        disabled={reviewDeletingId === r.id}
                        onClick={() => void deleteOwnReview(r.id)}
                        className="text-[10px] uppercase tracking-[0.14em] border border-gray-300 px-3 py-2 text-gray-700 hover:border-red-800 hover:text-red-900 transition-colors disabled:opacity-40"
                      >
                        {reviewDeletingId === r.id ? 'Удаление…' : 'Удалить мой отзыв'}
                      </button>
                      <span>
                        {c.reviews_likes ?? ''}{' '}
                        <strong className="text-[#0b2a24]">{r.likes}</strong>
                      </span>
                      <span>
                        {c.reviews_dislikes ?? ''}{' '}
                        <strong className="text-gray-700">{r.dislikes}</strong>
                      </span>
                    </div>
                    {r.replies.length > 0 && (
                      <div className="mt-4 pl-4 border-l-2 border-[#0b2a24]/20 space-y-3">
                        <p className="text-[10px] uppercase tracking-widest text-gray-400">
                          {c.reviews_reply_heading ?? ''}
                        </p>
                        {r.replies.map((rep) => (
                          <div key={rep.id}>
                            <p className="text-xs text-gray-700 leading-relaxed">{rep.text}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{formatDate(rep.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ViewFrame>
        );
      }

      case 'cabinet-favorites': {
        const sk = sectionCopyKeys('cabinet-favorites');
        return (
          <ViewFrame title={c[sk.titleKey] ?? ''} eyebrow={c[sk.eyebrowKey]}>
            <p
              className="text-sm text-gray-600 leading-relaxed max-w-xl mb-6"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {c.favorites_body ?? ''}
            </p>
            {d.favorites.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFavorites((prev) => {
                      const allSelected = d.favorites.every((f) => !!prev[f.auctionId]);
                      const next: Record<number, boolean> = {};
                      for (const f of d.favorites) next[f.auctionId] = !allSelected;
                      return next;
                    })
                  }
                  className="text-[10px] uppercase tracking-[0.14em] px-3 py-2 border border-gray-300 text-gray-700 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Выбрать всё
                </button>
                <button
                  type="button"
                  disabled={bulkFavoritesLoading}
                  onClick={() => void addSelectedFavoritesToCart()}
                  className="text-[10px] uppercase tracking-[0.14em] px-3 py-2 border border-[#0b2a24] bg-[#0b2a24] text-white hover:bg-transparent hover:text-[#0b2a24] transition-colors disabled:opacity-40"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {bulkFavoritesLoading ? 'Добавляем...' : 'Добавить выбранное в корзину'}
                </button>
              </div>
            ) : null}
            {d.favorites.length === 0 ? (
              <p className="text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                {c.favorites_empty ?? ''}
              </p>
            ) : (
              <ul className="space-y-4">
                {d.favorites.map((f) => {
                  const qty = getFavoriteQty(f.auctionId);
                  const loading = favAddLoadingId === f.auctionId;
                  const justAdded = favAddedFeedback?.auctionId === f.auctionId;
                  return (
                  <li
                    key={f.auctionId}
                    className={`flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-stretch border p-3 transition-all duration-500 ease-out ${
                      justAdded
                        ? 'border-[#0b2a24] bg-[#0b2a24]/[0.06] shadow-[0_8px_24px_-12px_rgba(11,42,36,0.35)] scale-[1.01]'
                        : 'border-gray-100'
                    }`}
                  >
                    <label className="self-center shrink-0">
                      <input
                        type="checkbox"
                        checked={!!selectedFavorites[f.auctionId]}
                        onChange={(e) =>
                          setSelectedFavorites((prev) => ({
                            ...prev,
                            [f.auctionId]: e.target.checked,
                          }))
                        }
                        className="w-4 h-4"
                        style={{ accentColor: '#0b2a24' }}
                      />
                    </label>
                    <Link
                      href={`/collection/${f.auctionId}`}
                      onClick={closeCabinetOverlay}
                      className="flex flex-1 min-w-0 gap-4 items-center text-left hover:opacity-90 transition-opacity"
                    >
                      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 shrink-0 overflow-hidden">
                        {f.image ? (
                          <img
                            src={f.image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className="text-sm line-clamp-2 block"
                          style={{ fontFamily: 'var(--font-playfair-display)' }}
                        >
                          {f.lotName}
                        </span>
                        <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          {f.price}
                        </p>
                      </div>
                    </Link>
                    <div
                      className="flex w-full sm:w-[158px] shrink-0 flex-col gap-2 justify-center"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      <p className="text-[9px] uppercase tracking-[0.14em] text-gray-500 text-left leading-none">
                        {c.favorites_qty_label ?? 'Кол-во'}
                      </p>
                      <div className="flex h-10 w-full border border-gray-300 bg-white">
                        <button
                          type="button"
                          aria-label="Меньше"
                          disabled={loading}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFavoriteQty(f.auctionId, qty - 1);
                          }}
                          className="flex flex-1 items-center justify-center text-base text-gray-800 hover:bg-gray-50 disabled:opacity-40 transition-colors border-r border-gray-300 leading-none"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          disabled={loading}
                          value={qty}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (Number.isNaN(v)) setFavoriteQty(f.auctionId, 1);
                            else setFavoriteQty(f.auctionId, v);
                          }}
                          className="flex-1 min-w-0 h-full px-0 py-0 text-center text-sm tabular-nums text-gray-900 border-0 outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-40"
                        />
                        <button
                          type="button"
                          aria-label="Больше"
                          disabled={loading}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFavoriteQty(f.auctionId, qty + 1);
                          }}
                          className="flex flex-1 items-center justify-center text-base text-gray-800 hover:bg-gray-50 disabled:opacity-40 transition-colors border-l border-gray-300 leading-none"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void addFavoriteToCart(f.auctionId);
                        }}
                        className={`w-full text-[10px] uppercase tracking-widest py-2.5 px-2 border transition-all duration-300 ${
                          justAdded
                            ? 'bg-white text-[#0b2a24] border-[#0b2a24]'
                            : 'bg-[#0b2a24] text-white border-[#0b2a24] hover:bg-transparent hover:text-[#0b2a24]'
                        } disabled:opacity-50`}
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {loading
                          ? (c.favorites_adding ?? 'Добавляем…')
                          : justAdded
                            ? `✓ ${c.favorites_added_ok ?? 'Готово'}`
                            : (c.favorites_add_to_cart ?? 'В корзину')}
                      </button>
                      {justAdded && favAddedFeedback ? (
                        <p
                          className="text-[10px] text-[#0b2a24] leading-snug"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          {tpl(c.favorites_added_detail_tpl ?? '', {
                            added: favAddedFeedback.addedQty,
                            total: favAddedFeedback.totalInCart,
                          })}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void removeFavorite(f.auctionId);
                        }}
                        className="w-full text-[10px] uppercase tracking-widest text-gray-500 border border-gray-300 py-2 px-2 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors disabled:opacity-40"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {c.favorites_remove ?? 'Убрать'}
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
            {d.suggested.length > 0 ? (
              <div className="mt-8 pt-6 border-t border-gray-200/90">
                <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Похожие товары
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {d.suggested.slice(0, 4).map((s) => (
                    <li key={`fav-s-${s.auctionId}`} className="border border-gray-100 p-2.5">
                      <Link href={`/collection/${s.auctionId}`} onClick={closeCabinetOverlay} className="flex items-center gap-3 hover:opacity-90 transition-opacity">
                        <div className="w-12 h-12 bg-gray-100 overflow-hidden">{s.image ? <img src={s.image} alt="" className="w-full h-full object-cover" /> : null}</div>
                        <div className="min-w-0">
                          <p className="text-sm truncate" style={{ fontFamily: 'var(--font-playfair-display)' }}>{s.lotName}</p>
                          <p className="text-[11px] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>{s.price}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </ViewFrame>
        );
      }

      case 'cabinet-concierge': {
        const sk = sectionCopyKeys('cabinet-concierge');
        const topics = d.conciergeTopics || [];
        const tickets = d.conciergeTickets || [];
        const selectedTicket = conciergeTicketDetails?.ticket || null;
        return (
          <ViewFrame title={c[sk.titleKey] ?? ''} eyebrow={c[sk.eyebrowKey]}>
            <p
              className="text-sm text-gray-600 leading-relaxed mb-6 max-w-xl"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {c.concierge_body ?? ''}
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="border border-gray-200/90 bg-[#faf9f7] p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Создать тикет
                </p>
                <div className="space-y-3">
                  <div className="relative" ref={conciergeTopicMenuRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setConciergeTopicMenuOpen((v) => !v);
                        setConciergeOrderMenuOpen(false);
                      }}
                      className="w-full h-12 px-4 border border-gray-300 bg-white text-sm text-left flex items-center justify-between focus:outline-none focus:border-[#0b2a24] hover:border-[#0b2a24] hover:bg-[#faf9f7] active:bg-[#f0efeb] transition-colors"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                      aria-haspopup="listbox"
                      aria-expanded={conciergeTopicMenuOpen}
                    >
                      <span className="truncate">
                        {(topics.find((t) => t.key === conciergeTopicKey)?.label || 'Тема обращения')} · SLA{' '}
                        {topics.find((t) => t.key === conciergeTopicKey)?.slaMinutes ?? 30} мин
                      </span>
                      <span className={`ml-2 text-xs transition-transform ${conciergeTopicMenuOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {conciergeTopicMenuOpen ? (
                      <div className="absolute z-20 mt-1 w-full border border-gray-300 bg-white shadow-lg">
                        <ul role="listbox" className="max-h-60 overflow-auto py-1">
                          {topics.map((t) => {
                            const active = t.key === conciergeTopicKey;
                            return (
                              <li key={t.key}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConciergeTopicKey(t.key);
                                    setConciergeTopicMenuOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                    active ? 'bg-[#0b2a24] text-white' : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                  style={{ fontFamily: 'var(--font-open-sans)' }}
                                  role="option"
                                  aria-selected={active}
                                >
                                  {t.label} · SLA {t.slaMinutes} мин
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  <div className="relative" ref={conciergeOrderMenuRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setConciergeOrderMenuOpen((v) => !v);
                        setConciergeTopicMenuOpen(false);
                      }}
                      className="w-full h-12 px-4 border border-gray-300 bg-white text-sm text-left flex items-center justify-between focus:outline-none focus:border-[#0b2a24] hover:border-[#0b2a24] hover:bg-[#faf9f7] active:bg-[#f0efeb] transition-colors"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                      aria-haspopup="listbox"
                      aria-expanded={conciergeOrderMenuOpen}
                    >
                      <span className="truncate">
                        {conciergeOrderId
                          ? `Заказ ${d.orders.find((o) => o.id === conciergeOrderId)?.reference || `#${conciergeOrderId}`}`
                          : 'Без привязки к заказу'}
                      </span>
                      <span className={`ml-2 text-xs transition-transform ${conciergeOrderMenuOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {conciergeOrderMenuOpen ? (
                      <div className="absolute z-20 mt-1 w-full border border-gray-300 bg-white shadow-lg">
                        <ul role="listbox" className="max-h-64 overflow-auto py-1">
                          <li>
                            <button
                              type="button"
                              onClick={() => {
                                setConciergeOrderId(null);
                                setConciergeOrderMenuOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                conciergeOrderId == null ? 'bg-[#0b2a24] text-white' : 'text-gray-700 hover:bg-gray-100'
                              }`}
                              style={{ fontFamily: 'var(--font-open-sans)' }}
                              role="option"
                              aria-selected={conciergeOrderId == null}
                            >
                              Без привязки к заказу
                            </button>
                          </li>
                          {d.orders.map((o) => {
                            const active = conciergeOrderId === o.id;
                            return (
                              <li key={o.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConciergeOrderId(o.id);
                                    setConciergeOrderMenuOpen(false);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                    active ? 'bg-[#0b2a24] text-white' : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                  style={{ fontFamily: 'var(--font-open-sans)' }}
                                  role="option"
                                  aria-selected={active}
                                >
                                  Заказ {o.reference || `#${o.id}`} · {formatDate(o.createdAt)}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  <input
                    type="text"
                    value={conciergeSubject}
                    onChange={(e) => setConciergeSubject(e.target.value)}
                    placeholder="Краткая тема обращения"
                    className="w-full h-10 px-3 border border-gray-300 bg-white text-sm focus:outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                  <textarea
                    value={conciergeMessage}
                    onChange={(e) => setConciergeMessage(e.target.value)}
                    placeholder="Опишите вопрос подробнее"
                    className={`w-full min-h-24 px-3 py-2.5 border bg-white text-sm focus:outline-none resize-y ${
                      conciergeMessage.trim().length > 0 && conciergeMessage.trim().length < 5
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-[#0b2a24]'
                    }`}
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                  <p
                    className={`text-[10px] mt-1 ${
                      conciergeMessage.trim().length > 0 && conciergeMessage.trim().length < 5
                        ? 'text-red-600'
                        : 'text-gray-500'
                    }`}
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Минимум 5 символов в описании. Сейчас: {conciergeMessage.trim().length}
                  </p>
                  <button
                    type="button"
                    disabled={conciergeCreating || conciergeMessage.trim().length < 5 || conciergeSubject.trim().length < 3}
                    onClick={() => void createConciergeTicket()}
                    className="text-[11px] uppercase tracking-[0.18em] px-6 py-3 bg-[#0b2a24] text-white border border-[#0b2a24] hover:bg-transparent hover:text-[#0b2a24] transition-colors disabled:opacity-40"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    {conciergeCreating ? 'Создаём...' : 'Создать тикет'}
                  </button>
                </div>
              </div>

              <div className="border border-gray-200/90 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Мои тикеты
                  </p>
                  <span className="text-[10px] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {tickets.length}
                  </span>
                </div>
                {tickets.length === 0 ? (
                  <p className="text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Пока нет обращений.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-[260px] overflow-auto">
                    {tickets.map((t) => {
                      const active = conciergeSelectedTicketId === t.id;
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => void loadConciergeTicket(t.id)}
                            className={`w-full text-left border px-3 py-2.5 transition-colors ${
                              active
                                ? 'border-[#0b2a24] bg-[#0b2a24]/[0.04]'
                                : 'border-gray-200 hover:border-[#0b2a24]/50'
                            }`}
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            <p className="text-xs text-[#0b2a24]">{t.subject}</p>
                            <p className="text-[10px] text-gray-500 mt-1">
                              {t.topicLabel} · {conciergeStatusLabel(t.status)}
                            </p>
                            {t.firstResponseDueAt ? (
                              <p className="text-[10px] text-gray-500">
                                SLA до: {new Date(t.firstResponseDueAt).toLocaleString('ru-RU')}
                              </p>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {conciergeLoadingDetails ? (
              <p className="mt-6 text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Загружаем диалог...
              </p>
            ) : selectedTicket ? (
              <div className="mt-6 border border-gray-200/90 p-4 bg-[#faf9f7]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-sm italic text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                    Тикет #{selectedTicket.id}: {selectedTicket.subject}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {conciergeStatusLabel(selectedTicket.status)}
                  </p>
                </div>
                <p className="text-[11px] text-gray-600 mb-3" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  Менеджер: {selectedTicket.assignedManagerName || 'Назначается автоматически'} · SLA ответа: {selectedTicket.responseSlaMinutes} мин
                </p>
                <div className="space-y-2 max-h-[260px] overflow-auto border border-gray-200 bg-white p-3">
                  {(conciergeTicketDetails?.messages || []).map((m) => (
                    <div key={m.id} className={`text-xs ${m.senderType === 'customer' ? 'text-gray-800' : m.senderType === 'manager' ? 'text-[#0b2a24]' : 'text-gray-500'}`} style={{ fontFamily: 'var(--font-open-sans)' }}>
                      <p className="leading-relaxed">{m.message}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(m.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={conciergeReply}
                    onChange={(e) => setConciergeReply(e.target.value)}
                    placeholder="Ответить в тикет"
                    className="flex-1 h-10 px-3 border border-gray-300 bg-white text-sm focus:outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                  <button
                    type="button"
                    disabled={conciergeSendingReply}
                    onClick={() => void sendConciergeReply()}
                    className="h-10 px-4 text-[10px] uppercase tracking-[0.14em] border border-[#0b2a24] text-[#0b2a24] hover:bg-[#0b2a24] hover:text-white transition-colors disabled:opacity-40"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    {conciergeSendingReply ? 'Отправка...' : 'Отправить'}
                  </button>
                </div>
              </div>
            ) : null}
          </ViewFrame>
        );
      }

      case 'cabinet-settings':
        return renderSettingsPanel();

      default:
        return null;
    }
  };

  const renderSettingsPanel = () => {
    const sk = sectionCopyKeys('cabinet-settings');
    const displayName = profileName.trim() || user.name || (c.header_guest_name ?? 'Участник');
    return (
      <ViewFrame title={c[sk.titleKey] ?? 'Настройки'} eyebrow={c[sk.eyebrowKey] ?? 'Профиль'}>
        <div className="space-y-8 max-w-lg">
          <div>
            <h3
              className="text-lg font-normal italic mb-1"
              style={{ fontFamily: 'var(--font-playfair-display)', color: 'var(--color-classic-black)' }}
            >
              {displayName}
            </h3>
            <p className="text-xs text-gray-500 tracking-wide" style={{ fontFamily: 'var(--font-open-sans)' }}>
              {user.email}
            </p>
          </div>

          <div className="space-y-4 border-t border-gray-200/80 pt-6">
            <div>
              <label
                htmlFor="cabinet-settings-name"
                className="block text-[10px] uppercase tracking-[0.14em] mb-1.5 text-gray-400"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {c.settings_name_label ?? 'Имя'}
              </label>
              <input
                id="cabinet-settings-name"
                type="text"
                autoComplete="name"
                value={profileName}
                onChange={(e) => {
                  setProfileName(e.target.value);
                  setProfileMsg('');
                }}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 bg-white text-gray-800 focus:outline-none focus:border-[#0b2a24]"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              />
            </div>
            <div>
              <label
                htmlFor="cabinet-settings-email"
                className="block text-[10px] uppercase tracking-[0.14em] mb-1.5 text-gray-400"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {c.settings_email_label ?? 'Email'}
              </label>
              <input
                id="cabinet-settings-email"
                type="email"
                value={user.email}
                readOnly
                className="w-full text-sm px-3 py-2.5 border border-gray-100 bg-[#faf9f7] text-gray-500"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              />
            </div>
            <div>
              <label
                htmlFor="cabinet-profile-birth"
                className="block text-[10px] uppercase tracking-[0.14em] mb-1.5 text-gray-400"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {c.settings_birth_label ?? 'День рождения'}
              </label>
              <input
                id="cabinet-profile-birth"
                type="date"
                value={profileBirthDate}
                onChange={(e) => {
                  setProfileBirthDate(e.target.value);
                  setProfileMsg('');
                }}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 bg-white text-gray-800 focus:outline-none focus:border-[#0b2a24]"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={profileSaving}
                onClick={() => void saveProfileSettings()}
                className="text-[10px] uppercase tracking-[0.14em] px-4 py-2.5 border border-[#0b2a24] bg-[#0b2a24] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {profileSaving ? '…' : (c.settings_save ?? 'Сохранить')}
              </button>
              {profileMsg ? (
                <span
                  className={`text-[10px] ${profileMsg === 'Сохранено' ? 'text-green-700' : 'text-red-600'}`}
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {profileMsg}
                </span>
              ) : null}
            </div>
          </div>

          <div className="border-t border-gray-200/80 pt-6">
            <p
              className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-3"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {c.settings_bots_label ?? 'Весь сервис в ботах'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'city_legend_officalbot'}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] px-3 py-2 border border-[#229ED9]/40 text-[#229ED9] hover:bg-[#229ED9] hover:text-white transition-colors"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg>
                Telegram
              </a>
              {process.env.NEXT_PUBLIC_MAX_BOT_LINK ? (
                <a
                  href={process.env.NEXT_PUBLIC_MAX_BOT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] px-3 py-2 border border-[#6B7280]/40 text-gray-600 hover:bg-gray-700 hover:text-white transition-colors"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73A2 2 0 0 1 12 2M7.5 13a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1m7 0a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1M5 18v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2H5Z"/></svg>
                  Max
                </a>
              ) : null}
            </div>
          </div>

          <div className="border-t border-gray-200/80 pt-6">
            <button
              type="button"
              onClick={onLogout}
              className="text-[10px] uppercase tracking-[0.18em] px-5 py-2.5 border border-gray-300 text-gray-600 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {c.header_logout ?? 'Выйти'}
            </button>
          </div>
        </div>
      </ViewFrame>
    );
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-0 h-full max-h-full w-full max-w-6xl mx-auto overflow-visible md:overflow-hidden">
      {toasts.length > 0 ? (
        <div className="pointer-events-none absolute right-4 top-4 z-30 flex flex-col gap-2 max-w-[340px]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-3.5 py-2.5 border text-xs shadow-sm ${
                t.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : t.tone === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : 'border-gray-200 bg-white text-gray-700'
              }`}
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {t.text}
            </div>
          ))}
        </div>
      ) : null}
      <header className="md:shrink-0 sticky top-0 z-30 md:static md:z-auto px-4 sm:px-6 lg:px-8 pt-3 pb-3 md:pb-4 border-b border-gray-200/80 bg-[#faf9f7]">
        <p
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{
            fontFamily: 'var(--font-open-sans)',
            color: 'var(--color-marble-grey-regular)',
          }}
        >
          {c.header_eyebrow ?? 'Личный кабинет'}
        </p>
      </header>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-visible md:overflow-hidden">
        <nav
          className="md:hidden shrink-0 border-b border-gray-200/80 bg-[#faf9f7] px-4 py-2 overflow-x-auto overflow-y-hidden"
          aria-label="Разделы кабинета"
        >
          <ul className="flex gap-1 w-max pr-2">
            {navItems.map((item) => {
              const active = view === item.id;
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setView(item.id)}
                    className={active ? navItemMobileActive : navItemMobileInactive}
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <aside
          className="hidden md:flex flex-col shrink-0 w-[200px] lg:w-52 border-r border-gray-200/90 bg-[#faf9f7] py-6 pl-4 lg:pl-5 pr-2"
          aria-label="Разделы кабинета"
        >
          <ul className="flex flex-col gap-0.5 border-l border-gray-200/80">
            {navItems.map((item) => {
              const active = view === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setView(item.id)}
                    className={active ? navItemActive : navItemInactive}
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div
          className="flex-1 min-w-0 min-h-0 overflow-x-hidden px-3 sm:px-6 lg:px-10 py-5 md:py-8 md:overflow-y-auto md:overscroll-y-contain overflow-visible"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="pb-16 max-w-3xl">{renderPanel()}</div>
        </div>
      </div>
    </div>
  );
}
