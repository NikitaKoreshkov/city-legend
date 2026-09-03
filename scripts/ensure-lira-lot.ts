/**
 * Создаёт или обновляет лот «Колье «Лира»» (как на витрине).
 * npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/ensure-lira-lot.ts
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

const NAME = 'Колье «Лира»';
/** Базовая цена на карточке (каталог); при вариантах на витрине — «от …» по минимальному SKU */
const STARTING_PRICE = '2 790 ₽';
/** Зачёркнутая для базовой карточки (минимальный вариант со скидкой) */
const COMPARE_AT_PRICE = '3 490 ₽';
const ADDITIONAL = 'Минималистичная цепь; выберите металл и длину — как в ювелирной витрине';
const IMAGES = ['/колье.png', '/кол.png', '/1.avif', '/2.jpeg', '/3.png'];

/** Варианты SKU: металл × длина цепи; остаток общий с карточки (inventory_qty null у строк) */
const PRODUCT_VARIANTS = {
  groups: [
    {
      key: 'metal',
      name: 'Металл и покрытие',
      order: 0,
      values: [
        { id: 'ag925', label: 'Серебро 925 пробы', hint: 'Гипоаллергенно' },
        { id: 'au_pl', label: 'Позолота 585', hint: 'Латунь с позолотой' },
        { id: 'rose', label: 'Розовое золото', hint: 'PVD-покрытие' },
      ],
    },
    {
      key: 'length',
      name: 'Длина цепи',
      order: 1,
      values: [
        { id: 'cm38', label: '38 см', hint: 'Чокер / короткое' },
        { id: 'cm42', label: '42 см', hint: 'Универсальная длина' },
        { id: 'cm45', label: '45 см', hint: 'Ниже ключиц' },
      ],
    },
  ],
  variants: [
    {
      id: 'lira-ag925-38',
      selection: { metal: 'ag925', length: 'cm38' },
      sku: 'CL-LIRA-AG-38',
      starting_price: '2 790 ₽',
      compare_at_price: '3 490 ₽',
      inventory_qty: null,
    },
    {
      id: 'lira-ag925-42',
      selection: { metal: 'ag925', length: 'cm42' },
      sku: 'CL-LIRA-AG-42',
      starting_price: '2 990 ₽',
      compare_at_price: '3 990 ₽',
      inventory_qty: null,
    },
    {
      id: 'lira-ag925-45',
      selection: { metal: 'ag925', length: 'cm45' },
      sku: 'CL-LIRA-AG-45',
      starting_price: '3 190 ₽',
      compare_at_price: '4 190 ₽',
      inventory_qty: null,
    },
    {
      id: 'lira-aupl-38',
      selection: { metal: 'au_pl', length: 'cm38' },
      sku: 'CL-LIRA-AU-38',
      starting_price: '3 290 ₽',
      compare_at_price: '3 990 ₽',
      inventory_qty: null,
    },
    {
      id: 'lira-aupl-42',
      selection: { metal: 'au_pl', length: 'cm42' },
      sku: 'CL-LIRA-AU-42',
      starting_price: '3 490 ₽',
      compare_at_price: '4 290 ₽',
      inventory_qty: null,
    },
    {
      id: 'lira-aupl-45',
      selection: { metal: 'au_pl', length: 'cm45' },
      sku: 'CL-LIRA-AU-45',
      starting_price: '3 690 ₽',
      compare_at_price: '4 490 ₽',
      inventory_qty: null,
    },
    {
      id: 'lira-rose-38',
      selection: { metal: 'rose', length: 'cm38' },
      sku: 'CL-LIRA-RG-38',
      starting_price: '3 490 ₽',
      compare_at_price: '4 190 ₽',
      inventory_qty: null,
    },
    {
      id: 'lira-rose-42',
      selection: { metal: 'rose', length: 'cm42' },
      sku: 'CL-LIRA-RG-42',
      starting_price: '3 690 ₽',
      compare_at_price: '4 490 ₽',
      inventory_qty: null,
    },
    {
      id: 'lira-rose-45',
      selection: { metal: 'rose', length: 'cm45' },
      sku: 'CL-LIRA-RG-45',
      starting_price: '3 890 ₽',
      compare_at_price: '4 690 ₽',
      inventory_qty: null,
    },
  ],
};

async function main() {
  await ensureDatabase();

  const found = await pool.query(`SELECT id FROM auctions WHERE name = $1 LIMIT 1`, [NAME]);

  if (found.rows.length > 0) {
    const id = found.rows[0].id;
    await pool.query(
      `UPDATE auctions
       SET starting_price = $1,
           compare_at_price = $2,
           additional_info = $3,
           images = $4::text[],
           product_variants = $5::jsonb,
           updated_at = NOW()
       WHERE id = $6`,
      [STARTING_PRICE, COMPARE_AT_PRICE, ADDITIONAL, IMAGES, JSON.stringify(PRODUCT_VARIANTS), id]
    );
    console.log('Обновлён лот', NAME, 'id=', id, '+ product_variants (9 SKU)');
  } else {
    const ins = await pool.query(
      `INSERT INTO auctions (name, additional_info, starting_price, compare_at_price, images, is_sellable, product_variants)
       VALUES ($1, $2, $3, $4, $5::text[], true, $6::jsonb)
       RETURNING id`,
      [NAME, ADDITIONAL, STARTING_PRICE, COMPARE_AT_PRICE, IMAGES, JSON.stringify(PRODUCT_VARIANTS)]
    );
    console.log('Создан лот', NAME, 'id=', ins.rows[0].id, '+ product_variants (9 SKU)');
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
