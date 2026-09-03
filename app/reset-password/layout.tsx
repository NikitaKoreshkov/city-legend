import type { Metadata } from 'next';
import { metadataForPath } from '@/lib/seo/staticPages';

export const metadata: Metadata = metadataForPath('/reset-password');

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
