'use client';

import { useEffect, useRef, useState } from 'react';
import { ADMIN_ROLES, ROLE_LABELS, type AdminRole } from '@/lib/admin/roles';

function normalizeRole(raw: string): AdminRole {
  return ADMIN_ROLES.includes(raw as AdminRole) ? (raw as AdminRole) : 'manager';
}

/**
 * Кастомный выбор роли (без нативного &lt;select&gt;), в стиле админ-панели.
 */
export function StaffRolePicker({
  value,
  onChange,
  disabled,
  size = 'md',
}: {
  value: string;
  onChange: (r: AdminRole) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const role = normalizeRole(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2.5 text-[13px]';

  return (
    <div className="relative inline-block min-w-[12rem]" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`
          flex w-full items-center justify-between gap-2 rounded-md border text-left transition-colors
          ${pad}
          ${
            disabled
              ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400'
              : 'border-[#0b2a24]/25 bg-white text-[#0a1210] shadow-sm hover:border-[#0b2a24]/40'
          }
        `}
        style={{ fontFamily: 'var(--font-open-sans)' }}
      >
        <span className="truncate">{ROLE_LABELS[role]}</span>
        <span
          className={`shrink-0 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 8L1 3h10L6 8z" />
          </svg>
        </span>
      </button>

      {open && !disabled && (
        <ul
          className="absolute left-0 right-0 z-[100] mt-1 overflow-hidden rounded-md border border-[#0b2a24]/20 py-1 shadow-xl"
          style={{
            background: 'linear-gradient(165deg, #0f1f1c 0%, #0b2a24 50%, #0a1513 100%)',
            fontFamily: 'var(--font-open-sans)',
          }}
          role="listbox"
        >
          {ADMIN_ROLES.map((r) => (
            <li key={r} role="option" aria-selected={r === role}>
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setOpen(false);
                }}
                className={`flex w-full items-center px-3 py-2.5 text-left text-[13px] transition-colors ${
                  r === role
                    ? 'bg-white/15 text-amber-50'
                    : 'text-emerald-50/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
