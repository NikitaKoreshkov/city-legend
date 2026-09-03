import bcrypt from 'bcryptjs';
import { loadEnvConfig } from '@next/env';

async function run() {
  loadEnvConfig(process.cwd());
  const { default: pool, ensureDatabase } = await import('../lib/db');
  await ensureDatabase();
  const targetEmail = (process.argv[2] || '').trim().toLowerCase();

  const userRes = targetEmail
    ? await pool.query(
        `SELECT id, email
         FROM cabinet_users
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [targetEmail]
      )
    : await pool.query(
        `SELECT id, email
         FROM cabinet_users
         ORDER BY id DESC
         LIMIT 1`
      );

  if (userRes.rows.length === 0) {
    if (targetEmail) {
      const passwordHash = await bcrypt.hash('Test12345!', 10);
      const createdUser = await pool.query(
        `INSERT INTO cabinet_users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email`,
        [targetEmail, passwordHash, 'Участник']
      );
      const u = createdUser.rows[0] as { id: number; email: string };
      console.log(`Пользователь ${targetEmail} не найден. Создан новый аккаунт: ${u.email} / Test12345!`);
      userRes.rows.push(u);
    } else {
      const email = 'test-orders@citylegend.local';
      const passwordHash = await bcrypt.hash('Test12345!', 10);
      const createdUser = await pool.query(
        `INSERT INTO cabinet_users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email`,
        [email, passwordHash, 'Тестовый Клиент']
      );
      const u = createdUser.rows[0] as { id: number; email: string };
      console.log(`Создан тестовый пользователь: ${u.email} / Test12345!`);
      userRes.rows.push(u);
    }
  }

  const user = userRes.rows[0] as { id: number; email: string };
  const now = Date.now();

  const testOrders = [
    {
      status: 'processing',
      ref: `CL-TST-${(now + 1).toString(36).toUpperCase().slice(-8)}`,
      total: '248 000 ₽',
      summary: '2 позиции',
      tracking: `TRK-TST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      etaDays: 4,
      progress: 22,
      canCancel: true,
      canReturn: false,
      items: [
        { lotName: 'Колье Aurora', unitPrice: '124 000 ₽', quantity: 1, image: null },
        { lotName: 'Серьги Velvet', unitPrice: '124 000 ₽', quantity: 1, image: null },
      ],
    },
    {
      status: 'delivered',
      ref: `CL-TST-${(now + 2).toString(36).toUpperCase().slice(-8)}`,
      total: '365 000 ₽',
      summary: '1 позиция',
      tracking: `TRK-TST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      etaDays: 0,
      progress: 92,
      canCancel: false,
      canReturn: true,
      items: [{ lotName: 'Браслет Imperial', unitPrice: '365 000 ₽', quantity: 1, image: null }],
    },
    {
      status: 'cancelled',
      ref: `CL-TST-${(now + 3).toString(36).toUpperCase().slice(-8)}`,
      total: '189 000 ₽',
      summary: '1 позиция',
      tracking: `TRK-TST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      etaDays: null,
      progress: 0,
      canCancel: false,
      canReturn: false,
      items: [{ lotName: 'Кольцо Monogram', unitPrice: '189 000 ₽', quantity: 1, image: null }],
    },
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const order of testOrders) {
      const orderInsert = await client.query(
        `INSERT INTO cabinet_orders (
          user_id, status, reference_code, total_display, summary_line,
          customer_name, customer_phone, customer_email,
          delivery_city, delivery_street, delivery_house, delivery_apartment, delivery_postal_code, customer_comment,
          tracking_number, eta_days, progress_percent, can_cancel, can_return
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19
        )
        RETURNING id`,
        [
          user.id,
          order.status,
          order.ref,
          order.total,
          order.summary,
          'Тестовый Клиент',
          '+7 (999) 123-45-67',
          user.email,
          'Москва',
          'Тестовая улица',
          '10',
          '5',
          '101000',
          'Тестовый заказ для проверки статусов',
          order.tracking,
          order.etaDays,
          order.progress,
          order.canCancel,
          order.canReturn,
        ]
      );

      const orderId = orderInsert.rows[0].id as number;
      for (const item of order.items) {
        await client.query(
          `INSERT INTO cabinet_order_items (order_id, auction_id, lot_name, unit_price_display, quantity, image_url)
           VALUES ($1, NULL, $2, $3, $4, $5)`,
          [orderId, item.lotName, item.unitPrice, item.quantity, item.image]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`Добавлено 3 тестовых заказа для пользователя #${user.id} (${user.email}).`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Ошибка сидирования тестовых заказов:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
