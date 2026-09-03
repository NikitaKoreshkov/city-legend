import type { ReactNode } from 'react';

type Variant = 'info' | 'tip' | 'warn';

const VARIANT_CLASS: Record<Variant, string> = {
  info: 'border-[#0b2a24]/15 bg-[#0b2a24]/[0.04] text-neutral-800',
  tip: 'border-blue-200/80 bg-blue-50/70 text-blue-950',
  warn: 'border-amber-200/80 bg-amber-50/70 text-amber-950',
};

/** Короткая подсказка для менеджеров в админке */
export function AdminHelpCallout({
  title,
  children,
  variant = 'info',
}: {
  title?: string;
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <div
      className={`border px-4 py-3 text-sm leading-relaxed ${VARIANT_CLASS[variant]}`}
      style={{ fontFamily: 'var(--font-open-sans)' }}
    >
      {title ? (
        <p className="text-[11px] uppercase tracking-[0.12em] font-medium text-[#0b2a24] mb-2">{title}</p>
      ) : null}
      <div className="text-[13px] text-neutral-700 space-y-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:text-neutral-900">
        {children}
      </div>
    </div>
  );
}
