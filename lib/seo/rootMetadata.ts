import type { Metadata } from 'next';
import { absoluteLogoUrl } from '@/lib/siteShell';
import { ogImageMetadata, siteBrand, twitterImageUrls, siteBaseUrl } from '@/lib/seoMeta';
import { SEO_KEYWORDS_GLOBAL } from '@/lib/seo/buildMetadata';

const DEFAULT_DESCRIPTION =
  'City Legend — кураторский каталог украшений и аксессуаров: серьги, браслеты, колье, кольца. Jewelry & accessories online store with delivery in Russia.';

const DEFAULT_TITLE =
  'City Legend — бижутерия и аксессуары | Jewelry & Accessories';

/** Корневой layout: template заголовков, иконки, верификация, дефолт для неизвестных страниц. */
export function buildRootLayoutMetadata(logoAbs: string): Metadata {
  const base = siteBaseUrl();
  const brand = siteBrand();
  const ogImages = ogImageMetadata(logoAbs) ?? [{ url: logoAbs, width: 1200, height: 630, alt: brand }];
  const favicon32 = `${base}/favicon-32.png`;

  return {
    metadataBase: new URL(`${base}/`),
    title: {
      default: DEFAULT_TITLE,
      template: `%s · ${brand}`,
    },
    description: DEFAULT_DESCRIPTION,
    keywords: SEO_KEYWORDS_GLOBAL,
    applicationName: brand,
    authors: [{ name: brand, url: base }],
    creator: brand,
    publisher: brand,
    category: 'shopping',
    alternates: {
      canonical: `${base}/`,
      languages: {
        'ru-RU': `${base}/`,
        'en-US': `${base}/`,
        'x-default': `${base}/`,
      },
    },
    icons: {
      icon: [
        { url: favicon32, type: 'image/png', sizes: '32x32' },
        { url: logoAbs, type: 'image/png', sizes: '192x192' },
        { url: logoAbs, type: 'image/png', sizes: '512x512' },
      ],
      apple: [{ url: logoAbs, sizes: '180x180', type: 'image/png' }],
      shortcut: [{ url: favicon32 }],
    },
    openGraph: {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      type: 'website',
      url: `${base}/`,
      siteName: brand,
      locale: 'ru_RU',
      alternateLocale: ['en_US'],
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      images: twitterImageUrls(ogImages),
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    verification: {
      google: 'KWevh9ww4gpPJbgY9TaqS8xkV3xGJB301v9uhcXp-IA',
      other: {
        'yandex-verification': '9ce441c36dc85a26',
      },
    },
  };
}

export function resolveLogoAbs(base: string, logoPath: string): string {
  return absoluteLogoUrl(logoPath, base);
}
