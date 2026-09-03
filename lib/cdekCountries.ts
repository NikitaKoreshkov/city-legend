/** Страны для подсказок городов СДЭК (ISO 3166-1 alpha-2). «Все» — объединённый запрос к API. */
export const CDEK_MULTI_COUNTRY_CODES =
  'RU,BY,KZ,AM,KG,AZ,UZ,MD,GE,TJ,TM,LT,LV,EE,PL,FI,DE,TR,CN,CZ,IT,FR,ES,NL,BE,AT,CH';

export const CDEK_COUNTRY_OPTIONS: { code: string; name: string }[] = [
  { code: 'ALL', name: 'Все страны' },
  { code: 'RU', name: 'Россия' },
  { code: 'BY', name: 'Беларусь' },
  { code: 'KZ', name: 'Казахстан' },
  { code: 'AM', name: 'Армения' },
  { code: 'KG', name: 'Киргизия' },
  { code: 'AZ', name: 'Азербайджан' },
  { code: 'UZ', name: 'Узбекистан' },
  { code: 'MD', name: 'Молдова' },
  { code: 'GE', name: 'Грузия' },
  { code: 'TJ', name: 'Таджикистан' },
  { code: 'TM', name: 'Туркменистан' },
  { code: 'LT', name: 'Литва' },
  { code: 'LV', name: 'Латвия' },
  { code: 'EE', name: 'Эстония' },
  { code: 'PL', name: 'Польша' },
  { code: 'FI', name: 'Финляндия' },
  { code: 'DE', name: 'Германия' },
  { code: 'TR', name: 'Турция' },
  { code: 'CN', name: 'Китай' },
  { code: 'CZ', name: 'Чехия' },
  { code: 'IT', name: 'Италия' },
  { code: 'FR', name: 'Франция' },
  { code: 'ES', name: 'Испания' },
  { code: 'NL', name: 'Нидерланды' },
  { code: 'BE', name: 'Бельгия' },
  { code: 'AT', name: 'Австрия' },
  { code: 'CH', name: 'Швейцария' },
];

export function cdekCountryCodesParam(iso: string): string {
  if (iso === 'ALL') return CDEK_MULTI_COUNTRY_CODES;
  return iso;
}
