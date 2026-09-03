import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/documents');

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
