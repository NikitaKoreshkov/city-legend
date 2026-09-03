/** Форматирование значений фильтров для таблицы сравнения */

export type FilterMeta = { id: number; name: string; type: string };

export function formatFilterCell(type: string, raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string' && raw.trim() === '') return '';
  if (type === 'checkbox') {
    if (!Array.isArray(raw)) return String(raw);
    return raw.map((x) => String(x).trim()).filter(Boolean).join(', ');
  }
  if (type === 'range' && typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const o = raw as { min?: unknown; max?: unknown };
    const min = o.min != null && String(o.min).trim() !== '' ? String(o.min) : '';
    const max = o.max != null && String(o.max).trim() !== '' ? String(o.max) : '';
    if (!min && !max) return '';
    if (min && max) return `${min} — ${max}`;
    return min || max;
  }
  return String(raw).trim();
}

export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

type Cert = { url?: string; type?: string };

export function certificatesSummary(certs: unknown, legacyUrl?: string | null): string {
  let list: Cert[] = [];
  if (Array.isArray(certs)) {
    list = certs as Cert[];
  } else if (typeof certs === 'string') {
    try {
      const p = JSON.parse(certs) as unknown;
      if (Array.isArray(p)) list = p as Cert[];
    } catch {
      /* ignore */
    }
  }
  const parts: string[] = [];
  const imgs = list.filter((c) => c?.type === 'image').length;
  const pdfs = list.filter((c) => c?.type === 'pdf').length;
  if (imgs) parts.push(`${imgs} фото`);
  if (pdfs) parts.push(`${pdfs} PDF`);
  if (legacyUrl && String(legacyUrl).trim()) {
    parts.push('ссылка (legacy)');
  }
  return parts.join(', ');
}

export function allFormattedEqual(strings: string[]): boolean {
  if (strings.length <= 1) return true;
  const n = strings[0].trim();
  return strings.every((s) => s.trim() === n);
}
