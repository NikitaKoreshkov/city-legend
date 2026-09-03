import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/payment/flow');

export default function PaymentFlowLayout({ children }: { children: React.ReactNode }) {
  return children;
}
