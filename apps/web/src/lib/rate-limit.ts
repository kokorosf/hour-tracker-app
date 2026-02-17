import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Not shared across server instances — suitable for single-process dev/staging.
 * For production with multiple instances, swap this for a Redis-backed version.
 */
export function createRateLimiter(opts: {
  /** Maximum requests allowed in the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
}) {
  const store = new Map<string, RateLimitEntry>();

  // Periodically evict expired entries to prevent memory leaks.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000).unref();

  return {
    /**
     * Check whether the given key has exceeded its rate limit.
     * Returns `null` if allowed, or a 429 `NextResponse` if blocked.
     */
    check(key: string): NextResponse | null {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || entry.resetAt <= now) {
        store.set(key, { count: 1, resetAt: now + opts.windowSeconds * 1000 });
        return null;
      }

      entry.count++;
      if (entry.count > opts.limit) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return NextResponse.json(
          { success: false, error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
          },
        );
      }

      return null;
    },
  };
}

/**
 * Extract a rate-limit key from a request.
 * Uses the X-Forwarded-For header (first IP) or falls back to a generic key.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return 'unknown';
}
