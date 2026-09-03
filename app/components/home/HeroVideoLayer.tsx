'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HomepageHeroMerged } from '@/lib/homepageMerge';
import { getHeroBackdropStillUrl } from '@/lib/homepageMerge';
import { publicMediaUrl } from '@/lib/publicMediaUrl';

export const HOME_HERO_SSR_POSTER_ID = 'home-hero-ssr-poster';

/**
 * Видео только от md (≥768px): на телефоне не грузим mp4 (экономия ~7 МБ и LCP).
 * Опционально: в hero.videoUrlMobile можно указать лёгкий ролик (<2 МБ) — тогда на мобиле
 * покажется видео после load (редкий сценарий).
 */
export default function HeroVideoLayer({ hero }: { hero: HomepageHeroMerged }) {
  const isVideo = Boolean(hero.isVideo);
  if (!isVideo) return null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [attachSource, setAttachSource] = useState(false);
  const [videoVisible, setVideoVisible] = useState(false);
  /** null до измерения — не качаем видео, пока не знаем вьюпорт */
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  const stillUrl = getHeroBackdropStillUrl(hero);
  const videoUrl = String(hero.videoUrl ?? '').trim();
  const videoUrlMobile = String(hero.videoUrlMobile ?? '').trim();

  const desktopSrc = publicMediaUrl(videoUrl);
  /** Мобильное видео только если явный URL в CMS и это не дефолтный тяжёлый файл */
  const mobileSrc =
    videoUrlMobile && !videoUrlMobile.endsWith('/hero-mobile.mp4')
      ? publicMediaUrl(videoUrlMobile)
      : '';

  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showDesktopVideo = isDesktop === true;
  const showMobileVideo = isDesktop === false && Boolean(mobileSrc);

  const activeSrc = showDesktopVideo ? desktopSrc : showMobileVideo ? mobileSrc : '';

  useEffect(() => {
    setAttachSource(false);
    setVideoVisible(false);
  }, [isDesktop, activeSrc]);

  useEffect(() => {
    if (!activeSrc) return;

    if (showDesktopVideo) {
      const start = () => setAttachSource(true);
      let idleId = 0;
      let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(start, { timeout: 2500 });
      } else {
        timeoutHandle = globalThis.setTimeout(start, 1200);
      }
      return () => {
        if (idleId) window.cancelIdleCallback(idleId);
        if (timeoutHandle !== undefined) globalThis.clearTimeout(timeoutHandle);
      };
    }

    if (showMobileVideo) {
      let cancelled = false;
      let timeoutHandle: number | undefined;
      const arm = () => {
        timeoutHandle = window.setTimeout(() => {
          if (!cancelled) setAttachSource(true);
        }, 1200);
      };
      if (document.readyState === 'complete') arm();
      else window.addEventListener('load', arm, { once: true });
      return () => {
        cancelled = true;
        if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
      };
    }
  }, [activeSrc, showDesktopVideo, showMobileVideo]);

  useEffect(() => {
    if (!attachSource || !videoRef.current) return;
    videoRef.current.load();
    void videoRef.current.play().catch(() => {});
  }, [attachSource]);

  useEffect(() => {
    if (!videoVisible) return;
    const el = document.getElementById(HOME_HERO_SSR_POSTER_ID);
    if (el) {
      el.classList.add('opacity-0');
      const t = window.setTimeout(() => el.classList.add('hidden'), 800);
      return () => window.clearTimeout(t);
    }
  }, [videoVisible]);

  if (!showDesktopVideo && !showMobileVideo) return null;

  return (
    <video
      ref={videoRef}
      key={`${showDesktopVideo ? 'd' : 'm'}-${activeSrc}`}
      className={`pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover object-center transition-opacity duration-700 ${videoVisible ? 'opacity-100' : 'opacity-0'}`}
      autoPlay
      loop
      muted
      playsInline
      preload="none"
      poster={stillUrl}
      onCanPlay={() => setVideoVisible(true)}
      aria-hidden
    >
      {attachSource && activeSrc ? <source src={activeSrc} type="video/mp4" /> : null}
    </video>
  );
}
