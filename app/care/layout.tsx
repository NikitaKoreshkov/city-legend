import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/care');

export default function CareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
