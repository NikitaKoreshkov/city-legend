import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureCabinetCoreSchema, ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { checkRateLimit } from '@/lib/auth/rateLimit';
import { openNegativeReviewTicket } from '@/lib/openNegativeReviewTicket';

type CreateReviewBody = {
  orderId?: number;
  orderItemId?: number;
  text?: string;
  rating?: number;
};

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const REVIEW_RL_WINDOW_MS = 60 * 60 * 1000;
const REVIEW_RL_MAX = 12;

/** Отзывы 1–2 звезды считаем негативными для эскалации в поддержку. */
export const NEGATIVE_REVIEW_MAX_STARS = 2;

export async function DELETE(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  await ensureDatabase();
  await ensureCabinetCoreSchema();

  let reviewId = 0;
  try {
    const url = new URL(req.url);
    reviewId = Number(url.searchParams.get('id') || 0);
  } catch {
    /* */
  }
  if (!Number.isFinite(reviewId) || reviewId <= 0) {
    return NextResponse.json({ error: 'Укажите id отзыва' }, { status: 400 });
  }

  const del = await pool.query(`DELETE FROM cabinet_user_reviews WHERE id = $1 AND user_id = $2 RETURNING id`, [
    reviewId,
    user.id,
  ]);
  if (del.rowCount === 0) {
    return NextResponse.json({ error: 'Отзыв не найден или нет доступа' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });

  if (!checkRateLimit(`cabinet_review:${user.id}`, REVIEW_RL_MAX, REVIEW_RL_WINDOW_MS)) {
    return NextResponse.json({ error: 'Слишком частые отзывы. Попробуйте позже.' }, { status: 429 });
  }

  await ensureDatabase();
  await ensureCabinetCoreSchema();

  let body: CreateReviewBody;
  try {
    body = (await req.json()) as CreateReviewBody;
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  const orderId = Number(body.orderId || 0);
  const orderItemId = Number(body.orderItemId || 0);
  const text = clean(body.text);
  const rating = Math.round(Number(body.rating));
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Некорректный orderId' }, { status: 400 });
  }
  if (!Number.isFinite(orderItemId) || orderItemId <= 0) {
    return NextResponse.json({ error: 'Некорректный orderItemId' }, { status: 400 });
  }
  if (text.length < 5) {
    return NextResponse.json({ error: 'Минимум 5 символов в отзыве' }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Выберите оценку от 1 до 5 звёзд' }, { status: 400 });
  }

  const itemRes = await pool.query(
    `SELECT oi.id, oi.order_id, oi.auction_id, oi.lot_name,
            o.user_id, o.status
     FROM cabinet_order_items oi
     JOIN cabinet_orders o ON o.id = oi.order_id
     WHERE oi.id = $1 AND oi.order_id = $2
     LIMIT 1`,
    [orderItemId, orderId]
  );
  if (itemRes.rows.length === 0) {
    return NextResponse.json({ error: 'Позиция заказа не найдена' }, { status: 404 });
  }
  const item = itemRes.rows[0] as {
    id: number;
    order_id: number;
    auction_id: number | null;
    lot_name: string;
    user_id: number;
    status: string;
  };
  if (item.user_id !== user.id) {
    return NextResponse.json({ error: 'Нет доступа к этому заказу' }, { status: 403 });
  }
  if (item.status !== 'completed') {
    return NextResponse.json({ error: 'Оставить отзыв можно только после завершения заказа' }, { status: 400 });
  }

  const exists = await pool.query(
    `SELECT id FROM cabinet_user_reviews
     WHERE user_id = $1 AND order_item_id = $2
     LIMIT 1`,
    [user.id, item.id]
  );
  if (exists.rows.length > 0) {
    return NextResponse.json({ error: 'Отзыв по этой позиции уже оставлен' }, { status: 409 });
  }

  const ins = await pool.query<{ id: number }>(
    `INSERT INTO cabinet_user_reviews
      (user_id, order_id, order_item_id, auction_id, lot_title, review_text, likes_count, dislikes_count, rating)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7)
     RETURNING id`,
    [user.id, item.order_id, item.id, item.auction_id, item.lot_name, text, rating]
  );
  const reviewId = ins.rows[0].id;

  if (rating <= NEGATIVE_REVIEW_MAX_STARS) {
    void openNegativeReviewTicket({
      userId: user.id,
      reviewId,
      orderId: item.order_id,
      rating,
      lotTitle: item.lot_name,
      reviewText: text,
    }).catch((e) => console.error('[reviews POST] negative ticket', e));
  }

  return NextResponse.json({ ok: true, id: reviewId });
}
