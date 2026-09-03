/**
 * Кодирует публичные пути и URL для src / CSS url(...).
 * Сырой не-ASCII в путях (например /ф.mp4) вызывает у Next/undici
 * TypeError: Cannot convert argument to a ByteString (заголовки HTTP).
 */

import { resolveLegacyMediaPath } from '@/lib/legacyMediaRedirects';
import { siteBaseUrl } from '@/lib/seoMeta';

function encodePathSegments(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(decodeURIComponent(seg)) : ''))
    .join('/');
}

/**
 * Возвращает безопасный URL для <img src>, <video src>, next/image и т.д.
 * Относительные пути кодируются; абсолютные http(s) возвращаются как есть.
 */
export function publicMediaUrl(raw: string | undefined | null): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      u.pathname = encodePathSegments(u.pathname);
      return u.toString();
    } catch {
      return trimmed;
    }
  }

  let path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const qIdx = path.indexOf('?');
  const query = qIdx >= 0 ? path.slice(qIdx) : '';
  const pathOnly = qIdx >= 0 ? path.slice(0, qIdx) : path;

  const legacy = resolveLegacyMediaPath(pathOnly);
  const resolved = legacy ?? pathOnly;
  return `${encodePathSegments(resolved)}${query}`;
}

/**
 * URL для next/image. В production — абсолютный https-URL: в standalone
 * оптимизатор не читает symlink public/uploads и часть файлов из public/.
 */
export function nextImageMediaUrl(raw: string | undefined | null): string {
  const url = publicMediaUrl(raw);
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (process.env.NODE_ENV === 'production') {
    const base = siteBaseUrl();
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
  }
  return url;
}

/** URL через next/image для случаев, где нужен обычный <img> (зум, fullscreen). */
export function optimizedMediaSrc(
  raw: string | undefined | null,
  width: number,
  quality = 75
): string {
  const url = nextImageMediaUrl(raw);
  if (!url) return '';
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}

/** Путь ведёт в /uploads/ (товарные фото из админки). */
export function isUploadMediaPath(raw: string | undefined | null): boolean {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return false;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).pathname.startsWith('/uploads/');
    }
  } catch {
    /* локальный путь */
  }
  const pathOnly = (trimmed.startsWith('/') ? trimmed : `/${trimmed}`).split('?')[0].split('#')[0];
  return pathOnly.startsWith('/uploads/');
}
