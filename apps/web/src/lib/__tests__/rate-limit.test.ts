import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Tests — createRateLimiter
// ---------------------------------------------------------------------------

describe('createRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('basic allow / deny', () => {
    it('allows requests under the limit', () => {
      const limiter = createRateLimiter({ limit: 3, windowSeconds: 60 });

      expect(limiter.check('user-1')).toBeNull();
      expect(limiter.check('user-1')).toBeNull();
      expect(limiter.check('user-1')).toBeNull();
    });

    it('blocks requests that exceed the limit', () => {
      const limiter = createRateLimiter({ limit: 2, windowSeconds: 60 });

      expect(limiter.check('user-1')).toBeNull(); // 1st
      expect(limiter.check('user-1')).toBeNull(); // 2nd
      const blocked = limiter.check('user-1');     // 3rd — over limit

      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);
    });

    it('returns a JSON body with error message on block', async () => {
      const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });

      limiter.check('user-1'); // allowed
      const blocked = limiter.check('user-1'); // blocked

      expect(blocked).not.toBeNull();
      const body = await blocked!.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/too many requests/i);
    });

    it('includes Retry-After header on 429 response', () => {
      const limiter = createRateLimiter({ limit: 1, windowSeconds: 30 });

      limiter.check('user-1');
      const blocked = limiter.check('user-1');

      expect(blocked).not.toBeNull();
      const retryAfter = blocked!.headers.get('Retry-After');
      expect(retryAfter).toBeDefined();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(Number(retryAfter)).toBeLessThanOrEqual(30);
    });
  });

  describe('per-key isolation', () => {
    it('tracks different keys independently', () => {
      const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });

      expect(limiter.check('user-a')).toBeNull();
      expect(limiter.check('user-b')).toBeNull();

      // user-a is now blocked, but user-b still had only 1 request
      expect(limiter.check('user-a')).not.toBeNull();
      expect(limiter.check('user-b')).not.toBeNull();
    });

    it('blocking one key does not affect another', () => {
      const limiter = createRateLimiter({ limit: 2, windowSeconds: 60 });

      // Exhaust user-a
      limiter.check('user-a');
      limiter.check('user-a');
      expect(limiter.check('user-a')).not.toBeNull(); // blocked

      // user-b is unaffected
      expect(limiter.check('user-b')).toBeNull();
      expect(limiter.check('user-b')).toBeNull();
    });
  });

  describe('window expiration', () => {
    it('resets the counter after the window expires', () => {
      const limiter = createRateLimiter({ limit: 1, windowSeconds: 10 });

      expect(limiter.check('user-1')).toBeNull();
      expect(limiter.check('user-1')).not.toBeNull(); // blocked

      // Advance time past the window
      jest.advanceTimersByTime(11_000);

      // Should be allowed again after window reset
      expect(limiter.check('user-1')).toBeNull();
    });

    it('does not reset before the window expires', () => {
      const limiter = createRateLimiter({ limit: 1, windowSeconds: 10 });

      expect(limiter.check('user-1')).toBeNull();

      // Advance to just before the window expires
      jest.advanceTimersByTime(9_000);

      expect(limiter.check('user-1')).not.toBeNull(); // still blocked
    });
  });

  describe('limit = 1 (strictest case)', () => {
    it('allows exactly one request then blocks', () => {
      const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });

      expect(limiter.check('key')).toBeNull();
      expect(limiter.check('key')).not.toBeNull();
      expect(limiter.check('key')).not.toBeNull();
    });
  });

  describe('large limit', () => {
    it('allows many requests up to the limit', () => {
      const limit = 100;
      const limiter = createRateLimiter({ limit, windowSeconds: 60 });

      for (let i = 0; i < limit; i++) {
        expect(limiter.check('user-1')).toBeNull();
      }

      // The next request should be blocked
      expect(limiter.check('user-1')).not.toBeNull();
    });
  });

  describe('Retry-After header accuracy', () => {
    it('decreases as time passes within the window', () => {
      const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });

      limiter.check('user-1'); // allowed

      // Block immediately
      const blocked1 = limiter.check('user-1');
      const retryAfter1 = Number(blocked1!.headers.get('Retry-After'));

      // Advance 30 seconds
      jest.advanceTimersByTime(30_000);

      const blocked2 = limiter.check('user-1');
      const retryAfter2 = Number(blocked2!.headers.get('Retry-After'));

      // Retry-After should be roughly 30s less
      expect(retryAfter2).toBeLessThan(retryAfter1);
      expect(retryAfter2).toBeLessThanOrEqual(30);
    });
  });

  describe('multiple windows', () => {
    it('allows full quota in each successive window', () => {
      const limiter = createRateLimiter({ limit: 2, windowSeconds: 5 });

      // Window 1
      expect(limiter.check('user-1')).toBeNull();
      expect(limiter.check('user-1')).toBeNull();
      expect(limiter.check('user-1')).not.toBeNull();

      // Advance past window
      jest.advanceTimersByTime(6_000);

      // Window 2
      expect(limiter.check('user-1')).toBeNull();
      expect(limiter.check('user-1')).toBeNull();
      expect(limiter.check('user-1')).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — getClientIp
// ---------------------------------------------------------------------------

describe('getClientIp', () => {
  it('extracts the first IP from X-Forwarded-For header', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '192.168.1.1, 10.0.0.1, 172.16.0.1' },
    });

    expect(getClientIp(request)).toBe('192.168.1.1');
  });

  it('returns the single IP when X-Forwarded-For has one value', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '203.0.113.50' },
    });

    expect(getClientIp(request)).toBe('203.0.113.50');
  });

  it('trims whitespace from the extracted IP', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '  192.168.1.1  , 10.0.0.1' },
    });

    expect(getClientIp(request)).toBe('192.168.1.1');
  });

  it('returns "unknown" when X-Forwarded-For header is absent', () => {
    const request = new Request('http://localhost/api/test');

    expect(getClientIp(request)).toBe('unknown');
  });

  it('handles IPv6 addresses in X-Forwarded-For', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Forwarded-For': '::1, 192.168.1.1' },
    });

    expect(getClientIp(request)).toBe('::1');
  });

  it('returns "unknown" when headers object exists but X-Forwarded-For is missing', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(getClientIp(request)).toBe('unknown');
  });
});
