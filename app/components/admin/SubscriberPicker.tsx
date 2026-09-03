'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminInputStyle } from '@/app/components/admin/adminUi';

export type SubscriberPick = {
  id: number;
  first_name: string;
  phone: string;
  platform: 'telegram' | 'max';
  dualPlatform?: boolean;
  platforms?: string[];
};

type Props = {
  value: SubscriberPick | null;
  onChange: (sub: SubscriberPick | null) => void;
  placeholder?: string;
};

export function SubscriberPicker({ value, onChange, placeholder = 'Имя или телефон…' }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<SubscriberPick[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const sp = new URLSearchParams({ q: trimmed, limit: '20', mergeDual: '1' });
      const res = await fetch(`/api/admin/bots?${sp}`);
      if (!res.ok) return;
      const data = await res.json();
      setOptions(
        (data.subscribers ?? []).map(
          (s: {
            id: number;
            first_name: string;
            phone: string;
            platform: 'telegram' | 'max';
            dualPlatform?: boolean;
            platforms?: string[];
          }) => ({
            id: s.id,
            first_name: s.first_name,
            phone: s.phone,
            platform: s.platform,
            dualPlatform: s.dualPlatform,
            platforms: s.platforms,
          })
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(query), 250);
    return () => clearTimeout(t);
  }, [query, open, search]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const label = (s: SubscriberPick) => {
    const plat =
      s.dualPlatform || (s.platforms && s.platforms.length > 1)
        ? 'TG+Max'
        : s.platform === 'telegram'
          ? 'TG'
          : 'Max';
    return `${s.first_name || 'Без имени'} · ${s.phone || '—'} · ${plat} (#${s.id})`;
  };

  return (
    <div ref={wrapRef} className="relative">
      {value ? (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 text-sm px-3 py-2 border border-[#0b2a24]/20 bg-white truncate"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            {label(value)}
          </div>
          <button
            type="button"
            className="text-xs text-gray-500 underline shrink-0"
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
          >
            Сменить
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            style={adminInputStyle}
            className="w-full"
            autoComplete="off"
          />
          {open && (query.trim().length >= 2 || options.length > 0) && (
            <ul
              className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto border border-gray-200 bg-white shadow-lg text-sm"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {loading ? (
                <li className="px-3 py-2 text-gray-400">Поиск…</li>
              ) : options.length === 0 ? (
                <li className="px-3 py-2 text-gray-400">Никого не найдено</li>
              ) : (
                options.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-neutral-50"
                      onClick={() => {
                        onChange(s);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      {label(s)}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
