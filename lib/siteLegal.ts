import pool, { ensureDatabase } from '@/lib/db';
import {
  operatorEntityName,
  operatorInn,
  operatorOgrn,
  operatorLegalAddress,
} from '@/lib/legalPublic';

export type SiteLegalResolved = {
  entityName: string;
  inn: string;
  ogrn: string;
  legalAddress: string;
};

/** Fallback без БД (env + дефолты из legalPublic). */
export function legalFromEnv(): SiteLegalResolved {
  return {
    entityName: operatorEntityName(),
    inn: operatorInn(),
    ogrn: operatorOgrn(),
    legalAddress: operatorLegalAddress(),
  };
}

export async function getSiteLegalFromDb(): Promise<SiteLegalResolved | null> {
  await ensureDatabase();
  const r = await pool.query<{
    entity_name: string;
    inn: string;
    ogrn: string;
    legal_address: string;
  }>(
    `SELECT entity_name, inn, ogrn, legal_address FROM site_legal WHERE id = 1 LIMIT 1`
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    entityName: row.entity_name.trim(),
    inn: row.inn.trim(),
    ogrn: (row.ogrn || '').trim(),
    legalAddress: row.legal_address.trim(),
  };
}

/** Для SSR и API: сначала строка из БД, иначе env/дефолты. */
export async function getResolvedLegal(): Promise<SiteLegalResolved> {
  try {
    const fromDb = await getSiteLegalFromDb();
    if (fromDb) return fromDb;
  } catch {
    // таблица ещё не создана или нет соединения
  }
  return legalFromEnv();
}
