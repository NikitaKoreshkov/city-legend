'use client';

import { OptimizedCoverImage } from '@/app/components/home/OptimizedCoverImage';

type Props = {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  imageClassName?: string;
};

/** Фото товара через next/image — не тянет многомегабайтные оригиналы из /uploads/. */
export function ProductPhoto({
  src,
  alt,
  sizes = '(max-width: 1024px) 100vw, 50vw',
  priority,
  imageClassName = 'object-cover',
}: Props) {
  return (
    <OptimizedCoverImage
      src={src}
      alt={alt}
      sizes={sizes}
      priority={priority}
      imageClassName={imageClassName}
    />
  );
}
