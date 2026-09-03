'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Tailwind max-width, default max-w-lg */
  widthClass?: string;
  footer?: ReactNode;
};

/** Центрированная модалка — рендер в body, не обрезается родителями. */
export function AdminModal({
  open,
  onClose,
  title,
  children,
  widthClass = 'max-w-lg',
  footer,
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
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 sm:p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[min(90vh,calc(100dvh-4rem))] w-full ${widthClass} flex-col overflow-hidden rounded-sm bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#ebe8e0] px-5 py-4 sm:px-6">
          <h2
            id="admin-modal-title"
            className="text-lg text-[#0b2a24]"
            style={{ fontFamily: 'var(--font-playfair-display)', fontWeight: 400 }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn-interactive shrink-0 flex h-9 w-9 items-center justify-center rounded-sm border border-[#ebe8e0] text-lg leading-none text-gray-500 hover:border-[#0b2a24]/30 hover:text-[#0b2a24]"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-[#ebe8e0] bg-white px-5 py-4 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
