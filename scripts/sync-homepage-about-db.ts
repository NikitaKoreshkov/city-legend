/**
 * Одним запуском записывает в БД актуальный контент главной и страницы «О нас»
 * (без устаревших упоминаний старого бренда — те же данные, что в siteContentDbSync).
 *
 * Запуск: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/sync-homepage-about-db.ts
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
import { upsertHomepageContent, upsertAboutContent } from './siteContentDbSync';

async function main() {
  await ensureDatabase();
  await upsertHomepageContent(pool);
  await upsertAboutContent(pool);
  console.log('Готово: homepage_content и about_content синхронизированы.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
