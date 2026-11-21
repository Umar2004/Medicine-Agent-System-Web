import "server-only";

// In-memory limiter — fine for a single Docker instance (see MASTER_PROMPT hosting).
// Move to the database or Redis if the app is ever scaled horizontally.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

function activeBucket(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key);
  if (bucket && bucket.resetAt <= now) {
    buckets.delete(key);
    return undefined;
  }
  return bucket;
}

export function checkRateLimit(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = activeBucket(key, now);
  if (bucket && bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordHit(key: string, windowMs: number): void {
  const now = Date.now();
  const bucket = activeBucket(key, now);
  if (bucket) bucket.count += 1;
  else buckets.set(key, { count: 1, resetAt: now + windowMs });
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Login: 5 failed attempts per 15 minutes per username. */
export const LOGIN_LIMIT = { attempts: 5, windowMs: 15 * 60 * 1000 } as const;
export const loginKey = (username: string) => `login:${username.trim().toLowerCase()}`;
