import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/privacy-policy');

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
