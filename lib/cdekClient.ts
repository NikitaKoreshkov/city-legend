import {
  cdekApiBase,
  cdekDefaultPackage,
  cdekFlatDeliveryRub,
  cdekPreferRealTariffPrice,
  cdekTariffDoor,
  cdekTariffPvz,
} from '@/lib/cdekConfig';

type TokenState = { token: string; expiresAt: number };
let cached: TokenState | null = null;

async function cdekFetchToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const clientId = process.env.CDEK_CLIENT_ID?.trim();
  const clientSecret = process.env.CDEK_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('CDEK_CLIENT_ID/CDEK_CLIENT_SECRET не заданы');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${cdekApiBase()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !j.access_token) {
    throw new Error(j.error || `CDEK OAuth ${res.status}`);
  }
  const ttl = typeof j.expires_in === 'number' ? j.expires_in : 3600;
  cached = { token: j.access_token, expiresAt: now + ttl };
  return j.access_token;
}

export async function cdekAuthorizedJson<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  const token = await cdekFetchToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${cdekApiBase()}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

export type CdekCitySuggestion = {
  code: number;
  city: string;
  region?: string;
  country_code?: string;
};

function parseCdekCityCode(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return null;
}

function normalizeSuggestCitiesEntity(raw: unknown): CdekCitySuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: CdekCitySuggestion[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const code = parseCdekCityCode(o.code ?? o.city_code);
    const city =
      typeof o.city === 'string'
        ? o.city
        : typeof o.full_name === 'string'
          ? o.full_name
          : typeof o.name === 'string'
            ? o.name
            : '';
    if (code == null || !city.trim()) continue;
    out.push({
      code,
      city: city.trim(),
      region: typeof o.region === 'string' ? o.region : undefined,
      country_code: typeof o.country_code === 'string' ? o.country_code : undefined,
    });
  }
  return out;
}

/** СДЭК отдаёт либо `{ entity: [...] }`, либо сразу массив в корне JSON. */
function normalizeSuggestCitiesPayload(data: unknown): CdekCitySuggestion[] {
  if (Array.isArray(data)) return normalizeSuggestCitiesEntity(data);
  if (data && typeof data === 'object' && 'entity' in data) {
    return normalizeSuggestCitiesEntity((data as { entity: unknown }).entity);
  }
  return [];
}

async function cdekSuggestCitiesOneLang(params: {
  name: string;
  countryCodes: string;
  size: number;
  lang: 'rus' | 'eng';
}): Promise<CdekCitySuggestion[]> {
  const q = params.name.trim();
  if (q.length < 1) return [];
  const base = cdekApiBase();
  const url = `${base}/location/suggest/cities?country_codes=${encodeURIComponent(params.countryCodes)}&name=${encodeURIComponent(q)}&size=${params.size}&lang=${params.lang}`;
  const token = await cdekFetchToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return normalizeSuggestCitiesPayload(data);
}

/** Один запрос suggest (без разбиения стран). Латиница / кириллица: разный `lang`. */
async function cdekSuggestCitiesListSingleCountryGroup(params: {
  name: string;
  countryCodes: string;
  size: number;
}): Promise<CdekCitySuggestion[]> {
  const q = params.name.trim();
  if (q.length < 1) return [];
  const size = Math.min(60, Math.max(1, params.size ?? 30));
  const hasCyrillic = /[а-яА-ЯёЁ]/.test(q);
  const order: ('rus' | 'eng')[] = hasCyrillic ? ['rus', 'eng'] : ['eng', 'rus'];
  const seen = new Set<number>();
  const merged: CdekCitySuggestion[] = [];
  for (const lang of order) {
    const batch = await cdekSuggestCitiesOneLang({
      name: q,
      countryCodes: params.countryCodes,
      size,
      lang,
    });
    for (const row of batch) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);
      merged.push(row);
    }
    if (merged.length > 0) break;
  }
  if (merged.length === 0) {
    const base = cdekApiBase();
    const url = `${base}/location/suggest/cities?country_codes=${encodeURIComponent(params.countryCodes)}&name=${encodeURIComponent(q)}&size=${size}`;
    const token = await cdekFetchToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return normalizeSuggestCitiesPayload(data);
  }
  return merged;
}

/**
 * Длинный `country_codes` (режим «все страны») API СДЭК часто обрабатывает пустым ответом.
 * Делим: сначала RU, затем остальные ISO порциями по 5.
 */
function buildCountryCodeChunks(countryCodes: string): string[] {
  const parts = countryCodes.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 4) return [parts.join(',')];
  const chunks: string[] = [];
  if (parts.includes('RU')) {
    chunks.push('RU');
    const rest = parts.filter((p) => p !== 'RU');
    for (let i = 0; i < rest.length; i += 5) {
      chunks.push(rest.slice(i, i + 5).join(','));
    }
  } else {
    for (let i = 0; i < parts.length; i += 5) {
      chunks.push(parts.slice(i, i + 5).join(','));
    }
  }
  return chunks;
}

/** Подсказка городов (несколько стран через `country_codes`). Латиница и кириллица: разный `lang` у API СДЭК. */
export async function cdekSuggestCitiesList(params: {
  name: string;
  countryCodes: string;
  size?: number;
}): Promise<CdekCitySuggestion[]> {
  const q = params.name.trim();
  if (q.length < 1) return [];
  const maxSize = Math.min(60, Math.max(1, params.size ?? 30));
  const chunks = buildCountryCodeChunks(params.countryCodes);
  if (chunks.length === 1) {
    return cdekSuggestCitiesListSingleCountryGroup({
      name: q,
      countryCodes: chunks[0],
      size: maxSize,
    });
  }
  const seen = new Set<number>();
  const merged: CdekCitySuggestion[] = [];
  for (const cc of chunks) {
    const part = await cdekSuggestCitiesListSingleCountryGroup({
      name: q,
      countryCodes: cc,
      size: maxSize,
    });
    for (const row of part) {
      if (seen.has(row.code)) continue;
      seen.add(row.code);
      merged.push(row);
      if (merged.length >= maxSize) return merged;
    }
  }
  return merged;
}

/** Подсказка городов (код ФИАС/СДЭК), только RU — для обратной совместимости. */
export async function cdekSuggestCityCode(cityName: string): Promise<number | null> {
  const list = await cdekSuggestCitiesList({ name: cityName, countryCodes: 'RU', size: 8 });
  return list[0]?.code ?? null;
}

export type CdekTariffOffer = {
  tariff_code: number;
  delivery_sum: number;
  period_min?: number;
  period_max?: number;
};

function parseDeliverySumRub(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw));
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return null;
}

function normalizeTariffOffer(raw: unknown): CdekTariffOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const codeRaw = o.tariff_code ?? o.tariffCode;
  const tariff_code =
    typeof codeRaw === 'number' && Number.isFinite(codeRaw)
      ? Math.floor(codeRaw)
      : typeof codeRaw === 'string' && /^\d+$/.test(codeRaw)
        ? parseInt(codeRaw, 10)
        : null;
  const delivery_sum = parseDeliverySumRub(
    o.delivery_sum ?? o.delivery_sum_total ?? o.total_sum ?? o.price
  );
  if (tariff_code == null || delivery_sum == null) return null;
  return {
    tariff_code,
    delivery_sum,
    period_min: typeof o.period_min === 'number' ? o.period_min : undefined,
    period_max: typeof o.period_max === 'number' ? o.period_max : undefined,
  };
}

function parseTariffOffersPayload(data: unknown): CdekTariffOffer[] {
  const raw = unwrapEntity(data) ?? data;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const list = o.tariff_codes ?? o.tariffs ?? (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(list)) return [];
  const out: CdekTariffOffer[] = [];
  for (const item of list) {
    const row = normalizeTariffOffer(item);
    if (row) out.push(row);
  }
  return out;
}

function unwrapEntity<T>(raw: unknown): T | null {
  if (raw && typeof raw === 'object' && 'entity' in (raw as object)) {
    return (raw as { entity: T }).entity;
  }
  return null;
}

export async function cdekResolveSenderCityCode(): Promise<number | null> {
  const code = process.env.CDEK_SENDER_CITY_CODE?.trim();
  if (code && /^\d+$/.test(code)) return parseInt(code, 10);
  const name = process.env.CDEK_SENDER_CITY?.trim();
  if (name) return cdekSuggestCityCode(name);
  return null;
}

/** Тарифы по маршруту (руб., сроки). */
export async function cdekTariffList(params: {
  fromCode: number;
  toCode: number;
}): Promise<CdekTariffOffer[]> {
  const pkg = cdekDefaultPackage();
  const body = {
    type: 1,
    currency: 1,
    lang: 'rus',
    from_location: { code: params.fromCode },
    to_location: { code: params.toCode },
    packages: [
      {
        weight: pkg.weightG,
        length: pkg.lengthCm,
        width: pkg.widthCm,
        height: pkg.heightCm,
      },
    ],
  };
  const { ok, data } = await cdekAuthorizedJson<Record<string, unknown>>('POST', '/calculator/tarifflist', body);
  if (!ok) return [];
  return parseTariffOffersPayload(data);
}

/** Расчёт одного тарифа (fallback, если tarifflist пустой). */
async function cdekCalculatorOneTariff(params: {
  fromCode: number;
  toCode: number;
  tariffCode: number;
}): Promise<CdekTariffOffer | null> {
  const pkg = cdekDefaultPackage();
  const body = {
    type: 1,
    currency: 1,
    lang: 'rus',
    tariff_code: params.tariffCode,
    from_location: { code: params.fromCode },
    to_location: { code: params.toCode },
    packages: [
      {
        weight: pkg.weightG,
        length: pkg.lengthCm,
        width: pkg.widthCm,
        height: pkg.heightCm,
      },
    ],
  };
  const { ok, data } = await cdekAuthorizedJson<Record<string, unknown>>('POST', '/calculator/tariff', body);
  if (!ok) return null;
  const raw = unwrapEntity(data) ?? data;
  const row = normalizeTariffOffer(raw);
  if (row) return row;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return normalizeTariffOffer({
      tariff_code: params.tariffCode,
      delivery_sum: o.delivery_sum ?? o.total_sum,
      period_min: o.period_min,
      period_max: o.period_max,
    });
  }
  return null;
}

function pickTariff(offers: CdekTariffOffer[], preferCode: number): CdekTariffOffer | null {
  const exact = offers.find((o) => o.tariff_code === preferCode);
  if (exact) return exact;
  const sorted = [...offers].filter((o) => typeof o.delivery_sum === 'number').sort((a, b) => a.delivery_sum - b.delivery_sum);
  return sorted[0] ?? null;
}

/**
 * Расчёт стоимости доставки СДЭК.
 *
 * По умолчанию клиенту показываем сумму из калькулятора СДЭК (`tariffRub`).
 * Запасной фикс — `CDEK_FIXED_DELIVERY_RUB` или `CDEK_FIXED_DELIVERY_ONLY=1`.
 */
export type CdekDeliveryQuoteCalc = {
  /** К оплате на сайте. */
  customerRub: number;
  /** Сумма по тарифу СДЭК API; null если калькулятор не ответил. */
  tariffRub: number | null;
  tariffCode: number;
  periodMin: number | null;
  periodMax: number | null;
};

function resolveCustomerDeliveryRub(tariffRub: number | null): number {
  const flat = cdekFlatDeliveryRub();
  if (!cdekPreferRealTariffPrice()) return flat;
  if (tariffRub != null && tariffRub > 0) return tariffRub;
  return 0;
}

export async function cdekCalculateDeliveryRub(params: {
  fromCode: number;
  toCode: number;
  mode: 'door' | 'pvz';
}): Promise<CdekDeliveryQuoteCalc> {
  let tariffCode = params.mode === 'pvz' ? cdekTariffPvz() : cdekTariffDoor();
  let periodMin: number | null = null;
  let periodMax: number | null = null;
  let tariffRub: number | null = null;

  const prefer = params.mode === 'pvz' ? cdekTariffPvz() : cdekTariffDoor();
  const alt = params.mode === 'pvz' ? cdekTariffDoor() : cdekTariffPvz();

  try {
    const offers = await cdekTariffList(params);
    if (offers.length > 0) {
      const picked = pickTariff(offers, prefer) ?? pickTariff(offers, alt);
      if (picked) {
        tariffCode = picked.tariff_code;
        periodMin = picked.period_min ?? null;
        periodMax = picked.period_max ?? null;
        tariffRub = picked.delivery_sum;
      }
    }
  } catch {
    /* tarifflist */
  }

  if (tariffRub == null) {
    for (const code of [prefer, alt]) {
      try {
        const one = await cdekCalculatorOneTariff({
          fromCode: params.fromCode,
          toCode: params.toCode,
          tariffCode: code,
        });
        if (one) {
          tariffCode = one.tariff_code;
          periodMin = one.period_min ?? null;
          periodMax = one.period_max ?? null;
          tariffRub = one.delivery_sum;
          break;
        }
      } catch {
        /* next tariff */
      }
    }
  }

  const customerRub = resolveCustomerDeliveryRub(tariffRub);
  return {
    customerRub,
    tariffRub,
    tariffCode,
    periodMin,
    periodMax,
  };
}

export function normalizeCdekPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) return `+7${d.slice(1)}`;
  if (d.length === 11 && d.startsWith('7')) return `+${d}`;
  if (d.length === 10) return `+7${d}`;
  if (raw.trim().startsWith('+')) return raw.trim();
  return `+${d}`;
}

export type CdekCreateOrderResult =
  | { ok: true; uuid: string; cdekNumber: string | null }
  | { ok: false; message: string };

/** Создание заказа в ЛК СДЭК (после оплаты на стороне магазина). */
export async function cdekCreateShipmentOrder(opts: {
  number: string;
  tariffCode: number;
  comment: string;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  /** Курьер: город + адрес. */
  toLocation: { code: number; postalCode?: string; address: string };
  /** ПВЗ: код офиса получателя. */
  deliveryPoint?: string | null;
  items: { name: string; wareKey: string; cost: number; weight: number; amount: number }[];
}): Promise<CdekCreateOrderResult> {
  const pkg = cdekDefaultPackage();
  const shipmentPoint = process.env.CDEK_SHIPMENT_POINT?.trim() || '';

  const packages = [
    {
      number: '1',
      weight: pkg.weightG,
      length: pkg.lengthCm,
      width: pkg.widthCm,
      height: pkg.heightCm,
      items: opts.items.map((it) => ({
        name: it.name.slice(0, 255),
        ware_key: it.wareKey.slice(0, 50),
        payment: { value: it.cost },
        cost: it.cost,
        weight: Math.max(1, it.weight),
        amount: it.amount,
      })),
    },
  ];

  const body: Record<string, unknown> = {
    type: 1,
    number: opts.number.slice(0, 40),
    tariff_code: opts.tariffCode,
    comment: opts.comment.slice(0, 255),
    recipient: {
      name: opts.recipientName.slice(0, 100),
      email: opts.recipientEmail.slice(0, 100),
      phones: [{ number: normalizeCdekPhone(opts.recipientPhone) }],
    },
    packages,
  };

  if (shipmentPoint) {
    body.shipment_point = shipmentPoint;
  } else {
    const senderName = process.env.CDEK_SENDER_NAME?.trim() || 'City Legend';
    const senderPhone = normalizeCdekPhone(process.env.CDEK_SENDER_PHONE?.trim() || '+79000000000');
    const senderAddr = process.env.CDEK_SENDER_ADDRESS?.trim() || '';
    let fromCode = Number(process.env.CDEK_SENDER_CITY_CODE || 0);
    if (!(fromCode > 0)) {
      const resolved = await cdekResolveSenderCityCode();
      if (resolved) fromCode = resolved;
    }
    if (fromCode > 0) {
      body.sender = {
        name: senderName,
        phones: [{ number: senderPhone }],
      };
      body.from_location = { code: fromCode, address: senderAddr };
    }
  }

  if (opts.deliveryPoint) {
    body.delivery_point = opts.deliveryPoint;
  } else {
    body.to_location = {
      code: opts.toLocation.code,
      postal_code: opts.toLocation.postalCode || undefined,
      address: opts.toLocation.address,
    };
  }

  const { ok, status, data } = await cdekAuthorizedJson<{
    entity?: { uuid?: string; cdek_number?: string; errors?: { message?: string }[] };
    requests?: { errors?: { message?: string }[] }[];
  }>('POST', '/orders', body);

  const entity = unwrapEntity<{ uuid?: string; cdek_number?: string }>(data) ?? (data as { entity?: { uuid?: string } }).entity;
  const uuid = entity && typeof entity.uuid === 'string' ? entity.uuid : null;
  if (ok && uuid) {
    const cn = entity && 'cdek_number' in entity && typeof (entity as { cdek_number?: string }).cdek_number === 'string'
      ? (entity as { cdek_number: string }).cdek_number
      : null;
    return { ok: true, uuid, cdekNumber: cn };
  }

  const msg =
    (data as { message?: string })?.message ||
    (data as { requests?: { errors?: { message?: string }[] }[] })?.requests?.[0]?.errors?.[0]?.message ||
    `СДЭК ${status}`;
  return { ok: false, message: msg };
}

/**
 * Удаляет/отменяет заказ в СДЭК по UUID.
 * Безопасно вызывать при отмене заказа на сайте — СДЭК вернёт ошибку, если заказ уже в пути
 * (статус не позволяет отмену), но не упадёт критически.
 */
export async function cdekDeleteOrder(uuid: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { ok, status, data } = await cdekAuthorizedJson<{
      entity?: { uuid?: string };
      requests?: { errors?: { message?: string }[] }[];
      message?: string;
    }>('DELETE', `/orders/${uuid}`);
    if (ok) return { ok: true, message: 'deleted' };
    const msg =
      (data as { message?: string })?.message ||
      (data as { requests?: { errors?: { message?: string }[] }[] })?.requests?.[0]?.errors?.[0]?.message ||
      `CDEK ${status}`;
    return { ok: false, message: msg };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

/**
 * Ждёт, пока СДЭК присвоит трек-номер (cdek_number) созданному заказу.
 * СДЭК обрабатывает заявку асинхронно, трек появляется обычно через 3–15 сек.
 */
export async function cdekPollTrackingNumber(
  uuid: string,
  { attempts = 8, intervalMs = 3000 }: { attempts?: number; intervalMs?: number } = {}
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const { ok, data } = await cdekAuthorizedJson<{
        entity?: { cdek_number?: string };
        cdek_number?: string;
      }>('GET', `/orders/${uuid}`);
      if (!ok) continue;
      const entity = unwrapEntity<{ cdek_number?: string }>(data) ?? (data as { entity?: { cdek_number?: string } }).entity;
      const cn = entity?.cdek_number ?? (data as { cdek_number?: string }).cdek_number;
      if (cn && typeof cn === 'string' && cn.trim()) return cn.trim();
    } catch {
      /* продолжаем опрос */
    }
  }
  return null;
}

/**
 * Регистрирует вебхук статусов СДЭК (ORDER_STATUS).
 * Безопасно вызывать повторно — если вебхук уже зарегистрирован, СДЭК не создаёт дубль.
 */
export async function cdekRegisterWebhook(webhookUrl: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { ok, status, data } = await cdekAuthorizedJson<{
      entity?: { uuid?: string };
      requests?: { errors?: { message?: string }[] }[];
    }>('POST', '/webhooks', {
      type: 'ORDER_STATUS',
      url: webhookUrl,
    });
    if (ok) return { ok: true, message: 'webhook registered' };
    const msg =
      (data as { message?: string })?.message ||
      (data as { requests?: { errors?: { message?: string }[] }[] })?.requests?.[0]?.errors?.[0]?.message ||
      `CDEK ${status}`;
    return { ok: false, message: msg };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

function readGeoCoord(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parsePvzLocation(loc: unknown): { address: string; lat?: number; lng?: number } {
  if (!loc || typeof loc !== 'object') return { address: '' };
  const o = loc as Record<string, unknown>;
  const address = typeof o.address === 'string' ? o.address : '';
  const lat = readGeoCoord(o.latitude ?? o.lat);
  const lng = readGeoCoord(o.longitude ?? o.lng ?? o.long);
  return {
    address,
    ...(lat !== undefined ? { lat } : {}),
    ...(lng !== undefined ? { lng } : {}),
  };
}

export type CdekPvzPoint = {
  code: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

function normalizeDeliveryPointsPayload(data: unknown): {
  code?: string;
  name?: string;
  location?: unknown;
}[] {
  if (Array.isArray(data)) return data as { code?: string; name?: string; location?: unknown }[];
  if (data && typeof data === 'object' && 'entity' in data) {
    const ent = (data as { entity: unknown }).entity;
    return Array.isArray(ent) ? (ent as { code?: string; name?: string; location?: unknown }[]) : [];
  }
  return [];
}

export async function cdekListDeliveryPoints(cityCode: number, size = 500): Promise<CdekPvzPoint[]> {
  const sz = Math.min(1000, Math.max(50, size));
  const { ok, data } = await cdekAuthorizedJson<unknown>(
    'GET',
    `/deliverypoints?city_code=${cityCode}&type=PVZ&size=${sz}`
  );
  if (!ok) return [];
  const list = normalizeDeliveryPointsPayload(data);
  return list
    .filter((x) => x.code)
    .map((x) => {
      const loc = parsePvzLocation(x.location);
      const address = loc.address || String(x.name || '');
      return {
        code: String(x.code),
        name: String(x.name || x.code),
        address,
        ...(loc.lat !== undefined ? { lat: loc.lat } : {}),
        ...(loc.lng !== undefined ? { lng: loc.lng } : {}),
      };
    });
}
