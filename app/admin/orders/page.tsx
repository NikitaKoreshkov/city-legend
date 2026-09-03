'use client';

import { AdminProtected } from '@/app/components/admin/AdminContext';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function AdminOrdersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/crm');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7]">
      <p className="text-sm text-gray-400" style={{ fontFamily: 'var(--font-open-sans)' }}>
        Перенаправление...
      </p>
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <AdminProtected permission="orders.view">
      <AdminOrdersRedirect />
    </AdminProtected>
  );
}
