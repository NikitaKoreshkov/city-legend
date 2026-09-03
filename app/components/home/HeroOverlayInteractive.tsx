'use client';

import type { HomepageHeroMerged } from '@/lib/homepageMerge';

export default function HeroOverlayInteractive({ hero }: { hero: HomepageHeroMerged }) {
  return (
    <div
      onClick={() => {
        window.dispatchEvent(new CustomEvent('openSearchPanel'));
      }}
      className="relative z-10 flex w-full max-w-5xl mx-auto cursor-pointer flex-col items-center justify-center px-4 transition-opacity duration-300 hover:opacity-90 sm:px-6 lg:px-8"
    >
      <p
        className="mb-2 px-2 text-xs text-white sm:mb-3 sm:text-xs md:mb-4 md:text-sm md:whitespace-nowrap"
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontWeight: 400,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          textAlign: 'center',
          lineHeight: '1.2',
        }}
      >
        {hero.line1}
      </p>

      <h1
        className="mb-4 px-2 text-xl font-bold text-white sm:mb-6 sm:text-2xl md:mb-8 md:text-3xl md:whitespace-nowrap lg:text-4xl xl:text-5xl"
        style={{
          fontFamily: 'var(--font-playfair-display)',
          letterSpacing: '0.01em',
          lineHeight: '1.1',
          textAlign: 'center',
        }}
      >
        {hero.line2}
      </h1>

      <p
        className="max-w-[95%] px-2 text-xs text-white sm:text-xs md:text-sm md:whitespace-nowrap"
        style={{
          fontFamily: 'var(--font-open-sans)',
          fontWeight: 400,
          lineHeight: '1.3',
          textAlign: 'center',
        }}
      >
        {hero.line3}
      </p>
    </div>
  );
}
