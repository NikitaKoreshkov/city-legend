/**
 * В БД иногда в массиве images оказывается логотип сайта — не грузим его как фото товара (LCP/трафик).
 */
const SITE_LOGO_BASENAMES = new Set([
  'logo.png',
  'logog.png',
  'cult-_1_-_1_.png',
  'favicon-32.png',
]);

export function isLikelySiteLogoUsedAsProductImage(src: string | undefined | null): boolean {
  if (!src || typeof src !== 'string') return true;
  const trimmed = src.trim();
  if (!trimmed) return true;
  let pathname = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) pathname = new URL(trimmed).pathname;
  } catch {
    /* локальный путь */
  }
  pathname = pathname.split('?')[0].split('#')[0].replace(/\\/g, '/');
  const decoded = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })().toLowerCase();
  const base = decoded.split('/').pop() || '';
  return SITE_LOGO_BASENAMES.has(base);
}
