import type { Metadata } from 'next';
import type { AuctionDetailPayload } from '@/lib/auctionDetailPayload';
import { stripHtml, truncateText } from '@/lib/compareDisplay';
import { listingPriceFromAuction } from '@/lib/productVariants';
import { buildPageMetadata, canonicalUrl } from '@/lib/seo/buildMetadata';
import { buildProductBreadcrumbJsonLd, buildProductJsonLd } from '@/lib/seo/jsonLd';
import {
  absoluteOgImageUrl,
  lotPageTitle,
  ogImageMetadata,
  siteBrand,
  twitterImageUrls,
} from '@/lib/seoMeta';

function lotDescription(payload: AuctionDetailPayload): string {
  const name = String(payload.auction.name ?? 'Артикул').trim() || 'Артикул';
  const extra = payload.auction.additional_info;
  if (typeof extra === 'string' && extra.trim()) {
    const plain = truncateText(stripHtml(extra), 140);
    if (plain) {
      return `${plain} · ${siteBrand()} — jewelry, украшения.`;
    }
  }
  const cat = payload.category?.name;
  const enHint = 'Buy online · earrings, bracelets, necklace, ring.';
  if (cat) {
    return `${name} — ${cat}. ${siteBrand()}. ${enHint}`;
  }
  return `${name}. ${siteBrand()} — jewelry & accessories. ${enHint}`;
}

function lotImages(payload: AuctionDetailPayload): string[] {
  const rawImages = payload.auction.images;
  if (!Array.isArray(rawImages)) return [];
  return rawImages.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()));
}

export function buildLotPageMetadata(
  id: number,
  payload: AuctionDetailPayload
): Metadata {
  const name = String(payload.auction.name ?? 'Артикул').trim() || 'Артикул';
  const description = lotDescription(payload);
  const title = lotPageTitle(name);
  const path = `/collection/${id}`;
  const images = lotImages(payload).slice(0, 3);
  const categoryKw = payload.category?.name
    ? [`${payload.category.name}`, `${payload.category.name} jewelry`]
    : [];

  const base = buildPageMetadata({
    title,
    titleAbsolute: true,
    description,
    path,
    image: images[0],
    ogType: 'website',
    keywords: [
      name,
      'купить украшение',
      'jewelry',
      'buy jewelry',
      ...categoryKw,
    ],
  });

  const ogImages =
    images.length > 0
      ? images.map((img) => {
          const url = absoluteOgImageUrl(img)!;
          return { url, width: 1200, height: 630, alt: name };
        })
      : ogImageMetadata(undefined);

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'website',
      title,
      description,
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      ...base.twitter,
      card: 'summary_large_image',
      title,
      description,
      ...(ogImages ? { images: twitterImageUrls(ogImages) } : {}),
    },
  };
}

export function buildLotProductJsonLd(
  id: number,
  payload: AuctionDetailPayload
): Record<string, unknown> {
  const name = String(payload.auction.name ?? 'Артикул').trim() || 'Артикул';
  const images = lotImages(payload);
  const price = listingPriceFromAuction(payload.auction);
  const qty = payload.auction.inventory_qty;
  const reserved = payload.auction.reserved_qty;
  const inv =
    typeof qty === 'number' && typeof reserved === 'number'
      ? qty - reserved
      : typeof qty === 'number'
        ? qty
        : 1;
  const inStock = inv > 0;

  return buildProductJsonLd({
    id,
    name,
    description: lotDescription(payload),
    images,
    priceRub: price.startingPrice,
    inStock,
    categoryName: payload.category?.name ?? null,
  });
}

export function buildLotBreadcrumbJsonLd(
  id: number,
  payload: AuctionDetailPayload
): Record<string, unknown> {
  const name = String(payload.auction.name ?? 'Артикул').trim() || 'Артикул';
  return buildProductBreadcrumbJsonLd({
    id,
    name,
    categoryName: payload.category?.name ?? null,
  });
}

export function lotMetadataFallback(): Metadata {
  return buildPageMetadata({
    path: '/collection',
    title: `Артикул · ${siteBrand()}`,
    titleAbsolute: true,
    description: `Каталог украшений ${siteBrand()}. Jewelry catalog.`,
  });
}

export { canonicalUrl as lotCanonicalUrl };
