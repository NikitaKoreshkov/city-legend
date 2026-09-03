'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Footer from '../components/Footer';

export default function AboutPage() {
  const [headerHeight, setHeaderHeight] = useState(120);

  const [hero, setHero] = useState({
    // В БД поле hero.image используется как источник медиа (jpg/avif или mp4)
    image: '/COLLECTION.mp4',
    subtitle: 'О бренде',
    title: 'CITY LEGEND',
    description: 'Бижутерия и аксессуары, отобранные для тех, кто ценит изящество в каждой детали. Кураторский подход и вневременной стиль.',
  });

  const [philosophy, setPhilosophy] = useState({
    title: 'Наша философия',
    quote: '«Аксессуар — это не просто украшение. Это знак внимания к себе и к моменту. Мы выбираем вещи с характером, которые говорят без слов».',
    author: 'CITY LEGEND',
  });

  const [valuesSection, setValuesSection] = useState({
    title: 'Наши ценности',
    subtitle: 'Принципы,\nкоторыми мы живём',
    image: '',
    values: [
      {
        title: 'Кураторский выбор',
        description: 'Каждая вещь в коллекции отобрана за безупречный вкус и качество. Мы не предлагаем массовый ассортимент — только то, что сами считаем достойным.',
        icon: '—',
      },
      {
        title: 'Качество',
        description: 'Натуральные камни, гипоаллергенная фурнитура и внимание к детали. Мы за то, чтобы аксессуары служили долго и радовали каждый день.',
        icon: '—',
      },
      {
        title: 'Индивидуальность',
        description: 'Для тех, кто не боится подчёркивать свой стиль. Наши вещи помогают выразить характер и вкус без лишних слов.',
        icon: '—',
      },
    ],
  });

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const response = await fetch('/api/content/about');
        const data = await response.json();
        if (data.hero) setHero(data.hero);
        if (data.philosophy) setPhilosophy(data.philosophy);
        if (data.values) setValuesSection(data.values);
      } catch (error) {
        console.error('Ошибка загрузки контента:', error);
      }
    };
    fetchContent();
  }, []);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) setHeaderHeight(header.offsetHeight);
    };
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    setTimeout(updateHeaderHeight, 100);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section
        className="relative flex min-h-[85vh] items-center justify-center overflow-hidden px-4"
        style={{ paddingTop: `${headerHeight}px` }}
      >
        {String(hero.image || '').toLowerCase().endsWith('.mp4') ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            src={hero.image}
          />
        ) : (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${hero.image})` }}
          />
        )}
        {/* Без синего: только лёгкое затемнение для читаемости */}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative z-10 max-w-2xl text-center">
          <p
            className="mb-4 text-[10px] uppercase tracking-[0.25em] text-white/90"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            {hero.subtitle}
          </p>
          <h1
            className="text-4xl font-normal tracking-tight text-white sm:text-5xl md:text-6xl"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              lineHeight: 1.15,
            }}
          >
            {hero.title}
          </h1>
          <p
            className="mt-6 text-sm leading-relaxed text-white/90 sm:text-base"
            style={{
              fontFamily: 'var(--font-open-sans)',
              letterSpacing: '0.02em',
            }}
          >
            {hero.description}
          </p>
        </div>
      </section>

      {/* Философия */}
      <section className="border-b border-gray-100 bg-[#faf9f7] py-16 md:py-24">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <p
            className="mb-6 text-[10px] uppercase tracking-[0.2em] text-gray-500"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            {philosophy.title}
          </p>
          <blockquote
            className="text-xl font-normal italic leading-relaxed text-black sm:text-2xl md:text-3xl"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              letterSpacing: '0.02em',
            }}
          >
            {philosophy.quote}
          </blockquote>
          <p
            className="mt-8 text-xs uppercase tracking-[0.15em] text-gray-500"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            {philosophy.author}
          </p>
        </div>
      </section>

      {/* Ценности + изображение */}
      <section className="border-b border-gray-100">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {valuesSection.image?.trim() ? (
            <div className="relative aspect-[4/5] w-full lg:aspect-auto lg:min-h-[720px]">
              <Image
                src={valuesSection.image}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          ) : null}
          <div className="flex flex-col justify-center bg-[#faf9f7] px-6 py-12 md:px-12 md:py-16 lg:px-16 lg:py-20">
            <p
              className="mb-4 text-[10px] uppercase tracking-[0.2em] text-gray-500"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              {valuesSection.title}
            </p>
            <h2
              className="mb-10 whitespace-pre-line text-2xl font-normal text-black md:mb-14 md:text-3xl lg:text-4xl"
              style={{
                fontFamily: 'var(--font-playfair-display)',
                letterSpacing: '0.01em',
                lineHeight: 1.2,
              }}
            >
              {valuesSection.subtitle}
            </h2>
            <ul className="space-y-8 md:space-y-10">
              {valuesSection.values.map((value, index) => (
                <li key={index}>
                  <h3
                    className="mb-2 text-lg font-normal text-black md:text-xl"
                    style={{
                      fontFamily: 'var(--font-playfair-display)',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {value.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed text-gray-600 md:text-base"
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {value.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="my-16 py-16 md:my-24 md:py-20"
        style={{ backgroundColor: '#0b2a24' }}
      >
        <div className="container mx-auto max-w-xl px-4 text-center">
          <h2
            className="text-2xl font-normal text-white md:text-3xl"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              letterSpacing: '0.02em',
              lineHeight: 1.25,
            }}
          >
            Узнайте нашу коллекцию
          </h2>
          <p
            className="mt-4 text-sm text-white/80"
            style={{
              fontFamily: 'var(--font-open-sans)',
              letterSpacing: '0.02em',
            }}
          >
            Каталог аксессуаров и бижутерии
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auctions"
              className="inline-block border border-white px-8 py-3 text-xs uppercase tracking-[0.15em] text-white transition-colors hover:bg-white hover:text-[#0b2a24]"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Каталог
            </Link>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
              className="inline-block border-b border-white/80 pb-1 text-xs uppercase tracking-[0.15em] text-white/90 transition-opacity hover:opacity-80"
              style={{ fontFamily: 'var(--font-open-sans)' }}
            >
              Связаться
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
