import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { restoreCatalog } from '@/lib/catalogRestore';

/**
 * Восстановление категорий и демо-лотов после сбоя / пустой БД.
 *
 * GET /api/catalog-restore
 * — всегда добавляет недостающие категории (18 шт.).
 * — если лотов 0: вставляет тестовый набор (~252 лота) с category_id (каталог по категориям снова работает).
 * — ?force=1: удаляет ВСЕ лоты и заливает демо заново (осторожно).
 *
 * Production: нужны CATALOG_RESTORE_SECRET в env и заголовок x-catalog-restore-secret с тем же значением.
 * Development: заголовок не требуется.
 */
export async function GET(request: NextRequest) {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    const expected = process.env.CATALOG_RESTORE_SECRET?.trim();
    const got = request.headers.get('x-catalog-restore-secret')?.trim();

    if (isProd) {
      if (!expected) {
        return NextResponse.json(
          {
            error:
              'В production задайте CATALOG_RESTORE_SECRET в переменных окружения и передайте его в заголовке x-catalog-restore-secret.',
          },
          { status: 403 }
        );
      }
      if (got !== expected) {
        return NextResponse.json(
          { error: 'Неверный или отсутствует заголовок x-catalog-restore-secret' },
          { status: 403 }
        );
      }
    }

    const force = request.nextUrl.searchParams.get('force') === '1';

    await ensureDatabase();
    const result = await restoreCatalog(pool, { forceReplaceAuctions: force });

    return NextResponse.json({
      ok: true,
      message:
        result.auctions.action === 'skipped'
          ? 'Категории проверены. Лоты не трогали — в базе уже есть позиции. Чтобы перезалить демо, добавьте ?force=1 (удалит все лоты).'
          : result.auctions.action === 'inserted'
            ? 'Категории и демо-лоты восстановлены.'
            : 'Категории проверены, все лоты заменены на демо-набор.',
      categoriesAdded: result.categories.added,
      categoriesExisting: result.categories.existing,
      auctions: result.auctions,
    });
  } catch (e) {
    console.error('catalog-restore', e);
    return NextResponse.json(
      { error: 'Ошибка сервера', details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
