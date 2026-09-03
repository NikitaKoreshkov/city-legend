import {
  HOMEPAGE_CATEGORY_SLOTS,
  HOMEPAGE_COLLECTION_SLOTS,
} from '@/lib/defaultAuctionCategories';

export { HOMEPAGE_CATEGORY_SLOTS, HOMEPAGE_COLLECTION_SLOTS };
import { publicMediaUrl } from '@/lib/publicMediaUrl';
import { HERO_DEFAULT_POSTER } from '@/lib/heroPosterDefault';

export const DEFAULT_HERO = {
  videoUrl: '/hero-main.mp4',
  /** Опционально: короткий сжатый mp4 для узкого экрана; пусто = постер без mp4 на мобиле. */
  videoUrlMobile: '',
  /** Отдельный фон/постер для узких экранов (если пусто — как на десктопе из imageUrl или постера к видео). */
  imageUrlMobile: '',
  imageUrl: '',
  isVideo: true,
  line1: 'Бижутерия',
  line2: 'Искусство аксессуара',
  line3:
    'Аксессуары, тщательно отобранные для тех, кто ценит изящество в каждой детали.',
};

export const DEFAULT_DESCRIPTION = {
  text: 'Коллекция, где каждая вещь — про безупречный вкус и внимание к детали. Серьги, браслеты, колье с характером.',
};

export const DEFAULT_PANELS = [
  {
    image: '',
    subtitle: 'ИСКУССТВО ДЕТАЛИ',
    title: 'ИЗЯЩЕСТВО\nВ КАЖДОЙ ВЕЩИ',
    quote:
      '«Мы верим, что аксессуар — это не просто украшение. Это знак внимания к себе и к моменту».',
  },
  {
    image: '',
    subtitle: 'КУРАТОРСКИЙ ВЫБОР',
    title: 'КОЛЛЕКЦИЯ\nС ХАРАКТЕРОМ',
    quote:
      '«Каждая вещь в нашей коллекции отобрана за безупречный вкус и умение говорить без слов».',
  },
  {
    image: '',
    subtitle: 'ДЛЯ ВАС',
    title: 'ИНДИВИДУАЛЬНОСТЬ\nИ СТИЛЬ',
    quote:
      '«Для тех, кто ценит изящество в мелочах и не боится подчёркивать свою индивидуальность».',
  },
];

export type HomepageHeroMerged = typeof DEFAULT_HERO & {
  isVideo?: boolean;
  videoUrl?: string;
  videoUrlMobile?: string;
  imageUrlMobile?: string;
  imageUrl?: string;
  line1?: string;
  line2?: string;
  line3?: string;
};

export type CategoryCard = {
  season: string;
  title: string;
  image: string;
  href: string;
  category_id?: number;
  collection_id?: number;
  slug?: string;
};

export const DEFAULT_TEXT_IMAGE = {
  smallImage: '',
  bigImage: '',
  title: 'Искусство аксессуара',
  text: 'Каждая вещь в нашей коллекции отобрана за безупречный вкус и внимание к детали. Для тех, кто ценит изящество.',
};

export const DEFAULT_IMPERIAL = {
  title: 'Знаковая коллекция',
  text: 'Классическая и вневременная подборка аксессуаров с характером. Для тех, кто ценит изящество в каждой детали и безупречный вкус.',
  image: '',
};

export const DEFAULT_CURATED = {
  title: 'Кураторская подборка',
};

export function mergeCurated(ic: Record<string, unknown>) {
  const raw = ic.curated;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_CURATED, ...(raw as Record<string, unknown>) };
  }
  return { ...DEFAULT_CURATED };
}

export function mergeHero(ic: Record<string, unknown>): HomepageHeroMerged {
  const raw = ic.hero;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_HERO, ...(raw as Record<string, unknown>) } as HomepageHeroMerged;
  }
  return { ...DEFAULT_HERO };
}

export function mergeDescription(ic: Record<string, unknown>) {
  const raw = ic.description;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_DESCRIPTION, ...(raw as Record<string, unknown>) };
  }
  return { ...DEFAULT_DESCRIPTION };
}

export function mergePanels(ic: Record<string, unknown>) {
  const raw = ic.panels;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw as typeof DEFAULT_PANELS;
  }
  return [...DEFAULT_PANELS];
}

/** @deprecated используйте mergeHomepageCollections */
export function mergeCategories(ic: Record<string, unknown>): CategoryCard[] {
  return mergeHomepageCollections(ic);
}

/** Карточки коллекций на главной (homepage_content.collections, fallback — legacy categories). */
export function mergeHomepageCollections(ic: Record<string, unknown>): CategoryCard[] {
  const raw = ic.collections ?? ic.categories;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, HOMEPAGE_COLLECTION_SLOTS).map((item: Record<string, unknown>) => {
    const slug = typeof item.slug === 'string' ? item.slug.trim() : '';
    const collectionId =
      typeof item.collection_id === 'number' && item.collection_id > 0
        ? item.collection_id
        : undefined;
    const categoryId =
      typeof item.category_id === 'number' && item.category_id > 0 ? item.category_id : undefined;
    let href = '/collection';
    if (collectionId && slug) {
      href = `/collection?collection=${encodeURIComponent(slug)}`;
    } else if (categoryId && slug) {
      href = `/collection?category=${encodeURIComponent(slug)}`;
    }
    return {
      season: String(item.season ?? ''),
      title: String(item.title ?? ''),
      image: String(item.image ?? ''),
      href,
      collection_id: collectionId,
      category_id: categoryId,
      slug: slug || undefined,
    };
  });
}

export function mergeTextImage(ic: Record<string, unknown>) {
  const raw = ic.textImage;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_TEXT_IMAGE, ...(raw as Record<string, unknown>) };
  }
  return { ...DEFAULT_TEXT_IMAGE };
}

export function mergeImperial(ic: Record<string, unknown>) {
  const raw = ic.imperial;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_IMPERIAL, ...(raw as Record<string, unknown>) };
  }
  return { ...DEFAULT_IMPERIAL };
}

export function isVideoAssetPath(p: string) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(p);
}

/**
 * URL ролика, из которого на клиенте снимаем первый кадр для постера (если в CMS нет imageUrl / imageUrlMobile).
 * Для мобильного слота: приоритет у videoUrlMobile, если это видео-файл, иначе основной videoUrl.
 */
export function getHeroFirstFrameCaptureVideoUrl(
  hero: HomepageHeroMerged,
  slot: 'desktop' | 'mobile'
): string {
  if (slot === 'mobile') {
    const m = String(hero.videoUrlMobile ?? '').trim();
    if (m && isVideoAssetPath(m)) return publicMediaUrl(m);
  }
  const d = String(hero.videoUrl ?? '').trim();
  if (d && isVideoAssetPath(d)) return publicMediaUrl(d);
  return '';
}

/** Публичный URL фона героя (постер / статичная картинка) на десктопе и по умолчанию на мобиле. */
export function getHeroBackdropStillUrl(hero: HomepageHeroMerged): string {
  const posterPath = HERO_DEFAULT_POSTER.src;
  const imageUrl = String(hero.imageUrl ?? '').trim();
  if (imageUrl) return publicMediaUrl(imageUrl);
  const videoUrl = String(hero.videoUrl ?? '').trim();
  if (videoUrl && !isVideoAssetPath(videoUrl)) return publicMediaUrl(videoUrl);
  return publicMediaUrl(posterPath);
}

/** SSR/LCP-слой для телефона: отдельная картинка из CMS или тот же рассчёт, что для десктопа. */
export function getHeroMobileBackdropStillUrl(hero: HomepageHeroMerged): string {
  const mobileImg = String(hero.imageUrlMobile ?? '').trim();
  if (mobileImg) return publicMediaUrl(mobileImg);
  return getHeroBackdropStillUrl(hero);
}

export const HERO_POSTER_SELECTOR_DESKTOP = '[data-home-hero-poster-desktop]';
export const HERO_POSTER_SELECTOR_MOBILE = '[data-home-hero-poster-mobile]';
