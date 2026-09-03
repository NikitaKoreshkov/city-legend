import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/promo');

export default function PromoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
