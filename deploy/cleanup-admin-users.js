#!/usr/bin/env node
/**
 * One-shot prod cleanup for legacy admin accounts.
 * Usage: node deploy/cleanup-admin-users.js  (with DATABASE_URL in env)
 */
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const c = new Client({ connectionString: url });
  await c.connect();

  const before = await c.query(
    `SELECT id, username,
            CASE WHEN password_hash IS NOT NULL AND TRIM(password_hash) <> '' THEN 'hash' ELSE 'nohash' END AS h,
            CASE WHEN COALESCE(TRIM(password), '') IN ('', '*') THEN 'empty' ELSE 'plaintext' END AS p
     FROM admin_users ORDER BY id`
  );
  console.log('before:', before.rows);

  const del = await c.query(
    `DELETE FROM admin_users
     WHERE TRIM(username) = '1' OR LENGTH(TRIM(username)) <= 1
     RETURNING id, username`
  );
  console.log('deleted:', del.rows);

  const upd = await c.query(
    `UPDATE admin_users
     SET password = ''
     WHERE password_hash IS NOT NULL
       AND TRIM(password_hash) <> ''
       AND COALESCE(TRIM(password), '') NOT IN ('', '*')
     RETURNING id, username`
  );
  console.log('cleared plaintext:', upd.rows);

  const after = await c.query(
    `SELECT id, username,
            CASE WHEN password_hash IS NOT NULL AND TRIM(password_hash) <> '' THEN 'hash' ELSE 'nohash' END AS h,
            CASE WHEN COALESCE(TRIM(password), '') IN ('', '*') THEN 'empty' ELSE 'plaintext' END AS p
     FROM admin_users ORDER BY id`
  );
  console.log('after:', after.rows);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
