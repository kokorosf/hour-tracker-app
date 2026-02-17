import { NextRequest, NextResponse } from 'next/server';
import { decode } from 'next-auth/jwt';
import type { ExtendedUser } from '@hour-tracker/types';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A `NextRequest` that has been validated by {@link requireAuth} and is
 * guaranteed to carry a `.user` property.
 */
export interface AuthenticatedRequest extends NextRequest {
  user: ExtendedUser;
}

/**
 * Route handler signature that receives an {@link AuthenticatedRequest}.
 */
type AuthenticatedHandler = (
  req: AuthenticatedRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<NextResponse> | NextResponse;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is not set');
  }
  return secret;
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * Extract the bearer token from the `Authorization` header.
 * Returns `null` when the header is missing or malformed.
 */
function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

/**
 * Decode and validate the JWT, returning the embedded user claims.
 * Returns `null` when the token is missing, expired, or invalid.
 */
async function decodeToken(req: NextRequest): Promise<ExtendedUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  try {
    const payload = await decode({
      token,
      secret: getSecret(),
      salt: 'authjs.session-token',
    });

    if (
      !payload ||
      typeof payload.userId !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.tenantId !== 'string' ||
      typeof payload.role !== 'string'
    ) {
      return null;
    }

    return {
      id: payload.userId,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role as 'admin' | 'user',
    };
  } catch (err) {
    console.error('[auth middleware] token decode failed:', (err as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// General API rate limiter
// ---------------------------------------------------------------------------

/**
 * Rate limiter applied to all authenticated API endpoints.
 * 100 requests per 60 seconds per IP — generous enough for normal use but
 * protects against abuse.
 */
const apiRateLimiter = createRateLimiter({ limit: 100, windowSeconds: 60 });

// ---------------------------------------------------------------------------
// Middleware wrappers
// ---------------------------------------------------------------------------

/**
 * Wrap a route handler so that it only executes when the request carries a
 * valid JWT in the `Authorization: Bearer <token>` header.
 *
 * The decoded user is attached to the request as `req.user`.
 *
 * A general rate limit (100 req/min per IP) is applied to all routes
 * wrapped with this middleware.
 *
 * ```ts
 * export const GET = requireAuth(async (req) => {
 *   const tenantId = getTenantId(req);
 *   // …
 * });
 * ```
 */
export function requireAuth(handler: AuthenticatedHandler) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    // Apply general rate limiting before authentication.
    const blocked = apiRateLimiter.check(getClientIp(req));
    if (blocked) return blocked;

    const user = await decodeToken(req);

    if (!user) {
      return jsonError('Authentication required.', 401);
    }

    (req as AuthenticatedRequest).user = user;
    return handler(req as AuthenticatedRequest, ctx);
  };
}

/**
 * Like {@link requireAuth}, but additionally verifies that the authenticated
 * user has the specified role.  Returns `403` when the role doesn't match.
 *
 * ```ts
 * export const DELETE = requireRole('admin')(async (req) => {
 *   // only admins reach this code
 * });
 * ```
 */
export function requireRole(role: 'admin' | 'user') {
  return (handler: AuthenticatedHandler) => {
    return requireAuth(async (req, ctx) => {
      if (req.user.role !== role) {
        return jsonError('Insufficient permissions.', 403);
      }
      return handler(req, ctx);
    });
  };
}

// ---------------------------------------------------------------------------
// Accessor helpers
// ---------------------------------------------------------------------------

/** Return the tenant UUID from an authenticated request. */
export function getTenantId(req: AuthenticatedRequest): string {
  return req.user.tenantId;
}

/** Return the user UUID from an authenticated request. */
export function getUserId(req: AuthenticatedRequest): string {
  return req.user.id;
}

/** Return the user's role from an authenticated request. */
export function getUserRole(req: AuthenticatedRequest): 'admin' | 'user' {
  return req.user.role;
}

/** Check whether the authenticated user is an admin. */
export function isAdmin(req: AuthenticatedRequest): boolean {
  return req.user.role === 'admin';
}
