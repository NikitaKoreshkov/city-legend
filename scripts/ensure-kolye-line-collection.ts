/**
 * Создаёт коллекцию и привязывает к ней несколько лотов «Колье …»,
 * чтобы на странице проекта появился блок «из коллекции».
 *
 * npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/ensure-kolye-line-collection.ts
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

const COLLECTION_NAME = 'City Legend — колье';
const COLLECTION_SLUG = 'city-legend-kolye';

/** Лоты из одной линейки (должны существовать в БД по имени) */
const LOT_NAMES = [
  'Колье «Лира»',
  'Колье «Аврора»',
  'Колье «Солstice»',
  'Колье «Маре»',
  'Колье «Перлина»',
];

async function main() {
  await ensureDatabase();

  let col = await pool.query(`SELECT id FROM auction_collections WHERE slug = $1`, [COLLECTION_SLUG]);
  let collectionId: number;
  if (col.rows.length === 0) {
    const ins = await pool.query(
      `INSERT INTO auction_collections (name, slug, sort_order) VALUES ($1, $2, 0) RETURNING id`,
      [COLLECTION_NAME, COLLECTION_SLUG]
    );
    collectionId = ins.rows[0].id;
    console.log('Создана коллекция', COLLECTION_NAME, 'id=', collectionId);
  } else {
    collectionId = col.rows[0].id;
    await pool.query(`UPDATE auction_collections SET name = $1, updated_at = NOW() WHERE id = $2`, [
      COLLECTION_NAME,
      collectionId,
    ]);
    console.log('Коллекция уже есть id=', collectionId, '— обновлено название');
  }

  const upd = await pool.query(
    `UPDATE auctions SET collection_id = $1, updated_at = NOW() WHERE name = ANY($2::text[])`,
    [collectionId, LOT_NAMES]
  );
  console.log('Привязано к коллекции строк (по имени из списка):', upd.rowCount);

  const inCol = await pool.query(`SELECT id, name FROM auctions WHERE collection_id = $1 ORDER BY id`, [collectionId]);
  console.log(
    'В коллекции сейчас:',
    inCol.rows.map((r) => `${r.id}:${r.name}`).join('; ')
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
