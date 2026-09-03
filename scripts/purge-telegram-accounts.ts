/**
 * Удаляет всех подписчиков Telegram-бота и связанные с ними аккаунты ЛК
 * (cabinet_users, на которые ссылался только бот).
 *
 * Использование: npx tsx scripts/purge-telegram-accounts.ts
 */
import { loadEnvConfig } from '@next/env';

async function run() {
  loadEnvConfig(process.cwd());
  const { default: pool, ensureDatabase } = await import('../lib/db');
  await ensureDatabase();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subs = await client.query<{ id: number; cabinet_user_id: number | null }>(
      `SELECT id, cabinet_user_id FROM bot_subscribers WHERE platform = 'telegram'`
    );

    const cabinetIds = [
      ...new Set(
        subs.rows.map((r) => r.cabinet_user_id).filter((x): x is number => x != null)
      ),
    ];

    const delSub = await client.query(
      `DELETE FROM bot_subscribers WHERE platform = 'telegram' RETURNING id`
    );

    let delCab = 0;
    if (cabinetIds.length > 0) {
      const delCabRes = await client.query(
        `DELETE FROM cabinet_users WHERE id = ANY($1::int[]) RETURNING id`,
        [cabinetIds]
      );
      delCab = delCabRes.rowCount ?? 0;
    }

    await client.query('COMMIT');
    console.log(
      `Удалено подписчиков Telegram: ${delSub.rowCount ?? 0}, связанных пользователей ЛК: ${delCab}`
    );
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
