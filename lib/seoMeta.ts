import type { Metadata } from 'next';
import { DEFAULT_LOGO_URL } from '@/lib/siteShellDefaults';

export function siteBrand(): string {
  return process.env.NEXT_PUBLIC_SITE_BRAND_NAME?.trim() || 'City Legend';
}

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://citylegend.art').replace(/\/$/, '');
}

export function lotPageTitle(name: string): string {
  const n = name.trim() || 'Артикул';
  return `${n} — ${siteBrand()}`;
}

export function promotionPageTitle(title: string): string {
  const t = title.trim() || 'Акция';
  return `${t} — ${siteBrand()}`;
}

export function blogPostTitle(title: string): string {
  const t = title.trim() || 'Новость';
  return `${t} — ${siteBrand()}`;
}

export function absoluteOgImageUrl(imagePath?: string | null): string | undefined {
  const raw = imagePath?.trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = siteBaseUrl();
  return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

export function ogImageMetadata(
  imagePath?: string | null
): NonNullable<Metadata['openGraph']>['images'] | undefined {
  const url = absoluteOgImageUrl(imagePath || DEFAULT_LOGO_URL);
  if (!url) return undefined;
  return [{ url, width: 1200, height: 630, alt: siteBrand() }];
}

type OgImageEntry = NonNullable<NonNullable<Metadata['openGraph']>['images']>;

export function twitterImageUrls(images: OgImageEntry | undefined): string[] | undefined {
  if (!images) return undefined;
  const list: OgImageEntry[] = Array.isArray(images) ? images : [images];
  const out: string[] = [];
  for (const i of list) {
    if (typeof i === 'string') out.push(i);
    else if (i && typeof i === 'object' && 'url' in i) {
      const u = (i as { url: string | URL }).url;
      out.push(typeof u === 'string' ? u : u.toString());
    }
  }
  return out.length ? out : undefined;
}
