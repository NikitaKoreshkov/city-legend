import Image from 'next/image';
import HeroOverlayInteractive from '@/app/components/home/HeroOverlayInteractive';
import HeroVideoLayer from '@/app/components/home/HeroVideoLayer';
import {
  getHeroBackdropStillUrl,
  getHeroMobileBackdropStillUrl,
  type HomepageHeroMerged,
} from '@/lib/homepageMerge';

export default function HomeHeroRsc({ hero }: { hero: HomepageHeroMerged }) {
  const stillDesktop = getHeroBackdropStillUrl(hero);
  const stillMobile = getHeroMobileBackdropStillUrl(hero);
  const hasMobileSpecificStill = Boolean(String(hero.imageUrlMobile ?? '').trim());
  /** Два слоя нужны только если загружена своя «мобильная» картинка и отличается от десктопного фона по URL после мержа. */
  const useSplitStillLayers = hasMobileSpecificStill || stillDesktop !== stillMobile;

  const posterProps = {
    alt: '',
    fill: true,
    priority: true,
    fetchPriority: 'high' as const,
    decoding: 'async' as const,
    sizes: '100vw',
    quality: 82,
    className:
      'object-cover object-center transition-opacity duration-700',
    'aria-hidden': true,
  };

  return (
    <section
      className="relative flex h-[calc(100vh-120px)] w-full items-center justify-center overflow-hidden md:aspect-[18/9] md:h-auto"
      style={{ marginTop: 'var(--cl-header-offset, 118px)' }}
    >
      <div className="absolute inset-0 z-0">
        {useSplitStillLayers ? (
          <>
            <Image
              {...posterProps}
              src={stillDesktop}
              data-home-hero-poster-desktop
              className={`${posterProps.className} hidden md:block`}
            />
            <Image
              {...posterProps}
              src={stillMobile}
              data-home-hero-poster-mobile
              className={`${posterProps.className} block md:hidden`}
            />
          </>
        ) : (
          <Image
            {...posterProps}
            src={stillDesktop}
            data-home-hero-poster-desktop
            data-home-hero-poster-mobile
          />
        )}
        <HeroVideoLayer hero={hero} />
      </div>

      <HeroOverlayInteractive hero={hero} />
    </section>
  );
}
