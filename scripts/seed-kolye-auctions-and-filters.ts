/**
 * Категория «Колье» (slug kolye): фильтры в БД + 12 лотов с filter_values.
 * Существующие лоты только этой категории удаляются (фильтры категории пересоздаются).
 *
 * npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-kolye-auctions-and-filters.ts
 */

import * as path from 'path';
import * as fs from 'fs';

function loadEnv(file: string) {
  const envPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) return;
    const key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    process.env[key] = val;
  });
  return true;
}

loadEnv('.env') || loadEnv('.env.local');

import pool, { ensureDatabase } from '../lib/db';

const CATEGORY_SLUG = 'kolye';

type CheckboxDef = { name: string; type: 'checkbox'; sort_order: number; options: string[] };
type RangeDef = { name: string; type: 'range'; sort_order: number };
type FilterDef = CheckboxDef | RangeDef;

const FILTER_DEFS: FilterDef[] = [
  {
    name: 'Материал',
    type: 'checkbox',
    sort_order: 1,
    options: ['Серебро 925', 'Латунь с позолотой', 'Медицинская сталь', 'Гипоаллергенный сплав'],
  },
  {
    name: 'Длина по типу',
    type: 'checkbox',
    sort_order: 2,
    options: ['Чокер', 'Стандарт (до 45 см)', 'Миди', 'Длинное (опера)'],
  },
  {
    name: 'Стиль',
    type: 'checkbox',
    sort_order: 3,
    options: ['Минимализм', 'Классика', 'Богемный', 'Вечерний'],
  },
  {
    name: 'Вставки',
    type: 'checkbox',
    sort_order: 4,
    options: ['Без вставок', 'Фианит', 'Натуральный камень', 'Жемчуг'],
  },
  {
    name: 'Оттенок металла',
    type: 'checkbox',
    sort_order: 5,
    options: ['Серебристый', 'Золотой', 'Розовое золото', 'Чёрный родий'],
  },
  { name: 'Длина, см', type: 'range', sort_order: 6 },
];

const IMAGES = ['/колье.png', '/кол.png'];

type Fv = Record<string, string[] | { min: number; max: number }>;

const PRODUCTS: Array<{
  name: string;
  starting_price: string;
  additional_info?: string;
  /** Если не задано — одно фото по очереди из IMAGES */
  images?: string[];
  fv: Fv;
}> = [
  {
    name: 'Колье «Лира»',
    starting_price: '3 990 ₽',
    additional_info: 'Серебро, минималистичная цепь',
    images: ['/колье.png', '/кол.png', '/1.avif', '/2.jpeg', '/3.png'],
    fv: {
      Материал: ['Серебро 925'],
      'Длина по типу': ['Чокер'],
      Стиль: ['Минимализм'],
      Вставки: ['Без вставок'],
      'Оттенок металла': ['Серебристый'],
      'Длина, см': { min: 34, max: 36 },
    },
  },
  {
    name: 'Колье «Аврора»',
    starting_price: '5 490 ₽',
    fv: {
      Материал: ['Серебро 925'],
      'Длина по типу': ['Стандарт (до 45 см)'],
      Стиль: ['Вечерний'],
      Вставки: ['Фианит'],
      'Оттенок металла': ['Серебристый'],
      'Длина, см': { min: 40, max: 45 },
    },
  },
  {
    name: 'Колье «Солstice»',
    starting_price: '4 290 ₽',
    fv: {
      Материал: ['Латунь с позолотой'],
      'Длина по типу': ['Стандарт (до 45 см)'],
      Стиль: ['Классика'],
      Вставки: ['Без вставок'],
      'Оттенок металла': ['Золотой'],
      'Длина, см': { min: 42, max: 46 },
    },
  },
  {
    name: 'Колье «Маре»',
    starting_price: '6 200 ₽',
    fv: {
      Материал: ['Серебро 925'],
      'Длина по типу': ['Миди'],
      Стиль: ['Богемный'],
      Вставки: ['Натуральный камень'],
      'Оттенок металла': ['Серебристый'],
      'Длина, см': { min: 48, max: 52 },
    },
  },
  {
    name: 'Колье «Перлина»',
    starting_price: '7 100 ₽',
    fv: {
      Материал: ['Серебро 925'],
      'Длина по типу': ['Стандарт (до 45 см)'],
      Стиль: ['Классика'],
      Вставки: ['Жемчуг'],
      'Оттенок металла': ['Розовое золото'],
      'Длина, см': { min: 40, max: 44 },
    },
  },
  {
    name: 'Колье «Ноктюрн»',
    starting_price: '4 590 ₽',
    fv: {
      Материал: ['Медицинская сталь'],
      'Длина по типу': ['Чокер'],
      Стиль: ['Минимализм'],
      Вставки: ['Без вставок'],
      'Оттенок металла': ['Чёрный родий'],
      'Длина, см': { min: 32, max: 35 },
    },
  },
  {
    name: 'Колье «Опера»',
    starting_price: '5 900 ₽',
    fv: {
      Материал: ['Латунь с позолотой'],
      'Длина по типу': ['Длинное (опера)'],
      Стиль: ['Вечерний'],
      Вставки: ['Фианит'],
      'Оттенок металла': ['Золотой'],
      'Длина, см': { min: 58, max: 64 },
    },
  },
  {
    name: 'Колье «Лесная тропа»',
    starting_price: '5 350 ₽',
    fv: {
      Материал: ['Гипоаллергенный сплав'],
      'Длина по типу': ['Миди'],
      Стиль: ['Богемный'],
      Вставки: ['Натуральный камень'],
      'Оттенок металла': ['Золотой'],
      'Длина, см': { min: 50, max: 54 },
    },
  },
  {
    name: 'Колье «Кассиопея»',
    starting_price: '4 100 ₽',
    fv: {
      Материал: ['Серебро 925'],
      'Длина по типу': ['Стандарт (до 45 см)'],
      Стиль: ['Минимализм'],
      Вставки: ['Фианит'],
      'Оттенок металла': ['Серебристый'],
      'Длина, см': { min: 41, max: 45 },
    },
  },
  {
    name: 'Колье «Ренессанс»',
    starting_price: '6 800 ₽',
    fv: {
      Материал: ['Серебро 925'],
      'Длина по типу': ['Стандарт (до 45 см)'],
      Стиль: ['Классика'],
      Вставки: ['Жемчуг', 'Фианит'],
      'Оттенок металла': ['Серебристый'],
      'Длина, см': { min: 42, max: 46 },
    },
  },
  {
    name: 'Колье «Город»',
    starting_price: '3 650 ₽',
    fv: {
      Материал: ['Гипоаллергенный сплав'],
      'Длина по типу': ['Чокер'],
      Стиль: ['Минимализм'],
      Вставки: ['Без вставок'],
      'Оттенок металла': ['Чёрный родий'],
      'Длина, см': { min: 33, max: 36 },
    },
  },
  {
    name: 'Колье «Золотой час»',
    starting_price: '5 150 ₽',
    fv: {
      Материал: ['Латунь с позолотой'],
      'Длина по типу': ['Миди'],
      Стиль: ['Вечерний'],
      Вставки: ['Фианит'],
      'Оттенок металла': ['Розовое золото'],
      'Длина, см': { min: 46, max: 50 },
    },
  },
];

function buildFilterValues(fv: Fv, idByName: Record<string, number>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, val] of Object.entries(fv)) {
    const id = idByName[name];
    if (id == null) throw new Error(`Неизвестный фильтр: ${name}`);
    out[String(id)] = val;
  }
  return out;
}

async function main() {
  await ensureDatabase();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let cat = await client.query<{ id: number }>(
      'SELECT id FROM auction_categories WHERE slug = $1',
      [CATEGORY_SLUG]
    );
    let categoryId = cat.rows[0]?.id;
    if (!categoryId) {
      const ins = await client.query<{ id: number }>(
        `INSERT INTO auction_categories (name, slug, image_url, sort_order, created_at, updated_at)
         VALUES ('Колье', $1, '/колье.png', 1, NOW(), NOW())
         RETURNING id`,
        [CATEGORY_SLUG]
      );
      categoryId = ins.rows[0].id;
      console.log('Создана категория Колье, id=', categoryId);
    }

    await client.query('DELETE FROM auctions WHERE category_id = $1', [categoryId]);
    await client.query('DELETE FROM filters WHERE category_id = $1', [categoryId]);

    const idByName: Record<string, number> = {};

    for (const def of FILTER_DEFS) {
      const fr = await client.query<{ id: number }>(
        `INSERT INTO filters (category_id, name, type, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
        [categoryId, def.name, def.type, def.sort_order]
      );
      const fid = fr.rows[0].id;
      idByName[def.name] = fid;

      if (def.type === 'checkbox') {
        let i = 0;
        for (const opt of def.options) {
          await client.query(
            `INSERT INTO filter_options (filter_id, value, sort_order, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [fid, opt, i++]
          );
        }
      }
    }

    let idx = 0;
    for (const p of PRODUCTS) {
      const filter_values = buildFilterValues(p.fv, idByName);
      const images = p.images ?? [IMAGES[idx % IMAGES.length]];
      idx += 1;

      await client.query(
        `INSERT INTO auctions (
          name, additional_info, starting_price, auction_dates, images,
          category_id, subcategory_ids, is_featured, filter_values, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8::jsonb, NOW(), NOW())`,
        [
          p.name,
          p.additional_info ?? null,
          p.starting_price,
          null,
          images,
          categoryId,
          [],
          JSON.stringify(filter_values),
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Колье: фильтров ${FILTER_DEFS.length}, лотов ${PRODUCTS.length}.`);
    console.log(`   Каталог: /auctions?category=${CATEGORY_SLUG}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
