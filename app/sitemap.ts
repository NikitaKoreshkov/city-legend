import { MetadataRoute } from 'next';
import pool from '@/lib/db';
import { siteBaseUrl } from '@/lib/seo/buildMetadata';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteBaseUrl();
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/collection`, lastModified: now, changeFrequency: 'daily', priority: 0.95 },
    { url: `${baseUrl}/collection/compare`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/care`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/how-to-order`, lastModified: now, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${baseUrl}/payment/flow`, lastModified: now, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${baseUrl}/documents`, lastModified: now, changeFrequency: 'monthly', priority: 0.55 },
    { url: `${baseUrl}/promo`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${baseUrl}/privacy-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.35 },
    { url: `${baseUrl}/terms-of-use`, lastModified: now, changeFrequency: 'yearly', priority: 0.35 },
    { url: `${baseUrl}/cookies`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  let productPages: MetadataRoute.Sitemap = [];
  let newsPages: MetadataRoute.Sitemap = [];
  let promotionPages: MetadataRoute.Sitemap = [];

  try {
    const [auctionRes, newsRes, promoRes] = await Promise.all([
      pool.query<{ id: number; updated_at: Date }>(
        `SELECT id, updated_at FROM auctions ORDER BY id`
      ),
      pool.query<{ id: number; created_at: Date }>(
        `SELECT id, created_at FROM cabinet_site_news ORDER BY id`
      ),
      pool.query<{ id: number; created_at: Date }>(
        `SELECT id, created_at FROM cabinet_promotions WHERE active = true ORDER BY id`
      ),
    ]);

    productPages = auctionRes.rows.map((row) => ({
      url: `${baseUrl}/collection/${row.id}`,
      lastModified: row.updated_at ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    }));

    newsPages = newsRes.rows.map((row) => ({
      url: `${baseUrl}/news/${row.id}`,
      lastModified: row.created_at ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    promotionPages = promoRes.rows.map((row) => ({
      url: `${baseUrl}/promotions/${row.id}`,
      lastModified: row.created_at ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    }));
  } catch {
    // DB not yet ready — return static pages only
  }

  return [...staticPages, ...productPages, ...newsPages, ...promotionPages];
}
