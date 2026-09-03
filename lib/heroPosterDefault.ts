/** Дефолтный постер видео-героя: preload в layout и SSR `<img>` на главной. */
export const HERO_DEFAULT_POSTER_PATH = '/6.webp' as const;
export const HERO_DEFAULT_POSTER = {
  src: HERO_DEFAULT_POSTER_PATH,
  width: 1536,
  height: 1060,
} as const;
