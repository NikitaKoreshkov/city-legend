import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { isCdekConfigured } from '@/lib/cdekConfig';
import { cdekListDeliveryPoints, cdekSuggestCityCode } from '@/lib/cdekClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  if (!isCdekConfigured()) return NextResponse.json({ error: 'СДЭК не настроен' }, { status: 503 });

  const cityCodeRaw = req.nextUrl.searchParams.get('cityCode')?.trim() || '';
  const city = req.nextUrl.searchParams.get('city')?.trim() || '';

  let code: number | null = null;
  if (/^\d+$/.test(cityCodeRaw)) {
    code = parseInt(cityCodeRaw, 10);
  } else if (city.length >= 2) {
    await ensureDatabase();
    code = await cdekSuggestCityCode(city);
  } else {
    return NextResponse.json({ error: 'Укажите город или код города СДЭК' }, { status: 400 });
  }

  await ensureDatabase();
  try {
    if (!code) return NextResponse.json({ points: [] as { code: string; name: string; address: string }[] });
    const points = await cdekListDeliveryPoints(code);
    return NextResponse.json({ cityCode: code, points });
  } catch (e) {
    console.error('delivery/pvz', e);
    return NextResponse.json({ error: 'Не удалось загрузить пункты выдачи' }, { status: 502 });
  }
}
