import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/about');

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
