import { MetadataRoute } from 'next';
import { siteBaseUrl } from '@/lib/seo/buildMetadata';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteBaseUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/payment',
          '/reset-password/',
          '/wish/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
