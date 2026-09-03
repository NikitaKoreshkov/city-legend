/**
 * Создаёт 4 карточки для блока «Кураторская подборка» на главной (featured=true).
 *
 * Блок на главной запрашивает: /api/auctions?featured=true&limit=4
 *
 * Запуск:
 * npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-curated-picks.ts
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  });
  return true;
}

loadEnv('.env') || loadEnv('.env.local');
if (!process.env.DATABASE_URL) console.warn('Предупреждение: DATABASE_URL не задан.');

import pool, { ensureDatabase } from '../lib/db';

const picks = [
  {
    name: 'Колье',
    starting_price: '3 990 ₽',
    images: ['/кол.png'],
  },
  {
    name: 'Кольца',
    starting_price: '2 490 ₽',
    images: ['/кольцо.png'],
  },
  {
    name: 'Браслеты',
    starting_price: '2 990 ₽',
    images: ['/брас.png'],
  },
  {
    name: 'Серьги',
    starting_price: '2 290 ₽',
    images: ['/серг.png'],
  },
];

async function main() {
  await ensureDatabase();

  // Чтобы блок на главной был стабильным, очищаем только featured-позиции.
  await pool.query('DELETE FROM auctions WHERE is_featured = true');

  for (const p of picks) {
    await pool.query(
      `INSERT INTO auctions (name, starting_price, images, is_featured, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())`,
      [p.name, p.starting_price, p.images]
    );
  }

  console.log(`✅ Кураторская подборка: добавлены ${picks.length} карточки (featured=true).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

