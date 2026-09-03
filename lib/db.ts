import { Pool } from 'pg';
import { DEFAULT_BRANDING, DEFAULT_SITE_FOOTER } from './siteShellDefaults';
import { HOW_TO_ORDER_TAB_YM, OZON_URL, WILDBERRIES_URL } from './marketplaceLinks';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Единая инициализация БД (вызывать перед первым запросом в любом API)
let initPromise: Promise<void> | null = null;
export async function ensureDatabase() {
  if (!initPromise) initPromise = initDatabase();
  await initPromise;
}

// Старые БД: только (id, username, password) — без is_active/role/password_hash, ломает /api/admin/login
let adminUsersSchemaPromise: Promise<void> | null = null;

export async function ensureAdminUsersSchema() {
  if (!adminUsersSchemaPromise) {
    adminUsersSchemaPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          ALTER TABLE admin_users
            ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
            ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'admin',
            ADD COLUMN IF NOT EXISTS display_name VARCHAR(200),
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        `);
        await client.query(
          `UPDATE admin_users SET is_active = TRUE WHERE is_active IS NULL;`
        );
        await client.query(
          `UPDATE admin_users SET role = 'admin' WHERE role IS NULL OR TRIM(role) = '';`
        );
        const superAdminEmail = process.env.SUPERADMIN_EMAIL?.trim();
        if (superAdminEmail) {
          await client.query(
            `UPDATE admin_users SET role = 'super_admin'
             WHERE LOWER(TRIM(username)) = LOWER($1);`,
            [superAdminEmail]
          );
        }
        // Тестовые/легаси аккаунты и plaintext рядом с hash
        await client.query(
          `DELETE FROM admin_users
           WHERE TRIM(username) = '1'
              OR LENGTH(TRIM(username)) <= 1;`
        );
        await client.query(
          `UPDATE admin_users
           SET password = ''
           WHERE password_hash IS NOT NULL
             AND TRIM(password_hash) <> ''
             AND COALESCE(TRIM(password), '') <> ''
             AND TRIM(password) <> '*';`
        );
      } finally {
        client.release();
      }
    })().catch((err) => {
      adminUsersSchemaPromise = null;
      throw err;
    });
  }
  await adminUsersSchemaPromise;
}

// В production initDatabase() не крутится — старые дампы без колонок кабинета (delivery_rub и т.д.) → 500 на /api/cabinet/*
let cabinetCoreSchemaPromise: Promise<void> | null = null;

export async function ensureCabinetCoreSchema() {
  if (!cabinetCoreSchemaPromise) {
    cabinetCoreSchemaPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          ALTER TABLE cabinet_users
          ADD COLUMN IF NOT EXISTS display_name VARCHAR(120) DEFAULT '';
        `);
        await client.query(`
          ALTER TABLE cabinet_users
          ADD COLUMN IF NOT EXISTS birth_date DATE;
        `);
        await client.query(`
          ALTER TABLE cabinet_site_news
          ADD COLUMN IF NOT EXISTS image_url TEXT,
          ADD COLUMN IF NOT EXISTS details_url TEXT,
          ADD COLUMN IF NOT EXISTS target_segment VARCHAR(64) DEFAULT 'all',
          ADD COLUMN IF NOT EXISTS ab_bucket VARCHAR(8) DEFAULT 'all',
          ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'Бутик',
          ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
        `);
        await client.query(`
          ALTER TABLE cabinet_promotions
          ADD COLUMN IF NOT EXISTS details_url TEXT,
          ADD COLUMN IF NOT EXISTS target_segment VARCHAR(64) DEFAULT 'all',
          ADD COLUMN IF NOT EXISTS ab_bucket VARCHAR(8) DEFAULT 'all';
        `);
        await client.query(`
          ALTER TABLE cabinet_orders
          ADD COLUMN IF NOT EXISTS customer_name VARCHAR(160),
          ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(40),
          ADD COLUMN IF NOT EXISTS customer_email VARCHAR(160),
          ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(120),
          ADD COLUMN IF NOT EXISTS delivery_street VARCHAR(180),
          ADD COLUMN IF NOT EXISTS delivery_house VARCHAR(40),
          ADD COLUMN IF NOT EXISTS delivery_apartment VARCHAR(40),
          ADD COLUMN IF NOT EXISTS delivery_postal_code VARCHAR(20),
          ADD COLUMN IF NOT EXISTS customer_comment TEXT,
          ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(80),
          ADD COLUMN IF NOT EXISTS eta_days INTEGER,
          ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 8,
          ADD COLUMN IF NOT EXISTS can_cancel BOOLEAN DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS can_return BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32),
          ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMP,
          ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
        `);
        await client.query(`
          ALTER TABLE cabinet_orders
          ADD COLUMN IF NOT EXISTS subtotal_rub BIGINT;
        `);
        await client.query(`
          ALTER TABLE cabinet_orders
          ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(64),
          ADD COLUMN IF NOT EXISTS discount_percent INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS discount_rub BIGINT DEFAULT 0,
          ADD COLUMN IF NOT EXISTS loyalty_percent INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS loyalty_discount_rub BIGINT DEFAULT 0;
        `);
        await client.query(`
          ALTER TABLE cabinet_orders
          ADD COLUMN IF NOT EXISTS delivery_rub BIGINT,
          ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(16),
          ADD COLUMN IF NOT EXISTS cdek_pvz_code VARCHAR(64),
          ADD COLUMN IF NOT EXISTS cdek_order_uuid VARCHAR(80),
          ADD COLUMN IF NOT EXISTS cdek_error TEXT,
          ADD COLUMN IF NOT EXISTS cdek_last_status_code VARCHAR(80),
          ADD COLUMN IF NOT EXISTS cdek_last_status_at TIMESTAMP;
        `);
        // Ссылка на подтверждение оплаты — нужна для возврата через T-Bank Cancel API.
        // Добавляем без FK-constraint чтобы не зависеть от порядка создания таблиц.
        await client.query(`
          ALTER TABLE cabinet_orders
          ADD COLUMN IF NOT EXISTS payment_confirmation_id INTEGER;
        `);
        await client.query(`
          ALTER TABLE cabinet_orders
          ADD COLUMN IF NOT EXISTS delivery_tariff_rub BIGINT,
          ADD COLUMN IF NOT EXISTS crm_assignee_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS crm_due_at TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS crm_priority VARCHAR(16) DEFAULT 'normal',
          ADD COLUMN IF NOT EXISTS crm_internal_notes TEXT;
        `);
        await client.query(`
          ALTER TABLE cabinet_user_reviews
          ADD COLUMN IF NOT EXISTS admin_hidden_at TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS admin_hidden_reason VARCHAR(500);
        `);
        await client.query(`
          ALTER TABLE cabinet_concierge_tickets
          ADD COLUMN IF NOT EXISTS bot_platform VARCHAR(16),
          ADD COLUMN IF NOT EXISTS bot_chat_id TEXT,
          ADD COLUMN IF NOT EXISTS related_review_id INTEGER REFERENCES cabinet_user_reviews(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS assignee_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;
        `);
        await client.query(`
          ALTER TABLE contact_requests
          ADD COLUMN IF NOT EXISTS assignee_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;
        `);
        const topicsTbl = await client.query(`SELECT to_regclass('public.cabinet_concierge_topics') AS reg`);
        if (topicsTbl.rows[0]?.reg) {
          await client.query(`
            INSERT INTO cabinet_concierge_topics (topic_key, label, sla_minutes, sort_order) VALUES
            ('review_negative', 'Негативный отзыв', 30, 6)
            ON CONFLICT (topic_key) DO UPDATE SET
              label = EXCLUDED.label,
              sla_minutes = EXCLUDED.sla_minutes,
              sort_order = EXCLUDED.sort_order;
          `);
        }
        await client.query(`
          ALTER TABLE cabinet_cart_items
          ADD COLUMN IF NOT EXISTS variant_id VARCHAR(64) NOT NULL DEFAULT '';
        `);
        await client.query(`
          ALTER TABLE auctions
          ADD COLUMN IF NOT EXISTS product_variants JSONB DEFAULT NULL;
        `);
        await client.query(`
          ALTER TABLE auctions
          ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES auction_categories(id) ON DELETE SET NULL;
        `);
        await client.query(`
          ALTER TABLE auctions
          ADD COLUMN IF NOT EXISTS subcategory_ids INTEGER[] DEFAULT '{}';
        `);
      } finally {
        client.release();
      }
    })().catch((err) => {
      cabinetCoreSchemaPromise = null;
      throw err;
    });
  }
  await cabinetCoreSchemaPromise;
}

// Гарантирует наличие таблицы cabinet_delivery_quotes (может не существовать в старых БД,
// которые не прошли через initDatabase()).
let deliveryQuotesSchemaPromise: Promise<void> | null = null;

export async function ensureDeliveryQuotesSchema() {
  if (!deliveryQuotesSchemaPromise) {
    deliveryQuotesSchemaPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS cabinet_delivery_quotes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
            goods_rub BIGINT NOT NULL,
            delivery_rub BIGINT NOT NULL,
            tariff_code INTEGER NOT NULL,
            mode VARCHAR(16) NOT NULL,
            pvz_code VARCHAR(64),
            receiver_city_code INTEGER,
            to_city VARCHAR(120) NOT NULL,
            to_postal_code VARCHAR(20),
            to_street VARCHAR(180),
            to_house VARCHAR(40),
            to_apartment VARCHAR(40),
            cart_signature TEXT NOT NULL,
            coupon_code_upper VARCHAR(64) NOT NULL DEFAULT '',
            express_json JSONB,
            period_min INTEGER,
            period_max INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_cabinet_delivery_quotes_user
          ON cabinet_delivery_quotes(user_id, created_at DESC);
        `);
        await client.query(`
          ALTER TABLE cabinet_delivery_quotes
          ADD COLUMN IF NOT EXISTS delivery_tariff_rub BIGINT;
        `);
      } finally {
        client.release();
      }
    })().catch((err) => {
      deliveryQuotesSchemaPromise = null;
      throw err;
    });
  }
  await deliveryQuotesSchemaPromise;
}

// Таблицы ботов (купоны, рассылки, шаблоны, триггеры) — в prod initDatabase() не вызывается.
let botCouponSchemaPromise: Promise<void> | null = null;

export async function ensureBotCouponSchema() {
  if (!botCouponSchemaPromise) {
    botCouponSchemaPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_coupon_sends (
            id SERIAL PRIMARY KEY,
            subscriber_id INTEGER NOT NULL REFERENCES bot_subscribers(id) ON DELETE CASCADE,
            coupon_id INTEGER REFERENCES cabinet_coupons(id) ON DELETE SET NULL,
            coupon_code VARCHAR(64) NOT NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_bot_coupon_sends_subscriber
          ON bot_coupon_sends (subscriber_id, sent_at DESC);
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_coupon_qr_scans (
            coupon_code VARCHAR(64) PRIMARY KEY,
            last_scan_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_site_sso_tokens (
            token VARCHAR(64) PRIMARY KEY,
            cabinet_user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_bot_site_sso_expires
          ON bot_site_sso_tokens (expires_at);
        `);
        await client.query(`
          ALTER TABLE bot_subscribers
          ADD COLUMN IF NOT EXISTS manager_notes TEXT DEFAULT '',
          ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT FALSE;
        `);
        await client.query(`
          ALTER TABLE cabinet_users
          ADD COLUMN IF NOT EXISTS birth_date DATE;
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_broadcast_templates (
            id SERIAL PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_scheduled_broadcasts (
            id SERIAL PRIMARY KEY,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
            payload JSONB NOT NULL,
            created_by VARCHAR(200),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            run_id INTEGER
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_bot_scheduled_pending
          ON bot_scheduled_broadcasts (scheduled_at)
          WHERE status = 'pending';
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_broadcast_runs (
            id SERIAL PRIMARY KEY,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP,
            payload JSONB,
            sent INTEGER NOT NULL DEFAULT 0,
            failed INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 0
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_broadcast_run_items (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL REFERENCES bot_broadcast_runs(id) ON DELETE CASCADE,
            subscriber_id INTEGER REFERENCES bot_subscribers(id) ON DELETE SET NULL,
            platform VARCHAR(16),
            platform_user_id VARCHAR(64),
            first_name VARCHAR(200),
            success BOOLEAN NOT NULL DEFAULT FALSE,
            error TEXT
          );
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_bot_broadcast_run_items_run
          ON bot_broadcast_run_items (run_id);
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_trigger_settings (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            abandoned_cart_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            abandoned_cart_hours INTEGER NOT NULL DEFAULT 24,
            abandoned_cart_text TEXT,
            post_purchase_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            post_purchase_days INTEGER NOT NULL DEFAULT 7,
            post_purchase_text TEXT,
            birthday_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            birthday_text TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          INSERT INTO bot_trigger_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS bot_trigger_sent (
            id SERIAL PRIMARY KEY,
            trigger_type VARCHAR(32) NOT NULL,
            subscriber_id INTEGER NOT NULL REFERENCES bot_subscribers(id) ON DELETE CASCADE,
            ref_key VARCHAR(128) NOT NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (trigger_type, subscriber_id, ref_key)
          );
        `);
        await client.query(`
          INSERT INTO bot_broadcast_templates (title, body)
          SELECT 'Новая коллекция', 'Здравствуйте, {имя}! Новая подборка украшений на сайте City Legend: https://citylegend.art/collection'
          WHERE NOT EXISTS (SELECT 1 FROM bot_broadcast_templates LIMIT 1);
        `);
        await client.query(`
          INSERT INTO bot_broadcast_templates (title, body)
          SELECT 'Скидка выходного дня', '{имя}, персональная скидка {купон}% — код {код}. Активировать: https://citylegend.art/promo?code={код}'
          WHERE (SELECT COUNT(*) FROM bot_broadcast_templates) < 2;
        `);
      } finally {
        client.release();
      }
    })().catch((err) => {
      botCouponSchemaPromise = null;
      throw err;
    });
  }
  await botCouponSchemaPromise;
}

/** @deprecated alias */
export const ensureBotAdminSchema = ensureBotCouponSchema;

// Создание таблицы, если её нет
export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS auctions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        additional_info VARCHAR(500),
        starting_price VARCHAR(100) NOT NULL,
        images TEXT[] DEFAULT '{}',
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Добавляем колонку category, если её нет (для существующих таблиц)
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS category VARCHAR(100);
    `);
    
    // Добавляем колонку subcategory для подфильтров
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
    `);
    
    // Добавляем колонку auction_dates для сроков проведения аукциона
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS auction_dates VARCHAR(50);
    `);
    
    // Добавляем колонку certificate_url для сертификата подлинности (старая, для обратной совместимости)
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS certificate_url TEXT;
    `);
    
    // Добавляем колонку certificates для множественных сертификатов (JSONB массив: [{url: string, type: 'image'|'pdf'}])
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS certificates JSONB DEFAULT '[]';
    `);
    await client.query(`
      ALTER TABLE auctions
      ADD COLUMN IF NOT EXISTS inventory_qty INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS reserved_qty INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN DEFAULT TRUE;
    `);
    await client.query(`
      ALTER TABLE auctions
      ADD COLUMN IF NOT EXISTS compare_at_price VARCHAR(100);
    `);
    await client.query(`
      ALTER TABLE auctions
      ALTER COLUMN inventory_qty DROP DEFAULT;
    `);
    await client.query(`
      UPDATE auctions
      SET auction_dates = NULL,
          inventory_qty = NULL
      WHERE TRIM(COALESCE(auction_dates, '')) = 'Уточняйте наличие';
    `);
    
    // Таблица для контента главной страницы (создаём до использования)
    await client.query(`
      CREATE TABLE IF NOT EXISTS homepage_content (
        id SERIAL PRIMARY KEY,
        section VARCHAR(100) NOT NULL UNIQUE,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(
      `INSERT INTO homepage_content (section, data) VALUES ($1, $2::jsonb) ON CONFLICT (section) DO NOTHING`,
      ['branding', JSON.stringify(DEFAULT_BRANDING)]
    );
    await client.query(
      `INSERT INTO homepage_content (section, data) VALUES ($1, $2::jsonb) ON CONFLICT (section) DO NOTHING`,
      ['site_footer', JSON.stringify(DEFAULT_SITE_FOOTER)]
    );
    
    // Таблица для контента страницы О нас
    await client.query(`
      CREATE TABLE IF NOT EXISTS about_content (
        id SERIAL PRIMARY KEY,
        section VARCHAR(100) NOT NULL UNIQUE,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Контент отдельных страниц (уход, как заказать и т.д.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_page_content (
        id SERIAL PRIMARY KEY,
        page VARCHAR(100) NOT NULL,
        section VARCHAR(100) NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (page, section)
      );
    `);
    
    // Таблица для категорий аукционов (создаём ДО добавления FK из auctions)
    await client.query(`
      CREATE TABLE IF NOT EXISTS auction_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(200) NOT NULL UNIQUE,
        image_url TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Коллекции лотов (для блока «из той же коллекции» на странице проекта)
    await client.query(`
      CREATE TABLE IF NOT EXISTS auction_collections (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(200) NOT NULL UNIQUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS collection_id INTEGER REFERENCES auction_collections(id) ON DELETE SET NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auctions_collection_id ON auctions(collection_id);
    `);
    
    // Добавляем колонку category_id для связи с таблицей auction_categories
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES auction_categories(id) ON DELETE SET NULL;
    `);
    
    // Добавляем колонку subcategory_ids для связи с подкатегориями
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS subcategory_ids INTEGER[] DEFAULT '{}';
    `);
    
    // Добавляем колонку is_featured для отображения на главной странице
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
    `);
    
    // Добавляем колонку detail_sections для дополнительных секций (аккордеоны)
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS detail_sections JSONB DEFAULT '[]';
    `);
    
    // Добавляем колонку filter_values для значений фильтров (JSONB: {filter_id: value})
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS filter_values JSONB DEFAULT '{}';
    `);

    await client.query(`
      ALTER TABLE auctions
      ADD COLUMN IF NOT EXISTS product_variants JSONB DEFAULT NULL;
    `);
    
    // Таблица для документов
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        file_url TEXT NOT NULL,
        file_size VARCHAR(50),
        file_type VARCHAR(10) DEFAULT 'PDF',
        document_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Индекс для сортировки по дате
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_date 
      ON documents(document_date DESC);
    `);
    
    // Таблица для подкатегорий/фильтров (старая, оставляем для обратной совместимости)
    await client.query(`
      CREATE TABLE IF NOT EXISTS auction_subcategories (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES auction_categories(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(200) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Новая таблица для фильтров (более гибкая система)
    await client.query(`
      CREATE TABLE IF NOT EXISTS filters (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES auction_categories(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL, -- 'checkbox', 'range', 'text'
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Таблица для значений фильтров (для чекбоксов)
    await client.query(`
      CREATE TABLE IF NOT EXISTS filter_options (
        id SERIAL PRIMARY KEY,
        filter_id INTEGER REFERENCES filters(id) ON DELETE CASCADE,
        value VARCHAR(200) NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Добавляем колонки для связи лотов с категориями и подкатегориями
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES auction_categories(id) ON DELETE SET NULL;
    `);
    
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS subcategory_ids INTEGER[] DEFAULT '{}';
    `);
    
    // Добавляем колонку для отображения на главной (чекбокс featured)
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
    `);
    
    // Добавляем колонку для дополнительных секций (аккордеонов)
    await client.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS detail_sections JSONB DEFAULT '[]';
    `);
    
    // Таблица для обратной связи
    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_requests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(200) NOT NULL,
        phone VARCHAR(50),
        message TEXT NOT NULL,
        auction_id INTEGER REFERENCES auctions(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Индекс для автоматического удаления старых заявок (старше 24 часов)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_requests_created 
      ON contact_requests(created_at DESC);
    `);
    
    // Пользователи личного кабинета (email в нижнем регистре, уникальность по LOWER)
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cabinet_users_email_lower
      ON cabinet_users (LOWER(email));
    `);
    await client.query(`
      ALTER TABLE cabinet_users
      ADD COLUMN IF NOT EXISTS display_name VARCHAR(120) DEFAULT '';
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_site_news (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        excerpt TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE cabinet_site_news
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS details_url TEXT,
      ADD COLUMN IF NOT EXISTS target_segment VARCHAR(64) DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS ab_bucket VARCHAR(8) DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'Бутик',
      ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_promotions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        subtitle TEXT,
        promo_code VARCHAR(64),
        discount_label VARCHAR(120),
        active BOOLEAN DEFAULT TRUE,
        valid_until DATE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE cabinet_promotions
      ADD COLUMN IF NOT EXISTS details_url TEXT,
      ADD COLUMN IF NOT EXISTS target_segment VARCHAR(64) DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS ab_bucket VARCHAR(8) DEFAULT 'all';
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_marketing_events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        event_name VARCHAR(64) NOT NULL,
        entity_type VARCHAR(24) NOT NULL,
        entity_id INTEGER,
        segment VARCHAR(64) NOT NULL DEFAULT 'all',
        ab_bucket VARCHAR(8) NOT NULL DEFAULT 'A',
        meta JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_marketing_events_user_created
      ON cabinet_marketing_events(user_id, created_at DESC);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        status VARCHAR(64) NOT NULL,
        reference_code VARCHAR(64),
        total_display VARCHAR(120) NOT NULL,
        summary_line TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE cabinet_orders
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(160),
      ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(40),
      ADD COLUMN IF NOT EXISTS customer_email VARCHAR(160),
      ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(120),
      ADD COLUMN IF NOT EXISTS delivery_street VARCHAR(180),
      ADD COLUMN IF NOT EXISTS delivery_house VARCHAR(40),
      ADD COLUMN IF NOT EXISTS delivery_apartment VARCHAR(40),
      ADD COLUMN IF NOT EXISTS delivery_postal_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS customer_comment TEXT,
      ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(80),
      ADD COLUMN IF NOT EXISTS eta_days INTEGER,
      ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 8,
      ADD COLUMN IF NOT EXISTS can_cancel BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS can_return BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32),
      ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    `);
    await client.query(`
      ALTER TABLE cabinet_orders
      ADD COLUMN IF NOT EXISTS subtotal_rub BIGINT;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_orders_user
      ON cabinet_orders(user_id, created_at DESC);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES cabinet_orders(id) ON DELETE CASCADE,
        auction_id INTEGER,
        lot_name VARCHAR(500) NOT NULL,
        unit_price_display VARCHAR(120) NOT NULL,
        unit_price_rub BIGINT,
        quantity INTEGER NOT NULL DEFAULT 1,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT cabinet_order_item_qty CHECK (quantity > 0 AND quantity <= 99)
      );
    `);
    await client.query(`
      ALTER TABLE cabinet_order_items
      ADD COLUMN IF NOT EXISTS unit_price_rub BIGINT;
    `);
    await client.query(`
      ALTER TABLE cabinet_order_items
      ADD COLUMN IF NOT EXISTS variant_id VARCHAR(64) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS variant_summary TEXT;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_order_items_order
      ON cabinet_order_items(order_id, id ASC);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_cart_items (
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, auction_id),
        CONSTRAINT cabinet_cart_qty CHECK (quantity > 0 AND quantity <= 99)
      );
    `);
    await client.query(`
      ALTER TABLE cabinet_cart_items
      ADD COLUMN IF NOT EXISTS variant_id VARCHAR(64) NOT NULL DEFAULT '';
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'cabinet_cart_items'::regclass
            AND contype = 'p'
            AND conname = 'cabinet_cart_items_pkey'
        ) THEN
          ALTER TABLE cabinet_cart_items DROP CONSTRAINT cabinet_cart_items_pkey;
        END IF;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'cabinet_cart_items'::regclass AND contype = 'p'
        ) THEN
          ALTER TABLE cabinet_cart_items
            ADD PRIMARY KEY (user_id, auction_id, variant_id);
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_favorites (
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, auction_id)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_favorites_user
      ON cabinet_favorites(user_id, created_at DESC);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_user_reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES cabinet_orders(id) ON DELETE SET NULL,
        order_item_id INTEGER REFERENCES cabinet_order_items(id) ON DELETE SET NULL,
        auction_id INTEGER REFERENCES auctions(id) ON DELETE SET NULL,
        lot_title VARCHAR(500) NOT NULL,
        review_text TEXT NOT NULL,
        likes_count INTEGER NOT NULL DEFAULT 0,
        dislikes_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE cabinet_user_reviews
      ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES cabinet_orders(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS order_item_id INTEGER REFERENCES cabinet_order_items(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS auction_id INTEGER REFERENCES auctions(id) ON DELETE SET NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_reviews_user
      ON cabinet_user_reviews(user_id, created_at DESC);
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cabinet_reviews_user_order_item_unique
      ON cabinet_user_reviews(user_id, order_item_id)
      WHERE order_item_id IS NOT NULL;
    `);
    await client.query(`
      ALTER TABLE cabinet_user_reviews
      ADD COLUMN IF NOT EXISTS rating SMALLINT;
    `);
    await client.query(`
      ALTER TABLE cabinet_user_reviews
      ADD COLUMN IF NOT EXISTS admin_hidden_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS admin_hidden_reason VARCHAR(500);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_review_replies (
        id SERIAL PRIMARY KEY,
        review_id INTEGER NOT NULL REFERENCES cabinet_user_reviews(id) ON DELETE CASCADE,
        reply_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_cms_copy (
        key VARCHAR(96) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_loyalty_tiers (
        id SERIAL PRIMARY KEY,
        sort_order INTEGER NOT NULL DEFAULT 0,
        from_rub BIGINT NOT NULL,
        label VARCHAR(200) NOT NULL,
        percent INTEGER NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_saved_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        label VARCHAR(80) NOT NULL DEFAULT 'Адрес',
        full_name VARCHAR(160) NOT NULL,
        phone VARCHAR(40) NOT NULL,
        email VARCHAR(160) NOT NULL,
        city VARCHAR(120) NOT NULL,
        street VARCHAR(180) NOT NULL,
        house VARCHAR(40) NOT NULL,
        apartment VARCHAR(40),
        postal_code VARCHAR(20),
        comment TEXT,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_addresses_user
      ON cabinet_saved_addresses(user_id, is_default DESC, id DESC);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_coupons (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        title VARCHAR(200) NOT NULL,
        discount_percent INTEGER NOT NULL,
        min_total_rub BIGINT NOT NULL DEFAULT 0,
        expires_at TIMESTAMP,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_coupon_usages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        order_id INTEGER NOT NULL REFERENCES cabinet_orders(id) ON DELETE CASCADE,
        coupon_id INTEGER NOT NULL REFERENCES cabinet_coupons(id) ON DELETE RESTRICT,
        coupon_code VARCHAR(64) NOT NULL,
        discount_percent INTEGER NOT NULL,
        discount_rub BIGINT NOT NULL DEFAULT 0,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_usage_order_unique
      ON cabinet_coupon_usages(order_id);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_payment_confirmations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        method VARCHAR(32) NOT NULL,
        amount_rub BIGINT NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'RUB',
        provider_payment_id VARCHAR(128) NOT NULL UNIQUE,
        status VARCHAR(24) NOT NULL DEFAULT 'confirmed',
        confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        used_at TIMESTAMP,
        meta JSONB NOT NULL DEFAULT '{}'
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_payment_confirmations_user
      ON cabinet_payment_confirmations(user_id, confirmed_at DESC);
    `);
    await client.query(`
      ALTER TABLE cabinet_payment_confirmations
      ALTER COLUMN confirmed_at DROP DEFAULT;
    `);
    // Связь заказа с подтверждением оплаты — нужна для возврата (T‑Bank Cancel API).
    // Без FK-constraint, чтобы migraton работала одинаково в prod (через ensureCabinetCoreSchema)
    // и при полной пересборке через initDatabase.
    await client.query(`
      ALTER TABLE cabinet_orders
      ADD COLUMN IF NOT EXISTS payment_confirmation_id INTEGER;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_orders_payment_confirmation
      ON cabinet_orders(payment_confirmation_id);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_concierge_topics (
        topic_key VARCHAR(64) PRIMARY KEY,
        label VARCHAR(160) NOT NULL,
        sla_minutes INTEGER NOT NULL DEFAULT 30,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_concierge_tickets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        topic_key VARCHAR(64) NOT NULL REFERENCES cabinet_concierge_topics(topic_key) ON DELETE RESTRICT,
        status VARCHAR(24) NOT NULL DEFAULT 'open',
        priority VARCHAR(16) NOT NULL DEFAULT 'normal',
        subject VARCHAR(200) NOT NULL,
        order_id INTEGER REFERENCES cabinet_orders(id) ON DELETE SET NULL,
        assigned_manager_name VARCHAR(120),
        response_sla_minutes INTEGER NOT NULL DEFAULT 30,
        first_response_due_at TIMESTAMP,
        last_customer_message_at TIMESTAMP,
        last_manager_message_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_concierge_tickets_user
      ON cabinet_concierge_tickets(user_id, created_at DESC);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_concierge_messages (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES cabinet_concierge_tickets(id) ON DELETE CASCADE,
        sender_type VARCHAR(24) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_concierge_messages_ticket
      ON cabinet_concierge_messages(ticket_id, created_at ASC);
    `);
    await client.query(`
      ALTER TABLE cabinet_concierge_tickets
      ADD COLUMN IF NOT EXISTS bot_platform VARCHAR(16),
      ADD COLUMN IF NOT EXISTS bot_chat_id TEXT,
      ADD COLUMN IF NOT EXISTS related_review_id INTEGER REFERENCES cabinet_user_reviews(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS assignee_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;
    `);
    await client.query(`
      ALTER TABLE contact_requests
      ADD COLUMN IF NOT EXISTS assignee_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;
    `);
    await client.query(`
      ALTER TABLE cabinet_orders
      ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(64),
      ADD COLUMN IF NOT EXISTS discount_percent INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS discount_rub BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loyalty_percent INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loyalty_discount_rub BIGINT DEFAULT 0;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS cabinet_delivery_quotes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES cabinet_users(id) ON DELETE CASCADE,
        goods_rub BIGINT NOT NULL,
        delivery_rub BIGINT NOT NULL,
        tariff_code INTEGER NOT NULL,
        mode VARCHAR(16) NOT NULL,
        pvz_code VARCHAR(64),
        receiver_city_code INTEGER,
        to_city VARCHAR(120) NOT NULL,
        to_postal_code VARCHAR(20),
        to_street VARCHAR(180),
        to_house VARCHAR(40),
        to_apartment VARCHAR(40),
        cart_signature TEXT NOT NULL,
        coupon_code_upper VARCHAR(64) NOT NULL DEFAULT '',
        express_json JSONB,
        period_min INTEGER,
        period_max INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_delivery_quotes_user
      ON cabinet_delivery_quotes(user_id, created_at DESC);
    `);
    await client.query(`
      ALTER TABLE cabinet_delivery_quotes
      ADD COLUMN IF NOT EXISTS delivery_tariff_rub BIGINT;
    `);
    await client.query(`
      ALTER TABLE cabinet_orders
      ADD COLUMN IF NOT EXISTS delivery_rub BIGINT,
      ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(16),
      ADD COLUMN IF NOT EXISTS cdek_pvz_code VARCHAR(64),
      ADD COLUMN IF NOT EXISTS cdek_order_uuid VARCHAR(80),
      ADD COLUMN IF NOT EXISTS cdek_error TEXT,
      ADD COLUMN IF NOT EXISTS cdek_last_status_code VARCHAR(80),
      ADD COLUMN IF NOT EXISTS cdek_last_status_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS delivery_tariff_rub BIGINT,
      ADD COLUMN IF NOT EXISTS crm_assignee_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS crm_due_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS crm_priority VARCHAR(16) DEFAULT 'normal',
      ADD COLUMN IF NOT EXISTS crm_internal_notes TEXT;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cabinet_loyalty_tiers_sort
      ON cabinet_loyalty_tiers (sort_order ASC, id ASC);
    `);

    const CMS_DEFAULTS: [string, string][] = [
      ['header_eyebrow', 'Личный кабинет'],
      ['header_guest_name', 'Участник'],
      ['header_logout', 'Выйти'],
      ['loading_cabinet', 'Загрузка кабинета…'],
      ['error_retry', 'Повторить'],
      ['nav_news', 'Блог'],
      ['nav_promo', 'Акции'],
      ['nav_orders', 'Заказы'],
      ['nav_cart', 'Корзина'],
      ['nav_reviews', 'Отзывы'],
      ['nav_favorites', 'Избранное'],
      ['nav_concierge', 'Поддержка'],
      ['section_news_eyebrow', 'Журнал'],
      ['section_news_title', 'Блог бутика'],
      ['section_promo_eyebrow', 'Привилегии'],
      ['section_promo_title', 'Скидки, акции и купоны'],
      ['section_orders_eyebrow', 'Сопровождение'],
      ['section_orders_title', 'История заказов'],
      ['section_cart_eyebrow', 'Выбранные товары'],
      ['section_cart_title', 'Корзина'],
      ['section_reviews_eyebrow', 'Сообщество'],
      ['section_reviews_title', 'Ваши отзывы'],
      ['section_favorites_eyebrow', 'Скоро'],
      ['section_favorites_title', 'Избранное'],
      [
        'favorites_body',
        'Отметьте товар сердцем в каталоге или на странице артикула. Повторное нажатие убирает его из избранного.',
      ],
      ['favorites_empty', 'Пока нет избранных товаров.'],
      ['favorites_remove', 'Убрать'],
      ['section_concierge_eyebrow', 'CITY LEGEND'],
      ['section_concierge_title', 'Служба поддержки'],
      [
        'concierge_body',
        'Вопрос по лоту, резерв или индивидуальный подбор — создайте обращение в личном кабинете или свяжитесь с нами по телефону и в мессенджерах.',
      ],
      ['concierge_cta', 'Написать в поддержку'],
      ['loyalty_headline', 'Программа лояльности по объёму'],
      [
        'loyalty_spent_hint_no_orders',
        'После первого оформленного заказа здесь отобразится ваша накопительная скидка.',
      ],
      ['loyalty_spent_hint_has_orders', 'Ваш статус обновляется по мере подтверждённых покупок.'],
      ['loyalty_row_left_tpl', 'Совокупные покупки {label}'],
      ['loyalty_row_right_tpl', 'до {percent}%'],
      ['empty_orders', 'Заказов пока нет — загляните в каталог.'],
      ['empty_cart', 'Корзина пуста.'],
      ['cart_total_label', 'Итого'],
      [
        'cart_total_partial_note',
        'По части лотов цена в каталоге без числа — ориентировочная сумма; точный итог уточнит менеджер.',
      ],
      ['cart_total_unavailable', 'Сумму корзины можно уточнить у менеджера.'],
      ['cart_remove', 'Убрать'],
      ['cart_checkout', 'Перейти к оплате'],
      ['favorites_add_to_cart', 'В корзину'],
      ['favorites_qty_label', 'Кол-во'],
      ['favorites_adding', 'Добавляем…'],
      ['favorites_added_ok', 'Добавлено в корзину'],
      [
        'favorites_added_detail_tpl',
        '+{added} шт. · всего по артикулу в корзине: {total}',
      ],
      [
        'empty_reviews',
        'Вы ещё не оставляли отзывов. Они появятся здесь с реакциями и ответами бутика.',
      ],
      ['empty_news', 'Пока нет публикаций.'],
      ['empty_promo', 'Активных акций сейчас нет — загляните позже.'],
      ['link_catalog', 'Перейти в каталог'],
      ['cart_price_qty_tpl', '{price} · {qty} шт.'],
      ['promo_fallback_discount', 'Акция'],
      ['promo_code_label_tpl', 'Код: {code}'],
      ['promo_copied', 'Скопировано'],
      ['promo_no_code', 'Без кода'],
      ['promo_valid_until_tpl', 'до {date}'],
      ['reviews_likes', 'Лайки:'],
      ['reviews_dislikes', 'Дизлайки:'],
      ['reviews_reply_heading', 'Ответ бутика'],
      ['orders_ref_prefix', '№ '],
    ];
    for (const [k, v] of CMS_DEFAULTS) {
      await client.query(
        `INSERT INTO cabinet_cms_copy (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [k, v]
      );
    }
    await client.query(`UPDATE cabinet_cms_copy SET value = 'Блог' WHERE key = 'nav_news'`);
    await client.query(`UPDATE cabinet_cms_copy SET value = 'Журнал' WHERE key = 'section_news_eyebrow'`);
    await client.query(`UPDATE cabinet_cms_copy SET value = 'Блог бутика' WHERE key = 'section_news_title'`);
    await client.query(`UPDATE cabinet_cms_copy SET value = 'Пока нет публикаций.' WHERE key = 'empty_news'`);
    await client.query(`UPDATE cabinet_cms_copy SET value = 'Поддержка' WHERE key = 'nav_concierge'`);
    await client.query(`UPDATE cabinet_cms_copy SET value = 'Служба поддержки' WHERE key = 'section_concierge_title'`);
    await client.query(
      `UPDATE cabinet_cms_copy SET value = 'Вопрос по лоту, резерв или индивидуальный подбор — создайте обращение в личном кабинете или свяжитесь с нами по телефону и в мессенджерах.' WHERE key = 'concierge_body'`
    );
    await client.query(`UPDATE cabinet_cms_copy SET value = 'Написать в поддержку' WHERE key = 'concierge_cta'`);
    await client.query(
      `UPDATE cabinet_cms_copy SET value = 'По части лотов цена в каталоге без числа — ориентировочная сумма; точный итог уточнит менеджер.' WHERE key = 'cart_total_partial_note'`
    );
    await client.query(
      `UPDATE cabinet_cms_copy SET value = 'Сумму корзины можно уточнить у менеджера.' WHERE key = 'cart_total_unavailable'`
    );
    await client.query(
      `UPDATE cabinet_site_news SET body = REPLACE(body, 'консьержу', 'в поддержку') WHERE body LIKE '%консьерж%'`
    );
    await client.query(
      `UPDATE cabinet_site_news SET body = REPLACE(body, 'консьержем', 'менеджером') WHERE body LIKE '%консьерж%'`
    );
    await client.query(
      `UPDATE cabinet_promotions SET title = 'Персональный сервис' WHERE title = 'Консьерж-сервис'`
    );
    await client.query(
      `UPDATE cabinet_concierge_tickets SET assigned_manager_name = 'Менеджер' WHERE assigned_manager_name = 'Premium Concierge'`
    );

    const tierCount = await client.query(
      'SELECT COUNT(*)::int AS c FROM cabinet_loyalty_tiers'
    );
    if ((tierCount.rows[0] as { c: number }).c === 0) {
      await client.query(`
        INSERT INTO cabinet_loyalty_tiers (sort_order, from_rub, label, percent) VALUES
        (1, 5000, 'от 5 000 ₽', 3),
        (2, 15000, 'от 15 000 ₽', 5),
        (3, 30000, 'от 30 000 ₽', 7);
      `);
    }
    await client.query(`
      UPDATE cabinet_loyalty_tiers
      SET from_rub = 5000, label = 'от 5 000 ₽', percent = 3
      WHERE sort_order = 1;
    `);
    await client.query(`
      UPDATE cabinet_loyalty_tiers
      SET from_rub = 15000, label = 'от 15 000 ₽', percent = 5
      WHERE sort_order = 2;
    `);
    await client.query(`
      UPDATE cabinet_loyalty_tiers
      SET from_rub = 30000, label = 'от 30 000 ₽', percent = 7
      WHERE sort_order = 3;
    `);

    const newsCount = await client.query(
      'SELECT COUNT(*)::int AS c FROM cabinet_site_news'
    );
    if ((newsCount.rows[0] as { c: number }).c === 0) {
      await client.query(`
        INSERT INTO cabinet_site_news (title, excerpt, sort_order, image_url, category, body) VALUES
        (
          'Digital-витрина обновлена',
          'Мы добавили удобный поиск по лотам и улучшили карточки украшений — загляните в каталог.',
          1,
          '/1.avif',
          'Коллекция',
          'Командная витрина CITY LEGEND теперь работает быстрее: мы пересобрали фильтры по категориям, добавили превью крупным планом и аккуратные подсказки по размеру и пробе металла.

Интерфейс карточки лота показывает ключевые характеристики — камень, огранка, вес — без лишних кликов. Вы можете сохранять понравившиеся позиции в избранное и переносить их в корзину прямо из списка.

Если нужна консультация по конкретному украшению, оставьте заявку в поддержку из личного кабинета — мы поможем с подбором и резервом.'
        ),
        (
          'Сертификаты подлинности',
          'По запросу предоставляем полный пакет документов на каждую позицию из коллекции.',
          2,
          '/2.jpeg',
          'Гарантии',
          'Подлинность и происхождение — основа доверия к ювелирной покупке. На изделия из нашей подборки оформляются сертификаты соответствия и, при необходимости, независимая геммологическая экспертиза.

Документы можно запросить до или после оформления заказа: мы подготовим пакет на русском языке и пришлём сканы в личный кабинет. Для редких камней и антикварных позиций доступны дополнительные справки и история обслуживания.

Храните электронные копии вместе с чеком — они пригодятся для страховки, перепродажи или наследования.'
        ),
        (
          'Доставка и примерка',
          'Отправляем по России и за рубеж. Индивидуальное сопровождение на каждом этапе.',
          3,
          '/3.png',
          'Сервис',
          'Мы организуем доставку курьерскими службами с объявленной ценностью и страхованием груза. По Москве и Санкт-Петербургу возможна передача под запись в шоуруме или удобной точке — согласуем время с вашим менеджером.

Для международных отправок оформляем таможенные декларации и сопровождаем пакет документов. Сроки и стоимость рассчитываются индивидуально до подтверждения заказа.

После получения украшения вы можете обратиться за консультацией по уходу и хранению — короткие рекомендации есть в разделе «Уход», а персональные советы даст команда бутика.'
        );
      `);
    } else {
      await client.query(
        `UPDATE cabinet_site_news SET image_url = '/1.avif'
         WHERE sort_order = 1 AND (image_url IS NULL OR TRIM(image_url) = '')`
      );
      await client.query(
        `UPDATE cabinet_site_news SET image_url = '/2.jpeg'
         WHERE sort_order = 2 AND (image_url IS NULL OR TRIM(image_url) = '')`
      );
      await client.query(
        `UPDATE cabinet_site_news SET image_url = '/3.png'
         WHERE sort_order = 3 AND (image_url IS NULL OR TRIM(image_url) = '')`
      );
    }

    const fillNewsBody = (
      sortOrder: number,
      category: string,
      body: string
    ) =>
      client.query(
        `UPDATE cabinet_site_news SET category = $2, body = $3
         WHERE sort_order = $1 AND (body IS NULL OR TRIM(COALESCE(body, '')) = '')`,
        [sortOrder, category, body]
      );
    await fillNewsBody(
      1,
      'Коллекция',
      `Командная витрина CITY LEGEND теперь работает быстрее: мы пересобрали фильтры по категориям, добавили превью крупным планом и аккуратные подсказки по размеру и пробе металла.

Интерфейс карточки лота показывает ключевые характеристики — камень, огранка, вес — без лишних кликов. Вы можете сохранять понравившиеся позиции в избранное и переносить их в корзину прямо из списка.

Если нужна консультация по конкретному украшению, оставьте заявку в поддержку из личного кабинета — мы поможем с подбором и резервом.`
    );
    await fillNewsBody(
      2,
      'Гарантии',
      `Подлинность и происхождение — основа доверия к ювелирной покупке. На изделия из нашей подборки оформляются сертификаты соответствия и, при необходимости, независимая геммологическая экспертиза.

Документы можно запросить до или после оформления заказа: мы подготовим пакет на русском языке и пришлём сканы в личный кабинет. Для редких камней и антикварных позиций доступны дополнительные справки и история обслуживания.

Храните электронные копии вместе с чеком — они пригодятся для страховки, перепродажи или наследования.`
    );
    await fillNewsBody(
      3,
      'Сервис',
      `Мы организуем доставку курьерскими службами с объявленной ценностью и страхованием груза. По Москве и Санкт-Петербургу возможна передача под запись в шоуруме или удобной точке — согласуем время с вашим менеджером.

Для международных отправок оформляем таможенные декларации и сопровождаем пакет документов. Сроки и стоимость рассчитываются индивидуально до подтверждения заказа.

После получения украшения вы можете обратиться за консультацией по уходу и хранению — короткие рекомендации есть в разделе «Уход», а персональные советы даст команда бутика.`
    );

    const promoCount = await client.query(
      'SELECT COUNT(*)::int AS c FROM cabinet_promotions'
    );
    if ((promoCount.rows[0] as { c: number }).c === 0) {
      await client.query(`
        INSERT INTO cabinet_promotions
          (title, subtitle, promo_code, discount_label, active, valid_until, sort_order)
        VALUES
        (
          'Приветственная программа',
          'На первый заказ от 300 000 ₽',
          'WELCOME10',
          '−10%',
          TRUE,
          NULL,
          1
        ),
        (
          'Постоянным клиентам',
          'Накопительная выгода при повторных покупках — см. блок лояльности ниже.',
          NULL,
          'до 7%',
          TRUE,
          NULL,
          2
        ),
        (
          'Персональный сервис',
          'Персональный подбор и резерв лота без ожидания в очереди.',
          'CONCIERGE',
          'VIP',
          TRUE,
          NULL,
          3
        );
      `);
    }

    const couponCount = await client.query(
      'SELECT COUNT(*)::int AS c FROM cabinet_coupons'
    );
    if ((couponCount.rows[0] as { c: number }).c === 0) {
      await client.query(`
        INSERT INTO cabinet_coupons (code, title, discount_percent, min_total_rub, expires_at, active)
        VALUES
          ('WELCOME10', 'Приветственный купон', 10, 1000, NOW() + INTERVAL '90 days', TRUE),
          ('VIP15', 'VIP-скидка', 15, 5000, NOW() + INTERVAL '180 days', TRUE),
          ('SPRING7', 'Сезонная скидка', 7, 3000, NOW() + INTERVAL '45 days', TRUE)
        ON CONFLICT (code) DO NOTHING;
      `);
    }
    await client.query(`
      UPDATE cabinet_coupons
      SET min_total_rub = 1000
      WHERE UPPER(code) = 'WELCOME10';
    `);
    await client.query(`
      UPDATE cabinet_coupons
      SET min_total_rub = 5000
      WHERE UPPER(code) = 'VIP15';
    `);
    await client.query(`
      UPDATE cabinet_coupons
      SET min_total_rub = 3000
      WHERE UPPER(code) = 'SPRING7';
    `);
    await client.query(`
      INSERT INTO cabinet_concierge_topics (topic_key, label, sla_minutes, sort_order) VALUES
        ('product_selection', 'Подбор украшения', 15, 1),
        ('lot_reserve', 'Резерв лота', 10, 2),
        ('gift_consulting', 'Подарочная консультация', 20, 3),
        ('order_support', 'Поддержка по заказу', 15, 4),
        ('payment_question', 'Вопрос по оплате', 15, 5),
        ('review_negative', 'Негативный отзыв', 30, 6),
        ('other', 'Другое', 30, 99)
      ON CONFLICT (topic_key) DO UPDATE SET
        label = EXCLUDED.label,
        sla_minutes = EXCLUDED.sla_minutes,
        sort_order = EXCLUDED.sort_order;
    `);

    // Таблица для администраторов (без демо-учёток — создаются через /admin/staff)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL DEFAULT '',
        password_hash VARCHAR(255),
        role VARCHAR(32) DEFAULT 'admin',
        display_name VARCHAR(200),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    client.release();
  }
}

export default pool;

