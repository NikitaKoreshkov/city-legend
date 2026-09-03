import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/how-to-order');

export default function HowToOrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
