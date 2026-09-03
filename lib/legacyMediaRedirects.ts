/**
 * Наследованные публичные пути (в т.ч. кириллица в URL). Браузер часто запрашивает
 * percent-encoded вариант — middleware декодирует pathname и отдаёт 308 на актуальный файл.
 */
export const LEGACY_MEDIA_REDIRECTS: Record<string, string> = {
  '/ф.mp4': '/hero-main.mp4',
};

/** Путь без query — как в URL, или после decodeURIComponent (старые данные в БД). */
export function resolveLegacyMediaPath(pathWithoutQuery: string): string | null {
  const direct = LEGACY_MEDIA_REDIRECTS[pathWithoutQuery];
  if (direct) return direct;
  try {
    const dec = decodeURIComponent(pathWithoutQuery);
    if (dec !== pathWithoutQuery) {
      return LEGACY_MEDIA_REDIRECTS[dec] ?? null;
    }
  } catch {
    /* */
  }
  return null;
}
