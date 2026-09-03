import { absoluteOgImageUrl, siteBrand } from '@/lib/seoMeta';
import { siteBaseUrl } from '@/lib/seo/buildMetadata';
import { parsePriceRub } from '@/lib/cartPricing';

export function buildOrganizationAndWebSiteJsonLd(opts: {
  baseUrl: string;
  logoUrl: string;
  legalName: string;
  legalAddress?: string;
  phoneE164: string;
  description: string;
}): { '@context': string; '@graph': Record<string, unknown>[] } {
  const base = opts.baseUrl.replace(/\/$/, '');
  const brand = siteBrand();
  const org: Record<string, unknown> = {
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: brand,
    legalName: opts.legalName || brand,
    alternateName: ['City Legend', 'citylegend', 'citylegend.art', 'Сити Легенд'],
    url: base,
    logo: opts.logoUrl,
    description: opts.description,
    ...(opts.legalAddress?.trim()
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: opts.legalAddress.trim(),
            addressCountry: 'RU',
          },
        }
      : {}),
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: opts.phoneE164,
      contactType: 'customer service',
      availableLanguage: ['Russian', 'English'],
    },
  };

  const website: Record<string, unknown> = {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: base,
    name: brand,
    alternateName: ['City Legend', 'citylegend.art'],
    description: opts.description,
    inLanguage: ['ru-RU', 'en-US'],
    publisher: { '@id': `${base}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${base}/collection?category={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [org, website],
  };
}

export function buildProductJsonLd(opts: {
  id: number;
  name: string;
  description: string;
  images: string[];
  priceRub: string | number | null | undefined;
  inStock: boolean;
  categoryName?: string | null;
}): Record<string, unknown> {
  const base = siteBaseUrl();
  const brand = siteBrand();
  const url = `${base}/collection/${opts.id}`;
  const price = parsePriceRub(String(opts.priceRub ?? ''));
  const imageUrls = opts.images
    .map((img) => absoluteOgImageUrl(img))
    .filter((u): u is string => Boolean(u));

  const product: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: opts.name,
    description: opts.description,
    url,
    sku: String(opts.id),
    mpn: String(opts.id),
    itemCondition: 'https://schema.org/NewCondition',
    brand: { '@type': 'Brand', name: brand },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    ...(imageUrls.length ? { image: imageUrls } : {}),
    ...(opts.categoryName
      ? { category: opts.categoryName }
      : {}),
  };

  if (price != null && price > 0) {
    product.offers = {
      '@type': 'Offer',
      '@id': `${url}#offer`,
      url,
      priceCurrency: 'RUB',
      price: String(price),
      availability: opts.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: brand,
        url: base,
      },
    };
  }

  return product;
}

/** BreadcrumbList для карточки товара. */
export function buildProductBreadcrumbJsonLd(opts: {
  id: number;
  name: string;
  categoryName?: string | null;
}): Record<string, unknown> {
  const base = siteBaseUrl();
  const brand = siteBrand();
  const url = `${base}/collection/${opts.id}`;
  const items: Record<string, unknown>[] = [
    {
      '@type': 'ListItem',
      position: 1,
      name: brand,
      item: `${base}/`,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Каталог',
      item: `${base}/collection`,
    },
  ];
  let pos = 3;
  if (opts.categoryName?.trim()) {
    items.push({
      '@type': 'ListItem',
      position: pos,
      name: opts.categoryName.trim(),
      item: `${base}/collection`,
    });
    pos += 1;
  }
  items.push({
    '@type': 'ListItem',
    position: pos,
    name: opts.name,
    item: url,
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}
