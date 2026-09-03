import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin/apiAuth';
import pool, { ensureDatabase } from '@/lib/db';
import { getPromoUrl, saveCouponQrPublic } from '@/lib/bots/couponDeliver';

/** GET ?code=XXX — JSON with QR URLs; ?code=XXX&download=1 — PNG file */
export async function GET(req: NextRequest) {
  const auth = await requireAdminApi('marketing.edit');
  if (auth instanceof NextResponse) return auth;

  const code = req.nextUrl.searchParams.get('code')?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: 'code обязателен' }, { status: 400 });
  }

  await ensureDatabase();
  const row = await pool.query<{ active: boolean; discount_percent: number; title: string }>(
    `SELECT active, discount_percent, title FROM cabinet_coupons WHERE UPPER(code) = $1 LIMIT 1`,
    [code]
  );
  if (row.rows.length === 0) {
    return NextResponse.json({ error: 'Купон не найден' }, { status: 404 });
  }

  const { buffer, qrUrl, promoUrl } = await saveCouponQrPublic(code);
  const download = req.nextUrl.searchParams.get('download') === '1';

  if (download) {
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="qr-${code}.png"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  return NextResponse.json({
    ok: true,
    code,
    title: row.rows[0].title,
    discountPercent: row.rows[0].discount_percent,
    active: row.rows[0].active,
    promoUrl,
    qrUrl,
    qrApiUrl: `/api/admin/promotions/coupon/qr?code=${encodeURIComponent(code)}&download=1`,
  });
}
