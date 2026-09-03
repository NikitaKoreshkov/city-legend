/**
 * Удаление из БД всех категорий и всех лотов (auctions).
 * Запуск: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/clear-categories-and-auctions.ts
 */

import * as path from 'path';
import * as fs from 'fs';

function loadEnv(file: string) {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
          val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
    return true;
  }
  return false;
}
loadEnv('.env') || loadEnv('.env.local');
if (!process.env.DATABASE_URL) console.warn('Предупреждение: DATABASE_URL не задан.');

import pool, { ensureDatabase } from '../lib/db';

async function main() {
  await ensureDatabase();

  const client = await pool.connect();
  try {
    // Заявки на лоты — обнуляем связь с лотами
    await client.query('UPDATE contact_requests SET auction_id = NULL WHERE auction_id IS NOT NULL');
    const r1 = await client.query('DELETE FROM auctions');
    const r2 = await client.query('DELETE FROM filter_options');
    const r3 = await client.query('DELETE FROM filters');
    const r4 = await client.query('DELETE FROM auction_subcategories');
    const r5 = await client.query('DELETE FROM auction_categories');

    console.log('Удалено лотов (auctions):', r1.rowCount);
    console.log('Удалено filter_options:', r2.rowCount);
    console.log('Удалено filters:', r3.rowCount);
    console.log('Удалено auction_subcategories:', r4.rowCount);
    console.log('Удалено категорий (auction_categories):', r5.rowCount);
    console.log('Готово.');
  } finally {
    client.release();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
