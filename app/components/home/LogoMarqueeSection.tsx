'use client';

import Image from 'next/image';
import Link from 'next/link';
import { publicMediaUrl } from '@/lib/publicMediaUrl';
import type { TrustLogosSection } from '@/lib/homepageTrustSections';

function LogoTile({ name, image, url }: { name: string; image: string; url?: string }) {
  const src = image ? publicMediaUrl(image) : '';
  const inner = (
    <div className="flex h-[72px] w-[148px] shrink-0 items-center justify-center rounded-xl bg-[#3a3a3a] px-4 sm:h-[80px] sm:w-[168px]">
      {src ? (
        <Image
          src={src}
          alt={name}
          width={120}
          height={48}
          className="max-h-10 w-auto max-w-[120px] object-contain brightness-0 invert"
          loading="lazy"
        />
      ) : (
        <span
          className="text-center text-[10px] uppercase tracking-wider text-white/70"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          {name}
        </span>
      )}
    </div>
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 transition-opacity hover:opacity-80"
        aria-label={name}
      >
        {inner}
      </a>
    );
  }
  return <div className="shrink-0">{inner}</div>;
}

export default function LogoMarqueeSection({
  section,
  variant,
}: {
  section: TrustLogosSection;
  /** clients — с опциональной кнопкой; partners — только прокрутка */
  variant: 'clients' | 'partners';
}) {
  if (!section.enabled || section.logos.length === 0) return null;

  const track = [...section.logos, ...section.logos];

  return (
    <section className="w-full bg-[#f3f3f3] py-12 sm:py-16 md:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px]">
          {section.eyebrow ? (
            <p
              className="mb-2 text-center text-[10px] uppercase tracking-[0.28em] text-[#888888]"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {section.eyebrow}
            </p>
          ) : null}
          <h2
            className="mb-3 text-center text-2xl sm:text-3xl md:text-4xl"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              color: '#111111',
              fontWeight: 400,
              letterSpacing: '0.01em',
            }}
          >
            {section.title}
          </h2>
          {section.subtitle ? (
            <p
              className="mx-auto mb-8 max-w-2xl text-center text-xs sm:text-sm text-[#666666]"
              style={{ fontFamily: 'var(--font-open-sans)', lineHeight: 1.6 }}
            >
              {section.subtitle}
            </p>
          ) : (
            <div className="mb-8" />
          )}

          <div className="rounded-2xl bg-white px-4 py-8 shadow-sm sm:px-8 sm:py-10">
            <div className="home-logo-marquee-mask relative overflow-hidden">
              <div className="home-logo-marquee-track flex w-max gap-4 sm:gap-5">
                {track.map((logo, index) => (
                  <LogoTile
                    key={`${logo.name}-${index}`}
                    name={logo.name}
                    image={logo.image}
                    url={logo.url}
                  />
                ))}
              </div>
            </div>

            {variant === 'clients' && section.showAllLink && section.showAllHref ? (
              <div className="mt-8 flex justify-center">
                <Link
                  href={section.showAllHref}
                  className="inline-flex items-center gap-2 rounded-full border border-[#d8d8d8] bg-white px-6 py-3 text-sm text-[#111111] transition-colors hover:border-[#0b2a24] hover:text-[#0b2a24]"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {section.showAllLabel || 'Смотреть всех клиентов'}
                  <span aria-hidden>→</span>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
