/**
 * Оставляет в БД только 4 категории (колье, кольца, браслеты, серьги), обновляет карточки на главной.
 * Подкатегории и фильтры лишних категорий удаляются (CASCADE); у лотов category_id обнуляется.
 *
 * npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/update-first-categories.ts
 */

import * as path from 'path';
import * as fs from 'fs';

function loadEnv(file: string) {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) return;
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[key] = val;
    });
    return true;
  }
  return false;
}

loadEnv('.env') || loadEnv('.env.local');
if (!process.env.DATABASE_URL) console.warn('Предупреждение: DATABASE_URL не задан.');

import pool, { ensureDatabase } from '../lib/db';
import { DEFAULT_AUCTION_CATEGORIES, KEEP_CATEGORY_SLUGS } from '../lib/defaultAuctionCategories';

type Cat = { name: string; slug: string; image_url: string; sort_order: number };

const jewelry: Cat[] = DEFAULT_AUCTION_CATEGORIES.map((c) => ({
  name: c.name,
  slug: c.slug,
  image_url: c.image,
  sort_order: c.order,
}));

async function upsertCategory(cat: Cat) {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO auction_categories (name, slug, image_url, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (slug)
     DO UPDATE SET name = EXCLUDED.name, image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order, updated_at = NOW()
     RETURNING id`,
    [cat.name, cat.slug, cat.image_url, cat.sort_order]
  );
  return res.rows[0].id;
}

async function upsertHomepageCategories(cards: Array<{ season: string; title: string; image: string; slug: string; category_id: number }>) {
  await pool.query(
    `INSERT INTO homepage_content (section, data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (section)
     DO UPDATE SET data = $2, updated_at = NOW()`,
    ['categories', JSON.stringify(cards)]
  );
}

async function main() {
  await ensureDatabase();

  const ids: Record<string, number> = {};
  for (const cat of jewelry) {
    ids[cat.slug] = await upsertCategory(cat);
  }

  const del = await pool.query(
    `DELETE FROM auction_categories WHERE NOT (slug = ANY($1::text[]))`,
    [KEEP_CATEGORY_SLUGS]
  );
  console.log(`Удалено лишних категорий (auction_categories): ${del.rowCount ?? 0}`);

  const homepageCards = jewelry.map((c) => ({
    season: 'COLLECTION 2025',
    title: c.name,
    image: c.image_url,
    slug: c.slug,
    category_id: ids[c.slug],
  }));

  await upsertHomepageCategories(homepageCards);

  console.log(`✅ Категории: ${jewelry.map((c) => c.name).join(', ')}.`);
  console.log('✅ homepage_content.categories: 4 карточки.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
