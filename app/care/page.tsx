'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import Footer from '../components/Footer';

function useScrollReveal(threshold = 0.12) {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

const PARALLAX_RATE = 0.35;
const PARALLAX_MAX = 120;
const SCALE_MIN = 0.82;
const SCALE_MAX = 1;

export default function CarePage() {
  const [headerHeight, setHeaderHeight] = useState(120);
  const [parallax1, setParallax1] = useState(0);
  const [parallax2, setParallax2] = useState(0);
  const [parallax3, setParallax3] = useState(0);
  const [scale1, setScale1] = useState(SCALE_MIN);
  const [scale2, setScale2] = useState(SCALE_MIN);
  const [scale3, setScale3] = useState(SCALE_MIN);
  const mediaRef1 = useRef<HTMLDivElement>(null);
  const mediaRef2 = useRef<HTMLDivElement>(null);
  const mediaRef3 = useRef<HTMLDivElement>(null);
  const s4 = useScrollReveal();
  const s5 = useScrollReveal();

  useEffect(() => {
    const updateHeaderHeight = () => {
      const header = document.querySelector('header');
      if (header) setHeaderHeight(header.offsetHeight);
    };
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  useEffect(() => {
    const updateParallaxAndScale = () => {
      const h = window.innerHeight;
      const calcParallax = (el: HTMLDivElement | null) => {
        if (!el) return 0;
        const top = el.getBoundingClientRect().top;
        if (top > h) return PARALLAX_MAX;
        if (top < -el.offsetHeight) return 0;
        const offset = top * PARALLAX_RATE;
        return Math.max(0, Math.min(offset, PARALLAX_MAX));
      };
      const calcScale = (el: HTMLDivElement | null) => {
        if (!el) return SCALE_MIN;
        const top = el.getBoundingClientRect().top;
        const progress = Math.max(0, Math.min(1, (h - top) / h));
        return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * progress;
      };
      setParallax1(calcParallax(mediaRef1.current));
      setParallax2(calcParallax(mediaRef2.current));
      setParallax3(calcParallax(mediaRef3.current));
      setScale1(calcScale(mediaRef1.current));
      setScale2(calcScale(mediaRef2.current));
      setScale3(calcScale(mediaRef3.current));
    };
    updateParallaxAndScale();
    window.addEventListener('scroll', updateParallaxAndScale, { passive: true });
    window.addEventListener('resize', updateParallaxAndScale);
    return () => {
      window.removeEventListener('scroll', updateParallaxAndScale);
      window.removeEventListener('resize', updateParallaxAndScale);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section
        className="relative flex min-h-[85vh] items-center justify-center overflow-hidden px-4"
        style={{ paddingTop: `${headerHeight}px` }}
      >
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          src="/Bulgari.mp4"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 max-w-2xl text-center">
          <p
            className="mb-4 text-[10px] uppercase tracking-[0.25em] text-white/90"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            Рекомендации
          </p>
          <h1
            className="text-4xl font-normal tracking-tight text-white sm:text-5xl md:text-6xl"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              lineHeight: 1.15,
            }}
          >
            Уход и хранение
          </h1>
          <p
            className="mt-6 text-sm leading-relaxed text-white/85 sm:text-base"
            style={{
              fontFamily: 'var(--font-open-sans)',
              letterSpacing: '0.02em',
            }}
          >
            Чтобы аксессуары долго сохраняли вид, достаточно нескольких простых правил.
          </p>
        </div>
      </section>

      {/* Intro block */}
      <section className="border-b border-gray-100 bg-[#faf9f7] py-16 md:py-24">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <p
            className="text-sm leading-relaxed text-gray-600 md:text-base"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              fontStyle: 'italic',
              letterSpacing: '0.02em',
            }}
          >
            Натуральные камни и гипоаллергенная фурнитура требуют бережного обращения. Следуя этим советам, вы сохраните блеск и целостность каждой вещи.
          </p>
        </div>
      </section>

      {/* Section 1 — Хранение */}
      <section className="grid min-h-0 items-center gap-12 border-b border-gray-100 py-16 md:grid-cols-2 md:gap-16 md:py-24 md:odd:grid-flow-dense">
        {/* Прозрачная панель — статичная рамка, без transform */}
        <div ref={mediaRef1} className="relative aspect-[4/5] overflow-hidden bg-transparent md:aspect-[3/4]">
          <div
            className="absolute inset-0 origin-center transition-transform duration-300 ease-out"
            style={{ transform: `scale(${scale1}) translateY(${parallax1}px)` }}
          >
            <video
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              src="/COLLECTION.mp4"
            />
          </div>
        </div>
        <div className="flex flex-col justify-center px-4 md:px-8">
          <span
            className="mb-3 block text-[10px] uppercase tracking-[0.2em] text-gray-400"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            I
          </span>
          <h2
            className="mb-6 text-2xl font-normal text-black md:text-3xl"
            style={{ fontFamily: 'var(--font-playfair-display)' }}
          >
            Хранение
          </h2>
          <p
            className="mb-4 text-sm leading-relaxed text-gray-600"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            Держите украшения в сухом месте, защищённом от прямого солнца. Идеально — отдельная шкатулка или мешочек на одну вещь, чтобы не царапать покрытие и не спутывать цепочки.
          </p>
          <p
            className="text-sm leading-relaxed text-gray-600"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            Для изделий с натуральными камнями лучше избегать контакта с другими металлами и хранить в мягкой ткани или антикоррозийной коробке.
          </p>
        </div>
      </section>

      {/* Section 2 — Ношение */}
      <section className="grid min-h-0 items-center gap-12 border-b border-gray-100 py-16 md:grid-cols-2 md:gap-16 md:py-24">
        <div className="order-2 flex flex-col justify-center px-4 md:order-1 md:px-8">
          <span
            className="mb-3 block text-[10px] uppercase tracking-[0.2em] text-gray-400"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            II
          </span>
          <h2
            className="mb-6 text-2xl font-normal text-black md:text-3xl"
            style={{ fontFamily: 'var(--font-playfair-display)' }}
          >
            Ношение
          </h2>
          <p
            className="mb-4 text-sm leading-relaxed text-gray-600"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            Надевайте украшения после того, как нанесли парфюм и косметику — так вы убережёте покрытие и камни от лишнего контакта с спиртами и маслами.
          </p>
          <p
            className="text-sm leading-relaxed text-gray-600"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            Снимайте аксессуары перед сном, душем, бассейном и тренировкой. Вода, пот и механические нагрузки сокращают срок службы любого украшения.
          </p>
        </div>
        {/* Прозрачная панель — статичная рамка, без transform */}
        <div ref={mediaRef2} className="relative order-1 aspect-[4/5] overflow-hidden bg-transparent md:order-2 md:aspect-[3/4]">
          <div
            className="absolute inset-0 origin-center transition-transform duration-300 ease-out"
            style={{ transform: `scale(${scale2}) translateY(${parallax2}px)` }}
          >
            <Image
              src="/4.avif"
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      {/* Section 3 — Чистка */}
      <section className="grid min-h-0 items-center gap-12 border-b border-gray-100 py-16 md:grid-cols-2 md:gap-16 md:py-24 md:odd:grid-flow-dense">
        {/* Прозрачная панель — статичная рамка, без transform */}
        <div ref={mediaRef3} className="relative aspect-[4/5] overflow-hidden bg-transparent md:aspect-[3/4]">
          <div
            className="absolute inset-0 origin-center transition-transform duration-300 ease-out"
            style={{ transform: `scale(${scale3}) translateY(${parallax3}px)` }}
          >
            <video
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              src="/Luxury.mp4"
            />
          </div>
        </div>
        <div className="flex flex-col justify-center px-4 md:px-8">
          <span
            className="mb-3 block text-[10px] uppercase tracking-[0.2em] text-gray-400"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            III
          </span>
          <h2
            className="mb-6 text-2xl font-normal text-black md:text-3xl"
            style={{ fontFamily: 'var(--font-playfair-display)' }}
          >
            Чистка
          </h2>
          <p
            className="mb-4 text-sm leading-relaxed text-gray-600"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            Протирайте изделия мягкой безворсовой тканью после ношения — этого обычно достаточно, чтобы убрать следы кожи и пыль. Не используйте абразивы и агрессивную химию.
          </p>
          <p
            className="text-sm leading-relaxed text-gray-600"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            Изделия с натуральными камнями лучше не погружать в воду надолго и не чистить в ультразвуке без консультации — некоторые камни этого не любят.
          </p>
        </div>
      </section>

      {/* Closing block */}
      <section
        ref={s4.ref}
        className="bg-[#0b2a24] py-20 md:py-28"
        style={{
          opacity: s4.isVisible ? 1 : 0,
          transform: s4.isVisible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
        }}
      >
        <div className="container mx-auto max-w-2xl px-4 text-center">
          <p
            className="text-sm leading-relaxed text-white/90 md:text-base"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              fontStyle: 'italic',
              letterSpacing: '0.03em',
            }}
          >
            Небольшая забота продлевает жизнь вещам и сохраняет их ценность — и эмоциональную, и материальную.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section
        ref={s5.ref}
        className="py-16 md:py-20"
        style={{
          opacity: s5.isVisible ? 1 : 0,
          transition: 'opacity 0.6s ease-out 0.2s',
        }}
      >
        <div className="container mx-auto max-w-xl px-4 text-center">
          <p
            className="text-xs uppercase tracking-[0.2em] text-gray-400"
            style={{ fontFamily: 'var(--font-open-sans)' }}
          >
            Вопросы по уходу?
          </p>
          <p
            className="mt-2 text-sm text-gray-600"
            style={{ fontFamily: 'var(--font-open-sans)', letterSpacing: '0.02em' }}
          >
            Напишите нам — подскажем для конкретного изделия.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('openPhonePanel'))}
            className="mt-6 inline-block border-b border-black pb-1 text-sm transition-opacity hover:opacity-70"
            style={{
              fontFamily: 'var(--font-playfair-display)',
              letterSpacing: '0.02em',
            }}
          >
            Связаться
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
