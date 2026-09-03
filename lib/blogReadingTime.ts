/** Примерная длительность чтения для русскоязычного текста (~200 слов/мин). */
export function estimateReadingMinutes(text: string): number {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 1;
  const words = t.split(' ').filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
