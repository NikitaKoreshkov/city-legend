import type { Pool } from 'pg';
import { DEFAULT_AUCTION_CATEGORIES } from '@/lib/defaultAuctionCategories';

export type CatalogCategoryDef = {
  name: string;
  slug: string;
  image: string;
  order: number;
};

/** Базовый набор категорий каталога */
export const DEFAULT_CATEGORIES: CatalogCategoryDef[] = DEFAULT_AUCTION_CATEGORIES.map((c) => ({
  name: c.name,
  slug: c.slug,
  image: c.image,
  order: c.order,
}));

export async function ensureCategoriesInDb(pool: Pool): Promise<{
  added: string[];
  existing: string[];
}> {
  const added: string[] = [];
  const existing: string[] = [];
  for (const cat of DEFAULT_CATEGORIES) {
    const res = await pool.query('SELECT id FROM auction_categories WHERE slug = $1', [cat.slug]);
    if (res.rows.length === 0) {
      await pool.query(
        `INSERT INTO auction_categories (name, slug, image_url, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [cat.name, cat.slug, cat.image, cat.order]
      );
      added.push(cat.name);
    } else {
      existing.push(cat.name);
    }
  }
  return { added, existing };
}

export type GeneratedAuctionRow = {
  name: string;
  additional_info: string;
  starting_price: string;
  images: string[];
  category: string;
  subcategory: string;
};

export function generateTestAuctionsByCategory(): GeneratedAuctionRow[] {
  const categoryFilters: Record<string, string[]> = {
    kolye: ['Классика', 'Современное', 'Минимализм', 'Вечернее'],
    koltsa: ['Печатки', 'Обручальные', 'С камнями', 'Геометрия'],
    braslety: ['Цепочки', 'Жёсткие', 'Шармы', 'Минимализм'],
    sergi: ['Гвоздики', 'Подвески', 'Длинные', 'Классика'],
  };

  const categories = DEFAULT_AUCTION_CATEGORIES.map((c) => ({
    key: c.slug,
    label: c.name,
  }));

  const images = ['/1.avif', '/2.jpeg', '/4.avif', '/6.webp', '/5.png', '/4.avif'];
  const testAuctions: GeneratedAuctionRow[] = [];

  categories.forEach((category) => {
    const subcategories = categoryFilters[category.key] || [];
    for (let i = 1; i <= 14; i++) {
      const priceBase = Math.floor(Math.random() * 50) + 5;
      const price = `${priceBase} ${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')} 000 ₽`;
      const subcategory = subcategories[(i - 1) % subcategories.length] || subcategories[0] || '';
      testAuctions.push({
        name: `${category.label} - Коллекция ${i}`,
        additional_info: `Эксклюзивный лот ${i} из коллекции ${category.label}`,
        starting_price: price,
        images: [images[(i - 1) % images.length]],
        category: category.key,
        subcategory,
      });
    }
  });

  return testAuctions;
}

/** Вставка демо-лотов с привязкой category_id (нужна для фильтра в каталоге). */
export async function insertGeneratedAuctionsWithCategories(pool: Pool): Promise<number> {
  const testAuctions = generateTestAuctionsByCategory();
  const catRows = await pool.query<{ id: number; slug: string }>('SELECT id, slug FROM auction_categories');
  const slugToId = new Map(catRows.rows.map((r) => [r.slug, r.id]));

  for (const auction of testAuctions) {
    const categoryId = slugToId.get(auction.category) ?? null;
    await pool.query(
      `INSERT INTO auctions (
         name, additional_info, starting_price, images, category, subcategory, category_id, is_sellable
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [
        auction.name,
        auction.additional_info,
        auction.starting_price,
        auction.images,
        auction.category,
        auction.subcategory,
        categoryId,
      ]
    );
  }
  return testAuctions.length;
}

export async function replaceAllAuctionsWithDemo(pool: Pool): Promise<number> {
  await pool.query('DELETE FROM auctions');
  return insertGeneratedAuctionsWithCategories(pool);
}

export type RestoreCatalogResult = {
  categories: { added: string[]; existing: string[] };
  auctions: {
    action: 'skipped' | 'inserted' | 'replaced';
    count?: number;
    previousCount?: number;
  };
};

/**
 * Восстанавливает категории; лоты — только если пусто, либо forceReplace (все текущие удаляются).
 */
export async function restoreCatalog(
  pool: Pool,
  opts: { forceReplaceAuctions: boolean }
): Promise<RestoreCatalogResult> {
  const categories = await ensureCategoriesInDb(pool);
  const cntRes = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM auctions');
  const previousCount = parseInt(cntRes.rows[0].c, 10) || 0;

  if (opts.forceReplaceAuctions) {
    const n = await replaceAllAuctionsWithDemo(pool);
    return {
      categories,
      auctions: { action: 'replaced', count: n, previousCount },
    };
  }

  if (previousCount === 0) {
    const n = await insertGeneratedAuctionsWithCategories(pool);
    return {
      categories,
      auctions: { action: 'inserted', count: n },
    };
  }

  return {
    categories,
    auctions: { action: 'skipped', previousCount },
  };
}
