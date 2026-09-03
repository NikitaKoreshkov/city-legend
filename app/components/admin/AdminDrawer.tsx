'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Tailwind max-width class, default max-w-xl */
  widthClass?: string;
};

/** Боковая панель справа — рендер в body, полная высота экрана, без обрезки. */
export function AdminDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  widthClass = 'max-w-xl',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex justify-end bg-black/45"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex h-[100dvh] max-h-[100dvh] w-full ${widthClass} flex-col bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-drawer-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#ebe8e0] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {subtitle ? (
              <p
                className="text-[10px] uppercase tracking-widest text-gray-400"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                {subtitle}
              </p>
            ) : null}
            <h2
              id="admin-drawer-title"
              className="text-lg text-[#0b2a24] truncate"
              style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-interactive shrink-0 flex h-9 w-9 items-center justify-center rounded-sm border border-[#ebe8e0] text-lg leading-none text-gray-500 hover:border-[#0b2a24]/30 hover:text-[#0b2a24]"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-10 sm:px-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
