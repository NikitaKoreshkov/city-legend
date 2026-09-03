'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  addCompareId,
  getCompareIds,
  removeCompareId,
  COMPARE_MAX,
  type AddCompareResult,
} from '@/lib/compareStorage';
import { displayPriceLabel, hasCompareAtPrice } from '@/lib/cartPricing';
import { catalogAvailabilityLine } from '@/lib/stockDisplay';

type Candidate = {
  id: number;
  name: string;
  additional_info?: string | null;
  starting_price: string;
  compare_at_price?: string | null;
  images?: string[] | null;
  auction_dates?: string | null;
  inventory_qty?: number | null;
  reserved_qty?: number | null;
};

type SortKey = 'relevance' | 'price-low' | 'price-high' | 'name-asc' | 'name-desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'По релевантности' },
  { value: 'price-low', label: 'Цена: по возрастанию' },
  { value: 'price-high', label: 'Цена: по убыванию' },
  { value: 'name-asc', label: 'Название А → Я' },
  { value: 'name-desc', label: 'Название Я → А' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  currentAuctionId: number;
  categoryLabel: string | null;
  categoryId: number | null;
};

export default function ComparePickerModal({
  open,
  onClose,
  currentAuctionId,
  categoryLabel,
  categoryId,
}: Props) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('relevance');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [compareIds, setCompareIdsState] = useState<number[]>([]);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  const refreshCompare = useCallback(() => setCompareIdsState(getCompareIds()), []);

  useEffect(() => {
    refreshCompare();
    const h = () => refreshCompare();
    window.addEventListener('compareStorageChanged', h);
    return () => window.removeEventListener('compareStorageChanged', h);
  }, [refreshCompare]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open || categoryId == null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const u = new URL(`/api/auctions/${currentAuctionId}/compare-candidates`, window.location.origin);
        if (debouncedQ) u.searchParams.set('q', debouncedQ);
        u.searchParams.set('sortBy', sortBy);
        const res = await fetch(u.toString(), { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && res.ok && Array.isArray(data.candidates)) {
          setCandidates(data.candidates);
        } else if (!cancelled) {
          setCandidates([]);
        }
      } catch {
        if (!cancelled) setCandidates([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, categoryId, currentAuctionId, debouncedQ, sortBy]);

  useEffect(() => {
    if (!open) setSortMenuOpen(false);
  }, [open]);

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sortMenuOpen) {
          setSortMenuOpen(false);
          return;
        }
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, sortMenuOpen]);

  const compareHref =
    compareIds.length >= 2 ? `/auctions/compare?ids=${compareIds.join(',')}` : '/auctions/compare';

  const tryAdd = (lotId: number) => {
    setMessage(null);
    const r: AddCompareResult = addCompareId(lotId);
    refreshCompare();
    if (r.ok) setMessage('Товар добавлен в сравнение');
    else if (r.reason === 'duplicate') setMessage('Уже в списке сравнения');
    else if (r.reason === 'full') setMessage(`Не больше ${COMPARE_MAX} товаров`);
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col bg-white shadow-xl sm:max-h-[85vh] sm:rounded-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
          <div>
            <h2
              id="compare-modal-title"
              className="text-base sm:text-lg text-[#0b2a24]"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              Добавить к сравнению
            </h2>
            {categoryLabel ? (
              <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                Только категория: {categoryLabel}
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-800" style={{ fontFamily: 'var(--font-open-sans)' }}>
                У товара нет категории — выберите категорию в админке.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 py-3 sm:px-5">
          {categoryId != null ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Поиск по названию или описанию…"
                  className="min-h-10 flex-1 border border-gray-300 px-3 text-sm outline-none focus:border-[#0b2a24]"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                />
                <div className="relative w-full shrink-0 sm:w-[220px]" ref={sortMenuRef}>
                  <span
                    className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-gray-500 sm:sr-only"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Сортировка
                  </span>
                  <button
                    type="button"
                    onClick={() => setSortMenuOpen((v) => !v)}
                    className="flex min-h-10 w-full items-center justify-between border border-gray-300 bg-white px-3 py-2 text-left text-xs text-[#0b2a24] focus:outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                    aria-haspopup="listbox"
                    aria-expanded={sortMenuOpen}
                    aria-label="Сортировка списка"
                  >
                    <span className="truncate pr-2">
                      {SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'По релевантности'}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] transition-transform ${sortMenuOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    >
                      ▾
                    </span>
                  </button>
                  {sortMenuOpen ? (
                    <div className="absolute z-[130] left-0 right-0 mt-1 border border-gray-300 bg-white shadow-lg">
                      <ul role="listbox" aria-label="Варианты сортировки" className="max-h-56 overflow-y-auto py-1">
                        {SORT_OPTIONS.map((opt) => {
                          const active = opt.value === sortBy;
                          return (
                            <li key={opt.value}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSortBy(opt.value);
                                  setSortMenuOpen(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-xs transition-colors ${
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

              <button
                type="button"
                onClick={() => tryAdd(currentAuctionId)}
                disabled={compareIds.includes(currentAuctionId)}
                className="w-full border border-[#0b2a24] py-2 text-xs uppercase tracking-[0.12em] text-[#0b2a24] hover:bg-[#0b2a24] hover:text-white disabled:opacity-40"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {compareIds.includes(currentAuctionId) ? 'Этот товар уже в сравнении' : 'Добавить текущий товар'}
              </button>

              {message ? (
                <p className="text-xs text-gray-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
                  {message}
                </p>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto border border-gray-100">
                {loading ? (
                  <p className="p-4 text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    Загрузка…
                  </p>
                ) : candidates.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                    {debouncedQ ? 'Ничего не найдено в этой категории.' : 'Других товаров в категории нет.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {candidates.map((c) => {
                      const img = c.images?.[0];
                      const inList = compareIds.includes(c.id);
                      return (
                        <li key={c.id} className="flex gap-3 p-3 sm:gap-4">
                          <div className="h-16 w-14 shrink-0 bg-gray-100">
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={img} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#0b2a24] line-clamp-2" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                              {c.name}
                            </p>
                            {c.additional_info ? (
                              <p className="mt-0.5 text-xs text-gray-500 line-clamp-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
                                {c.additional_info}
                              </p>
                            ) : null}
                            <p className="mt-1 text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                              {hasCompareAtPrice(c.compare_at_price) ? (
                                <>
                                  <span className="text-gray-400 line-through mr-2">
                                    {displayPriceLabel(String(c.compare_at_price).trim())}
                                  </span>
                                  {displayPriceLabel(c.starting_price)}
                                </>
                              ) : (
                                displayPriceLabel(c.starting_price)
                              )}
                            </p>
                            <p className="text-[10px] text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
                              {catalogAvailabilityLine(c.auction_dates, c.inventory_qty, c.reserved_qty) || ' '}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col justify-center gap-1">
                            {inList ? (
                              <>
                                <span className="text-[10px] uppercase tracking-wider text-gray-500">В списке</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    removeCompareId(c.id);
                                    refreshCompare();
                                  }}
                                  className="text-xs text-red-700 underline"
                                  style={{ fontFamily: 'var(--font-open-sans)' }}
                                >
                                  Убрать
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => tryAdd(c.id)}
                                disabled={compareIds.length >= COMPARE_MAX}
                                className="border border-gray-300 px-2 py-1.5 text-[10px] uppercase tracking-wider text-[#0b2a24] hover:border-[#0b2a24] disabled:opacity-40"
                                style={{ fontFamily: 'var(--font-open-sans)' }}
                              >
                                В сравнение
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:justify-between sm:px-5">
          <p className="text-xs text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
            В сравнении: {compareIds.length} / {COMPARE_MAX}
          </p>
          <div className="flex gap-2">
            {compareIds.length >= 2 ? (
              <Link
                href={compareHref}
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center border border-[#0b2a24] bg-[#0b2a24] px-4 py-2 text-center text-xs uppercase tracking-[0.12em] text-white sm:flex-none"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Открыть сравнение
              </Link>
            ) : (
              <span
                className="inline-flex flex-1 cursor-not-allowed items-center justify-center border border-gray-200 px-4 py-2 text-center text-xs uppercase tracking-[0.12em] text-gray-400 sm:flex-none"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Минимум 2 товара
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
