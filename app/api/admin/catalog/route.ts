import { NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/admin/apiAuth';
import {
  parseProductVariantConfig,
  validateVariantConfigForSave,
  type ProductVariantConfig,
} from '@/lib/productVariants';

function normalizeProductVariantsPayload(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const parsed = parseProductVariantConfig(raw);
  if (!parsed) {
    return null;
  }
  const err = validateVariantConfigForSave(parsed);
  if (err) {
    throw new Error(err);
  }
  return JSON.stringify(parsed as ProductVariantConfig);
}

// GET - получить все товары каталога (для админки)
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const result = await pool.query(`
      SELECT a.*, ac.name as category_name, col.name as collection_name
      FROM auctions a
      LEFT JOIN auction_categories ac ON a.category_id = ac.id
      LEFT JOIN auction_collections col ON col.id = a.collection_id
      ORDER BY a.created_at DESC
    `);

    return NextResponse.json({ products: result.rows, auctions: result.rows });
  } catch (error) {
    console.error('Ошибка получения каталога:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// POST - добавить товар в каталог
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const {
      name,
      additional_info,
      starting_price,
      compare_at_price,
      auction_dates,
      images,
      category_id,
      collection_id,
      subcategory_ids,
      is_featured,
      certificate_url,
      certificates,
      detail_sections,
      filter_values,
      product_variants,
    } = await request.json();

    if (!name || !starting_price) {
      return NextResponse.json(
        { error: 'Название и начальная цена обязательны' },
        { status: 400 }
      );
    }

    // Проверяем количество товаров на главной
    if (is_featured) {
      const featuredCount = await pool.query(
        'SELECT COUNT(*) FROM auctions WHERE is_featured = true'
      );
      
      if (parseInt(featuredCount.rows[0].count) >= 4) {
        return NextResponse.json(
          { error: 'Максимум 4 товара могут быть на главной' },
          { status: 400 }
        );
      }
    }

    const compareAt =
      typeof compare_at_price === 'string' && compare_at_price.trim() ? compare_at_price.trim() : null;

    let variantsJson: string | null = null;
    try {
      variantsJson = normalizeProductVariantsPayload(product_variants);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Некорректные варианты SKU';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO auctions (
        name, additional_info, starting_price, compare_at_price, auction_dates, images,
        category_id, collection_id, subcategory_ids, is_featured, certificate_url, certificates, detail_sections, filter_values,
        product_variants
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
       RETURNING *`,
      [
        name,
        additional_info || null,
        starting_price,
        compareAt,
        auction_dates || null,
        images || [],
        category_id || null,
        collection_id ?? null,
        subcategory_ids || [],
        is_featured || false,
        certificate_url || null,
        JSON.stringify(certificates || []),
        JSON.stringify(detail_sections || []),
        JSON.stringify(filter_values || {}),
        variantsJson,
      ]
    );

    return NextResponse.json({ success: true, product: result.rows[0], auction: result.rows[0] });
  } catch (error) {
    console.error('Ошибка добавления товара:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// PUT - обновить товар
export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const body = (await request.json()) as Record<string, unknown>;
    const {
      id,
      name,
      additional_info,
      starting_price,
      compare_at_price,
      auction_dates,
      images,
      category_id,
      collection_id,
      subcategory_ids,
      is_featured,
      certificate_url,
      certificates,
      detail_sections,
      filter_values,
      product_variants,
    } = body;

    const pvProvided = Object.prototype.hasOwnProperty.call(body, 'product_variants');

    console.log('🔧 Обновление товара:', { id, name, category_id, subcategory_ids, filter_values });

    if (!id || !name || !starting_price) {
      return NextResponse.json(
        { error: 'ID, название и начальная цена обязательны' },
        { status: 400 }
      );
    }

    // Проверяем количество товаров на главной (если меняем на featured)
    if (is_featured) {
      const currentAuction = await pool.query(
        'SELECT is_featured FROM auctions WHERE id = $1',
        [id]
      );
      
      if (!currentAuction.rows[0]?.is_featured) {
        const featuredCount = await pool.query(
          'SELECT COUNT(*) FROM auctions WHERE is_featured = true'
        );
        
        if (parseInt(featuredCount.rows[0].count) >= 4) {
          return NextResponse.json(
            { error: 'Максимум 4 товара могут быть на главной' },
            { status: 400 }
          );
        }
      }
    }

    const compareAt =
      typeof compare_at_price === 'string' && compare_at_price.trim() ? compare_at_price.trim() : null;

    let variantsJson: string | null | undefined;
    if (pvProvided) {
      try {
        variantsJson = normalizeProductVariantsPayload(product_variants);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Некорректные варианты SKU';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    const result = await pool.query(
      `UPDATE auctions 
       SET name = $1, additional_info = $2, starting_price = $3, compare_at_price = $4, auction_dates = $5,
           images = $6, category_id = $7, collection_id = $8, subcategory_ids = $9, is_featured = $10,
           certificate_url = $11, certificates = $12, detail_sections = $13, filter_values = $14,
           product_variants = CASE WHEN $16::boolean THEN $15::jsonb ELSE product_variants END,
           updated_at = NOW()
       WHERE id = $17
       RETURNING *`,
      [
        name,
        additional_info,
        starting_price,
        compareAt,
        auction_dates,
        images,
        category_id,
        collection_id ?? null,
        subcategory_ids,
        is_featured,
        certificate_url,
        JSON.stringify(certificates || []),
        JSON.stringify(detail_sections || []),
        JSON.stringify(filter_values || {}),
        pvProvided ? variantsJson ?? null : null,
        pvProvided,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 });
    }

    console.log('✅ Товар обновлён:', result.rows[0]);

    return NextResponse.json({ success: true, product: result.rows[0], auction: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления товара:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

// DELETE - удалить товар
export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID товара обязателен' }, { status: 400 });
    }

    await pool.query('DELETE FROM auctions WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления товара:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

