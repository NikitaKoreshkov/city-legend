'use client';

import { useEffect, useRef, useState } from 'react';

export type AdminSelectOption = {
  value: string;
  label: string;
  color?: string; // optional dot color
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: AdminSelectOption[];
  placeholder?: string;
  /** small (filter bar) | normal (form field) */
  size?: 'sm' | 'md';
  className?: string;
  fullWidth?: boolean;
};

export function AdminSelect({
  value,
  onChange,
  options,
  placeholder = 'Выберите…',
  size = 'md',
  className = '',
  fullWidth = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const h = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3 py-2.5 text-sm';

  return (
    <div ref={ref} className={`relative ${fullWidth ? 'w-full' : 'inline-block'} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`flex items-center gap-2 border border-[#ebe8e0] bg-white hover:border-[#0b2a24] transition-colors ${h} ${fullWidth ? 'w-full' : ''} text-left`}
        style={{ fontFamily: 'var(--font-open-sans)' }}
      >
        {selected?.color && (
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: selected.color }}
          />
        )}
        <span className={`flex-1 truncate ${selected ? 'text-[#0b2a24]' : 'text-gray-400'}`}>
          {label}
        </span>
        <svg
          className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 z-[200] mt-1 min-w-full bg-[#1a1a1a] border border-[#333] shadow-2xl overflow-hidden"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`flex items-center gap-3 w-full text-left px-4 py-2.5 text-xs transition-colors
                  ${isSelected
                    ? 'bg-[#2a2a2a] text-white'
                    : 'text-[#c8c3bb] hover:bg-[#252525] hover:text-white'
                  }`}
              >
                {isSelected ? (
                  <svg className="shrink-0 text-white" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                {opt.color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: opt.color }}
                  />
                )}
                <span className="tracking-wide">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
