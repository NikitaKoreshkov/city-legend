import { cache } from 'react';
import pool, { ensureDatabase } from '@/lib/db';

/**
 * Контент главной из БД — для RSC и API. Дедуп в рамках одного запроса.
 */
export const getHomepagePublicContent = cache(
  async (): Promise<Record<string, unknown>> => {
    try {
      await ensureDatabase();
      const result = await pool.query('SELECT * FROM homepage_content');
      const content: Record<string, unknown> = {};
      for (const row of result.rows as Array<{ section: string; data: unknown }>) {
        content[row.section] = row.data;
      }
      return content;
    } catch {
      return {};
    }
  }
);
