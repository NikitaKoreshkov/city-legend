'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DEFAULT_LOGO_URL } from '@/lib/siteShellDefaults';

type Wish = {
  token: string;
  auction_id: number;
  name: string;
  starting_price: string;
  compare_at_price: string | null;
  images: string[];
  additional_info: string | null;
  category: string | null;
} | null;

function GiftIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function VKIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.101-.458.593v1.575c0 .424-.135.677-1.253.677-1.846 0-3.896-1.118-5.335-3.202C5.044 11.519 4.5 9.553 4.5 9.129c0-.254.101-.491.593-.491h1.744c.44 0 .61.203.78.677.864 2.49 2.303 4.675 2.896 4.675.22 0 .322-.101.322-.66V10.95c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.743c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.253-1.406 2.15-3.574 2.15-3.574.119-.254.322-.491.762-.491h1.744c.525 0 .643.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .779.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.745-.576.745z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function WishPageClient({ wish, token }: { wish: Wish; token: string }) {
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL || 'https://citylegend.art');

  const wishUrl = `${baseUrl}/wish/${token}`;
  const productUrl = wish ? `${baseUrl}/collection/${wish.auction_id}` : '';

  const wishText = wish
    ? `Привет! Я очень хочу это в 🎁 подарок!\n\n${wish.name}\n${wishUrl}`
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wishUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const shareLinks = wish ? [
    {
      label: 'Telegram',
      icon: <TelegramIcon />,
      href: `https://t.me/share/url?url=${encodeURIComponent(wishUrl)}&text=${encodeURIComponent(`Привет! Я очень хочу это в 🎁 подарок!\n\n${wish.name}`)}`,
      color: '#229ED9',
    },
    {
      label: 'WhatsApp',
      icon: <WhatsAppIcon />,
      href: `https://wa.me/?text=${encodeURIComponent(wishText)}`,
      color: '#25D366',
    },
    {
      label: 'ВКонтакте',
      icon: <VKIcon />,
      href: `https://vk.com/share.php?url=${encodeURIComponent(wishUrl)}&title=${encodeURIComponent(`🎁 ${wish.name}`)}&description=${encodeURIComponent(`Хочу это в подарок из коллекции City Legend`)}`,
      color: '#4C75A3',
    },
  ] : [];

  if (!wish) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#faf9f7]" style={{ fontFamily: 'var(--font-open-sans)' }}>
        <p className="text-xs uppercase tracking-[0.2em] text-gray-400 mb-4">City Legend</p>
        <h1 className="text-2xl font-normal italic mb-4" style={{ fontFamily: 'var(--font-playfair-display)' }}>
          Ссылка не найдена
        </h1>
        <p className="text-sm text-gray-500 mb-8 text-center">Эта ссылка на подарочное желание больше не активна или не существует.</p>
        <Link href="/collection" className="text-xs uppercase tracking-[0.15em] border border-black px-8 py-3 hover:bg-black hover:text-white transition-colors">
          Перейти в коллекцию
        </Link>
      </div>
    );
  }

  const image = wish.images?.[0];

  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col" style={{ fontFamily: 'var(--font-open-sans)' }}>
      {/* Шапка */}
      <header className="flex items-center justify-center py-5 border-b border-gray-200/60">
        <Link href="/" className="hover:opacity-70 transition-opacity">
          <img src={DEFAULT_LOGO_URL} alt="City Legend" className="h-9 w-auto" />
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16">
        {/* Анимированный значок */}
        <div
          className="mb-6 flex items-center justify-center w-16 h-16 rounded-full border border-gray-200 bg-white shadow-sm"
          style={{ animation: 'gentlePulse 3s ease-in-out infinite' }}
        >
          <GiftIcon />
        </div>

        <p className="text-[10px] uppercase tracking-[0.25em] text-gray-400 mb-3">Подарочное желание</p>

        <h1
          className="text-2xl sm:text-3xl font-normal italic text-center leading-snug mb-2 max-w-md"
          style={{ fontFamily: 'var(--font-playfair-display)', color: '#0b2a24' }}
        >
          {wish.name}
        </h1>

        {wish.additional_info && (
          <p className="text-xs text-gray-500 text-center mb-6 max-w-xs">{wish.additional_info}</p>
        )}

        {/* Карточка товара */}
        <div className="mt-8 w-full max-w-sm">
          <div className="bg-white border border-gray-200/70 overflow-hidden shadow-sm">
            {image && (
              <div className="aspect-[4/3] overflow-hidden bg-gray-50">
                <img
                  src={image}
                  alt={wish.name}
                  className="w-full h-full object-cover"
                  style={{ transition: 'transform 0.6s ease', objectPosition: 'center' }}
                />
              </div>
            )}
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 mb-2">
                {wish.category ?? 'City Legend'}
              </p>
              <h2
                className="text-base font-normal leading-snug mb-3"
                style={{ fontFamily: 'var(--font-playfair-display)', color: '#0b2a24' }}
              >
                {wish.name}
              </h2>
              <div className="flex items-baseline gap-3 mb-5">
                <span className="text-base font-normal tracking-wide" style={{ color: '#0b2a24' }}>
                  {wish.starting_price}
                </span>
                {wish.compare_at_price && (
                  <span className="text-sm text-gray-400 line-through">{wish.compare_at_price}</span>
                )}
              </div>
              <Link
                href={productUrl}
                className="block w-full text-center py-3 bg-[#0b2a24] text-white text-[11px] uppercase tracking-[0.15em] hover:bg-transparent hover:text-[#0b2a24] hover:border hover:border-[#0b2a24] transition-all"
              >
                Посмотреть украшение
              </Link>
            </div>
          </div>
        </div>

        {/* Блок шеринга */}
        <div className="mt-10 w-full max-w-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-center text-gray-400 mb-5">
            Поделиться желанием
          </p>

          {/* Иконки соцсетей */}
          <div className="flex items-center justify-center gap-4 mb-5">
            {shareLinks.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex items-center justify-center w-11 h-11 rounded-full border border-gray-200 bg-white hover:border-gray-400 transition-all hover:shadow-sm"
                style={{ color: s.color }}
              >
                {s.icon}
              </a>
            ))}
          </div>

          {/* Копировать ссылку */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 w-full py-3 border border-gray-300 text-[11px] uppercase tracking-[0.15em] text-gray-600 hover:border-[#0b2a24] hover:text-[#0b2a24] transition-colors"
          >
            <CopyIcon />
            {copied ? 'Ссылка скопирована ✓' : 'Скопировать ссылку'}
          </button>
        </div>
      </main>

      <footer className="text-center py-6 border-t border-gray-200/60">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">
          © City Legend — Коллекция украшений
        </p>
      </footer>

      <style>{`
        @keyframes gentlePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(11, 42, 36, 0.08); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(11, 42, 36, 0); }
        }
      `}</style>
    </div>
  );
}
