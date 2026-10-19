import { LRUCache } from "lru-cache";

const store = new LRUCache<string, number[]>({ max: 10_000 });

export function checkRateLimit(
  userId: string,
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean } {
  const cacheKey = `${key}:${userId}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const hits = (store.get(cacheKey) ?? []).filter((t) => t > windowStart);

  if (hits.length >= max) {
    store.set(cacheKey, hits);
    return { allowed: false };
  }

  hits.push(now);
  store.set(cacheKey, hits);
  return { allowed: true };
}
