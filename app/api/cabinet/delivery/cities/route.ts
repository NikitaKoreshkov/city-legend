import { NextRequest, NextResponse } from 'next/server';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import { isCdekConfigured } from '@/lib/cdekConfig';
import { cdekSuggestCitiesList, type CdekCitySuggestion } from '@/lib/cdekClient';
import { cdekCountryCodesParam } from '@/lib/cdekCountries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  if (!isCdekConfigured()) return NextResponse.json({ error: 'СДЭК не настроен' }, { status: 503 });

  const q = req.nextUrl.searchParams.get('q')?.trim() || '';
  const country = req.nextUrl.searchParams.get('country')?.trim() || 'RU';
  if (q.length < 1) return NextResponse.json({ cities: [] as CdekCitySuggestion[] });

  try {
    const countryCodes = cdekCountryCodesParam(country);
    const cities = await cdekSuggestCitiesList({ name: q, countryCodes, size: 40 });
    return NextResponse.json({ cities });
  } catch (e) {
    console.error('delivery/cities', e);
    return NextResponse.json({ error: 'Не удалось загрузить города' }, { status: 502 });
  }
}
