import type { CSSProperties } from 'react';

/** Общие стили карточек и полей админ-панели (согласованы с AdminShell). */
export const adminInputStyle: CSSProperties = {
  fontFamily: 'var(--font-open-sans)',
  fontSize: '13px',
  border: '1px solid #e5e7eb',
  outline: 'none',
  padding: '10px 12px',
  width: '100%',
  background: '#fff',
  color: '#111',
  borderRadius: 0,
};

export const adminCard =
  'bg-white border border-neutral-200/90 shadow-[0_1px_0_rgba(0,0,0,0.04)]';

export const adminSectionLabel =
  'text-[10px] uppercase tracking-[0.16em] text-neutral-500 font-medium';

export const adminBtnPrimary =
  'w-full py-2.5 bg-[#0b2a24] text-white text-sm hover:bg-[#0a201c] disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors';

export const adminBtnSecondary =
  'px-4 py-2 text-xs uppercase tracking-[0.1em] border border-neutral-300 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors bg-white';
