/**
 * Создаёт таблицу site_legal (через initDatabase) и записывает/обновляет реквизиты ООО «Аарон Студио».
 * Запуск: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-site-legal.ts
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

import pool, { initDatabase } from '../lib/db';

const ENTITY = 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ААРОН СТУДИО"';
const INN = '5262257450';
const OGRN = '';
const ADDRESS =
  '603022, РОССИЯ, НИЖЕГОРОДСКАЯ ОБЛАСТЬ, Г.О. ГОРОД НИЖНИЙ НОВГОРОД, Г НИЖНИЙ НОВГОРОД, УЛ 1-Я ОРАНЖЕРЕЙНАЯ, Д. 24А, КВ. 348';

async function main() {
  await initDatabase();
  await pool.query(
    `INSERT INTO site_legal (id, entity_name, inn, ogrn, legal_address, updated_at)
     VALUES (1, $1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO UPDATE SET
       entity_name = EXCLUDED.entity_name,
       inn = EXCLUDED.inn,
       ogrn = EXCLUDED.ogrn,
       legal_address = EXCLUDED.legal_address,
       updated_at = NOW()`,
    [ENTITY, INN, OGRN, ADDRESS]
  );
  console.log('site_legal: реквизиты записаны/обновлены.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
