import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getAuctionDetailPayload } from '@/lib/auctionDetailPayload';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auctionId = parseInt(id, 10);

    if (isNaN(auctionId)) {
      return NextResponse.json({ error: 'Неверный ID аукциона' }, { status: 400 });
    }

    const payload = await getAuctionDetailPayload(auctionId);
    if (!payload) {
      return NextResponse.json({ error: 'Аукцион не найден' }, { status: 404 });
    }

    return NextResponse.json(
      {
        auction: payload.auction,
        relatedAuctions: payload.relatedAuctions,
        collection: payload.collection,
        category: payload.category,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Ошибка при получении аукциона:', error);
    return NextResponse.json({ error: 'Произошла ошибка при получении аукциона' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabase();

    const { id } = await params;
    const auctionId = parseInt(id, 10);

    if (isNaN(auctionId)) {
      return NextResponse.json({ error: 'Неверный ID аукциона' }, { status: 400 });
    }

    const body = await request.json();
    const { images } = body;

    if (!images || !Array.isArray(images)) {
      return NextResponse.json({ error: 'Необходимо предоставить массив изображений' }, { status: 400 });
    }

    const result = await pool.query(
      'UPDATE auctions SET images = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [images, auctionId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Аукцион не найден' }, { status: 404 });
    }

    return NextResponse.json({
      auction: result.rows[0],
      message: 'Изображения успешно обновлены',
    });
  } catch (error: unknown) {
    console.error('Ошибка при обновлении аукциона:', error);
    return NextResponse.json({ error: 'Произошла ошибка при обновлении аукциона' }, { status: 500 });
  }
}
