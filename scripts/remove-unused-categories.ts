/**
 * Удаляет из auction_categories записи по имени (подкатегории и фильтры — CASCADE).
 * Лоты: category_id обнуляется (ON DELETE SET NULL).
 *
 * npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/remove-unused-categories.ts
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

const NAMES = ['Карты', 'Живопись1', 'Мебель', 'Кураторская подборка'];

import pool, { ensureDatabase } from '../lib/db';

async function main() {
  await ensureDatabase();

  const sel = await pool.query(
    `SELECT id, name, slug FROM auction_categories WHERE name = ANY($1::text[])`,
    [NAMES]
  );
  if (sel.rows.length === 0) {
    console.log('Нет категорий с указанными именами (уже удалены или другие названия).');
    process.exit(0);
    return;
  }

  console.log('Удаляем:', sel.rows.map((r) => `${r.name} (id=${r.id}, slug=${r.slug})`).join('\n'));

  const del = await pool.query(`DELETE FROM auction_categories WHERE name = ANY($1::text[])`, [NAMES]);
  console.log('Удалено строк auction_categories:', del.rowCount);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
