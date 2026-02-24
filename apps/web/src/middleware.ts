import { NextRequest, NextResponse } from 'next/server';

/**
 * CSRF protection via Origin header validation.
 *
 * State-changing requests (POST/PUT/PATCH/DELETE) to API routes must include
 * an Origin or Referer header that matches the application's host. This
 * prevents cross-site request forgery even though the app already uses
 * Bearer token auth (defense-in-depth).
 *
 * Exceptions:
 * - GET/HEAD/OPTIONS requests (safe methods)
 * - NextAuth routes (handled by NextAuth's own CSRF protection)
 * - Cron/webhook routes (authenticated via secret headers)
 * - Requests without an Origin header (non-browser clients like curl/Postman)
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CSRF_EXEMPT_PATHS = [
  '/api/auth/',       // NextAuth handles its own CSRF
  '/api/cron/',       // Authenticated via CRON_SECRET header
  '/api/telegram/',   // Authenticated via bot token
  '/api/mcp',         // Authenticated via Bearer token from AI agents
];

function isExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const { method, nextUrl, headers } = request;

  // Only validate state-changing requests to API routes
  if (SAFE_METHODS.has(method) || !nextUrl.pathname.startsWith('/api/') || isExempt(nextUrl.pathname)) {
    return NextResponse.next();
  }

  const origin = headers.get('origin');
  const referer = headers.get('referer');

  // Allow requests without Origin (non-browser clients)
  if (!origin && !referer) {
    return NextResponse.next();
  }

  const allowedHost = nextUrl.host;

  // Validate Origin header
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === allowedHost) {
        return NextResponse.next();
      }
    } catch {
      // Invalid origin URL — reject
    }
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost === allowedHost) {
        return NextResponse.next();
      }
    } catch {
      // Invalid referer URL — reject
    }
  }

  return NextResponse.json(
    { success: false, error: 'CSRF validation failed: origin mismatch.' },
    { status: 403 },
  );
}

export const config = {
  matcher: '/api/:path*',
};
