/**
 * Создаёт один завершённый заказ с одной позицией (для отзыва из кабинета).
 * Использование:
 *   node scripts/seed-completed-order-for-review.js
 *   node scripts/seed-completed-order-for-review.js user@mail.com 863
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function run() {
  loadDotEnv();
  const email = (process.argv[2] || 'nikita.koreshcov@gmail.com').trim();
  const auctionId = parseInt(process.argv[3] || '863', 10);

  if (!process.env.DATABASE_URL) {
    console.error('Нет DATABASE_URL в .env');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const userRes = await client.query(
    `SELECT id FROM cabinet_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  if (userRes.rows.length === 0) {
    console.error(`Пользователь не найден: ${email}`);
    await client.end();
    process.exit(1);
  }
  const userId = userRes.rows[0].id;

  const auctionRes = await client.query(
    `SELECT id, name, starting_price, images FROM auctions WHERE id = $1 LIMIT 1`,
    [auctionId]
  );
  if (auctionRes.rows.length === 0) {
    console.error(`Лот не найден: id=${auctionId}`);
    await client.end();
    process.exit(1);
  }
  const lot = auctionRes.rows[0];
  const priceDisplay =
    typeof lot.starting_price === 'string' && lot.starting_price.trim()
      ? lot.starting_price.startsWith('От')
        ? lot.starting_price
        : `От ${lot.starting_price}`
      : 'Уточняется';
  const thumb =
    Array.isArray(lot.images) && lot.images.length > 0 ? lot.images[0] : null;

  await client.query('BEGIN');
  try {
    const orderInsert = await client.query(
      `INSERT INTO cabinet_orders (
        user_id, status, reference_code, total_display, summary_line,
        customer_name, customer_phone, customer_email,
        delivery_city, delivery_street, delivery_house, delivery_apartment, delivery_postal_code, customer_comment,
        tracking_number, eta_days, progress_percent, can_cancel, can_return,
        completed_at
      ) VALUES (
        $1, 'completed', '', $2, $3,
        $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        NULL, 0, 100, FALSE, FALSE,
        CURRENT_TIMESTAMP
      ) RETURNING id`,
      [
        userId,
        priceDisplay,
        '1 позиция',
        'Клиент',
        '+7 (000) 000-00-00',
        email,
        'Москва',
        'ул. Примерная',
        '1',
        '',
        '101000',
        'Тестовый завершённый заказ для отзыва',
      ]
    );
    const orderId = orderInsert.rows[0].id;
    const reference = `CL-${String(orderId).padStart(8, '0')}`;
    await client.query(`UPDATE cabinet_orders SET reference_code = $2 WHERE id = $1`, [
      orderId,
      reference,
    ]);

    const itemInsert = await client.query(
      `INSERT INTO cabinet_order_items (order_id, auction_id, lot_name, unit_price_display, quantity, image_url)
       VALUES ($1, $2, $3, $4, 1, $5)
       RETURNING id`,
      [orderId, lot.id, lot.name, priceDisplay, thumb]
    );
    const orderItemId = itemInsert.rows[0].id;

    await client.query(
      `DELETE FROM cabinet_user_reviews
       WHERE user_id = $1 AND auction_id = $2 AND order_item_id IS NULL`,
      [userId, lot.id]
    );

    await client.query('COMMIT');
    console.log('OK', {
      email,
      orderId,
      reference,
      orderItemId,
      auctionId: lot.id,
      lotName: lot.name,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
