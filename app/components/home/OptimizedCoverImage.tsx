'use client';

import Image from 'next/image';
import { nextImageMediaUrl } from '@/lib/publicMediaUrl';

type Props = {
  src: string | undefined | null;
  alt?: string;
  /** Первые экранные / LCP‑критичные — без lazy */
  priority?: boolean;
  /** Например «(max-width: 768px) 100vw, 1600px» */
  sizes: string;
  quality?: number;
  imageClassName?: string;
};

/**
 * Обложка секции через next/image — на лету отдаёт WebP/AVIF и нужный размер
 * вместо скачивания многомегабайтного PNG напрямую.
 */
export function OptimizedCoverImage({
  src,
  alt = '',
  priority,
  sizes,
  quality,
  imageClassName = 'object-cover',
}: Props) {
  const normalized = src?.trim();
  const url = nextImageMediaUrl(normalized || '');
  if (!url) return null;

  const resolvedQuality = quality ?? (priority ? 82 : 75);

  return (
    <Image
      src={url}
      alt={alt}
      fill
      priority={priority}
      loading={priority ? undefined : 'lazy'}
      fetchPriority={priority ? 'high' : 'low'}
      sizes={sizes}
      quality={resolvedQuality}
      className={imageClassName}
      decoding={priority ? 'sync' : 'async'}
    />
  );
}
