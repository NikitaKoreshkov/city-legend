const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/auction_db',
});

const categories = [
  { name: 'Колье', slug: 'kolye', image: '/колье.png', order: 1 },
  { name: 'Кольца', slug: 'koltsa', image: '/кольца.png', order: 2 },
  { name: 'Браслеты', slug: 'braslety', image: '/браслеты.png', order: 3 },
  { name: 'Серьги', slug: 'sergi', image: '/серг.png', order: 4 },
];

async function init() {
  const client = await pool.connect();

  try {
    console.log('🚀 Добавление категорий в БД...');

    for (const cat of categories) {
      const existing = await client.query('SELECT id FROM auction_categories WHERE slug = $1', [cat.slug]);

      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO auction_categories (name, slug, image_url, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [cat.name, cat.slug, cat.image, cat.order]
        );
        console.log(`✅ Добавлена категория: ${cat.name}`);
      } else {
        console.log(`⏭️  Категория уже существует: ${cat.name}`);
      }
    }

    console.log('✨ Готово!');

    const result = await client.query('SELECT COUNT(*) FROM auction_categories');
    console.log(`\n📊 Всего категорий в БД: ${result.rows[0].count}`);
  } catch (err) {
    console.error('❌ Ошибка:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

init();
