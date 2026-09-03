/**
 * Единые сведения для юридических страниц (РФ).
 * При публикации укажите NEXT_PUBLIC_LEGAL_ENTITY_NAME, при наличии — ИНН, ОГРН/ОГРНИП, адрес.
 */

export const SITE_BRAND =
  typeof process.env.NEXT_PUBLIC_SITE_BRAND_NAME === 'string' &&
  process.env.NEXT_PUBLIC_SITE_BRAND_NAME.trim()
    ? process.env.NEXT_PUBLIC_SITE_BRAND_NAME.trim()
    : 'Бижутерия';

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || 'contact@example.com';

/** Отображаемый номер (совпадает с основным контактным на сайте). */
export const CONTACT_PHONE =
  process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || '+7 (965) 231-60-18';

/** E.164 для schema.org и ссылок tel: */
export const CONTACT_PHONE_E164 =
  process.env.NEXT_PUBLIC_CONTACT_PHONE_E164?.trim() || '+79652316018';

/** Публичный адрес сайта для документов и SEO; на проде задайте NEXT_PUBLIC_SITE_URL. */
export const CANONICAL_SITE_URL = 'https://citylegend.art';

/**
 * URL сайта для юридических текстов (политики, оферта).
 * Пустой env или localhost — подставляется официальный домен, чтобы в документах не оставался тестовый адрес.
 */
export function siteUrlDisplay(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return CANONICAL_SITE_URL.replace(/\/$/, '');
  const normalized = raw.replace(/\/$/, '');
  try {
    const parsed = new URL(normalized.match(/^https?:\/\//i) ? normalized : `https://${normalized}`);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return CANONICAL_SITE_URL.replace(/\/$/, '');
    }
  } catch {
    /* оставляем как есть */
  }
  return normalized;
}

const DEFAULT_LEGAL_ENTITY =
  'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ААРОН СТУДИО"';
const DEFAULT_LEGAL_INN = '5262257450';
const DEFAULT_LEGAL_ADDRESS =
  '603022, РОССИЯ, НИЖЕГОРОДСКАЯ ОБЛАСТЬ, Г.О. ГОРОД НИЖНИЙ НОВГОРОД, Г НИЖНИЙ НОВГОРОД, УЛ 1-Я ОРАНЖЕРЕЙНАЯ, Д. 24А, КВ. 348';

export function operatorEntityName(): string {
  return process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME?.trim() || DEFAULT_LEGAL_ENTITY;
}

export function operatorInn(): string {
  return process.env.NEXT_PUBLIC_LEGAL_INN?.trim() || DEFAULT_LEGAL_INN;
}

export function operatorOgrn(): string {
  return process.env.NEXT_PUBLIC_LEGAL_OGRN?.trim() || '';
}

export function operatorLegalAddress(): string {
  const a = process.env.NEXT_PUBLIC_LEGAL_ADDRESS?.trim();
  return a || DEFAULT_LEGAL_ADDRESS;
}
