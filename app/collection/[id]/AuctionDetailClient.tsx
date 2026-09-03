'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuctionCard from '../../components/AuctionCard';
import ComparePickerModal from '../../components/ComparePickerModal';
import Footer from '../../components/Footer';
import { ProductMagnifyingGlass } from '../../components/ProductMagnifyingGlass';
import { ProductPhoto } from '../../components/ProductPhoto';
import AuctionLotNotFound from '../../components/AuctionLotNotFound';
import { getCompareIds } from '@/lib/compareStorage';
import { catalogAvailabilityLine } from '@/lib/stockDisplay';
import { displayLineTotalForQuantity, hasCompareAtPrice } from '@/lib/cartPricing';
import type { AuctionDetailPayload } from '@/lib/auctionDetailPayload';
import {
  availableUnitsForVariant,
  availableValueIdsForGroup,
  defaultSelection,
  findVariantBySelection,
  hasActiveVariantConfig,
  parseProductVariantConfig,
  sortedGroups,
  type ProductVariantConfig,
} from '@/lib/productVariants';
import type { CatalogLabels } from '@/lib/catalogLabels';
import { DEFAULT_CATALOG_LABELS } from '@/lib/catalogLabels';
import { optimizedMediaSrc } from '@/lib/publicMediaUrl';

interface Auction {
  id: number;
  name: string;
  additional_info?: string;
  sku?: string | null;
  starting_price: string;
  compare_at_price?: string | null;
  auction_dates?: string;
  certificate_url?: string; // Старое поле для обратной совместимости
  certificates?: Array<{
    url: string;
    type: 'image' | 'pdf';
  }>; // Новое поле для множественных сертификатов
  images: string[];
  category?: string;
  category_id?: number | null;
  subcategory?: string;
  detail_sections?: Array<{
    title: string;
    content: string;
  }>;
  inventory_qty?: number | null;
  reserved_qty?: number | null;
  product_variants?: unknown;
}

interface RelatedAuction {
  id: number;
  name: string;
  additional_info?: string;
  starting_price: string;
  compare_at_price?: string | null;
  auction_dates?: string;
  images: string[];
  inventory_qty?: number | null;
  reserved_qty?: number | null;
}

type ProductReviewItem = { id: number; lotTitle: string; text: string; rating: number; createdAt: string };

type ProductReviewSummary = {
  averageRating: number;
  totalReviews: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  reviews?: ProductReviewItem[];
};

type ReviewSort = 'newest' | 'oldest' | 'rating_high' | 'rating_low';

const REVIEW_SORT_OPTIONS: { value: ReviewSort; label: string }[] = [
  { value: 'newest', label: 'Сначала новые' },
  { value: 'oldest', label: 'Сначала старые' },
  { value: 'rating_high', label: 'С высокой оценкой' },
  { value: 'rating_low', label: 'С низкой оценкой' },
];

/** Полноэкранная лупа: scale(2) с object-cover сильно обрезал кадр; ниже — мягче зум и предсказуемый панорамный ход */
const GALLERY_ZOOM_SCALE = 1.42;
function galleryZoomMaxOffsetPct(scale: number): number {
  if (scale <= 1) return 0;
  return (50 * (scale - 1)) / scale;
}

function normalizeAuctionCert(auction: Record<string, unknown>): Auction {
  const a = { ...auction } as unknown as Auction;
  if (a.certificates) {
    if (typeof a.certificates === 'string') {
      try {
        a.certificates = JSON.parse(a.certificates);
      } catch {
        a.certificates = [];
      }
    } else if (!Array.isArray(a.certificates)) {
      a.certificates = [];
    }
  } else {
    a.certificates = [];
  }
  return a;
}

function variantConfigFromAuction(auction: Auction | null): ProductVariantConfig | null {
  if (!auction?.product_variants) return null;
  return parseProductVariantConfig(auction.product_variants);
}

function stateFromInitialPayload(initialPayload: AuctionDetailPayload | null | undefined) {
  if (!initialPayload?.auction) {
    return {
      auction: null as Auction | null,
      relatedAuctions: [] as RelatedAuction[],
      relatedCollectionName: null as string | null,
      productCategory: null as { id: number; name: string; slug: string } | null,
    };
  }
  const auc = normalizeAuctionCert(initialPayload.auction);
  const rel = (initialPayload.relatedAuctions ?? []) as unknown as RelatedAuction[];
  const relatedCollectionName =
    initialPayload.collection && typeof initialPayload.collection.name === 'string'
      ? initialPayload.collection.name
      : null;
  const productCategory =
    initialPayload.category && typeof initialPayload.category.name === 'string' && initialPayload.category.id != null
      ? {
          id: initialPayload.category.id,
          name: initialPayload.category.name,
          slug: initialPayload.category.slug ?? '',
        }
      : null;
  return { auction: auc, relatedAuctions: rel, relatedCollectionName, productCategory };
}

export default function AuctionDetailClient({
  initialPayload,
  catalogLabels = DEFAULT_CATALOG_LABELS,
}: {
  initialPayload?: AuctionDetailPayload | null;
  catalogLabels?: CatalogLabels;
}) {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const id = (Array.isArray(idParam) ? idParam[0] : idParam) as string | undefined;

  const init = stateFromInitialPayload(initialPayload ?? null);
  const [auction, setAuction] = useState<Auction | null>(init.auction);
  const [relatedAuctions, setRelatedAuctions] = useState<RelatedAuction[]>(init.relatedAuctions);
  const [relatedCollectionName, setRelatedCollectionName] = useState<string | null>(init.relatedCollectionName);
  const [loading, setLoading] = useState(() => !init.auction);
  const [auctionMissing, setAuctionMissing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [zoomImageIndex, setZoomImageIndex] = useState(0);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const [isZooming, setIsZooming] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(120);
  /** До mount = false и совпадает с SSR; иначе гидрация ломается из‑за window.innerWidth */
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [layoutMounted, setLayoutMounted] = useState(false);
  const [imagesContainerMousePosition, setImagesContainerMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringImagesArea, setIsHoveringImagesArea] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [relatedAuctionsIndex, setRelatedAuctionsIndex] = useState(0);
  const [carouselItemWidth, setCarouselItemWidth] = useState(0);
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [isCertificateFullscreenOpen, setIsCertificateFullscreenOpen] = useState(false);
  const [fullscreenCertificateIndex, setFullscreenCertificateIndex] = useState(0);

  const [cabinetLoggedIn, setCabinetLoggedIn] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [cartLoading, setCartLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cartNotice, setCartNotice] = useState('');
  const [cartQty, setCartQty] = useState(1);
  const [reviewSummary, setReviewSummary] = useState<ProductReviewSummary | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewSort, setReviewSort] = useState<ReviewSort>('newest');
  const [reviewsVisibleCount, setReviewsVisibleCount] = useState(5);
  const [reviewSortMenuOpen, setReviewSortMenuOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [wishLoading, setWishLoading] = useState(false);
  const [wishCopied, setWishCopied] = useState(false);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [wishToken, setWishToken] = useState<string | null>(null);
  const [wishStep, setWishStep] = useState<'form' | 'share'>('form');
  const [wishForm, setWishForm] = useState({
    friendName: '',
    occasion: '',
    wishDate: '',
    personalMessage: '',
  });
  const [compareCount, setCompareCount] = useState(0);
  const [productCategory, setProductCategory] = useState<{
    id: number;
    name: string;
    slug: string;
  } | null>(init.productCategory);

  const variantConfig = useMemo(
    () => variantConfigFromAuction(auction),
    [auction?.id, auction?.product_variants]
  );
  const hasVariants = hasActiveVariantConfig(variantConfig);
  const [optionSelection, setOptionSelection] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!auction?.id) return;
    const cfg = variantConfigFromAuction(auction);
    if (cfg) setOptionSelection(defaultSelection(cfg));
    else setOptionSelection({});
  }, [auction?.id, auction?.product_variants]);

  const activeVariant = useMemo(() => {
    if (!variantConfig) return null;
    return findVariantBySelection(variantConfig, optionSelection);
  }, [variantConfig, optionSelection]);

  const variantStockAvailable = useMemo(() => {
    if (!auction) return 99;
    return availableUnitsForVariant(
      variantConfig,
      activeVariant,
      auction.inventory_qty,
      auction.reserved_qty
    );
  }, [auction, variantConfig, activeVariant]);

  const maxCartQtyForVariant = useMemo(() => {
    if (variantStockAvailable >= 1000) return 99;
    return Math.max(1, Math.min(99, variantStockAvailable));
  }, [variantStockAvailable]);

  const priceCurrent = auction
    ? hasVariants && activeVariant
      ? activeVariant.starting_price
      : auction.starting_price
    : '';
  const priceCompare = auction
    ? hasVariants && activeVariant
      ? (activeVariant.compare_at_price ?? null)
      : (auction.compare_at_price ?? null)
    : null;

  const priceDisplay = useMemo(
    () => displayLineTotalForQuantity(String(priceCurrent ?? ''), cartQty),
    [priceCurrent, cartQty]
  );
  const compareDisplay = useMemo(() => {
    if (!hasCompareAtPrice(priceCompare)) return null;
    return displayLineTotalForQuantity(String(priceCompare).trim(), cartQty);
  }, [priceCompare, cartQty]);

  const handleVariantOptionPick = useCallback(
    (groupKey: string, valueId: string) => {
      if (!variantConfig) return;
      setOptionSelection((prev) => {
        const next = { ...prev, [groupKey]: valueId };
        if (findVariantBySelection(variantConfig, next)) return next;
        const candidate = variantConfig.variants.find((v) => v.selection[groupKey] === valueId);
        return candidate ? { ...candidate.selection } : next;
      });
    },
    [variantConfig]
  );

  const relatedSlotsPerView = useMemo(() => {
    if (!layoutMounted) return 1;
    if (isLargeScreen) return 4;
    if (typeof window !== 'undefined' && window.innerWidth >= 640) return 2;
    return 1;
  }, [layoutMounted, isLargeScreen]);

  const relatedVisibleItems = useMemo(() => {
    return Math.min(relatedSlotsPerView, Math.max(relatedAuctions.length, 1));
  }, [relatedSlotsPerView, relatedAuctions.length]);

  const relatedCarouselScrollable = relatedAuctions.length > relatedSlotsPerView;

  const relatedItemWidthCss = useMemo(() => {
    if (!layoutMounted) return '100%';
    const slots = Math.min(relatedSlotsPerView, Math.max(relatedAuctions.length, 1));
    if (slots === 1) return '100%';
    if (isLargeScreen) return `calc((100% - ${(slots - 1) * 1.5}rem) / ${slots})`;
    if (typeof window !== 'undefined' && window.innerWidth >= 640) {
      return `calc((100% - ${(slots - 1) * 1.5}rem) / ${slots})`;
    }
    return '100%';
  }, [layoutMounted, isLargeScreen, relatedSlotsPerView, relatedAuctions.length]);

  // Состояния для мобильной версии фотографий
  const [mobileImageIndex, setMobileImageIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState(false);
  
  const imagesContainerRef = useRef<HTMLDivElement>(null);
  const zoomImageRef = useRef<HTMLImageElement>(null);
  const relatedCarouselRef = useRef<HTMLDivElement>(null);
  const relatedCarouselItemRef = useRef<HTMLDivElement>(null);
  const relatedSwipeStartX = useRef<number | null>(null);
  const reviewSortMenuRef = useRef<HTMLDivElement>(null);

  // Функция для получения всех сертификатов
  const getAllCertificates = () => {
    if (!auction) return [];
    
    let parsedCertificates = [];
    if (auction.certificates) {
      if (typeof auction.certificates === 'string') {
        try {
          parsedCertificates = JSON.parse(auction.certificates);
        } catch (e) {
          console.error('Ошибка парсинга certificates:', e);
          parsedCertificates = [];
        }
      } else if (Array.isArray(auction.certificates)) {
        parsedCertificates = auction.certificates;
      }
    }
    
    return parsedCertificates.length > 0
      ? parsedCertificates
      : auction.certificate_url
        ? [{ url: auction.certificate_url, type: auction.certificate_url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image' }]
        : [];
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        const me = await meRes.json();
        if (cancelled) return;
        if (!me?.user) {
          setCabinetLoggedIn(false);
          setFavoriteIds(new Set());
          return;
        }
        setCabinetLoggedIn(true);
        const favRes = await fetch('/api/cabinet/favorites', { credentials: 'include' });
        if (cancelled || favRes.status !== 200) return;
        const fav = await favRes.json();
        setFavoriteIds(new Set(Array.isArray(fav.ids) ? fav.ids : []));
      } catch {
        if (!cancelled) {
          setCabinetLoggedIn(false);
          setFavoriteIds(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggleFavorite = useCallback(
    async (auctionId: number) => {
      if (!cabinetLoggedIn) {
        window.dispatchEvent(new CustomEvent('openCabinetPanel'));
        return;
      }
      let was = false;
      setFavoriteIds((prev) => {
        was = prev.has(auctionId);
        const n = new Set(prev);
        if (was) n.delete(auctionId);
        else n.add(auctionId);
        return n;
      });
      try {
        const res = await fetch('/api/cabinet/favorites', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auctionId }),
        });
        const j = await res.json();
        if (res.ok && typeof j.favored === 'boolean') {
          setFavoriteIds((prev) => {
            const n = new Set(prev);
            if (j.favored) n.add(auctionId);
            else n.delete(auctionId);
            return n;
          });
        } else {
          setFavoriteIds((prev) => {
            const n = new Set(prev);
            if (was) n.add(auctionId);
            else n.delete(auctionId);
            return n;
          });
        }
      } catch {
        setFavoriteIds((prev) => {
          const n = new Set(prev);
          if (was) n.add(auctionId);
          else n.delete(auctionId);
          return n;
        });
      }
    },
    [cabinetLoggedIn]
  );

  const openWish = useCallback(() => {
    if (!auction) return;
    setWishStep('form');
    setWishToken(null);
    setWishCopied(false);
    setWishForm({ friendName: '', occasion: '', wishDate: '', personalMessage: '' });
    setWishModalOpen(true);
  }, [auction]);

  const submitWishForm = useCallback(async () => {
    if (!auction) return;
    setWishLoading(true);
    try {
      const res = await fetch('/api/wish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId: auction.id,
          friendName: wishForm.friendName,
          occasion: wishForm.occasion,
          wishDate: wishForm.wishDate,
          personalMessage: wishForm.personalMessage,
        }),
      });
      const data = await res.json() as { token?: string };
      if (data.token) {
        setWishToken(data.token);
        setWishStep('share');
      }
    } catch {
      // ignore
    } finally {
      setWishLoading(false);
    }
  }, [auction, wishForm]);

  const copyWishLink = useCallback(async () => {
    if (!wishToken) return;
    const url = `${window.location.origin}/wish/${wishToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setWishCopied(true);
      setTimeout(() => setWishCopied(false), 2500);
    } catch {
      // ignore
    }
  }, [wishToken]);

  const addToCart = useCallback(async () => {
    if (!auction) return;
    if (!cabinetLoggedIn) {
      window.dispatchEvent(new CustomEvent('openCabinetPanel'));
      return;
    }
    if (hasVariants && !activeVariant) {
      setCartNotice('Выберите доступную комбинацию опций.');
      return;
    }
    const qty = Math.min(maxCartQtyForVariant, Math.max(1, Math.floor(cartQty)));
    setCartLoading(true);
    setCartNotice('');
    try {
      const res = await fetch('/api/cabinet/cart', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId: auction.id,
          quantity: qty,
          variantId: hasVariants && activeVariant ? activeVariant.id : '',
        }),
      });
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('openCabinetPanel'));
        return;
      }
      const j = await res.json();
      if (res.ok && j.quantity != null) {
        setCartNotice(`В корзине по этому артикулу: ${j.quantity} шт.`);
        window.setTimeout(() => setCartNotice(''), 5000);
      } else {
        setCartNotice('Не удалось добавить. Попробуйте ещё раз.');
      }
    } catch {
      setCartNotice('Нет соединения');
    } finally {
      setCartLoading(false);
    }
  }, [auction, cabinetLoggedIn, cartQty, hasVariants, activeVariant, maxCartQtyForVariant]);

  const checkoutNow = useCallback(async () => {
    if (!auction) return;
    if (!cabinetLoggedIn) {
      window.dispatchEvent(new CustomEvent('openCabinetPanel'));
      return;
    }
    if (hasVariants && !activeVariant) {
      setCartNotice('Выберите доступную комбинацию опций.');
      return;
    }
    const qty = Math.min(maxCartQtyForVariant, Math.max(1, Math.floor(cartQty)));
    setCheckoutLoading(true);
    setCartNotice('');
    try {
      const res = await fetch('/api/cabinet/cart', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId: auction.id,
          quantity: qty,
          variantId: hasVariants && activeVariant ? activeVariant.id : '',
        }),
      });
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('openCabinetPanel'));
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { quantity?: number; error?: string };
      if (res.ok && j.quantity != null) {
        const vPart =
          hasVariants && activeVariant
            ? `&variantId=${encodeURIComponent(activeVariant.id)}`
            : '';
        router.push(`/payment?express=1&auctionId=${auction.id}&qty=${qty}${vPart}`);
        return;
      }
      setCartNotice(typeof j.error === 'string' ? j.error : 'Не удалось перейти к оформлению.');
    } catch {
      setCartNotice('Нет соединения');
    } finally {
      setCheckoutLoading(false);
    }
  }, [
    auction,
    cabinetLoggedIn,
    cartQty,
    router,
    hasVariants,
    activeVariant,
    maxCartQtyForVariant,
  ]);

  useEffect(() => {
    setCartQty(1);
  }, [auction?.id]);

  useEffect(() => {
    setCartQty((q) => Math.min(maxCartQtyForVariant, Math.max(1, q)));
  }, [maxCartQtyForVariant]);

  useEffect(() => {
    setMobileImageIndex(0);
    setCurrentImageIndex(0);
    setZoomImageIndex(0);
  }, [auction?.id, activeVariant?.id]);

  useEffect(() => {
    if (!id) return;
    setReviewSort('newest');
    setReviewsVisibleCount(5);
    setReviewSortMenuOpen(false);
    let cancelled = false;
    (async () => {
      setReviewLoading(true);
      try {
        const res = await fetch(`/api/auctions/${id}/reviews`, { cache: 'no-store' });
        const raw = (await res.json()) as ProductReviewSummary & { latest?: ProductReviewItem[] };
        const rawList = Array.isArray(raw.reviews)
          ? raw.reviews
          : Array.isArray(raw.latest)
            ? raw.latest
            : [];
        const reviewsList: ProductReviewItem[] = rawList
          .map((r: ProductReviewItem & Record<string, unknown>) => {
            const rid = Number(r.id);
            if (!Number.isFinite(rid)) return null;
            const text =
              typeof r.text === 'string'
                ? r.text
                : typeof r.review_text === 'string'
                  ? r.review_text
                  : '';
            const lotTitle =
              typeof r.lotTitle === 'string'
                ? r.lotTitle
                : typeof r.lot_title === 'string'
                  ? r.lot_title
                  : '';
            const rating = Math.min(5, Math.max(1, Number(r.rating) || 1));
            const createdAt =
              typeof r.createdAt === 'string'
                ? r.createdAt
                : typeof r.created_at === 'string'
                  ? r.created_at
                  : new Date().toISOString();
            return { id: rid, lotTitle, text, rating, createdAt };
          })
          .filter((x): x is ProductReviewItem => x != null);
        const totalReviews = reviewsList.length;
        const sum = reviewsList.reduce((s, r) => s + r.rating, 0);
        const averageRating = totalReviews > 0 ? Number((sum / totalReviews).toFixed(1)) : 0;
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
        for (const r of reviewsList) {
          distribution[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
        }
        const data: ProductReviewSummary = {
          ...raw,
          reviews: reviewsList,
          totalReviews,
          averageRating,
          distribution,
        };
        if (!cancelled && res.ok) setReviewSummary(data);
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setReviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    setReviewsVisibleCount(5);
  }, [reviewSort]);

  const sortedProductReviews = useMemo(() => {
    const list = [...(reviewSummary?.reviews ?? [])];
    const byDateDesc = (a: ProductReviewItem, b: ProductReviewItem) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const byDateAsc = (a: ProductReviewItem, b: ProductReviewItem) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    switch (reviewSort) {
      case 'newest':
        list.sort(byDateDesc);
        break;
      case 'oldest':
        list.sort(byDateAsc);
        break;
      case 'rating_high':
        list.sort((a, b) => b.rating - a.rating || byDateDesc(a, b));
        break;
      case 'rating_low':
        list.sort((a, b) => a.rating - b.rating || byDateDesc(a, b));
        break;
      default:
        list.sort(byDateDesc);
    }
    return list;
  }, [reviewSummary?.reviews, reviewSort]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (reviewSortMenuRef.current && !reviewSortMenuRef.current.contains(e.target as Node)) {
        setReviewSortMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReviewSortMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Догрузка / обновление с API (данные с сервера уже в initialPayload — не затираем до ответа)
  useEffect(() => {
    const fetchAuction = async () => {
      const hadInitial = Boolean(initialPayload?.auction);
      try {
        if (!hadInitial) {
          setLoading(true);
        }
        setAuctionMissing(false);
        if (!hadInitial) {
          setRelatedCollectionName(null);
          setProductCategory(null);
        }

        if (!id) {
          setAuctionMissing(true);
          setAuction(null);
          return;
        }

        const response = await fetch(`/api/auctions/${id}`, { cache: 'no-store' });
        const data = await response.json();

        if (response.status === 404 || response.status === 400) {
          setAuctionMissing(true);
          setAuction(null);
          return;
        }

        if (response.ok) {
          setAuction(normalizeAuctionCert(data.auction as Record<string, unknown>));
          setRelatedAuctions((data.relatedAuctions || []) as RelatedAuction[]);
          setRelatedCollectionName(
            data.collection && typeof data.collection.name === 'string' ? data.collection.name : null
          );
          setProductCategory(
            data.category && typeof data.category.name === 'string' && data.category.id != null
              ? {
                  id: data.category.id,
                  name: data.category.name,
                  slug: data.category.slug ?? '',
                }
              : null
          );
          setRelatedAuctionsIndex(0);
        } else {
          console.error('Ошибка загрузки аукциона:', data.error);
          setAuction(null);
        }
      } catch (error) {
        console.error('Ошибка при загрузке аукциона:', error);
        setAuction(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAuction();
    // initialPayload только для первого кадра с сервера; обновление при смене id через key на странице
  }, [id]);

  useEffect(() => {
    const sync = () => setCompareCount(getCompareIds().length);
    sync();
    window.addEventListener('compareStorageChanged', sync);
    return () => window.removeEventListener('compareStorageChanged', sync);
  }, []);

  useEffect(() => {
    if (auctionMissing) {
      const prev = document.title;
      document.title = 'Товар не найден';
      return () => {
        document.title = prev;
      };
    }
    if (!auction?.name) return;
    const prev = document.title;
    document.title = `${auction.name} — проект`;
    return () => {
      document.title = prev;
    };
  }, [auction?.name, auctionMissing]);

  // Получение высоты хедера и размера экрана
  useEffect(() => {
    setLayoutMounted(true);

    const updateHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) {
        setHeaderHeight(header.offsetHeight);
      }
    };

    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };

    const handleResize = () => {
      updateHeaderHeight();
      checkScreenSize();
    };

    // Инициализация при монтировании
    updateHeaderHeight();
    checkScreenSize();
    
    // Небольшая задержка для первого рендера
    const timeoutId = setTimeout(() => {
      updateHeaderHeight();
      checkScreenSize();
    }, 100);

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Вычисление шага карусели — по реальной ширине карточки (не контейнера), иначе на мобиле drift
  useEffect(() => {
    const CAROUSEL_GAP_PX = 24;
    const container = relatedCarouselRef.current;
    if (!container) return;

    let debounceId: ReturnType<typeof setTimeout> | null = null;
    let lastMeasured = 0;

    const measure = () => {
      const item = relatedCarouselItemRef.current;
      if (!item) return;
      const w = item.getBoundingClientRect().width;
      if (w > 0 && Math.abs(w - lastMeasured) > 1) {
        lastMeasured = w;
        setCarouselItemWidth(w);
      }
    };

    const schedule = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(measure, 80);
    };

    schedule();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(container);
    const item = relatedCarouselItemRef.current;
    if (item) ro?.observe(item);

    window.addEventListener('resize', schedule);
    return () => {
      if (debounceId) clearTimeout(debounceId);
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [isLargeScreen, relatedAuctions.length, layoutMounted, relatedItemWidthCss]);

  // Обработчики для свайпа на мобильных
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd || !auction) return;

    const images =
      activeVariant?.images && activeVariant.images.length > 0
        ? activeVariant.images
        : auction.images && auction.images.length > 0
          ? auction.images
          : ['/11.jpg'];
    if (!images.length) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      setMobileImageIndex((prev) => (prev + 1) % images.length);
    }
    if (isRightSwipe) {
      setMobileImageIndex((prev) => (prev - 1 + images.length) % images.length);
    }
  };

  const onRelatedCarouselTouchStart = useCallback((e: React.TouchEvent) => {
    relatedSwipeStartX.current = e.targetTouches[0].clientX;
  }, []);

  const onRelatedCarouselTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!relatedCarouselScrollable || relatedSwipeStartX.current == null) return;
      const delta = relatedSwipeStartX.current - e.changedTouches[0].clientX;
      relatedSwipeStartX.current = null;
      if (Math.abs(delta) < minSwipeDistance) return;
      const maxIndex = Math.max(0, relatedAuctions.length - relatedVisibleItems);
      if (delta > 0) {
        setRelatedAuctionsIndex((i) => Math.min(maxIndex, i + 1));
      } else {
        setRelatedAuctionsIndex((i) => Math.max(0, i - 1));
      }
    },
    [relatedCarouselScrollable, relatedAuctions.length, relatedVisibleItems]
  );

  // Обработка Escape для закрытия модального окна
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isZoomModalOpen) {
        setIsZoomModalOpen(false);
        setIsZooming(false);
      }
      if (e.key === 'Escape' && isFullscreenModalOpen) {
        setIsFullscreenModalOpen(false);
      }
      if (e.key === 'Escape' && isCertificateModalOpen) {
        setIsCertificateModalOpen(false);
        setIsCertificateFullscreenOpen(false);
      }
      if (e.key === 'Escape' && isCertificateFullscreenOpen) {
        setIsCertificateFullscreenOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isZoomModalOpen, isFullscreenModalOpen, isCertificateModalOpen, isCertificateFullscreenOpen]);

  // Блокировка скролла при открытом модальном окне
  useEffect(() => {
    if (isZoomModalOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isZoomModalOpen]);

  // Обработка панорамирования с ограничениями границ
  const handleZoomMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZooming || !zoomImageRef.current) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    
    // Позиция мыши относительно контейнера (0-100%)
    const mouseX = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseY = ((e.clientY - rect.top) / rect.height) * 100;

    const maxOffset = galleryZoomMaxOffsetPct(GALLERY_ZOOM_SCALE);

    // Вычисляем смещение на основе позиции мыши
    // Центр (50%) = 0 смещение, края (0% и 100%) = максимальное смещение
    const offsetX = (50 - mouseX) * 0.5; // Коэффициент 0.5 для плавности
    const offsetY = (50 - mouseY) * 0.5;
    
    // Ограничиваем смещение
    const clampedX = Math.max(-maxOffset, Math.min(maxOffset, offsetX));
    const clampedY = Math.max(-maxOffset, Math.min(maxOffset, offsetY));

    setZoomPosition({ x: clampedX, y: clampedY });
  };

  const handleZoomClick = () => {
    setIsZooming(!isZooming);
    if (!isZooming) {
      // При включении зума - центрируем
      setZoomPosition({ x: 0, y: 0 });
    }
  };

  // Обработка движения мыши над панелью с фотографиями
  const handleImagesContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setImagesContainerMousePosition({ x: e.clientX, y: e.clientY });
    setIsHoveringImagesArea(true);
  };

  const handleImagesContainerMouseLeave = () => {
    setIsHoveringImagesArea(false);
    setImagesContainerMousePosition(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-40 sm:pt-48 md:pt-56">
        <p className="text-sm" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Загрузка...
        </p>
      </div>
    );
  }

  if (auctionMissing) {
    return (
      <>
        <AuctionLotNotFound />
        <Footer />
      </>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 pt-40 sm:pt-48 md:pt-56">
        <p className="text-sm text-center text-gray-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Не удалось загрузить товар. Попробуйте обновить страницу.
        </p>
      </div>
    );
  }

  const displayImages =
    activeVariant?.images && activeVariant.images.length > 0
      ? activeVariant.images
      : auction.images && auction.images.length > 0
        ? auction.images
        : ['/11.jpg'];
  const images = displayImages;
  const imagesPerRow = 2;
  const totalRows = Math.ceil(images.length / imagesPerRow);
  const dedicatedVariantStock = !!(activeVariant && activeVariant.inventory_qty != null);
  const lotAvailabilityLine = catalogAvailabilityLine(
    auction.auction_dates,
    dedicatedVariantStock ? activeVariant?.inventory_qty ?? null : auction.inventory_qty,
    dedicatedVariantStock ? 0 : auction.reserved_qty
  );

  return (
    <div className="w-full bg-white">
      {/* Основной контент */}
      <section className="w-full bg-white pt-40 sm:pt-48 md:pt-56 pb-12 sm:pb-16">
        <div className="container mx-auto px-0 lg:px-8">
          <div className="max-w-[1600px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 lg:gap-8 xl:gap-10 lg:items-stretch" style={{ position: 'relative' }}>
              {/* Фотографии — на мобильных сверху; на десктопе sticky внутри растянутой ячейки */}
              <div 
                ref={imagesContainerRef}
                className="relative order-1 lg:order-1 lg:px-4"
                onMouseMove={handleImagesContainerMouseMove}
                onMouseLeave={handleImagesContainerMouseLeave}
              >
                <div
                  className="relative space-y-4 sm:space-y-6 lg:sticky lg:self-start"
                  style={{
                    overflow: 'visible',
                    ...(isLargeScreen ? { top: `${headerHeight + 20}px` } : {}),
                  }}
                >
                {/* Мобильная / планшетная версия — главное фото по центру, остальные снизу */}
                <div className="lg:hidden w-full px-4 sm:px-6 space-y-4">
                  <div className="mx-auto w-full max-w-md">
                    <button
                      type="button"
                      className="relative w-full overflow-hidden bg-gray-50"
                      style={{ aspectRatio: '3/4' }}
                      onClick={() => setIsFullscreenModalOpen(true)}
                      aria-label="Открыть фото на весь экран"
                    >
                      <ProductPhoto
                        src={images[mobileImageIndex] ?? images[0]}
                        alt={`${auction.name} - фото ${mobileImageIndex + 1}`}
                        sizes="(max-width: 768px) 100vw, 28rem"
                        priority
                      />
                    </button>
                  </div>

                  {images.length > 1 ? (
                    <div className="mx-auto w-full max-w-md grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {images.map((image, index) => {
                        if (index === mobileImageIndex) return null;
                        return (
                          <button
                            key={index}
                            type="button"
                            className="relative w-full overflow-hidden bg-gray-50 ring-1 ring-transparent hover:ring-[#0b2a24]/30 transition-shadow"
                            style={{ aspectRatio: '3/4' }}
                            onClick={() => {
                              setMobileImageIndex(index);
                              setIsFullscreenModalOpen(true);
                            }}
                            aria-label={`Показать фото ${index + 1}`}
                          >
                            <ProductPhoto
                              src={image}
                              alt={`${auction.name} - фото ${index + 1}`}
                              sizes="(max-width: 640px) 100vw, 20rem"
                            />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {/* Десктопная версия - сетка фотографий (2 колонки, как было) */}
                <div className="hidden lg:block">
                  {Array.from({ length: totalRows }).map((_, rowIndex) => (
                    <div key={rowIndex} className="grid grid-cols-2 gap-4 sm:gap-6">
                      {Array.from({ length: imagesPerRow }).map((_, colIndex) => {
                        const imageIndex = rowIndex * imagesPerRow + colIndex;
                        const image = images[imageIndex];

                        if (!image) return null;

                        return (
                          <div
                            key={imageIndex}
                            className="relative aspect-[2/3] overflow-hidden bg-gray-50 group image-container"
                            onClick={() => {
                              setZoomImageIndex(imageIndex);
                              setIsZoomModalOpen(true);
                              setIsZooming(true);
                              setZoomPosition({ x: 0, y: 0 });
                            }}
                          >
                            <ProductPhoto
                              src={image}
                              alt={`${auction.name} - фото ${imageIndex + 1}`}
                              sizes="(max-width: 1024px) 50vw, 25vw"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                
                <ProductMagnifyingGlass
                  visible={isHoveringImagesArea && imagesContainerMousePosition != null}
                  x={imagesContainerMousePosition?.x ?? 0}
                  y={imagesContainerMousePosition?.y ?? 0}
                />
                </div>
              </div>

              {/* Информация о товаре; на мобильных — под фото */}
              <div className="order-2 px-4 sm:px-6 lg:order-2 lg:px-0">
                <div 
                  className="sticky-info-panel"
                  style={{ 
                    position: isLargeScreen ? 'sticky' : 'static',
                    top: isLargeScreen ? `${headerHeight + 20}px` : 'auto',
                    height: 'fit-content',
                  } as React.CSSProperties}
                >
                <div className="space-y-6 sm:space-y-8">
                  {/* Название, описание, коллекция и цена — один вертикальный ритм (без лишнего space-y между блоками) */}
                  <div className="flex flex-col gap-2 sm:gap-2.5">
                    <h1
                      className="text-3xl sm:text-4xl md:text-4xl"
                      style={{
                        fontFamily: 'var(--font-playfair-display)',
                        color: '#000000',
                        fontWeight: 400,
                        letterSpacing: '0.01em',
                        lineHeight: '1.25',
                      }}
                    >
                      {auction.name}
                    </h1>

                    {auction.additional_info && (
                      <p
                        className="text-sm sm:text-base text-gray-600"
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          letterSpacing: '0.02em',
                          lineHeight: '1.6',
                        }}
                      >
                        {auction.additional_info}
                      </p>
                    )}

                    {relatedCollectionName ? (
                      <p
                        className="text-[10px] uppercase tracking-[0.18em] text-gray-500"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        Коллекция «{relatedCollectionName}»
                      </p>
                    ) : null}

                    {auction.subcategory && (
                      <p
                        className="text-sm sm:text-base text-[#666666]"
                        style={{
                          fontFamily: 'var(--font-open-sans)',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {auction.subcategory}
                      </p>
                    )}

                    {hasVariants && variantConfig ? (
                      <div className="space-y-4 pt-1">
                        <p
                          className="text-[10px] uppercase tracking-[0.16em] text-gray-500"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Выберите параметры
                        </p>
                        {sortedGroups(variantConfig).map((g) => {
                          const allowed = availableValueIdsForGroup(variantConfig, g.key, optionSelection);
                          return (
                            <div key={g.key} className="space-y-2">
                              <p
                                className="text-[10px] uppercase tracking-[0.14em] text-gray-500"
                                style={{ fontFamily: 'var(--font-open-sans)' }}
                              >
                                {g.name}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {g.values.map((val) => {
                                  const picked = (optionSelection[g.key] || '') === val.id;
                                  const ok = allowed.has(val.id);
                                  return (
                                    <button
                                      key={val.id}
                                      type="button"
                                      disabled={!ok}
                                      onClick={() => ok && handleVariantOptionPick(g.key, val.id)}
                                      title={val.hint || undefined}
                                      className={`min-h-[2.25rem] px-3 text-left text-xs border transition-colors ${
                                        picked
                                          ? 'border-[#0b2a24] bg-[#0b2a24]/5 text-[#0b2a24]'
                                          : ok
                                            ? 'border-gray-300 text-gray-800 hover:border-[#0b2a24]'
                                            : 'border-gray-200 text-gray-300 cursor-not-allowed line-through'
                                      }`}
                                      style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.06em' }}
                                    >
                                      {val.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {hasVariants && !activeVariant ? (
                          <p className="text-xs text-amber-900" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            Эта комбинация сейчас недоступна. Выберите другие значения.
                          </p>
                        ) : null}
                        {(activeVariant?.sku || (!hasVariants && auction?.sku)) ? (
                          <p
                            className="text-[10px] uppercase tracking-[0.14em] text-gray-400"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            Артикул: {activeVariant?.sku ?? auction?.sku}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {hasCompareAtPrice(priceCompare) && compareDisplay ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                          <p
                            className="text-lg sm:text-xl text-gray-600 line-through decoration-gray-500/90 sm:text-gray-400 sm:decoration-gray-400/90"
                            style={{
                              fontFamily: 'var(--font-playfair-display)',
                              fontWeight: 400,
                              letterSpacing: '0.01em',
                            }}
                          >
                            {compareDisplay.totalLabel}
                          </p>
                          <p
                            className="text-xl sm:text-2xl md:text-3xl"
                            style={{
                              fontFamily: 'var(--font-playfair-display)',
                              color: '#000000',
                              fontWeight: 400,
                              letterSpacing: '0.01em',
                            }}
                          >
                            {priceDisplay.totalLabel}
                          </p>
                          <span
                            className="text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 border border-amber-700/40 text-amber-900 bg-amber-50/80"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            Акция
                          </span>
                        </div>
                        {priceDisplay.unitHint || compareDisplay.unitHint ? (
                          <p
                            className="text-xs text-gray-500"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            {priceDisplay.unitHint ?? compareDisplay.unitHint}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p
                          className="text-xl sm:text-2xl md:text-3xl"
                          style={{
                            fontFamily: 'var(--font-playfair-display)',
                            color: '#000000',
                            fontWeight: 400,
                            letterSpacing: '0.01em',
                          }}
                        >
                          {priceDisplay.totalLabel}
                        </p>
                        {priceDisplay.unitHint ? (
                          <p
                            className="text-xs text-gray-500"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            {priceDisplay.unitHint}
                          </p>
                        ) : null}
                      </div>
                    )}

                    {lotAvailabilityLine ? (
                      <p
                        className="text-sm sm:text-base"
                        style={{
                          fontFamily: 'var(--font-playfair-display)',
                          color: '#696969',
                          fontWeight: 400,
                          fontStyle: 'italic',
                          letterSpacing: '0.01em',
                          lineHeight: '1.4',
                        }}
                      >
                        {lotAvailabilityLine}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setIsCertificateModalOpen(true);
                      }}
                      className="group inline-flex items-center gap-2 self-start cursor-pointer bg-transparent border-none p-0"
                      style={{
                        fontFamily: 'var(--font-playfair-display)',
                        color: '#000000',
                        fontSize: '14px',
                        letterSpacing: '0.02em',
                        fontWeight: 400,
                      }}
                    >
                      <span className="relative">
                        <span className="relative z-10">{catalogLabels.certificateLabel}</span>
                        <span 
                          className="absolute bottom-0 left-0 w-full h-px bg-black transition-all duration-500 origin-left group-hover:scale-x-0"
                        ></span>
                      </span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-transform duration-500 group-hover:translate-x-1"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </div>

                  {/* Количество, избранное и корзина — одна ширина колонки */}
                  <div className="mb-6 w-full max-w-md space-y-3 sm:space-y-4">
                    <div className="w-full" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-2 text-left leading-none">
                        Количество
                      </p>
                      <div className="flex h-11 w-full border border-gray-300 bg-white">
                        <button
                          type="button"
                          aria-label="Уменьшить количество"
                          onClick={() => setCartQty((q) => Math.max(1, q - 1))}
                          disabled={hasVariants && !activeVariant}
                          className="flex flex-1 items-center justify-center text-lg text-gray-800 hover:bg-gray-50 transition-colors border-r border-gray-300 leading-none disabled:opacity-40"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={maxCartQtyForVariant}
                          value={cartQty}
                          disabled={hasVariants && !activeVariant}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (Number.isNaN(v)) {
                              setCartQty(1);
                              return;
                            }
                            setCartQty(Math.min(maxCartQtyForVariant, Math.max(1, v)));
                          }}
                          className="flex-1 min-w-0 h-full px-0 py-0 text-center text-sm tabular-nums text-gray-900 border-0 outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-40"
                        />
                        <button
                          type="button"
                          aria-label="Увеличить количество"
                          onClick={() => setCartQty((q) => Math.min(maxCartQtyForVariant, q + 1))}
                          disabled={hasVariants && !activeVariant}
                          className="flex flex-1 items-center justify-center text-lg text-gray-800 hover:bg-gray-50 transition-colors border-l border-gray-300 leading-none disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(auction.id)}
                      className="flex h-11 w-full min-w-0 items-center justify-center gap-2 border border-gray-300 px-2 hover:border-[#0b2a24] transition-colors"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '11px',
                        letterSpacing: '0.12em',
                        color: '#0b2a24',
                        background: favoriteIds.has(auction.id) ? 'rgba(11, 42, 36, 0.06)' : 'transparent',
                      }}
                      aria-label={
                        favoriteIds.has(auction.id) ? 'Убрать из избранного' : 'Добавить в избранное'
                      }
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill={favoriteIds.has(auction.id) ? '#0b2a24' : 'none'}
                        stroke="#0b2a24"
                        strokeWidth="1.5"
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span className="truncate">
                        {favoriteIds.has(auction.id) ? 'В избранном' : 'В избранное'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void addToCart()}
                      disabled={cartLoading || (hasVariants && !activeVariant)}
                      className="flex h-11 w-full min-w-0 items-center justify-center border border-[#0b2a24] bg-[#0b2a24] px-2 text-white hover:bg-transparent hover:text-[#0b2a24] transition-colors disabled:opacity-50"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '11px',
                        letterSpacing: '0.12em',
                      }}
                    >
                      {cartLoading ? '…' : 'В корзину'}
                    </button>
                    </div>
                    {/* Хочу в подарок */}
                    <button
                      type="button"
                      onClick={openWish}
                      className="flex h-11 w-full min-w-0 items-center justify-center gap-2 border border-gray-200 px-2 hover:border-[#0b2a24] transition-colors"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '11px',
                        letterSpacing: '0.12em',
                        color: '#0b2a24',
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                      </svg>
                      Хочу в подарок
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompareModalOpen(true)}
                      disabled={!productCategory}
                      title={
                        productCategory
                          ? 'Выбрать товары той же категории для сравнения'
                          : 'Назначьте категорию товару в админке'
                      }
                      className="flex h-11 w-full min-w-0 items-center justify-center gap-2 border border-gray-300 px-2 text-[#0b2a24] hover:border-[#0b2a24] transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '11px',
                        letterSpacing: '0.12em',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                        <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" strokeLinecap="round" />
                      </svg>
                      <span className="truncate">
                        Сравнение{compareCount > 0 ? ` (${compareCount})` : ''}
                      </span>
                    </button>
                  {cartNotice ? (
                    <p
                      className="text-xs text-gray-600"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      {cartNotice}
                    </p>
                  ) : null}

                  {/* Запрос по товару */}
                    <button
                      type="button"
                      disabled={checkoutLoading || cartLoading || (hasVariants && !activeVariant)}
                      onClick={() => void checkoutNow()}
                      className="group relative flex h-11 w-full items-center justify-center overflow-hidden transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed sm:h-12"
                      style={{
                        backgroundColor: '#0b2a24',
                        color: '#FFFFFF',
                        fontFamily: 'var(--font-open-sans)',
                        fontSize: '11px',
                        letterSpacing: '0.14em',
                        fontWeight: 400,
                        border: '1px solid #0b2a24',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (e.currentTarget.disabled) return;
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#0b2a24';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#0b2a24';
                        e.currentTarget.style.color = '#FFFFFF';
                      }}
                    >
                      {checkoutLoading ? '…' : 'ОФОРМИТЬ СЕЙЧАС'}
                    </button>
                  </div>

                  {/* Описание */}
                  <div>
                    {/* Полный текст описания - будет из БД (auction.description) */}
                    <div
                      className="text-sm sm:text-base leading-relaxed"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#000000',
                        letterSpacing: '0.02em',
                        lineHeight: '1.6',
                      }}
                    >
                      {auction.additional_info ||
                        'Эксклюзивная позиция из коллекции CITY LEGEND. Состав, размеры и наличие уточняйте у консультанта — мы поможем подобрать аксессуар под ваш образ.'}
                    </div>
                  </div>

                  {/* Дополнительные секции (раскрывающиеся) - из БД */}
                  <div className="space-y-4 border-t border-gray-200 pt-6">
                    {auction.detail_sections && auction.detail_sections.length > 0 ? (
                      auction.detail_sections.map((section, index) => {
                        const sectionKey = `section-${index}`;
                        return (
                          <details 
                            key={index}
                            className="group"
                            onToggle={(e) => {
                              const newExpanded = new Set(expandedDetails);
                              if (e.currentTarget.open) {
                                newExpanded.add(sectionKey);
                              } else {
                                newExpanded.delete(sectionKey);
                              }
                              setExpandedDetails(newExpanded);
                            }}
                          >
                            <summary
                              className="flex items-center justify-between cursor-pointer list-none py-3"
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                color: '#000000',
                                fontSize: '14px',
                                letterSpacing: '0.02em',
                              }}
                            >
                              <span>{section.title}</span>
                              <span 
                                className="filter-expand-icon"
                                style={{ 
                                  fontSize: '20px', 
                                  color: '#0b2a24',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  position: 'relative',
                                  width: '20px',
                                  height: '20px',
                                  lineHeight: '1',
                                }}
                              >
                                <span
                                  style={{
                                    position: 'absolute',
                                    display: 'inline-block',
                                    opacity: expandedDetails.has(sectionKey) ? 0 : 1,
                                    transform: expandedDetails.has(sectionKey) ? 'rotate(-90deg) scale(0)' : 'rotate(0deg) scale(1)',
                                    transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                    pointerEvents: expandedDetails.has(sectionKey) ? 'none' : 'auto',
                                  }}
                                >
                                  +
                                </span>
                                <span
                                  style={{
                                    position: 'absolute',
                                    display: 'inline-block',
                                    opacity: expandedDetails.has(sectionKey) ? 1 : 0,
                                    transform: expandedDetails.has(sectionKey) ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0)',
                                    transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                    pointerEvents: expandedDetails.has(sectionKey) ? 'auto' : 'none',
                                  }}
                                >
                                  −
                                </span>
                              </span>
                            </summary>
                            <div
                              className="mt-4 text-sm leading-relaxed whitespace-pre-line"
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                color: '#666666',
                                letterSpacing: '0.02em',
                                lineHeight: '1.6',
                              }}
                            >
                              {section.content}
                            </div>
                          </details>
                        );
                      })
                    ) : (
                      <>
                        {/* Дефолтные секции если не настроены в админке */}
                        <details 
                          className="group"
                          onToggle={(e) => {
                            const newExpanded = new Set(expandedDetails);
                            if (e.currentTarget.open) {
                              newExpanded.add('product-details');
                            } else {
                              newExpanded.delete('product-details');
                            }
                            setExpandedDetails(newExpanded);
                          }}
                        >
                          <summary
                            className="flex items-center justify-between cursor-pointer list-none py-3"
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              color: '#000000',
                              fontSize: '14px',
                              letterSpacing: '0.02em',
                            }}
                          >
                            <span>Детали продукта</span>
                            <span 
                              className="filter-expand-icon"
                              style={{ 
                                fontSize: '20px', 
                                color: '#0b2a24',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative',
                                width: '20px',
                                height: '20px',
                                lineHeight: '1',
                              }}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  display: 'inline-block',
                                  opacity: expandedDetails.has('product-details') ? 0 : 1,
                                  transform: expandedDetails.has('product-details') ? 'rotate(-90deg) scale(0)' : 'rotate(0deg) scale(1)',
                                  transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                  pointerEvents: expandedDetails.has('product-details') ? 'none' : 'auto',
                                }}
                              >
                                +
                              </span>
                              <span
                                style={{
                                  position: 'absolute',
                                  display: 'inline-block',
                                  opacity: expandedDetails.has('product-details') ? 1 : 0,
                                  transform: expandedDetails.has('product-details') ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0)',
                                  transition: 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                  pointerEvents: expandedDetails.has('product-details') ? 'auto' : 'none',
                                }}
                              >
                                −
                              </span>
                            </span>
                          </summary>
                          <div
                            className="mt-4 text-sm leading-relaxed"
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              color: '#666666',
                              letterSpacing: '0.02em',
                              lineHeight: '1.6',
                            }}
                          >
                            <p>Детальная информация о продукте будет здесь.</p>
                          </div>
                        </details>
                      </>
                    )}
                  </div>

                  {/* Ссылки помощи */}
                  <div className="space-y-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => {
                        // Открываем кабинет: для авторизованного — сразу на вкладке "Поддержка",
                        // для гостя — экран входа/регистрации (после регистрации он останется
                        // в кабинете и сможет написать в поддержку).
                        try {
                          sessionStorage.setItem('cl_cabinet_pending_view', 'cabinet-concierge');
                        } catch {
                          /* sessionStorage недоступен */
                        }
                        window.dispatchEvent(new CustomEvent('openCabinetPanel'));
                        window.setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('openCabinetConciergeView'));
                        }, 60);
                      }}
                      className="text-sm relative inline-block group"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#000000',
                        letterSpacing: '0.02em',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      Нужна помощь? Свяжитесь с нами
                      <span className="absolute bottom-0 left-0 right-0 h-px bg-black origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></span>
                    </button>
                  </div>
                  </div>
                </div>
              </div>

              {/* Отзывы: отдельная строка сетки на всю ширину — не обрезается узкой колонкой */}
              <div
                className="order-3 col-span-full w-full border-t border-gray-200 pt-8 lg:col-span-2 px-4 sm:px-6 lg:px-4"
                style={{ position: 'relative', zIndex: 2 }}
              >
                <p
                  className="text-[11px] uppercase tracking-[0.16em] text-gray-500 mb-3"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Отзывы
                </p>
                {reviewLoading ? (
                  <p className="text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Загрузка отзывов...
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-3 mb-4">
                      <p className="text-3xl text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                        {(reviewSummary?.averageRating || 0).toFixed(1)}
                      </p>
                      <p className="text-base text-[#0b2a24] mb-1">
                        {'★★★★★'.slice(0, Math.round(reviewSummary?.averageRating || 0)).padEnd(5, '☆')}
                      </p>
                      <p className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        {reviewSummary?.totalReviews || 0} отзывов
                      </p>
                    </div>

                    <div className="space-y-2 mb-4 max-w-md">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = reviewSummary?.distribution?.[star as 1 | 2 | 3 | 4 | 5] || 0;
                        const total = Math.max(1, reviewSummary?.totalReviews || 1);
                        const width = Math.round((count / total) * 100);
                        return (
                          <div key={star} className="flex items-center gap-2">
                            <span className="w-8 text-xs text-gray-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
                              {star}★
                            </span>
                            <div className="h-1.5 flex-1 bg-gray-200">
                              <div className="h-full bg-[#0b2a24]" style={{ width: `${width}%` }} />
                            </div>
                            <span className="w-8 text-right text-xs text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {reviewSummary && reviewSummary.totalReviews > 0 ? (
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                        <span
                          className="text-[11px] uppercase tracking-[0.14em] text-gray-500"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Сортировка
                        </span>
                        <div className="relative w-full max-w-xs" ref={reviewSortMenuRef}>
                          <button
                            type="button"
                            onClick={() => setReviewSortMenuOpen((v) => !v)}
                            className="w-full min-h-9 px-3 py-2 border border-gray-300 bg-white text-xs text-left flex items-center justify-between text-[#0b2a24] focus:outline-none focus:border-[#0b2a24]"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                            aria-haspopup="listbox"
                            aria-expanded={reviewSortMenuOpen}
                            aria-label="Сортировка отзывов"
                          >
                            <span className="truncate pr-2">
                              {REVIEW_SORT_OPTIONS.find((o) => o.value === reviewSort)?.label ?? 'Сначала новые'}
                            </span>
                            <span
                              className={`shrink-0 text-[10px] transition-transform ${reviewSortMenuOpen ? 'rotate-180' : ''}`}
                              aria-hidden
                            >
                              ▾
                            </span>
                          </button>
                          {reviewSortMenuOpen ? (
                            <div className="absolute z-[60] left-0 right-0 mt-1 border border-gray-300 bg-white shadow-lg">
                              <ul role="listbox" aria-label="Варианты сортировки" className="py-1">
                                {REVIEW_SORT_OPTIONS.map((opt) => {
                                  const active = opt.value === reviewSort;
                                  return (
                                    <li key={opt.value}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReviewSort(opt.value);
                                          setReviewSortMenuOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
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
                    ) : null}

                    <div className="space-y-3">
                      {sortedProductReviews.slice(0, reviewsVisibleCount).map((rv) => (
                        <article
                          key={rv.id}
                          className="border border-gray-200 p-4 bg-[#fafafa] min-h-[3rem]"
                        >
                          <p className="text-xs text-[#0b2a24]" aria-hidden>
                            {'★★★★★'.slice(0, rv.rating).padEnd(5, '☆')}
                          </p>
                          <p
                            className="text-sm text-gray-800 mt-2 leading-relaxed whitespace-pre-wrap"
                            style={{ fontFamily: 'var(--font-open-sans)' }}
                          >
                            {rv.text || '—'}
                          </p>
                        </article>
                      ))}
                      {!reviewSummary?.totalReviews ? (
                        <p className="text-xs text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                          Пока нет отзывов по этому товару.
                        </p>
                      ) : null}
                      {sortedProductReviews.length > 5 && reviewsVisibleCount < sortedProductReviews.length ? (
                        <button
                          type="button"
                          onClick={() =>
                            setReviewsVisibleCount((n) => Math.min(n + 5, sortedProductReviews.length))
                          }
                          className="text-xs text-[#0b2a24] underline underline-offset-2 hover:no-underline"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Посмотреть ещё
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>

              {relatedAuctions.length > 0 ? (
                <div className="order-4 col-span-full w-full border-t border-gray-200 pt-10 mt-6 lg:col-span-2 px-4 sm:px-6">
                  <div className="text-center mb-6 sm:mb-8">
                    <h2
                      className="text-lg sm:text-xl md:text-2xl"
                      style={{
                        fontFamily: 'var(--font-playfair-display)',
                        color: '#000000',
                        fontWeight: 400,
                        letterSpacing: '0.01em',
                        lineHeight: '1.3',
                      }}
                    >
                      {relatedCollectionName
                        ? `Из коллекции «${relatedCollectionName}»`
                        : 'Из той же коллекции'}
                    </h2>
                  </div>

                  <div className="relative">
                    {(() => {
                      const canGoPrev =
                        relatedAuctions.length > relatedVisibleItems && relatedAuctionsIndex > 0;

                      return (
                        canGoPrev && (
                          <button
                            type="button"
                            onClick={() => {
                              setRelatedAuctionsIndex(Math.max(0, relatedAuctionsIndex - 1));
                            }}
                            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-6 sm:-translate-x-10 z-10 w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-full transition-all duration-300 hover:scale-110"
                            style={{
                              background: 'rgba(255, 255, 255, 0.85)',
                              backdropFilter: 'blur(20px) saturate(180%)',
                              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                              border: '1px solid rgba(212, 196, 184, 0.3)',
                              boxShadow: `
                          inset 0 0 20px rgba(255, 255, 255, 0.5),
                          0 8px 32px rgba(0, 0, 0, 0.12),
                          0 0 0 1px rgba(255, 255, 255, 0.1)
                        `,
                            }}
                            aria-label="Предыдущий проект"
                          >
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ color: '#0b2a24' }}
                            >
                              <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                          </button>
                        )
                      );
                    })()}

                    <div
                      ref={relatedCarouselRef}
                      className="overflow-hidden touch-pan-y"
                      onTouchStart={onRelatedCarouselTouchStart}
                      onTouchEnd={onRelatedCarouselTouchEnd}
                    >
                      <div
                        className={`flex transition-transform duration-700 ease-in-out ${
                          relatedCarouselScrollable ? '' : 'justify-center'
                        }`}
                        style={{
                          gap: '1.5rem',
                          transform:
                            relatedCarouselScrollable && carouselItemWidth > 0
                              ? `translateX(-${relatedAuctionsIndex * (carouselItemWidth + 24)}px)`
                              : 'translateX(0)',
                        }}
                      >
                        {relatedAuctions.map((relatedAuction, index) => {
                          return (
                            <div
                              key={relatedAuction.id}
                              ref={index === 0 ? relatedCarouselItemRef : null}
                              className="flex-shrink-0"
                              style={{
                                width: relatedItemWidthCss,
                                minWidth: relatedItemWidthCss,
                              }}
                            >
                              <AuctionCard
                                id={relatedAuction.id.toString()}
                                name={relatedAuction.name}
                                additionalInfo={relatedAuction.additional_info || undefined}
                                startingPrice={relatedAuction.starting_price}
                                compareAtPrice={relatedAuction.compare_at_price}
                                availabilityLine={catalogAvailabilityLine(
                                  relatedAuction.auction_dates,
                                  relatedAuction.inventory_qty,
                                  relatedAuction.reserved_qty
                                )}
                                images={relatedAuction.images || []}
                                showFavorite
                                favorited={favoriteIds.has(relatedAuction.id)}
                                onFavoriteClick={() => toggleFavorite(relatedAuction.id)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {(() => {
                      const canGoNext =
                        relatedAuctions.length > relatedVisibleItems &&
                        relatedAuctionsIndex < relatedAuctions.length - relatedVisibleItems;

                      return (
                        canGoNext && (
                          <button
                            type="button"
                            onClick={() => {
                              const maxIndex = relatedAuctions.length - relatedVisibleItems;
                              setRelatedAuctionsIndex(Math.min(maxIndex, relatedAuctionsIndex + 1));
                            }}
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-6 sm:translate-x-10 z-10 w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-full transition-all duration-300 hover:scale-110"
                            style={{
                              background: 'rgba(255, 255, 255, 0.85)',
                              backdropFilter: 'blur(20px) saturate(180%)',
                              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                              border: '1px solid rgba(212, 196, 184, 0.3)',
                              boxShadow: `
                          inset 0 0 20px rgba(255, 255, 255, 0.5),
                          0 8px 32px rgba(0, 0, 0, 0.12),
                          0 0 0 1px rgba(255, 255, 255, 0.1)
                        `,
                            }}
                            aria-label="Следующий проект"
                          >
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ color: '#0b2a24' }}
                            >
                              <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                          </button>
                        )
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Модальное окно с лупой */}
      {isZoomModalOpen && (
        <div
          className="zoom-modal-enter fixed inset-0 z-[100] bg-black flex"
          onClick={() => {
            setIsZoomModalOpen(false);
            setIsZooming(false);
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomModalOpen(false);
              setIsZooming(false);
            }}
            className="close-button fixed z-[300] flex h-12 w-12 items-center justify-center text-white sm:h-11 sm:w-11"
            style={{
              top: 'max(1rem, env(safe-area-inset-top, 0px))',
              right: 'max(1rem, env(safe-area-inset-right, 0px))',
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(10px)',
              borderRadius: '50%',
              cursor: 'pointer',
            }}
            aria-label="Закрыть"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Левая панель с миниатюрами */}
          <div className="hidden lg:flex flex-col items-center justify-center w-32 p-4 space-y-3 overflow-y-auto absolute left-0 top-0 bottom-0 z-10" style={{ cursor: 'auto' }}>
            {images.map((image, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomImageIndex(index);
                  setIsZooming(true);
                  setZoomPosition({ x: 0, y: 0 }); // Центрируем
                }}
                className={`thumbnail-button relative w-20 h-20 overflow-hidden border-2 ${
                  index === zoomImageIndex
                    ? 'border-white scale-110'
                    : 'border-transparent opacity-60'
                }`}
              >
                <ProductPhoto
                  src={image}
                  alt={`Миниатюра ${index + 1}`}
                  sizes="80px"
                />
              </button>
            ))}
          </div>

          {/* Мобильная панель с миниатюрами (внизу) */}
          <div className="lg:hidden absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 p-4 overflow-x-auto bg-black/50 backdrop-blur-sm" style={{ cursor: 'auto' }}>
            {images.map((image, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomImageIndex(index);
                  setIsZooming(true);
                  setZoomPosition({ x: 0, y: 0 }); // Центрируем
                }}
                className={`thumbnail-button relative w-16 h-16 flex-shrink-0 overflow-hidden border-2 ${
                  index === zoomImageIndex
                    ? 'border-white scale-110'
                    : 'border-transparent opacity-60'
                }`}
              >
                <ProductPhoto
                  src={image}
                  alt={`Миниатюра ${index + 1}`}
                  sizes="80px"
                />
              </button>
            ))}
          </div>

          {/* Центральная часть - большое изображение */}
          <div
            className="flex-1 flex items-center justify-center relative w-full h-full"
            style={{ cursor: isZooming ? 'grab' : 'zoom-in' }}
            onMouseMove={handleZoomMouseMove}
            onTouchMove={(e) => {
              if (isZooming && e.touches.length > 0) {
                const touch = e.touches[0];
                const rect = e.currentTarget.getBoundingClientRect();
                
                // Позиция touch относительно контейнера (0-100%)
                const touchX = ((touch.clientX - rect.left) / rect.width) * 100;
                const touchY = ((touch.clientY - rect.top) / rect.height) * 100;

                const maxOffset = galleryZoomMaxOffsetPct(GALLERY_ZOOM_SCALE);
                const offsetX = (50 - touchX) * 0.5;
                const offsetY = (50 - touchY) * 0.5;
                
                const clampedX = Math.max(-maxOffset, Math.min(maxOffset, offsetX));
                const clampedY = Math.max(-maxOffset, Math.min(maxOffset, offsetY));

                setZoomPosition({ x: clampedX, y: clampedY });
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleZoomClick();
            }}
          >
            <div className="relative w-full h-full flex items-center justify-center" style={{ overflow: 'visible' }}>
              <img
                ref={zoomImageRef}
                src={optimizedMediaSrc(images[zoomImageIndex], 1920, 82)}
                alt={`${auction.name} - фото ${zoomImageIndex + 1}`}
                className="zoom-image-enter"
                style={{
                  position: 'fixed',
                  width: '100vw',
                  height: '100vh',
                  left: '50%',
                  top: '50%',
                  objectFit: 'contain',
                  transform: isZooming 
                    ? `translate(calc(-50% + ${zoomPosition.x}%), calc(-50% + ${zoomPosition.y}%)) scale(${GALLERY_ZOOM_SCALE})`
                    : 'translate(-50%, -50%) scale(1)',
                  touchAction: 'none',
                  willChange: 'transform',
                  transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      <Footer />

      {/* Модальное окно для просмотра сертификата */}
      {isCertificateModalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
          onClick={() => {
            setIsCertificateModalOpen(false);
            setIsCertificateFullscreenOpen(false);
          }}
          style={{
            animation: 'certificateFadeIn 0.3s ease-out',
          }}
        >
          <style dangerouslySetInnerHTML={{
            __html: `
              @keyframes certificateFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes certificateSlideUp {
                from { 
                  opacity: 0; 
                  transform: translateY(30px); 
                }
                to { 
                  opacity: 1; 
                  transform: translateY(0); 
                }
              }
            `
          }} />
          
          {/* Контейнер модального окна */}
          <div
            className="relative max-w-6xl w-[90%] max-h-[90vh] bg-white p-4 sm:p-6 overflow-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation: 'certificateSlideUp 0.4s ease-out',
            }}
          >
            
            {/* Заголовок */}
            <div className="mb-6">
              <h3
                className="text-xl sm:text-2xl text-center"
                style={{
                  fontFamily: 'var(--font-playfair-display)',
                  color: '#000000',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                }}
              >
                {catalogLabels.certificateModalTitle}
              </h3>
              <p
                className="text-sm text-center mt-2"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#696969',
                  letterSpacing: '0.02em',
                }}
              >
                {auction.name}
              </p>
            </div>

            {/* Сертификаты или текст об отсутствии */}
            {(() => {
              const allCertificates = getAllCertificates();

              if (allCertificates.length === 0) {
                return (
                  <div className="flex justify-center items-center py-12">
                    <p
                      className="text-base sm:text-lg text-center"
                      style={{
                        fontFamily: 'var(--font-open-sans)',
                        color: '#696969',
                        letterSpacing: '0.02em',
                        lineHeight: '1.6',
                      }}
                    >
                      {catalogLabels.certificateMissing}
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {allCertificates.map((cert: { url: string; type: 'image' | 'pdf' }, index: number) => (
                    <div
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullscreenCertificateIndex(index);
                        setIsCertificateFullscreenOpen(true);
                      }}
                      className="cursor-pointer border border-gray-200 hover:border-black transition-colors"
                    >
                      {cert.type === 'image' ? (
                        <div className="relative w-full h-48">
                          <ProductPhoto
                            src={cert.url}
                            alt={`Сертификат ${index + 1}`}
                            sizes="(max-width: 640px) 50vw, 240px"
                          />
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                          <div className="text-center">
                            <svg className="w-16 h-16 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm text-gray-600">PDF</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Модальное окно для полноэкранного просмотра сертификата */}
      {isCertificateFullscreenOpen && auction && (() => {
        const allCertificates = getAllCertificates();
        if (allCertificates.length === 0) return null;
        
        const currentCert = allCertificates[fullscreenCertificateIndex];
        
        return (
          <div
            className="fixed inset-0 z-[10000] bg-black flex items-center justify-center"
            onClick={() => setIsCertificateFullscreenOpen(false)}
          >
            <div
              className="relative w-full h-full flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              {currentCert.type === 'image' ? (
                <img
                  src={optimizedMediaSrc(currentCert.url, 1920, 82)}
                  alt={`Сертификат ${fullscreenCertificateIndex + 1}`}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <iframe
                  src={currentCert.url}
                  className="w-full h-full"
                  title={`Сертификат ${fullscreenCertificateIndex + 1}`}
                />
              )}
              
              {/* Навигация между сертификатами (если их несколько) */}
              {allCertificates.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFullscreenCertificateIndex((prev) => 
                        prev === 0 ? allCertificates.length - 1 : prev - 1
                      );
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/70 text-white px-4 py-2 hover:bg-black/90 transition-colors"
                  >
                    ←
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFullscreenCertificateIndex((prev) => 
                        prev === allCertificates.length - 1 ? 0 : prev + 1
                      );
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/70 text-white px-4 py-2 hover:bg-black/90 transition-colors"
                  >
                    →
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded">
                    {fullscreenCertificateIndex + 1} / {allCertificates.length}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Модальное окно для полноэкранного просмотра фотографий на мобильных */}
      {auction && !auctionMissing ? (
        <ComparePickerModal
          open={compareModalOpen}
          onClose={() => setCompareModalOpen(false)}
          currentAuctionId={auction.id}
          categoryLabel={productCategory?.name ?? null}
          categoryId={productCategory?.id ?? null}
        />
      ) : null}

      {/* Модалка "Хочу в подарок" */}
      {wishModalOpen && auction && (
        <div
          className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center"
          onClick={() => setWishModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px]" />
          <div
            className="relative z-10 w-full sm:max-w-lg bg-[#faf9f7] shadow-2xl overflow-hidden max-h-[95vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Закрыть */}
            <button
              type="button"
              onClick={() => setWishModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-black transition-colors z-10"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            {/* ШАГ 1 — Форма */}
            {wishStep === 'form' && (
              <>
                {/* Превью товара — горизонтальная полоса */}
                <div className="flex items-center gap-4 px-6 pt-6 pb-5 border-b border-gray-100">
                  {auction.images?.[0] && (
                    <div className="w-14 h-14 shrink-0 overflow-hidden bg-gray-100 relative">
                      <ProductPhoto src={auction.images[0]} alt={auction.name} sizes="56px" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Хочу в подарок
                    </p>
                    <p className="text-sm font-normal leading-snug truncate" style={{ fontFamily: 'var(--font-playfair-display)', color: '#0b2a24' }}>
                      {auction.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5" style={{ fontFamily: 'var(--font-open-sans)' }}>{auction.starting_price}</p>
                  </div>
                </div>

                <div className="px-6 py-6 sm:px-8">
                  <p className="text-[11px] text-gray-500 mb-5 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Расскажите немного — мы создадим персональную страницу, которую вы сможете отправить тому, кто подарит вам это украшение.
                  </p>

                  <div className="space-y-0">
                    {/* Имя друга */}
                    <div className="border-b border-gray-200 focus-within:border-[#0b2a24] transition-colors pb-0.5 mb-5">
                      <label className="block text-[9px] uppercase tracking-[0.2em] text-gray-400 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Кому отправляете? *
                      </label>
                      <input
                        type="text"
                        value={wishForm.friendName}
                        onChange={(e) => setWishForm(f => ({ ...f, friendName: e.target.value }))}
                        placeholder="Имя человека, который дарит"
                        className="w-full bg-transparent border-0 outline-none text-sm py-1 placeholder:text-gray-300"
                        style={{ fontFamily: 'var(--font-open-sans)', color: '#0b2a24' }}
                        maxLength={100}
                      />
                    </div>

                    {/* Повод */}
                    <div className="border-b border-gray-200 focus-within:border-[#0b2a24] transition-colors pb-0.5 mb-5">
                      <label className="block text-[9px] uppercase tracking-[0.2em] text-gray-400 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Повод
                      </label>
                      <input
                        type="text"
                        value={wishForm.occasion}
                        onChange={(e) => setWishForm(f => ({ ...f, occasion: e.target.value }))}
                        placeholder="День рождения, годовщина, просто так..."
                        className="w-full bg-transparent border-0 outline-none text-sm py-1 placeholder:text-gray-300"
                        style={{ fontFamily: 'var(--font-open-sans)', color: '#0b2a24' }}
                        maxLength={100}
                      />
                    </div>

                    {/* Дата */}
                    <div className="border-b border-gray-200 focus-within:border-[#0b2a24] transition-colors pb-0.5 mb-5">
                      <label className="block text-[9px] uppercase tracking-[0.2em] text-gray-400 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Дата или период
                      </label>
                      <input
                        type="text"
                        value={wishForm.wishDate}
                        onChange={(e) => setWishForm(f => ({ ...f, wishDate: e.target.value }))}
                        placeholder="15 мая, скоро, в это воскресенье..."
                        className="w-full bg-transparent border-0 outline-none text-sm py-1 placeholder:text-gray-300"
                        style={{ fontFamily: 'var(--font-open-sans)', color: '#0b2a24' }}
                        maxLength={60}
                      />
                    </div>

                    {/* Личное сообщение */}
                    <div className="border-b border-gray-200 focus-within:border-[#0b2a24] transition-colors pb-0.5 mb-6">
                      <label className="block text-[9px] uppercase tracking-[0.2em] text-gray-400 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        Личное сообщение
                      </label>
                      <textarea
                        value={wishForm.personalMessage}
                        onChange={(e) => setWishForm(f => ({ ...f, personalMessage: e.target.value }))}
                        placeholder="Что хочется добавить от себя..."
                        rows={2}
                        className="w-full bg-transparent border-0 outline-none text-sm py-1 placeholder:text-gray-300 resize-none"
                        style={{ fontFamily: 'var(--font-open-sans)', color: '#0b2a24' }}
                        maxLength={300}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void submitWishForm()}
                    disabled={wishLoading || !wishForm.friendName.trim()}
                    className="w-full h-12 bg-[#0b2a24] text-white text-[11px] uppercase tracking-[0.18em] hover:bg-transparent hover:text-[#0b2a24] hover:border hover:border-[#0b2a24] transition-all disabled:opacity-40"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    {wishLoading ? '…' : 'Создать страницу желания →'}
                  </button>
                </div>
              </>
            )}

            {/* ШАГ 2 — Шеринг */}
            {wishStep === 'share' && wishToken && (
              <>
                {auction.images?.[0] && (
                  <div className="aspect-[16/7] overflow-hidden bg-gray-100 relative">
                    <ProductPhoto src={auction.images[0]} alt={auction.name} sizes="100vw" />
                  </div>
                )}

                <div className="px-6 py-6 sm:px-8">
                  <div className="text-center mb-6">
                    <div className="w-10 h-10 mx-auto mb-3 flex items-center justify-center border border-gray-200 rounded-full">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0b2a24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>Страница создана</p>
                    <h3 className="text-lg font-normal italic" style={{ fontFamily: 'var(--font-playfair-display)', color: '#0b2a24' }}>
                      Отправьте {wishForm.friendName || 'другу'}
                    </h3>
                    {wishForm.occasion && (
                      <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                        {wishForm.occasion}{wishForm.wishDate ? ` · ${wishForm.wishDate}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Кнопки шеринга */}
                  <div className="flex gap-3 mb-4">
                    {[
                      {
                        label: 'Telegram',
                        color: '#229ED9',
                        href: `https://t.me/share/url?url=${encodeURIComponent(`${window.location.origin}/wish/${wishToken}`)}&text=${encodeURIComponent(`${wishForm.friendName ? `${wishForm.friendName}, я` : 'Я'} очень хочу это в 🎁 подарок${wishForm.occasion ? ` — ${wishForm.occasion}` : ''}!\n\n${auction.name}`)}`,
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg>,
                      },
                      {
                        label: 'TG Бот',
                        color: '#229ED9',
                        href: `https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'city_legend_officalbot'}`,
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73A2 2 0 0 1 12 2M7.5 13a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1m7 0a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1M5 18v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2H5Z"/></svg>,
                      },
                      ...(process.env.NEXT_PUBLIC_MAX_BOT_LINK
                        ? [{
                            label: 'Max Бот',
                            color: '#6B7280',
                            href: process.env.NEXT_PUBLIC_MAX_BOT_LINK,
                            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73A2 2 0 0 1 12 2M7.5 13a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1m7 0a.5.5 0 0 0-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1M5 18v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2H5Z"/></svg>,
                          }]
                        : []),
                      {
                        label: 'ВКонтакте',
                        color: '#4C75A3',
                        href: `https://vk.com/share.php?url=${encodeURIComponent(`${window.location.origin}/wish/${wishToken}`)}&title=${encodeURIComponent(`🎁 ${auction.name}`)}`,
                        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.101-.458.593v1.575c0 .424-.135.677-1.253.677-1.846 0-3.896-1.118-5.335-3.202C5.044 11.519 4.5 9.553 4.5 9.129c0-.254.101-.491.593-.491h1.744c.44 0 .61.203.78.677.864 2.49 2.303 4.675 2.896 4.675.22 0 .322-.101.322-.66V10.95c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.743c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.253-1.406 2.15-3.574 2.15-3.574.119-.254.322-.491.762-.491h1.744c.525 0 .643.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .779.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.745-.576.745z"/></svg>,
                      },
                    ].map((s) => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex flex-col items-center justify-center gap-1.5 h-14 border border-gray-200 hover:border-gray-400 transition-colors"
                        style={{ color: s.color, fontFamily: 'var(--font-open-sans)' }}
                      >
                        {s.icon}
                        <span className="text-[9px] uppercase tracking-[0.1em] text-gray-500">{s.label}</span>
                      </a>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void copyWishLink()}
                    className="flex items-center justify-center gap-2 w-full h-11 border border-gray-300 text-[11px] uppercase tracking-[0.15em] text-gray-600 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    {wishCopied ? 'Скопировано ✓' : 'Скопировать ссылку'}
                  </button>

                  <p className="text-center text-[10px] text-gray-400 mt-4 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Страница открыта для всех, у кого есть ссылка
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isFullscreenModalOpen && images.length > 0 && (
        <div
          className="lg:hidden fixed inset-0 z-[9999] bg-black"
          onClick={() => setIsFullscreenModalOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreenModalOpen(false);
            }}
            className="close-button fixed z-[10001] flex h-12 w-12 items-center justify-center text-white"
            style={{
              top: 'max(1rem, env(safe-area-inset-top, 0px))',
              right: 'max(1rem, env(safe-area-inset-right, 0px))',
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(10px)',
              borderRadius: '50%',
              cursor: 'pointer',
            }}
            aria-label="Закрыть"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div 
            className="relative w-full h-full flex items-center"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="flex transition-transform duration-300 ease-out w-full h-full"
              style={{
                transform: `translateX(-${mobileImageIndex * 100}%)`,
              }}
            >
              {images.map((image, index) => (
                <div
                  key={index}
                  className="w-full h-full flex-shrink-0 flex items-center justify-center relative"
                >
                  <ProductPhoto
                    src={image}
                    alt={`${auction.name} - фото ${index + 1}`}
                    sizes="100vw"
                    imageClassName="object-contain"
                  />
                </div>
              ))}
            </div>
            
            {/* Индикаторы (круги) */}
            {images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1.5 z-10">
                {images.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMobileImageIndex(index);
                    }}
                    className={`rounded-full transition-all duration-300 ${
                      index === mobileImageIndex 
                        ? 'w-6 h-1.5' 
                        : 'w-1.5 h-1.5'
                    }`}
                    style={{
                      backgroundColor: index === mobileImageIndex ? '#0b2a24' : 'rgba(11, 42, 36, 0.4)'
                    }}
                    aria-label={`Перейти к фото ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

