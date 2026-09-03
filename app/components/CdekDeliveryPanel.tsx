'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatRub } from '@/lib/cartPricing';
import type { CdekCitySuggestion, CdekPvzPoint } from '@/lib/cdekClient';

export type CdekPvzRow = CdekPvzPoint;

const CdekPvzMap = dynamic(() => import('@/app/components/CdekPvzMap').then((m) => m.CdekPvzMap), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full min-h-[220px] items-center justify-center bg-[#f0efec] text-xs text-gray-500"
      style={{ fontFamily: 'var(--font-open-sans)' }}
    >
      Загрузка карты…
    </div>
  ),
});

type Props = {
  cityQuery: string;
  onCityQueryChange: (q: string) => void;
  cityResults: CdekCitySuggestion[];
  cityLoading: boolean;
  selectedCity: CdekCitySuggestion | null;
  onSelectCity: (row: CdekCitySuggestion) => void;
  onResetCitySelection: () => void;
  pvzPoints: CdekPvzRow[];
  pvzLoading: boolean;
  pvzCode: string;
  onSelectPvz: (row: CdekPvzRow) => void;
  quoteLoading: boolean;
  /** Сумма из последнего расчёта СДЭК (null — ещё не считали). */
  quotedDeliveryRub: number | null;
  periodMin?: number | null;
  periodMax?: number | null;
  quoteError: string;
  hasQuote: boolean;
};

function formatDeliveryPeriod(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min != null && max != null && min > 0 && max > 0) {
    if (min === max) return `${min} раб. дн.`;
    return `${min}–${max} раб. дн.`;
  }
  if (min != null && min > 0) return `от ${min} раб. дн.`;
  if (max != null && max > 0) return `до ${max} раб. дн.`;
  return null;
}

export function CdekDeliveryPanel({
  cityQuery,
  onCityQueryChange,
  cityResults,
  cityLoading,
  selectedCity,
  onSelectCity,
  onResetCitySelection,
  pvzPoints,
  pvzLoading,
  pvzCode,
  onSelectPvz,
  quoteLoading,
  quotedDeliveryRub,
  periodMin,
  periodMax,
  quoteError,
  hasQuote,
}: Props) {
  const [pickerOpen, setPickerOpenState] = useState(false);
  const [pvzFilter, setPvzFilter] = useState('');
  const [pvzMapFlyTo, setPvzMapFlyTo] = useState<{ lat: number; lng: number; token: number } | null>(null);
  const overlayPressedRef = useRef(false);

  const setPickerOpen = (v: boolean) => {
    setPickerOpenState(v);
    if (v) setPvzMapFlyTo(null);
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen]);

  const selectedPvz = useMemo(
    () => pvzPoints.find((p) => p.code === pvzCode) || null,
    [pvzPoints, pvzCode]
  );

  const filteredPvz = useMemo(() => {
    const q = pvzFilter.trim().toLowerCase();
    if (!q) return pvzPoints;
    return pvzPoints.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    );
  }, [pvzPoints, pvzFilter]);

  const periodLabel = formatDeliveryPeriod(periodMin, periodMax);

  const cityLine = (c: CdekCitySuggestion) => {
    const reg = c.region ? `, ${c.region}` : '';
    return `${c.city}${reg}`;
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">
      <h3
        className="text-[10px] uppercase tracking-[0.2em] text-gray-400"
        style={{ fontFamily: 'var(--font-open-sans)' }}
      >
        Доставка СДЭК — только Россия
      </h3>
      <p className="text-[11px] text-gray-500 leading-relaxed" style={{ fontFamily: 'var(--font-open-sans)' }}>
        Выберите город и пункт выдачи — стоимость доставки рассчитается по тарифам СДЭК для вашего заказа.
      </p>

      <div>
        <span
          className="text-[10px] uppercase tracking-[0.16em] text-gray-500 block mb-2"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          Город (поиск)
        </span>
        <input
          type="text"
          value={cityQuery}
          onChange={(e) => onCityQueryChange(e.target.value)}
          placeholder="Начните вводить название города"
          className="w-full h-11 px-3 border border-gray-300 bg-white text-sm focus:outline-none focus:border-[#0b2a24]"
          style={{ fontFamily: 'var(--font-open-sans)' }}
          autoComplete="off"
        />
        {cityLoading ? (
          <p className="text-[10px] text-gray-400 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Поиск городов…
          </p>
        ) : null}
        {!selectedCity && cityQuery.trim().length >= 1 && cityResults.length > 0 ? (
          <ul
            className="mt-2 max-h-44 overflow-y-auto border border-gray-200 bg-white divide-y divide-gray-100 rounded-sm shadow-sm z-10 relative"
            role="listbox"
          >
            {cityResults.map((c) => (
              <li key={`${c.code}-${c.city}`}>
                <button
                  type="button"
                  onClick={() => onSelectCity(c)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#0b2a24]/5 transition-colors"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {cityLine(c)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!selectedCity && cityQuery.trim().length >= 1 && !cityLoading && cityResults.length === 0 ? (
          <p className="text-[10px] text-amber-800/90 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
            Ничего не найдено. Уточните название города.
          </p>
        ) : null}
      </div>

      {selectedCity ? (
        <div className="rounded-sm border border-[#0b2a24]/20 bg-[#0b2a24]/[0.03] px-4 py-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 mb-1" style={{ fontFamily: 'var(--font-open-sans)' }}>
              Город доставки
            </p>
            <p className="text-sm text-[#0b2a24]" style={{ fontFamily: 'var(--font-open-sans)' }}>
              {cityLine(selectedCity)}
            </p>
          </div>
          <button
            type="button"
            onClick={onResetCitySelection}
            className="text-[10px] uppercase tracking-[0.12em] text-[#0b2a24] border-b border-[#0b2a24]/40 hover:border-[#0b2a24] shrink-0"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            Сменить город
          </button>
        </div>
      ) : null}

      {selectedCity && (
        <div>
          <button
            type="button"
            onClick={() => {
              setPickerOpen(true);
              setPvzFilter('');
            }}
            disabled={pvzLoading}
            className="w-full py-3 px-4 text-left border border-gray-300 bg-white hover:border-[#0b2a24] transition-colors disabled:opacity-50 disabled:cursor-wait"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500 block mb-1">Пункт выдачи</span>
            {pvzLoading ? (
              <span className="text-sm text-gray-500">Загрузка пунктов…</span>
            ) : selectedPvz ? (
              <span className="text-sm text-[#0b2a24]">
                {selectedPvz.name}
                {selectedPvz.address ? ` — ${selectedPvz.address}` : ''}
              </span>
            ) : (
              <span className="text-sm text-gray-500">Выберите пункт на списке</span>
            )}
          </button>
          {!pvzLoading && selectedCity && pvzPoints.length === 0 ? (
            <p className="text-[10px] text-gray-500 mt-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
              В этом городе нет ПВЗ СДЭК или список временно недоступен.
            </p>
          ) : null}
        </div>
      )}

      {pickerOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cdek-pvz-title"
          onPointerDown={(e) => {
            overlayPressedRef.current = e.target === e.currentTarget;
          }}
          onPointerUp={(e) => {
            if (overlayPressedRef.current && e.target === e.currentTarget) {
              setPickerOpen(false);
            }
            overlayPressedRef.current = false;
          }}
          onPointerCancel={() => {
            overlayPressedRef.current = false;
          }}
        >
          <div
            className="bg-[#faf9f7] w-full sm:max-w-4xl h-[92dvh] sm:h-auto sm:max-h-[90vh] flex flex-col rounded-t-lg sm:rounded-lg shadow-2xl border border-gray-200 overflow-hidden"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
              <h4 id="cdek-pvz-title" className="text-sm font-medium text-[#0b2a24]" style={{ fontFamily: 'var(--font-playfair-display)' }}>
                Пункты выдачи СДЭК
              </h4>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-gray-500 hover:text-[#0b2a24] p-1"
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col sm:flex-row flex-1 min-h-0">
              <div className="relative h-44 sm:h-auto sm:min-h-[min(420px,55vh)] sm:flex-[1.15] border-b sm:border-b-0 sm:border-r border-gray-200 shrink-0">
                <CdekPvzMap
                  points={filteredPvz}
                  selectedCode={pvzCode}
                  flyTo={pvzMapFlyTo}
                  onPick={(p) => {
                    onSelectPvz(p);
                    setPickerOpen(false);
                  }}
                />
              </div>
              <div className="flex flex-col flex-1 min-h-0 sm:max-w-md sm:w-[42%]">
                <div className="px-4 py-3 border-b border-gray-100 shrink-0">
                  <input
                    type="search"
                    value={pvzFilter}
                    onChange={(e) => setPvzFilter(e.target.value)}
                    placeholder="Поиск по коду, названию, адресу"
                    className="w-full h-10 px-3 border border-gray-300 bg-white text-sm focus:outline-none focus:border-[#0b2a24]"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  />
                </div>
                <ul
                  className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {filteredPvz.length === 0 ? (
                    <li className="px-4 py-8 text-center text-sm text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
                      Нет пунктов по фильтру
                    </li>
                  ) : (
                    filteredPvz.map((p) => (
                      <li key={p.code}>
                        <button
                          type="button"
                          onMouseEnter={() => {
                            if (typeof p.lat === 'number' && typeof p.lng === 'number') {
                              setPvzMapFlyTo({ lat: p.lat, lng: p.lng, token: Date.now() });
                            }
                          }}
                          onClick={() => {
                            onSelectPvz(p);
                            setPickerOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-white transition-colors ${
                            pvzCode === p.code ? 'bg-[#0b2a24]/10' : ''
                          }`}
                          style={{ fontFamily: 'var(--font-open-sans)' }}
                        >
                          <span className="text-xs text-gray-500 font-mono">{p.code}</span>
                          <span className="block text-sm text-[#0b2a24] mt-0.5">{p.name}</span>
                          {p.address ? (
                            <span className="block text-xs text-gray-600 mt-1 leading-snug">{p.address}</span>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {quoteLoading ? (
        <p className="text-[10px] text-gray-500" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Считаем доставку по тарифам СДЭК…
        </p>
      ) : null}
      {hasQuote && quotedDeliveryRub != null && quotedDeliveryRub > 0 ? (
        <p className="text-[11px] text-emerald-800 bg-emerald-50/80 border border-emerald-200 px-3 py-2" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Доставка: <strong>{formatRub(quotedDeliveryRub)}</strong>
          {periodLabel ? ` · срок ${periodLabel}` : ''} (по калькулятору СДЭК).
        </p>
      ) : null}
      {quoteError ? (
        <p className="text-[11px] text-red-700" style={{ fontFamily: 'var(--font-open-sans)' }}>
          {quoteError}
        </p>
      ) : null}
      {hasQuote ? (
        <p className="text-[10px] text-gray-600" style={{ fontFamily: 'var(--font-open-sans)' }}>
          Расчёт действует ~2 часа. При смене пункта выдачи пересчитаем автоматически.
        </p>
      ) : null}
    </div>
  );
}
