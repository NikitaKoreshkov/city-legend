import type { Metadata } from 'next';
import { ogImageMetadata, siteBrand, twitterImageUrls } from '@/lib/seoMeta';

/** Общие ключевые слова (RU + EN) — дополняют страничные. */
export const SEO_KEYWORDS_GLOBAL: string[] = [
  'City Legend',
  'citylegend',
  'citylegend.art',
  'сити легенд',
  'бижутерия',
  'украшения',
  'аксессуары',
  'серьги',
  'браслеты',
  'колье',
  'кольца',
  'ювелирные украшения',
  'купить украшения',
  'интернет-магазин украшений',
  'jewelry',
  'jewelry store',
  'accessories',
  'earrings',
  'bracelets',
  'necklace',
  'rings',
  'luxury jewelry',
  'buy jewelry online',
];

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://citylegend.art').replace(/\/$/, '');
}

export function canonicalUrl(path: string): string {
  const base = siteBaseUrl();
  if (!path || path === '/') return `${base}/`;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export type BuildPageMetadataInput = {
  /** Короткий заголовок (к root template «%s · Brand») или полный при titleAbsolute */
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string | null;
  ogType?: 'website' | 'article';
  noindex?: boolean;
  titleAbsolute?: boolean;
};

function mergeKeywords(page?: string[]): string[] | undefined {
  const merged = [...SEO_KEYWORDS_GLOBAL, ...(page ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of merged) {
    const t = k.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.length ? out : undefined;
}

function robotsBlock(noindex?: boolean): Metadata['robots'] {
  if (noindex) {
    return { index: false, follow: false, nocache: true };
  }
  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  };
}

/** Метаданные публичной страницы: canonical, OG/Twitter, RU+EN keywords, hreflang на один URL. */
export function buildPageMetadata(input: BuildPageMetadataInput): Metadata {
  const brand = siteBrand();
  const url = canonicalUrl(input.path);
  const titleField: Metadata['title'] = input.titleAbsolute
    ? { absolute: input.title }
    : input.title;

  const ogTitle = input.titleAbsolute ? input.title : `${input.title} · ${brand}`;
  const images = ogImageMetadata(input.image ?? undefined);
  const keywords = mergeKeywords(input.keywords);

  return {
    title: titleField,
    description: input.description,
    keywords,
    alternates: {
      canonical: url,
      languages: {
        'ru-RU': url,
        'en-US': url,
        'x-default': url,
      },
    },
    openGraph: {
      title: ogTitle,
      description: input.description,
      url,
      siteName: brand,
      locale: 'ru_RU',
      alternateLocale: ['en_US'],
      type: input.ogType ?? 'website',
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: ogTitle,
      description: input.description,
      ...(images ? { images: twitterImageUrls(images) } : {}),
    },
    robots: robotsBlock(input.noindex),
  };
}

export function buildNoindexMetadata(input: {
  title: string;
  description?: string;
  path: string;
}): Metadata {
  return buildPageMetadata({
    ...input,
    description:
      input.description ??
      `${input.title}. ${siteBrand()}.`,
    noindex: true,
    titleAbsolute: true,
  });
}
