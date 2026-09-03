import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/collection/compare');

export default function CollectionCompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
