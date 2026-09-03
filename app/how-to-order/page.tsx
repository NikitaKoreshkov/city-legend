'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Footer from '../components/Footer';

const TAB_OPTIONS: { id: 'site' | 'wb' | 'ozon' | 'whatsapp'; label: string }[] = [
  { id: 'site', label: 'На сайте' },
  { id: 'wb', label: 'Wildberries' },
  { id: 'ozon', label: 'Ozon' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

export default function HowToOrderPage() {
  const [headerHeight, setHeaderHeight] = useState(120);
  const [active, setActive] = useState<'site' | 'wb' | 'ozon' | 'whatsapp'>('site');
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) setHeaderHeight(header.offsetHeight);
    };
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  const marketplaceLinks = useMemo(
    () => ({
      whatsapp: 'https://wa.me/79652316018',
      wb: 'https://www.wildberries.ru/seller/479435',
      ozon: 'https://www.ozon.ru/seller/city-legend/',
    }),
    []
  );

  const Tab = ({
    id,
    label,
    onAfterSelect,
  }: {
    id: 'site' | 'wb' | 'ozon' | 'whatsapp';
    label: string;
    onAfterSelect?: () => void;
  }) => {
    const isActive = active === id;
    return (
      <button
        type="button"
        onClick={() => {
          setActive(id);
          onAfterSelect?.();
        }}
        className={[
          'px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors',
          isActive ? 'bg-[#0b2a24] text-white' : 'bg-white text-black hover:bg-gray-50',
          'border border-gray-200',
        ].join(' ')}
        style={{ fontFamily: 'var(--font-open-sans)' }}
      >
        {label}
      </button>
    );
  };

  const activeLabel = TAB_OPTIONS.find((t) => t.id === active)?.label ?? 'На сайте';

  return (
    <div className="min-h-screen bg-white" style={{ paddingTop: `${headerHeight}px` }}>
      {/* Hero */}
      <section className="border-b border-gray-100 bg-white py-14 sm:py-16 md:py-20">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <p
            className="text-[10px] uppercase tracking-[0.25em] text-gray-400"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            Покупка и доставка
          </p>
          <h1
            className="mt-4 text-3xl font-normal text-black sm:text-4xl md:text-5xl"
            style={{ fontFamily: 'var(--font-playfair-display)', lineHeight: 1.15 }}
          >
            Оформление заказа
          </h1>
          <p
            className="mx-auto mt-6 max-w-3xl text-sm leading-relaxed text-gray-600 sm:text-base"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            Вы можете купить украшения прямо на сайте, на маркетплейсах или написать нам в WhatsApp. Ниже — кратко и по шагам, как всё
            происходит.
          </p>
        </div>
      </section>

      {/* Способы заказа */}
      <section className="border-b border-gray-100 bg-[#faf9f7] py-16 md:py-24">
        <div className="container mx-auto max-w-5xl px-4">
          <div className="hidden text-center sm:block">
            <p
              className="text-[10px] uppercase tracking-[0.25em] text-gray-400"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Выберите удобный способ
            </p>
            <h2
              className="mt-4 text-2xl font-normal text-black sm:text-3xl"
              style={{ fontFamily: 'var(--font-playfair-display)' }}
            >
              4 варианта покупки
            </h2>
          </div>

          {/* Мобильная липкая панель выбора способа */}
          <div
            className="sm:hidden sticky z-40 -mx-4 border-y border-gray-200 bg-[#faf9f7]/95 px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md"
            style={{ top: `${headerHeight}px` }}
          >
            <button
              type="button"
              aria-expanded={mobilePickerOpen}
              aria-controls="how-to-order-mobile-tabs"
              onClick={() => setMobilePickerOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <p
                  className="text-[10px] uppercase tracking-[0.25em] text-gray-400"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Выберите удобный способ
                </p>
                <p
                  className="mt-1 text-lg font-normal leading-tight text-black"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  4 варианта покупки
                </p>
                <p
                  className="mt-1 truncate text-[11px] uppercase tracking-[0.2em] text-gray-600"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  Сейчас: {activeLabel}
                </p>
              </div>
              <span
                className="flex h-10 w-10 flex-none items-center justify-center border border-gray-200 bg-white text-gray-600"
                aria-hidden
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className={mobilePickerOpen ? '-rotate-180 transition-transform duration-200' : 'transition-transform duration-200'}
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {mobilePickerOpen && (
              <div id="how-to-order-mobile-tabs" className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-200/80 pt-4">
                {TAB_OPTIONS.map(({ id, label }) => (
                  <Tab key={id} id={id} label={label} onAfterSelect={() => setMobilePickerOpen(false)} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-10 hidden flex-wrap items-center justify-center gap-2 sm:flex">
            {TAB_OPTIONS.map(({ id, label }) => (
              <Tab key={id} id={id} label={label} />
            ))}
          </div>

          <div className="mx-auto mt-6 max-w-4xl rounded-none border border-gray-200 bg-white px-5 py-8 sm:mt-10 sm:px-8">
            {active === 'site' && (
              <div>
                <h3
                  className="text-lg font-normal text-black sm:text-xl"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Покупка на сайте
                </h3>
                <ol className="mt-6 space-y-4">
                  {[
                    'Выберите изделие в каталоге и добавьте в корзину.',
                    'Перейдите к оформлению: укажите имя, телефон и адрес доставки.',
                    'Выберите способ оплаты и подтвердите заказ.',
                    'Мы свяжемся с вами для подтверждения и отправим заказ.',
                  ].map((t, i) => (
                    <li key={i} className="flex gap-4">
                      <span
                        className="mt-[2px] inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-gray-200 text-[11px] text-gray-600"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {i + 1}
                      </span>
                      <p
                        className="text-sm leading-relaxed text-gray-600 sm:text-base"
                        style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                      >
                        {t}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/auctions"
                    className="inline-block border border-black px-8 py-3 text-[11px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Перейти в каталог
                  </Link>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
                    className="inline-block border-b border-black pb-1 text-[11px] uppercase tracking-[0.2em] text-black/90 transition-opacity hover:opacity-70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Задать вопрос
                  </button>
                </div>
              </div>
            )}

            {active === 'wb' && (
              <div>
                <h3
                  className="text-lg font-normal text-black sm:text-xl"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Покупка на Wildberries
                </h3>
                <p
                  className="mt-6 text-sm leading-relaxed text-gray-600 sm:text-base"
                  style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                >
                  Оформление и доставка проходят по правилам Wildberries.
                </p>
                <ol className="mt-6 space-y-4">
                  {[
                    'Перейдите в наш магазин на Wildberries.',
                    'Выберите изделие и оформите заказ в приложении/на сайте WB.',
                    'Отслеживайте статус доставки в кабинете Wildberries.',
                  ].map((t, i) => (
                    <li key={i} className="flex gap-4">
                      <span
                        className="mt-[2px] inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-gray-200 text-[11px] text-gray-600"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {i + 1}
                      </span>
                      <p
                        className="text-sm leading-relaxed text-gray-600 sm:text-base"
                        style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                      >
                        {t}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a
                    href={marketplaceLinks.wb}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block border border-black px-8 py-3 text-[11px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Открыть Wildberries
                  </a>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
                    className="inline-block border-b border-black pb-1 text-[11px] uppercase tracking-[0.2em] text-black/90 transition-opacity hover:opacity-70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Нужна помощь
                  </button>
                </div>
              </div>
            )}

            {active === 'ozon' && (
              <div>
                <h3
                  className="text-lg font-normal text-black sm:text-xl"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Покупка на Ozon
                </h3>
                <p
                  className="mt-6 text-sm leading-relaxed text-gray-600 sm:text-base"
                  style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                >
                  Оформление и доставка проходят по правилам Ozon.
                </p>
                <ol className="mt-6 space-y-4">
                  {[
                    'Перейдите в наш магазин на Ozon.',
                    'Выберите изделие и оформите заказ в приложении/на сайте Ozon.',
                    'Отслеживайте статус доставки в кабинете Ozon.',
                  ].map((t, i) => (
                    <li key={i} className="flex gap-4">
                      <span
                        className="mt-[2px] inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-gray-200 text-[11px] text-gray-600"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {i + 1}
                      </span>
                      <p
                        className="text-sm leading-relaxed text-gray-600 sm:text-base"
                        style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                      >
                        {t}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a
                    href={marketplaceLinks.ozon}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block border border-black px-8 py-3 text-[11px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Открыть Ozon
                  </a>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
                    className="inline-block border-b border-black pb-1 text-[11px] uppercase tracking-[0.2em] text-black/90 transition-opacity hover:opacity-70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Нужна помощь
                  </button>
                </div>
              </div>
            )}

            {active === 'whatsapp' && (
              <div>
                <h3
                  className="text-lg font-normal text-black sm:text-xl"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  Заказ через WhatsApp
                </h3>
                <p
                  className="mt-6 text-sm leading-relaxed text-gray-600 sm:text-base"
                  style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                >
                  Если нужно быстро подобрать вариант, уточнить наличие или получить рекомендацию — напишите нам.
                </p>
                <ol className="mt-6 space-y-4">
                  {[
                    'Отправьте ссылку на изделие (или скрин) и укажите, что хотите заказать.',
                    'Мы подтвердим наличие, цену, сроки и условия доставки.',
                    'Согласуем адрес и способ оплаты, после чего оформим отправку.',
                  ].map((t, i) => (
                    <li key={i} className="flex gap-4">
                      <span
                        className="mt-[2px] inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-gray-200 text-[11px] text-gray-600"
                        style={{ fontFamily: 'var(--font-open-sans)' }}
                      >
                        {i + 1}
                      </span>
                      <p
                        className="text-sm leading-relaxed text-gray-600 sm:text-base"
                        style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                      >
                        {t}
                      </p>
                    </li>
                  ))}
                </ol>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <a
                    href={marketplaceLinks.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block border border-black px-8 py-3 text-[11px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Написать в WhatsApp
                  </a>
                  <Link
                    href="/auctions"
                    className="inline-block border-b border-black pb-1 text-[11px] uppercase tracking-[0.2em] text-black/90 transition-opacity hover:opacity-70"
                    style={{ fontFamily: 'var(--font-open-sans)' }}
                  >
                    Сначала выбрать изделие
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Оплата, доставка, возврат */}
      <section className="border-b border-gray-100 bg-white py-16 md:py-24">
        <div className="container mx-auto max-w-5xl px-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            {[
              {
                title: 'Оплата',
                kicker: 'Коротко о способах',
                items: [
                  'На сайте — выбранным способом при оформлении заказа.',
                  'На маркетплейсах — по правилам Wildberries/Ozon.',
                  'Через WhatsApp — по согласованию (после подтверждения наличия).',
                ],
              },
              {
                title: 'Доставка',
                kicker: 'Сроки и отслеживание',
                items: [
                  'Сроки и стоимость зависят от региона и способа заказа.',
                  'После отправки вы получите информацию для отслеживания (если применимо).',
                  'Для WB/Ozon — отслеживание в личном кабинете маркетплейса.',
                ],
              },
              {
                title: 'Возврат и обмен',
                kicker: 'Если что-то не подошло',
                items: [
                  'Если заказ оформлен на маркетплейсе — возврат/обмен по правилам площадки.',
                  'Если заказ оформлен на сайте или через WhatsApp — напишите нам, и мы подскажем порядок действий.',
                  'Пожалуйста, сохраняйте упаковку и комплектность до завершения примерки.',
                ],
              },
            ].map((card) => (
              <div key={card.title} className="border border-gray-200 bg-[#faf9f7] px-5 py-7 sm:px-7">
                <p
                  className="text-[10px] uppercase tracking-[0.25em] text-gray-400"
                  style={{ fontFamily: 'var(--font-open-sans)' }}
                >
                  {card.kicker}
                </p>
                <h3
                  className="mt-3 text-lg font-normal text-black"
                  style={{ fontFamily: 'var(--font-playfair-display)' }}
                >
                  {card.title}
                </h3>
                <ul className="mt-6 space-y-4">
                  {card.items.map((t) => (
                    <li key={t} className="flex gap-3">
                      <span
                        className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-black/70"
                        aria-hidden
                      />
                      <p
                        className="text-sm leading-relaxed text-gray-600"
                        style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
                      >
                        {t}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-none border border-gray-200 bg-[#faf9f7] px-5 py-8 sm:px-8">
            <p
              className="text-[10px] uppercase tracking-[0.25em] text-gray-400"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Важно
            </p>
            <p
              className="mt-4 text-sm leading-relaxed text-gray-600 sm:text-base"
              style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
            >
              Если вы не уверены в размере/посадке или хотите подобрать вариант под образ — напишите нам в WhatsApp. Мы ответим и
              предложим наиболее удачные решения.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={marketplaceLinks.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-fit border border-black px-7 py-3 text-[11px] uppercase tracking-[0.2em] text-black transition-opacity hover:opacity-70"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Написать в WhatsApp
              </a>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
                className="inline-block w-fit border-b border-black pb-1 text-[11px] uppercase tracking-[0.2em] text-black/90 transition-opacity hover:opacity-70"
                style={{ fontFamily: 'var(--font-open-sans)' }}
              >
                Контакты
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
