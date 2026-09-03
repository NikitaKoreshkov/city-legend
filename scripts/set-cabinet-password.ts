import bcrypt from 'bcryptjs';
import { loadEnvConfig } from '@next/env';

async function run() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const password = process.argv[3] || '';

  if (!email || !password) {
    console.log('Использование: npx tsx scripts/set-cabinet-password.ts <email> <password>');
    process.exit(1);
  }

  loadEnvConfig(process.cwd());
  const { default: pool, ensureDatabase } = await import('../lib/db');
  await ensureDatabase();
  const hash = await bcrypt.hash(password, 12);
  const res = await pool.query(
    `UPDATE cabinet_users
     SET password_hash = $2
     WHERE LOWER(email) = $1
     RETURNING id, email`,
    [email, hash]
  );

  if (res.rows.length === 0) {
    console.log(`Пользователь ${email} не найден.`);
  } else {
    const u = res.rows[0] as { id: number; email: string };
    console.log(`Пароль обновлен для пользователя #${u.id} (${u.email}).`);
  }
  await pool.end();
}

run();
