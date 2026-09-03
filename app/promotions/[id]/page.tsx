import Link from 'next/link';
import type { Metadata } from 'next';
import pool, { ensureDatabase } from '@/lib/db';
import { truncateText } from '@/lib/compareDisplay';
import { buildPageMetadata } from '@/lib/seo/buildMetadata';
import { promotionPageTitle, siteBrand } from '@/lib/seoMeta';
import Footer from '@/app/components/Footer';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const id = Number(p.id || 0);
  const fallback = buildPageMetadata({
    path: '/collection',
    title: `Акции · ${siteBrand()}`,
    titleAbsolute: true,
    description: `Акции и скидки ${siteBrand()}. Jewelry promotions.`,
  });
  if (!Number.isFinite(id) || id <= 0) return fallback;
  try {
    await ensureDatabase();
    const res = await pool.query(
      `SELECT title, subtitle, discount_label
       FROM cabinet_promotions
       WHERE id = $1 AND active = true
       LIMIT 1`,
      [id]
    );
    if (res.rows.length === 0) return fallback;
    const row = res.rows[0] as { title: string; subtitle: string | null; discount_label: string | null };
    const title = promotionPageTitle(row.title);
    const parts = [row.subtitle, row.discount_label].filter(Boolean) as string[];
    const description = truncateText(
      parts.join(' — ') || `Акция: ${row.title}. Скидки на украшения City Legend. Jewelry sale.`,
      160
    );
    return buildPageMetadata({
      title,
      titleAbsolute: true,
      description,
      path: `/promotions/${id}`,
      keywords: ['акция', 'скидка', 'promotion', 'jewelry sale', row.title],
    });
  } catch {
    return fallback;
  }
}

export default async function PromotionDetailsPage({ params }: Props) {
  const p = await params;
  const id = Number(p.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="flex min-h-screen flex-col bg-[#faf9f7]">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-32 pb-16 sm:px-6 sm:pt-36 md:pt-40 md:pb-20">
          <p className="text-sm text-gray-600">Акция недоступна.</p>
        </main>
        <Footer />
      </div>
    );
  }

  await ensureDatabase();
  const res = await pool.query(
    `SELECT title, subtitle, promo_code, discount_label, valid_until
     FROM cabinet_promotions
     WHERE id = $1 AND active = true
     LIMIT 1`,
    [id]
  );
  if (res.rows.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-[#faf9f7]">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-32 pb-16 sm:px-6 sm:pt-36 md:pt-40 md:pb-20">
          <p className="text-sm text-gray-600">Акция недоступна.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const row = res.rows[0] as {
    title: string;
    subtitle: string | null;
    promo_code: string | null;
    discount_label: string | null;
    valid_until: Date | null;
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f7]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-32 pb-16 sm:px-6 sm:pt-36 md:pt-40 md:pb-20">
        <Link href="/" className="text-xs uppercase tracking-widest text-[#0b2a24]">
          Назад
        </Link>
        <h1 className="mt-4 text-3xl italic" style={{ fontFamily: 'var(--font-playfair-display)' }}>
          {row.title}
        </h1>
        <div className="mt-6 border border-gray-200 bg-[#faf9f7] p-5">
          <p className="text-sm text-gray-700">{row.subtitle || 'Персональное предложение для вас.'}</p>
          {row.discount_label ? <p className="mt-3 text-lg text-[#0b2a24]">{row.discount_label}</p> : null}
          {row.promo_code ? <p className="mt-2 text-xs tracking-widest">Код: {row.promo_code}</p> : null}
          {row.valid_until ? (
            <p className="mt-2 text-xs text-gray-500">
              До {new Date(row.valid_until).toLocaleDateString('ru-RU')}
            </p>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}
