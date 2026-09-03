/**
 * Каталог: только бижутерия (как на витрине до расширения демо-категорий).
 */

export type DefaultAuctionCategory = {
  name: string;
  slug: string;
  /** Публичный путь к картинке в /public */
  image: string;
  order: number;
};

export const HOMEPAGE_CATEGORY_SLOTS = 4;
/** Карточек коллекций на главной (сетка 3 шт.) */
export const HOMEPAGE_COLLECTION_SLOTS = 3;

export const DEFAULT_AUCTION_CATEGORIES: DefaultAuctionCategory[] = [
  { name: 'Колье', slug: 'kolye', image: '', order: 1 },
  { name: 'Кольца', slug: 'koltsa', image: '', order: 2 },
  { name: 'Браслеты', slug: 'braslety', image: '', order: 3 },
  { name: 'Серьги', slug: 'sergi', image: '', order: 4 },
];

export const KEEP_CATEGORY_SLUGS = DEFAULT_AUCTION_CATEGORIES.map((c) => c.slug);

/** Плейсхолдеры для главной до загрузки homepage_content */
export const DEFAULT_HOMEPAGE_CATEGORY_CARDS = DEFAULT_AUCTION_CATEGORIES.map((c) => ({
  season: 'COLLECTION 2025',
  title: c.name,
  image: c.image,
  href: `/collection?category=${encodeURIComponent(c.slug)}`,
}));
