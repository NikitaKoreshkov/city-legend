import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/payment');

export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
