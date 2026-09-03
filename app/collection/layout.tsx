import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/collection');

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
