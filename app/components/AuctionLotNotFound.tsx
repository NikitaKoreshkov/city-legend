import Link from 'next/link';

const ACCENT = '#8B4513';

/**
 * Экран «лот не найден» — тот же визуальный язык, что и глобальная 404.
 */
export default function AuctionLotNotFound() {
  return (
    <main
      className="relative min-h-[calc(100dvh-4rem)] overflow-hidden"
      style={{
        backgroundColor: '#faf9f7',
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(139, 69, 19, 0.06), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(0,0,0,0.03), transparent 50%)',
      }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[45%] select-none whitespace-nowrap text-[clamp(6rem,22vw,14rem)] font-normal leading-none tracking-tight text-black/[0.04]"
        style={{ fontFamily: 'var(--font-playfair-display)' }}
        aria-hidden
      >
        404
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] max-w-2xl flex-col items-center justify-center px-6 pb-16 pt-44 text-center md:pt-48">
        <p
          className="mb-5 text-[10px] uppercase tracking-[0.35em] text-gray-500"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          товар не найден
        </p>

        <h1
          className="mb-4 max-w-lg text-3xl font-normal italic leading-snug text-[var(--color-classic-black)] sm:text-4xl md:text-[2.75rem]"
          style={{
            fontFamily: 'var(--font-playfair-display)',
            letterSpacing: '0.01em',
          }}
        >
          Такого лота нет в&nbsp;каталоге
        </h1>

        <p
          className="mb-12 max-w-md text-sm leading-relaxed text-gray-600 sm:text-base"
          style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
        >
          Возможно, номер в ссылке изменён, лот снят с публикации или никогда не существовал. Загляните в каталог или на главную.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <Link
            href="/auctions"
            className="group relative min-w-[200px] border border-black/90 px-10 py-3 text-center text-xs uppercase tracking-[0.2em] text-[var(--color-classic-black)] transition-colors duration-300 hover:bg-black hover:text-white"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            В каталог
          </Link>
          <Link
            href="/"
            className="group relative text-xs uppercase tracking-[0.2em] transition-opacity duration-300 hover:opacity-80"
            style={{ fontFamily: 'var(--font-open-sans)', color: ACCENT }}
          >
            <span className="relative inline-block pb-0.5">
              На главную
              <span
                className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-300 ease-out group-hover:scale-x-100"
                aria-hidden
              />
            </span>
          </Link>
        </div>

        <div
          className="mt-16 h-px w-12 bg-gradient-to-r from-transparent via-black/15 to-transparent"
          aria-hidden
        />
      </div>
    </main>
  );
}
