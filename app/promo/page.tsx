'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  markCabinetAutoOpenCart,
  persistPromoCouponForCabinet,
} from '@/lib/promoDeepLink';

async function exchangeBotSsoToken(token: string): Promise<void> {
  await fetch('/api/auth/site-sso', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

function PromoRedirectInner() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = searchParams.toString();
    if (startedRef.current === key) return;
    startedRef.current = key;

    const run = async () => {
      const sso = searchParams.get('sso')?.trim();
      if (sso) {
        try {
          await exchangeBotSsoToken(sso);
        } catch {
          /* корзину откроем даже без авто-входа */
        }
      }

      const code = searchParams.get('code')?.trim().toUpperCase();
      if (!code) {
        markCabinetAutoOpenCart();
        window.location.replace('/');
        return;
      }

      const goToCart = (coupon: string) => {
        persistPromoCouponForCabinet(coupon);
        window.location.replace('/');
      };

      try {
        const res = await fetch('/api/promo/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          error?: string;
        };

        if (res.ok && data.ok && data.code) {
          goToCart(data.code.toUpperCase());
          return;
        }

        // QR уже сканировали за 24 ч — всё равно открываем корзину с кодом
        if (res.status === 429) {
          goToCart(code);
          return;
        }

        setError(data.error || 'QR-код временно недоступен. Попробуйте позже.');
      } catch {
        setError('Не удалось проверить QR-код. Попробуйте позже.');
      }
    };

    void run();
  }, [searchParams]);

  if (error) {
    const fallbackCode = searchParams.get('code')?.trim().toUpperCase();
    return (
      <div className="min-h-[40vh] flex items-center justify-center px-4 text-center">
        <div>
          <p className="text-sm text-gray-700">{error}</p>
          <button
            className="mt-4 text-xs underline text-gray-500 hover:text-gray-700"
            onClick={() => {
              if (fallbackCode) {
                persistPromoCouponForCabinet(fallbackCode);
              } else {
                markCabinetAutoOpenCart();
              }
              window.location.replace('/');
            }}
          >
            Перейти в корзину на сайте
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[40vh] flex items-center justify-center px-4 text-center text-sm text-gray-600">
      Переход в корзину…
    </div>
  );
}

export default function PromoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-500">Загрузка…</div>
      }
    >
      <PromoRedirectInner />
    </Suspense>
  );
}
