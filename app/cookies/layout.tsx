import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/cookies');

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
