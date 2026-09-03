/**
 * Нормализует номер для сравнения и уникальности: только цифры (без +).
 * Пустая строка — невалидно для привязки к аккаунту.
 */
export function normalizePhoneKey(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (!/^\+?\d{7,15}$/.test(cleaned)) return '';
  return cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
}
