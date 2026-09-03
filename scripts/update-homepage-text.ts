/**
 * Обновление текста hero и description на главной в БД.
 * Запуск из корня проекта: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/update-homepage-text.ts
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
if (!process.env.DATABASE_URL) console.warn('Предупреждение: DATABASE_URL не задан. Проверьте .env или .env.local');

import pool, { ensureDatabase } from '../lib/db';
import { upsertHomepageContent } from './siteContentDbSync';

async function main() {
  await ensureDatabase();
  await upsertHomepageContent(pool);
  const check = await pool.query(
    'SELECT section, data FROM homepage_content WHERE section IN ($1, $2, $3, $4, $5)',
    ['hero', 'description', 'panels', 'textImage', 'imperial']
  );
  check.rows.forEach((row: { section: string; data: unknown }) => {
    console.log(row.section + ':', JSON.stringify(row.data, null, 0).slice(0, 120) + '...');
  });
  console.log('homepage_content: hero, description, panels, textImage и imperial обновлены.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
