/**
 * Sliding-window rate limiter keyed by client address.
 *
 * In-memory, so the window is per server instance. On a single Node server
 * that is exact; on serverless platforms each warm instance keeps its own
 * counts, which still caps abuse but less tightly. Move the buckets to a
 * shared store (Vercel KV, Redis, Azure Cache) before a serious launch.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until a request would be accepted again. 0 when ok. */
  retryAfter: number;
}

export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_KEYS) pruneExpired(cutoff);
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  bucket.hits.push(now);
  return { ok: true, remaining: limit - bucket.hits.length, retryAfter: 0 };
}

function pruneExpired(cutoff: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => t <= cutoff)) buckets.delete(key);
  }
}

/** Best-effort client identity: first forwarded address, else a shared local key. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

export function tooManyRequests(result: RateLimitResult, what: string) {
  return Response.json(
    { error: `Too many ${what} requests. Try again in ${result.retryAfter}s.` },
    { status: 429, headers: { "Retry-After": String(result.retryAfter) } }
  );
}
