import { NextResponse } from 'next/server';
import { UserRepository } from '@hour-tracker/database';
import {
  requireRole,
  getTenantId,
  getUserId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import type { User } from '@hour-tracker/types';

const userRepo = new UserRepository();

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * PUT /api/users/:id
 *
 * Update a user's role. Requires admin role.
 * Body: { role: 'admin' | 'user' }
 *
 * Admins cannot change their own role.
 */
export const PUT = requireRole('admin')(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const currentUserId = getUserId(req);
    const { id } = await ctx.params;

    // --- Cannot change own role ---
    if (id === currentUserId) {
      return NextResponse.json(
        { success: false, error: 'You cannot change your own role.' },
        { status: 400 },
      );
    }

    const body = (await req.json()) as { role?: unknown };

    // --- Validate role ---
    const role = body.role === 'admin' || body.role === 'user' ? body.role : null;
    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role must be "admin" or "user".' },
        { status: 400 },
      );
    }

    // --- Verify user exists ---
    const existing = await userRepo.findById(id, tenantId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 },
      );
    }

    const updated = await userRepo.update(id, { role } as Partial<User>, tenantId);

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[PUT /api/users/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/users/:id
 *
 * Permanently delete (deactivate) a user. Requires admin role.
 * Users table has no soft-delete, so this is a hard delete.
 *
 * Admins cannot deactivate themselves.
 * Returns 204 No Content on success.
 */
export const DELETE = requireRole('admin')(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const currentUserId = getUserId(req);
    const { id } = await ctx.params;

    if (id === currentUserId) {
      return NextResponse.json(
        { success: false, error: 'You cannot deactivate your own account.' },
        { status: 400 },
      );
    }

    const existing = await userRepo.findById(id, tenantId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 },
      );
    }

    await userRepo.hardDelete(id, tenantId);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[DELETE /api/users/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
