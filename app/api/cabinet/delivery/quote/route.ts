import { NextRequest, NextResponse } from 'next/server';
import pool, { ensureDatabase, ensureDeliveryQuotesSchema } from '@/lib/db';
import { getCabinetUserFromCookies } from '@/lib/auth/cabinetSession';
import {
  cdekFlatDeliveryRub,
  cdekTariffDoor,
  cdekTariffPvz,
  isCdekApiConfigured,
  isCdekDeliveryEnabled,
} from '@/lib/cdekConfig';
import {
  cdekCalculateDeliveryRub,
  cdekResolveSenderCityCode,
  cdekSuggestCityCode,
} from '@/lib/cdekClient';
import { resolveCheckoutCart } from '@/lib/cabinetCheckoutResolve';

export const dynamic = 'force-dynamic';

type Body = {
  mode?: string;
  pvzCode?: string;
  /** Код города получателя из справочника СДЭК (предпочтительно вместо угадывания по названию). */
  receiverCityCode?: number;
  couponCode?: string;
  expressAuctionId?: number;
  expressQuantity?: number;
  expressVariantId?: string;
  city?: string;
  postalCode?: string;
  street?: string;
  house?: string;
  apartment?: string;
};

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function POST(req: NextRequest) {
  const user = await getCabinetUserFromCookies();
  if (!user) return NextResponse.json({ error: 'Требуется вход' }, { status: 401 });
  if (!isCdekDeliveryEnabled()) {
    return NextResponse.json({ error: 'Доставка отключена' }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Неверный формат' }, { status: 400 });
  }

  const apiAvailable = isCdekApiConfigured();
  // Если есть API СДЭК и пользователь выбрал ПВЗ — режим pvz; иначе курьер «до двери».
  const requestedMode = body.mode === 'door' ? 'door' : 'pvz';
  const mode: 'pvz' | 'door' = apiAvailable && requestedMode === 'pvz' ? 'pvz' : 'door';
  const pvzCode = clean(body.pvzCode) || null;
  if (apiAvailable && mode === 'pvz' && !pvzCode) {
    return NextResponse.json({ error: 'Выберите пункт выдачи СДЭК' }, { status: 400 });
  }

  const city = clean(body.city);
  const street = clean(body.street);
  const house = clean(body.house);
  const receiverCityCodeRaw = body.receiverCityCode;
  const receiverCityCodeNum =
    typeof receiverCityCodeRaw === 'number' && Number.isFinite(receiverCityCodeRaw) && receiverCityCodeRaw > 0
      ? Math.floor(receiverCityCodeRaw)
      : null;

  if (city.length < 2) {
    return NextResponse.json({ error: 'Укажите город получателя' }, { status: 400 });
  }
  if (street.length < 2 || house.length < 1) {
    return NextResponse.json(
      { error: 'Укажите улицу и дом получателя (или выберите ПВЗ — адрес подставится автоматически)' },
      { status: 400 }
    );
  }

  await ensureDatabase();
  await ensureDeliveryQuotesSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resolved = await resolveCheckoutCart(client, user.id, {
      couponCode: body.couponCode,
      expressAuctionId: body.expressAuctionId,
      expressQuantity: body.expressQuantity,
      expressVariantId: body.expressVariantId,
    });
    if (!resolved.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: resolved.error, unavailable: resolved.unavailable },
        { status: 400 }
      );
    }
    const data = resolved.data;

    let toCode: number | null = receiverCityCodeNum;
    let tariffCode = mode === 'pvz' ? cdekTariffPvz() : cdekTariffDoor();
    let periodMin: number | null = null;
    let periodMax: number | null = null;
    let deliveryRub = 0;
    let deliveryTariffRub: number | null = null;

    if (apiAvailable) {
      try {
        const fromCode = await cdekResolveSenderCityCode();
        if (toCode == null) {
          toCode = await cdekSuggestCityCode(city);
        }
        if (!fromCode) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            {
              error:
                'Не настроен город отправления СДЭК. Укажите CDEK_SENDER_CITY_CODE в настройках магазина.',
            },
            { status: 503 }
          );
        }
        if (!toCode) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'Город получателя не найден в справочнике СДЭК. Выберите город из подсказки.' },
            { status: 400 }
          );
        }
        const calc = await cdekCalculateDeliveryRub({ fromCode, toCode, mode });
        tariffCode = calc.tariffCode;
        periodMin = calc.periodMin;
        periodMax = calc.periodMax;
        deliveryTariffRub = calc.tariffRub;
        deliveryRub = calc.customerRub;
        if (deliveryRub <= 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            {
              error:
                'СДЭК не рассчитал стоимость доставки для этого адреса. Попробуйте другой пункт выдачи или город.',
            },
            { status: 422 }
          );
        }
      } catch (e) {
        console.error('[delivery/quote] CDEK calculator failed', e);
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: 'Ошибка расчёта доставки СДЭК. Попробуйте позже или напишите в поддержку.' },
          { status: 502 }
        );
      }
    } else {
      deliveryRub = cdekFlatDeliveryRub();
    }

    const expressJson =
      body.expressAuctionId != null && body.expressQuantity != null
        ? JSON.stringify({
            expressAuctionId: body.expressAuctionId,
            expressQuantity: body.expressQuantity,
            expressVariantId: body.expressVariantId ?? '',
          })
        : null;

    // expires_at вычисляется на стороне БД через NOW() — так избегаем ошибок TZ между Node.js (UTC+3) и PG.
    const ins = await client.query(
      `INSERT INTO cabinet_delivery_quotes (
         user_id, goods_rub, delivery_rub, delivery_tariff_rub, tariff_code, mode, pvz_code, receiver_city_code,
         to_city, to_postal_code, to_street, to_house, to_apartment,
         cart_signature, coupon_code_upper, express_json, period_min, period_max, expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13,
         $14, $15, $16::jsonb, $17, $18, NOW() + INTERVAL '2 hours'
       ) RETURNING id`,
      [
        user.id,
        data.finalRub,
        deliveryRub,
        deliveryTariffRub,
        tariffCode,
        mode,
        pvzCode,
        toCode,
        city,
        null,
        street,
        house,
        null,
        data.cartSignature,
        clean(body.couponCode).toUpperCase(),
        expressJson,
        periodMin,
        periodMax,
      ]
    );

    const quoteId = (ins.rows[0] as { id: number }).id;
    await client.query('COMMIT');

    return NextResponse.json({
      ok: true,
      quoteId,
      goodsRub: data.finalRub,
      deliveryRub,
      payTotalRub: data.finalRub + deliveryRub,
      tariffCode,
      periodMin,
      periodMax,
      mode,
      receiverCityCode: toCode,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('delivery/quote', e);
    return NextResponse.json({ error: 'Ошибка расчёта доставки' }, { status: 500 });
  } finally {
    client.release();
  }
}
