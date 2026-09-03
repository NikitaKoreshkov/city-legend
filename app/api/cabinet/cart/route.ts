import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { fetchAuctionCartRow, resolveCartLineAvailability } from '@/lib/cabinetCartAvailability';

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCabinetUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
    }
    await ensureDatabase();
    const rawAuctionId = request.nextUrl.searchParams.get('auctionId');
    if (!rawAuctionId) {
      await pool.query(`DELETE FROM cabinet_cart_items WHERE user_id = $1`, [user.id]);
      return NextResponse.json({ ok: true, cleared: true });
    }
    const auctionId = parseInt(rawAuctionId, 10);
    if (!Number.isFinite(auctionId) || auctionId < 1) {
      return NextResponse.json({ error: 'Некорректный лот' }, { status: 400 });
    }
    const variantId = String(request.nextUrl.searchParams.get('variantId') ?? '').trim();
    await pool.query(
      `DELETE FROM cabinet_cart_items WHERE user_id = $1 AND auction_id = $2 AND variant_id = $3`,
      [user.id, auctionId, variantId]
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('cabinet/cart DELETE', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCabinetUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
    }
    await ensureDatabase();
    let body: { auctionId?: unknown; quantity?: unknown; variantId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
    }
    const auctionId = typeof body.auctionId === 'number' ? body.auctionId : parseInt(String(body.auctionId), 10);
    const variantId = String(body.variantId ?? '').trim();
    const addQty =
      typeof body.quantity === 'number' && body.quantity > 0
        ? Math.min(99, Math.floor(body.quantity))
        : 1;

    if (!Number.isFinite(auctionId) || auctionId < 1) {
      return NextResponse.json({ error: 'Некорректный лот' }, { status: 400 });
    }

    const row = await fetchAuctionCartRow(pool, auctionId);
    if (!row) {
      return NextResponse.json({ error: 'Лот не найден' }, { status: 404 });
    }
    const resolved = resolveCartLineAvailability(row, variantId);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!row.is_sellable) {
      return NextResponse.json({ error: 'Лот недоступен для заказа' }, { status: 400 });
    }
    if (resolved.available < 1) {
      return NextResponse.json({ error: 'Лот временно недоступен' }, { status: 409 });
    }

    const inCart = await pool.query(
      `SELECT quantity FROM cabinet_cart_items WHERE user_id = $1 AND auction_id = $2 AND variant_id = $3 LIMIT 1`,
      [user.id, auctionId, variantId]
    );
    const alreadyQty = inCart.rows.length > 0 ? Number((inCart.rows[0] as { quantity: number }).quantity) : 0;
    const maxAllowed = Math.max(0, Math.min(99, resolved.available));
    if (alreadyQty + addQty > maxAllowed) {
      return NextResponse.json(
        { error: `Доступно только ${maxAllowed} шт. по этой позиции` },
        { status: 409 }
      );
    }

    const res = await pool.query(
      `INSERT INTO cabinet_cart_items (user_id, auction_id, variant_id, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, auction_id, variant_id)
       DO UPDATE SET
         quantity = LEAST(cabinet_cart_items.quantity + EXCLUDED.quantity, 99),
         updated_at = CURRENT_TIMESTAMP
       RETURNING quantity`,
      [user.id, auctionId, variantId, addQty]
    );
    const quantity = (res.rows[0] as { quantity: number }).quantity;
    return NextResponse.json({ ok: true, quantity });
  } catch (e) {
    console.error('cabinet/cart POST', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCabinetUserFromCookies();
    if (!user) {
      return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
    }
    await ensureDatabase();
    let body: { auctionId?: unknown; quantity?: unknown; variantId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 });
    }
    const auctionId = typeof body.auctionId === 'number' ? body.auctionId : parseInt(String(body.auctionId), 10);
    const variantId = String(body.variantId ?? '').trim();
    const quantity = typeof body.quantity === 'number' ? Math.floor(body.quantity) : parseInt(String(body.quantity), 10);
    if (!Number.isFinite(auctionId) || auctionId < 1) {
      return NextResponse.json({ error: 'Некорректный лот' }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      return NextResponse.json({ error: 'Количество должно быть от 1 до 99' }, { status: 400 });
    }

    const row = await fetchAuctionCartRow(pool, auctionId);
    if (!row) {
      return NextResponse.json({ error: 'Лот не найден' }, { status: 404 });
    }
    const resolved = resolveCartLineAvailability(row, variantId);
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!row.is_sellable) {
      return NextResponse.json({ error: 'Лот недоступен для заказа' }, { status: 400 });
    }
    const maxAllowed = Math.max(0, Math.min(99, resolved.available));
    if (quantity > maxAllowed) {
      return NextResponse.json(
        { error: `Доступно только ${maxAllowed} шт. по этой позиции` },
        { status: 409 }
      );
    }

    const updated = await pool.query(
      `UPDATE cabinet_cart_items
       SET quantity = $3, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND auction_id = $2 AND variant_id = $4
       RETURNING quantity`,
      [user.id, auctionId, quantity, variantId]
    );
    if (updated.rowCount === 0) {
      return NextResponse.json({ error: 'Позиция не найдена в корзине' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, quantity: (updated.rows[0] as { quantity: number }).quantity });
  } catch (e) {
    console.error('cabinet/cart PATCH', e);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
