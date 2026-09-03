'use client';

type Props = {
  children?: React.ReactNode;
  onRefresh?: () => void;
  refreshLabel?: string;
};

/** Строка действий под хлебными крошками AdminShell. */
export function AdminPageToolbar({ children, onRefresh, refreshLabel = 'Обновить' }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-8 pb-4 border-b border-neutral-200/80">
      <div className="flex-1 min-w-0">{children}</div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="shrink-0 px-4 py-2 text-xs uppercase tracking-[0.1em] border border-neutral-300 bg-white hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          {refreshLabel}
        </button>
      )}
    </div>
  );
}
