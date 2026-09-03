import type { Metadata } from 'next';
import { AdminShell } from '@/app/components/admin/AdminShell';
import { buildNoindexMetadata } from '@/lib/seo/buildMetadata';

export const metadata: Metadata = buildNoindexMetadata({
  path: '/admin',
  title: 'Админ-панель City Legend',
  description: 'Служебный раздел администратора.',
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
