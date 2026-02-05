import { NextResponse } from 'next/server';
import {
  requireAuth,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

/**
 * GET /api/users/me
 *
 * Return the currently authenticated user's basic info from the JWT.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest) => {
  return NextResponse.json({
    success: true,
    data: {
      id: req.user.id,
      email: req.user.email,
      tenantId: req.user.tenantId,
      role: req.user.role,
    },
  });
});
