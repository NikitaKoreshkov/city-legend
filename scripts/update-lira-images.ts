/**
 * 5 фото для лота «Колье «Лира»».
 * npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/update-lira-images.ts
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
const IMAGES = ['/колье.png', '/кол.png', '/1.avif', '/2.jpeg', '/3.png'];

async function main() {
  await ensureDatabase();
  const r = await pool.query(
    `UPDATE auctions SET images = $1::text[], updated_at = NOW() WHERE name = $2`,
    [IMAGES, NAME]
  );
  console.log('Обновлено строк:', r.rowCount);
  if (r.rowCount === 0) {
    console.warn('Лот не найден по имени:', NAME);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
