import { NextResponse } from 'next/server';
import { ClientRepository } from '@hour-tracker/database';
import {
  requireAuth,
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const clientRepo = new ClientRepository();

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/clients/:id
 *
 * Fetch a single client by ID.  Returns 404 if the client does not exist
 * or belongs to a different tenant.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;

    const client = await clientRepo.findById(id, tenantId);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Client not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: client });
  } catch (err) {
    console.error('[GET /api/clients/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/clients/:id
 *
 * Update an existing client. Requires admin role.
 */
export const PUT = requireRole('admin')(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as { name?: unknown };

    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (name.length === 0 || name.length > 255) {
      return NextResponse.json(
        { success: false, error: 'Name is required and must be between 1 and 255 characters.' },
        { status: 400 },
      );
    }

    // Verify the client exists and belongs to this tenant before updating.
    const existing = await clientRepo.findById(id, tenantId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Client not found.' },
        { status: 404 },
      );
    }

    const updated = await clientRepo.update(
      id,
      { name } as Partial<import('@hour-tracker/types').Client>,
      tenantId,
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[PUT /api/clients/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/clients/:id
 *
 * Soft-delete a client. Requires admin role.
 * Returns 204 No Content on success.
 */
export const DELETE = requireRole('admin')(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;

    // Verify the client exists and belongs to this tenant.
    const existing = await clientRepo.findById(id, tenantId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Client not found.' },
        { status: 404 },
      );
    }

    await clientRepo.softDelete(id, tenantId);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[DELETE /api/clients/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
