import Link from 'next/link';
import type { Metadata } from 'next';
import pool, { ensureDatabase } from '@/lib/db';
import { estimateReadingMinutes } from '@/lib/blogReadingTime';
import Footer from '@/app/components/Footer';

type Props = { params: Promise<{ id: string }> };

function splitArticleBody(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const id = Number(p.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return { title: 'Блог · CITY LEGEND' };
  }
  try {
    await ensureDatabase();
    const res = await pool.query(`SELECT title FROM cabinet_site_news WHERE id = $1 LIMIT 1`, [id]);
    if (res.rows.length === 0) return { title: 'Блог · CITY LEGEND' };
    const title = (res.rows[0] as { title: string }).title;
    return { title: `${title} · Блог CITY LEGEND` };
  } catch {
    return { title: 'Блог · CITY LEGEND' };
  }
}

export default async function NewsDetailsPage({ params }: Props) {
  const p = await params;
  const id = Number(p.id || 0);
  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="flex min-h-screen flex-col bg-[#faf9f7]">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-32 pb-16 sm:px-6 sm:pt-36 md:pt-40 md:pb-20">
          <p className="text-sm text-gray-600">Публикация недоступна.</p>
        </main>
        <Footer />
      </div>
    );
  }

  await ensureDatabase();
  const res = await pool.query(
    `SELECT title, excerpt, image_url, created_at,
            COALESCE(NULLIF(TRIM(category), ''), 'Бутик') AS category,
            COALESCE(body, '') AS body
     FROM cabinet_site_news
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  if (res.rows.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-[#faf9f7]">
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-32 pb-16 sm:px-6 sm:pt-36 md:pt-40 md:pb-20">
          <p className="text-sm text-gray-600">Публикация недоступна.</p>
        </main>
        <Footer />
      </div>
    );
  }
  const row = res.rows[0] as {
    title: string;
    excerpt: string;
    image_url: string | null;
    created_at: Date;
    category: string;
    body: string;
  };

  const readingMinutes = estimateReadingMinutes(`${row.excerpt}\n${row.body}`);
  const paragraphs = splitArticleBody(row.body);

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f7]">
      <article className="mx-auto w-full max-w-3xl flex-1 px-4 pt-32 pb-16 sm:px-6 sm:pt-36 md:pt-40 md:pb-20">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-10">
          <Link href="/" className="text-[#0b2a24] hover:underline underline-offset-4">
            Главная
          </Link>
          <span className="text-gray-300" aria-hidden>
            /
          </span>
          <span className="text-gray-600">Блог</span>
        </nav>

        <header className="mb-8 md:mb-10">
          <p
            className="inline-block text-[10px] uppercase tracking-[0.2em] text-[#0b2a24] border border-[#0b2a24]/25 px-2.5 py-1 mb-5"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            {row.category}
          </p>
          <h1
            className="text-3xl sm:text-4xl md:text-[2.35rem] font-normal italic text-[#0b2a24] leading-tight"
            style={{ fontFamily: 'var(--font-playfair-display)' }}
          >
            {row.title}
          </h1>
          <div
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            <time dateTime={row.created_at.toISOString()}>
              {new Date(row.created_at).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
            <span className="text-gray-300" aria-hidden>
              ·
            </span>
            <span>{readingMinutes} мин чтения</span>
          </div>
        </header>

        {row.image_url ? (
          <div className="mb-10 md:mb-12 overflow-hidden border border-[#0b2a24]/10 bg-white shadow-sm">
            <img src={row.image_url} alt="" className="w-full h-auto object-cover" />
          </div>
        ) : null}

        <div className="max-w-2xl">
          <p
            className="text-lg sm:text-xl text-gray-700 leading-relaxed mb-10 font-light border-l-2 border-[#0b2a24]/25 pl-5"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            {row.excerpt}
          </p>

          {paragraphs.length > 0 ? (
            <div className="space-y-6">
              {paragraphs.map((para, i) => (
                <p
                  key={i}
                  className="text-[15px] sm:text-base text-gray-800 leading-[1.85]"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {para}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-16 border-t border-gray-200/90 pt-10">
          <Link
            href="/"
            className="text-[10px] uppercase tracking-[0.22em] text-[#0b2a24] border-b border-[#0b2a24]/40 pb-0.5 transition-colors hover:border-[#0b2a24]"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            ← К каталогу
          </Link>
        </div>
      </article>
      <Footer />
    </div>
  );
}
