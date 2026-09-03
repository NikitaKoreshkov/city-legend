'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { displayPriceLabel } from '@/lib/cartPricing';
import { SITE_BRAND } from '@/lib/legalPublic';
import { isLikelySiteLogoUsedAsProductImage } from '@/lib/productImage';
import { nextImageMediaUrl } from '@/lib/publicMediaUrl';

interface AuctionCardProps {
  id: string;
  name: string;
  additionalInfo?: string;
  startingPrice: string;
  /** Зачёркнутая «цена до скидки»; актуальная — startingPrice */
  compareAtPrice?: string | null;
  /** Подзаголовок под названием: сроки или «N шт.» при малом остатке; пусто — не рендерим */
  availabilityLine?: string | null;
  auctionDates?: string;
  images?: string[];
  large?: boolean;
  small?: boolean;
  /** Показать кнопку избранного (сердце) */
  showFavorite?: boolean;
  favorited?: boolean;
  onFavoriteClick?: (e: React.MouseEvent) => void;
}

function CardPriceBlock({
  startingPrice,
  compareAtPrice,
  className,
  style,
}: {
  startingPrice: string;
  compareAtPrice?: string | null;
  className: string;
  style?: CSSProperties;
}) {
  const compare = String(compareAtPrice ?? '').trim();
  if (!compare) {
    return (
      <p className={className} style={style}>
        {displayPriceLabel(startingPrice)}
      </p>
    );
  }
  return (
    <p className={className} style={style}>
      <span className="text-gray-600 line-through decoration-gray-500/80 mr-2 sm:text-gray-400 sm:decoration-gray-400/80">
        {displayPriceLabel(compare)}
      </span>
      <span>{displayPriceLabel(startingPrice)}</span>
    </p>
  );
}

export default function AuctionCard({
  id,
  name,
  startingPrice,
  compareAtPrice,
  availabilityLine,
  auctionDates,
  images = [],
  large = false,
  small = false,
  showFavorite = false,
  favorited = false,
  onFavoriteClick,
}: AuctionCardProps) {
  const rawFirst = images.length > 0 ? images[0] : null;
  const displayImage =
    rawFirst && !isLikelySiteLogoUsedAsProductImage(rawFirst) ? rawFirst : null;
  const displaySrc = displayImage ? nextImageMediaUrl(displayImage) : null;
  const metaLine = availabilityLine ?? auctionDates;

  const onHeart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFavoriteClick?.(e);
  };

  const hasSale = Boolean(String(compareAtPrice ?? '').trim());

  return (
    <div className="relative w-full group/card">
      {hasSale && (
        <span
          className="absolute top-3 left-3 z-20 text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 border border-amber-700/40 text-amber-900 bg-amber-50/90"
          style={{ fontFamily: 'var(--font-open-sans)' }}
        >
          Акция
        </span>
      )}
      {showFavorite && (
        <button
          type="button"
          onClick={onHeart}
          className="absolute top-3 right-3 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/90 border border-gray-200/90 shadow-sm hover:bg-white transition-colors"
          aria-label={favorited ? 'Убрать из избранного' : 'В избранное'}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={favorited ? '#0b2a24' : 'none'}
            stroke="#0b2a24"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      )}
      <Link href={`/collection/${id}`} className="group block w-full">
        <div className="w-full">
          <div
            className={`relative w-full overflow-hidden bg-white mb-4 md:mb-0 ${
              large ? 'aspect-[3/5]' : 'aspect-[3/4]'
            }`}
          >
            {displaySrc ? (
              <Image
                src={displaySrc}
                alt={name}
                fill
                sizes="(max-width: 640px) 46vw, (max-width: 1024px) 33vw, 22vw"
                quality={75}
                loading="lazy"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                <div
                  className="text-gray-300 text-2xl tracking-wider"
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontWeight: 300,
                    letterSpacing: '0.2em',
                  }}
                >
                  {SITE_BRAND}
                </div>
              </div>
            )}

            <div className="hidden md:block absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out w-1/2 bg-white px-4 py-3 text-center">
              <h3
                className="mb-1 text-[13px] sm:text-[14px] leading-tight"
                style={{
                  fontFamily: 'var(--font-playfair-display)',
                  color: '#000000',
                  fontWeight: 400,
                  letterSpacing: '0.02em',
                  lineHeight: '1.4',
                }}
              >
                {name}
              </h3>

              {metaLine ? (
                <p
                  className="text-[11px] sm:text-[12px] mb-1.5"
                  style={{
                    fontFamily: 'var(--font-playfair-display)',
                    color: '#696969',
                    fontWeight: 400,
                    fontStyle: 'italic',
                    letterSpacing: '0.01em',
                    lineHeight: '1.3',
                  }}
                >
                  {metaLine}
                </p>
              ) : null}

              <CardPriceBlock
                startingPrice={startingPrice}
                compareAtPrice={compareAtPrice}
                className="text-[11px] sm:text-[12px]"
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  color: '#696969',
                  fontWeight: 400,
                  letterSpacing: '0.05em',
                  lineHeight: '1.5',
                }}
              />
            </div>
          </div>

          <div className="md:hidden text-center">
            <h3
              className="mb-2 text-sm leading-tight"
              style={{
                fontFamily: 'var(--font-playfair-display)',
                color: '#000000',
                fontWeight: 400,
                letterSpacing: '0.01em',
                lineHeight: '1.4',
              }}
            >
              {name}
            </h3>

            {metaLine ? (
              <p
                className="text-xs mb-2"
                style={{
                  fontFamily: 'var(--font-playfair-display)',
                  color: '#696969',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  letterSpacing: '0.01em',
                  lineHeight: '1.4',
                }}
              >
                {metaLine}
              </p>
            ) : null}

            <CardPriceBlock
              startingPrice={startingPrice}
              compareAtPrice={compareAtPrice}
              className="text-xs"
              style={{
                fontFamily: 'var(--font-open-sans)',
                color: '#696969',
                fontWeight: 400,
                letterSpacing: '0.02em',
                lineHeight: '1.5',
              }}
            />
          </div>
        </div>
      </Link>
    </div>
  );
}
