/**
 * Обновление контента страницы «О нас» в БД (CITY LEGEND).
 * Запуск: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/update-about-content.ts
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
import { upsertAboutContent } from './siteContentDbSync';

async function main() {
  await ensureDatabase();
  await upsertAboutContent(pool);
  console.log('about_content: hero, philosophy, values обновлены под CITY LEGEND.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
