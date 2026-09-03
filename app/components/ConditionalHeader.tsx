'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Header from './Header';

export default function ConditionalHeader() {
  const pathname = usePathname();
  
  // Не показываем Header на страницах админки
  if (pathname?.startsWith('/admin')) {
    return null;
  }
  
  return (
    <Suspense fallback={null}>
      <Header />
    </Suspense>
  );
}

