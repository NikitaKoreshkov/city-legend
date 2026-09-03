const STORAGE_KEY = 'kamni_compare_auction_ids';
export const COMPARE_MAX = 4;

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
}

export function getCompareIds(): number[] {
  if (typeof window === 'undefined') return [];
  return parseIds(window.localStorage.getItem(STORAGE_KEY));
}

export function setCompareIds(ids: number[]): void {
  if (typeof window === 'undefined') return;
  const unique = [...new Set(ids)].slice(0, COMPARE_MAX);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  window.dispatchEvent(new CustomEvent('compareStorageChanged'));
}

export type AddCompareResult =
  | { ok: true }
  | { ok: false; reason: 'duplicate' | 'full' | 'invalid' };

export function addCompareId(id: number): AddCompareResult {
  if (!Number.isFinite(id) || id < 1) return { ok: false, reason: 'invalid' };
  const cur = getCompareIds();
  if (cur.includes(id)) return { ok: false, reason: 'duplicate' };
  if (cur.length >= COMPARE_MAX) return { ok: false, reason: 'full' };
  setCompareIds([...cur, id]);
  return { ok: true };
}

export function removeCompareId(id: number): void {
  setCompareIds(getCompareIds().filter((x) => x !== id));
}

export function clearCompare(): void {
  setCompareIds([]);
}
