'use client';

import { useEffect, useState } from 'react';

type DataPoster = 'desktop' | 'mobile' | 'both';

type Props = {
  videoSrc: string;
  className: string;
  onFrameUrl: (url: string | null) => void;
  dataPoster: DataPoster;
};

/**
 * Достаёт декодируемый кадр из mp4 (через seek), рисует в canvas → blob URL для <img>.
 * Нужен, чтобы LCP-слой совпадал с началом ролика, если в CMS не задан imageUrl.
 */
export default function VideoFirstFramePoster({ videoSrc, className, onFrameUrl, dataPoster }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!videoSrc) return;

    let cancelled = false;
    let blobUrl: string | null = null;
    const v = document.createElement('video');

    const cleanupBlob = () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
    };

    const fail = () => {
      cleanupBlob();
      if (!cancelled) {
        setUrl(null);
        onFrameUrl(null);
      }
    };

    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.src = videoSrc;

    onFrameUrl(null);

    const onSeeked = () => {
      if (cancelled) return;
      try {
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (!w || !h) return fail();
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return fail();
        ctx.drawImage(v, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (cancelled || !blob) return fail();
            cleanupBlob();
            blobUrl = URL.createObjectURL(blob);
            setUrl(blobUrl);
            onFrameUrl(blobUrl);
          },
          'image/jpeg',
          0.88
        );
      } catch {
        fail();
      }
    };

    const onLoadedMetadata = () => {
      if (cancelled) return;
      v.addEventListener('seeked', onSeeked, { once: true });
      const t =
        Number.isFinite(v.duration) && v.duration > 0 ? Math.min(0.08, v.duration * 0.02) : 0.001;
      v.currentTime = t;
    };

    v.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    v.addEventListener('error', () => fail(), { once: true });

    return () => {
      cancelled = true;
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('loadedmetadata', onLoadedMetadata);
      cleanupBlob();
      setUrl(null);
      onFrameUrl(null);
      v.removeAttribute('src');
      v.load();
    };
  }, [videoSrc, onFrameUrl]);

  const dataProps =
    dataPoster === 'both'
      ? { 'data-home-hero-poster-desktop': true, 'data-home-hero-poster-mobile': true }
      : dataPoster === 'desktop'
        ? { 'data-home-hero-poster-desktop': true }
        : { 'data-home-hero-poster-mobile': true };

  if (!url) {
    return (
      <div
        className={`absolute inset-0 h-full w-full bg-black ${className}`}
        {...dataProps}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob URL от canvas, не в remotePatterns
    <img
      src={url}
      alt=""
      decoding="async"
      fetchPriority="high"
      className={`absolute inset-0 h-full w-full ${className}`}
      {...dataProps}
      aria-hidden
    />
  );
}
