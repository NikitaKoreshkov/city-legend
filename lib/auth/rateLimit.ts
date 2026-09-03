type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

function prune(now: number) {
  for (const [k, v] of store) {
    if (now > v.resetAt) store.delete(k);
  }
}

/** true = разрешено, false = слишком много запросов */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): boolean {
  const now = Date.now();
  if (store.size > 10_000) prune(now);

  const b = store.get(key);
  if (!b || now > b.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
