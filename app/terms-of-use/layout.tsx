import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/terms-of-use');

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
