'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { displayPriceLabel, hasCompareAtPrice } from '@/lib/cartPricing';
import { catalogAvailabilityLine } from '@/lib/stockDisplay';
import { clearCompare, getCompareIds, setCompareIds } from '@/lib/compareStorage';
import {
  allFormattedEqual,
  certificatesSummary,
  formatFilterCell,
  stripHtml,
  truncateText,
  type FilterMeta,
} from '@/lib/compareDisplay';
import Footer from '../../components/Footer';

type DetailSection = { title: string; content: string };

type Row = Record<string, unknown> & {
  id: number;
  name: string;
  additional_info?: string | null;
  starting_price: string;
  compare_at_price?: string | null;
  images?: string[] | null;
  auction_dates?: string | null;
  inventory_qty?: number | null;
  reserved_qty?: number | null;
  detail_sections?: unknown;
  filter_values?: Record<string, unknown> | null;
  certificates?: unknown;
  certificate_url?: string | null;
  subcategory?: string | null;
  category?: string | null;
  collection_name?: string | null;
  review_avg?: number | null;
  review_count?: number | null;
  is_sellable?: boolean | null;
  created_at?: string | Date | null;
};

function normalizeDetailSections(raw: unknown): DetailSection[] {
  if (!raw) return [];
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as { title?: string; content?: string };
      return {
        title: String(o.title || '').trim(),
        content: String(o.content || ''),
      };
    })
    .filter((s): s is DetailSection => s !== null && s.title.length > 0);
}

function collectDetailTitles(auctions: Row[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const a of auctions) {
    for (const s of normalizeDetailSections(a.detail_sections)) {
      if (!seen.has(s.title)) {
        seen.add(s.title);
        order.push(s.title);
      }
    }
  }
  return order;
}

function sectionPlainText(a: Row, title: string): string {
  const s = normalizeDetailSections(a.detail_sections).find((x) => x.title === title);
  if (!s) return '';
  return truncateText(stripHtml(s.content), 480);
}

function normalizeFilterValues(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, unknown>;
}

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, Math.round(value * 10) / 10));
  const full = Math.floor(v);
  const half = v - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <span className="inline-flex items-center gap-0.5 text-[#c4a35a]" aria-label={`Рейтинг ${v} из 5`}>
      {Array.from({ length: full }, (_, i) => (
        <span key={`f-${i}`}>★</span>
      ))}
      {half ? <span className="text-[#c4a35a]/70">½</span> : null}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e-${i}`} className="text-gray-200">
          ★
        </span>
      ))}
    </span>
  );
}

function ComparePageInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const idsParam = sp.get('ids') || '';
  const [data, setData] = useState<{
    categoryName: string | null;
    filters: FilterMeta[];
    auctions: Row[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const fromUrl = idsParam
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      const fromStorage = getCompareIds();
      const raw = fromUrl.length >= 2 ? fromUrl : fromStorage;
      const unique = [...new Set(raw)];
      if (unique.length < 2) {
        if (!cancelled) {
          setData(null);
          setError('Добавьте минимум два товара из одной категории на странице проекта (кнопка «Сравнение»).');
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch(`/api/auctions/compare-data?ids=${unique.join(',')}`, { cache: 'no-store' });
        const j = await res.json();
        if (!cancelled) {
          if (!res.ok) {
            setError(typeof j.error === 'string' ? j.error : 'Не удалось загрузить');
            setData(null);
          } else {
            const auctions = Array.isArray(j.auctions) ? j.auctions : [];
            setCompareIds(auctions.map((a: Row) => a.id));
            setData({
              categoryName: j.categoryName ?? null,
              filters: Array.isArray(j.filters) ? j.filters : [],
              auctions,
            });
            setError(null);
          }
        }
      } catch {
        if (!cancelled) {
          setError('Нет соединения');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsParam]);

  const detailTitles = useMemo(
    () => (data?.auctions.length ? collectDetailTitles(data.auctions) : []),
    [data?.auctions]
  );

  const removeColumn = (id: number) => {
    if (!data?.auctions.length) return;
    const remaining = data.auctions.filter((a) => a.id !== id).map((a) => a.id);
    setCompareIds(remaining);
    if (remaining.length < 2) {
      router.push('/auctions/compare');
    } else {
      router.push(`/auctions/compare?ids=${remaining.join(',')}`);
    }
  };

  if (loading) {
    return (
      <div className="mt-24 flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#faf9f6] px-4 pb-24 pt-8 sm:mt-28 sm:pt-10 md:mt-32">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-[#0b2a24] border-t-transparent"
          aria-hidden
        />
        <p className="text-sm tracking-wide text-stone-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Загрузка сравнения…
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto mt-24 min-h-[50vh] max-w-lg bg-[#faf9f6] px-4 pb-24 pt-8 sm:mt-28 sm:pt-10 md:mt-32">
        <p className="text-sm text-stone-700 mb-6 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
          {error}
        </p>
        <Link
          href="/auctions"
          className="text-sm text-[#0b2a24] underline underline-offset-4 decoration-[#c4a35a]/60"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          В каталог
        </Link>
      </div>
    );
  }

  if (!data?.auctions.length) return null;

  const cols = data.auctions;
  const colCount = cols.length;

  const renderDiffCells = (displayValues: string[]) => {
    const same = allFormattedEqual(displayValues);
    return displayValues.map((text, i) => {
      const show = text.trim() ? text : '—';
      return (
        <td
          key={i}
          className={`compare-cell border-b border-[#ebe8e0] px-5 py-4 align-top text-sm leading-relaxed text-stone-700 sm:px-6 sm:py-5 ${
            !same ? 'bg-[#fffdf8]' : 'bg-white/90'
          }`}
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          {show}
        </td>
      );
    });
  };

  return (
    <div className="w-full bg-[#faf9f6] pb-8 sm:pb-12">
      {/* Отступ от фиксированного хедера; под ним — полоска фона страницы (#faf9f6) */}
      <div className="relative mt-24 overflow-hidden border-b border-[#e5e0d4] bg-gradient-to-br from-[#1a3d34] via-[#0b2a24] to-[#0d2520] sm:mt-28 md:mt-32">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 60L60 0M-15 15L15-15M45 75L75 45' stroke='%23fff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="container relative mx-auto max-w-[1600px] px-4 pb-10 pt-14 sm:px-6 sm:pb-12 sm:pt-16 lg:px-8 lg:pt-20">
          <p
            className="mb-2 text-[10px] uppercase tracking-[0.28em] text-[#c4a35a]"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            Подборка
          </p>
          <h1
            className="max-w-3xl text-3xl sm:text-4xl font-normal leading-tight text-white"
            style={{ fontFamily: 'var(--font-playfair-display)' }}
          >
            Сравнение изделий
          </h1>
          {data.categoryName ? (
            <p
              className="mt-4 max-w-xl text-sm leading-relaxed text-white/75"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Одна категория — <span className="text-white/95">{data.categoryName}</span>. Все параметры собраны в одной
              матрице: от цены и наличия до характеристик, описаний и документов.
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                clearCompare();
                router.push('/auctions/compare');
              }}
              className="border border-white/25 bg-white/5 px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm transition hover:bg-white/10"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Очистить список
            </button>
            <Link
              href="/auctions"
              className="inline-flex items-center border border-[#c4a35a] bg-[#c4a35a] px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#0b2a24] transition hover:bg-[#d4b76a]"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              В каталог
            </Link>
          </div>
        </div>
      </div>

      {/* Явный зазор между шапкой-героя и блоком таблицы (раньше -mt подтягивал панели) */}
      <div className="container relative z-[1] mx-auto mt-10 max-w-[1600px] px-4 sm:mt-12 sm:px-6 md:mt-14 lg:mt-16 lg:px-8">
        <div className="overflow-x-auto rounded-sm border border-[#e5e0d4] bg-[#ebe8e0] p-4 shadow-[0_24px_60px_-24px_rgba(11,42,36,0.18)] sm:p-6 md:p-8">
          <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-x-2 border-spacing-y-0 text-left sm:border-spacing-x-3">
            <colgroup>
              <col className="w-44 min-w-[11rem]" />
              {cols.map((c) => (
                <col key={c.id} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-[#e5e0d4] bg-[#f7f5f0]">
                <th
                  className="compare-sticky sticky left-0 z-20 border-r border-[#e5e0d4] bg-[#f7f5f0] p-0 align-bottom shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)]"
                  scope="col"
                >
                  <div className="px-5 py-6 sm:px-6 sm:py-8">
                    <span
                      className="text-[10px] uppercase tracking-[0.2em] text-stone-500"
                      style={{ fontFamily: 'var(--font-open-sans)' }}
                    >
                      Параметр
                    </span>
                  </div>
                </th>
                {cols.map((a) => (
                  <th key={a.id} scope="col" className="bg-[#f7f5f0] p-0 align-top">
                    {/* Равные колонки (table-fixed + col) + фикс. высота фото — без aspect, иначе ширина колонки меняет размер картинки */}
                    <div className="grid w-full min-w-0 grid-cols-1 grid-rows-[220px_5.25rem_3rem_4.25rem_auto] gap-y-5 px-4 pb-7 pt-2 sm:grid-rows-[248px_5.75rem_3.25rem_4.5rem_auto] sm:gap-y-6 sm:px-5 sm:pb-8 sm:pt-3">
                      <div className="box-border flex h-[220px] w-full shrink-0 flex-col overflow-hidden rounded-sm bg-[#eceae4] p-2 shadow-[inset_0_0_0_1px_rgba(229,224,212,0.9)] sm:h-[248px]">
                        {a.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.images[0]}
                            alt=""
                            className="h-full min-h-0 w-full flex-1 rounded-sm object-cover"
                          />
                        ) : (
                          <div className="flex min-h-0 flex-1 items-center justify-center text-[10px] text-stone-400">
                            Нет фото
                          </div>
                        )}
                      </div>
                      <div className="min-h-0 overflow-hidden">
                        <Link
                          href={`/auctions/${a.id}`}
                          className="line-clamp-4 text-left text-base leading-[1.35] text-[#0b2a24] transition hover:text-[#1a5c4a] sm:text-[1.05rem]"
                          style={{ fontFamily: 'var(--font-playfair-display)' }}
                        >
                          {a.name}
                        </Link>
                      </div>
                      <div className="flex min-h-0 items-center">
                        <p
                          className="text-lg font-medium leading-none text-[#0b2a24] sm:text-xl"
                          style={{ fontFamily: 'var(--font-playfair-display)' }}
                        >
                          {hasCompareAtPrice(a.compare_at_price) ? (
                            <>
                              <span className="text-gray-400 line-through mr-2 text-base sm:text-lg">
                                {displayPriceLabel(String(a.compare_at_price).trim())}
                              </span>
                              {displayPriceLabel(a.starting_price)}
                            </>
                          ) : (
                            displayPriceLabel(a.starting_price)
                          )}
                        </p>
                      </div>
                      <div className="flex min-h-0 flex-col justify-center gap-1">
                        {a.review_avg != null && Number(a.review_avg) > 0 ? (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Stars value={Number(a.review_avg)} />
                            <span className="text-xs text-stone-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                              {Number(a.review_avg).toFixed(1)}
                              {a.review_count != null && a.review_count > 0
                                ? ` · ${a.review_count} отз.`
                                : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-stone-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
                            Пока без оценок
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-3 border-t border-[#e0dcd3] pt-4 sm:pt-5">
                        <Link
                          href={`/auctions/${a.id}`}
                          className="text-center border border-[#0b2a24] px-3 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0b2a24] transition hover:bg-[#0b2a24] hover:text-white"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Страница лота
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeColumn(a.id)}
                          className="pb-0.5 text-center text-[10px] uppercase tracking-[0.16em] text-stone-500 underline-offset-[5px] hover:text-[#8b2942] hover:underline"
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          Убрать из сравнения
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ fontFamily: 'var(--font-open-sans)' }}>
              <tr className="bg-[rgba(11,42,36,0.04)]">
                <td
                  colSpan={colCount + 1}
                  className="bg-[#f0ebe3] px-6 py-4 text-[10px] uppercase tracking-[0.22em] text-stone-600 sm:px-8 sm:py-5"
                >
                  Основное
                </td>
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 w-44 min-w-[11rem] border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Артикул
                </th>
                {cols.map((a) => (
                  <td
                    key={a.id}
                    className="border-b border-[#ebe8e0] bg-white/90 px-5 py-4 text-sm tabular-nums leading-relaxed text-stone-800 sm:px-6 sm:py-5"
                  >
                    #{a.id}
                  </td>
                ))}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Кратко
                </th>
                {renderDiffCells(cols.map((a) => (a.additional_info || '').trim()))}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Наличие и сроки
                </th>
                {renderDiffCells(
                  cols.map((a) => catalogAvailabilityLine(a.auction_dates, a.inventory_qty, a.reserved_qty) || '')
                )}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Продажа
                </th>
                {renderDiffCells(
                  cols.map((a) => {
                    if (a.is_sellable === false) return 'По запросу / не в продаже';
                    return 'Доступно к заказу';
                  })
                )}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Коллекция
                </th>
                {renderDiffCells(cols.map((a) => (a.collection_name ? String(a.collection_name) : '').trim()))}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Линия / подкатегория
                </th>
                {renderDiffCells(
                  cols.map((a) => {
                    const legacy = (a.subcategory || a.category || '').trim();
                    return legacy;
                  })
                )}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Отзывы
                </th>
                {cols.map((a) => {
                  const avg = a.review_avg != null ? Number(a.review_avg) : 0;
                  const cnt = a.review_count != null ? Number(a.review_count) : 0;
                  const parts: string[] = [];
                  if (avg > 0) parts.push(`${avg.toFixed(1)} / 5`);
                  if (cnt > 0) parts.push(`${cnt} отзывов`);
                  const text = parts.length ? parts.join(', ') : '—';
                  const allTexts = cols.map((x) => {
                    const xa = x.review_avg != null ? Number(x.review_avg) : 0;
                    const xc = x.review_count != null ? Number(x.review_count) : 0;
                    const p: string[] = [];
                    if (xa > 0) p.push(`${xa.toFixed(1)} / 5`);
                    if (xc > 0) p.push(`${xc} отзывов`);
                    return p.length ? p.join(', ') : '—';
                  });
                  const same = allFormattedEqual(allTexts);
                  return (
                    <td
                      key={a.id}
                      className={`border-b border-[#ebe8e0] px-5 py-4 align-top text-sm leading-relaxed sm:px-6 sm:py-5 ${
                        !same ? 'bg-[#fffdf8]' : 'bg-white/90'
                      }`}
                    >
                      {avg > 0 ? (
                        <div className="flex flex-col gap-2">
                          <Stars value={avg} />
                          <span className="text-xs text-stone-600">{text}</span>
                        </div>
                      ) : (
                        <span className="text-stone-500">{text}</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {data.filters.length > 0 ? (
                <>
                  <tr className="bg-[rgba(11,42,36,0.04)]">
                    <td
                      colSpan={colCount + 1}
                      className="bg-[#f0ebe3] px-6 py-4 text-[10px] uppercase tracking-[0.22em] text-stone-600 sm:px-8 sm:py-5"
                    >
                      Характеристики категории
                    </td>
                  </tr>
                  {data.filters.map((f) => {
                    const displayValues = cols.map((a) => {
                      const fv = normalizeFilterValues(a.filter_values);
                      const key = String(f.id);
                      const raw = fv[key] ?? fv[f.id as unknown as string];
                      return formatFilterCell(f.type, raw);
                    });
                    return (
                      <tr key={f.id}>
                        <th
                          scope="row"
                          className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] font-normal uppercase leading-snug tracking-[0.12em] text-stone-600 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                        >
                          {f.name}
                        </th>
                        {renderDiffCells(displayValues)}
                      </tr>
                    );
                  })}
                </>
              ) : null}

              {detailTitles.length > 0 ? (
                <>
                  <tr className="bg-[rgba(11,42,36,0.04)]">
                    <td
                      colSpan={colCount + 1}
                      className="bg-[#f0ebe3] px-6 py-4 text-[10px] uppercase tracking-[0.22em] text-stone-600 sm:px-8 sm:py-5"
                    >
                      Дополнительные блоки с лота
                    </td>
                  </tr>
                  {detailTitles.map((title) => {
                    const displayValues = cols.map((a) => sectionPlainText(a, title));
                    return (
                      <tr key={title}>
                        <th
                          scope="row"
                          className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-xs font-normal leading-relaxed text-stone-600 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                        >
                          {title}
                        </th>
                        {renderDiffCells(displayValues)}
                      </tr>
                    );
                  })}
                </>
              ) : null}

              <tr className="bg-[rgba(11,42,36,0.04)]">
                <td
                  colSpan={colCount + 1}
                  className="bg-[#f0ebe3] px-6 py-4 text-[10px] uppercase tracking-[0.22em] text-stone-600 sm:px-8 sm:py-5"
                >
                  Подлинность и медиа
                </td>
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Сертификаты и файлы
                </th>
                {renderDiffCells(
                  cols.map((a) => certificatesSummary(a.certificates, a.certificate_url || undefined))
                )}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="compare-sticky sticky left-0 z-10 border-b border-r border-[#ebe8e0] bg-[#faf9f6] px-5 py-4 text-left text-[11px] uppercase leading-snug tracking-[0.14em] text-stone-500 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.06)] sm:px-6 sm:py-5"
                >
                  Фото в галерее
                </th>
                {renderDiffCells(cols.map((a) => `${Array.isArray(a.images) ? a.images.length : 0} шт.`))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-20 sm:mt-24 md:mt-28 lg:mt-32">
        <Footer />
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mt-24 flex min-h-[50vh] items-center justify-center bg-[#faf9f6] px-4 pb-24 pt-8 sm:mt-28 sm:pt-10 md:mt-32">
          <p className="text-sm text-stone-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Загрузка…
          </p>
        </div>
      }
    >
      <ComparePageInner />
    </Suspense>
  );
}
