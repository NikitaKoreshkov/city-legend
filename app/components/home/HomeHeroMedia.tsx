'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';
import HeroVideoLayer from '@/app/components/home/HeroVideoLayer';
import VideoFirstFramePoster from '@/app/components/home/VideoFirstFramePoster';
import {
  getHeroBackdropStillUrl,
  getHeroFirstFrameCaptureVideoUrl,
  getHeroMobileBackdropStillUrl,
  type HomepageHeroMerged,
} from '@/lib/homepageMerge';

/** Стабильные колбеки без лишних effect в постере из-за смены ссылки функции родителя. */
function useStablePosterCallback(setter: (v: string | null) => void) {
  return useCallback((u: string | null) => setter(u), [setter]);
}

export default function HomeHeroMedia({ hero }: { hero: HomepageHeroMerged }) {
  const [deskCapUrl, setDeskCapUrl] = useState<string | null>(null);
  const [mobCapUrl, setMobCapUrl] = useState<string | null>(null);

  const onDeskPoster = useStablePosterCallback(setDeskCapUrl);
  const onMobPoster = useStablePosterCallback(setMobCapUrl);

  const useSplitStillLayers = Boolean(String(hero.imageUrlMobile ?? '').trim());
  const hasDeskImg = Boolean(String(hero.imageUrl ?? '').trim());
  const hasMobImg = Boolean(String(hero.imageUrlMobile ?? '').trim());
  const isVideo = Boolean(hero.isVideo);

  const desktopNeedsCapture = isVideo && !hasDeskImg;
  const mobileNeedsCapture = isVideo && !hasMobImg;

  const stillDesktop = getHeroBackdropStillUrl(hero);
  const stillMobile = getHeroMobileBackdropStillUrl(hero);

  const deskVideoSrc = getHeroFirstFrameCaptureVideoUrl(hero, 'desktop');
  const mobVideoSrc = getHeroFirstFrameCaptureVideoUrl(hero, 'mobile');

  const posterProps = {
    alt: '',
    fill: true as const,
    priority: true,
    fetchPriority: 'high' as const,
    decoding: 'async' as const,
    sizes: '100vw',
    quality: 82,
    className:
      'object-cover object-center transition-opacity duration-700 max-md:[content-visibility:auto]',
    'aria-hidden': true as const,
  };

  return (
    <>
      {useSplitStillLayers ? (
        <>
          {desktopNeedsCapture && deskVideoSrc ? (
            <VideoFirstFramePoster
              videoSrc={deskVideoSrc}
              onFrameUrl={onDeskPoster}
              dataPoster="desktop"
              className={`${posterProps.className} hidden md:block`}
            />
          ) : (
            <Image
              {...posterProps}
              src={stillDesktop}
              data-home-hero-poster-desktop
              className={`${posterProps.className} hidden md:block`}
            />
          )}
          {mobileNeedsCapture && mobVideoSrc ? (
            <VideoFirstFramePoster
              videoSrc={mobVideoSrc}
              onFrameUrl={onMobPoster}
              dataPoster="mobile"
              className={`${posterProps.className} block md:hidden`}
            />
          ) : (
            <Image
              {...posterProps}
              src={stillMobile}
              data-home-hero-poster-mobile
              className={`${posterProps.className} block md:hidden`}
            />
          )}
        </>
      ) : desktopNeedsCapture && deskVideoSrc ? (
        <VideoFirstFramePoster
          videoSrc={deskVideoSrc}
          onFrameUrl={onDeskPoster}
          dataPoster="both"
          className={posterProps.className}
        />
      ) : (
        <Image
          {...posterProps}
          src={stillDesktop}
          data-home-hero-poster-desktop
          data-home-hero-poster-mobile
        />
      )}

      <HeroVideoLayer hero={hero} />
    </>
  );
}
