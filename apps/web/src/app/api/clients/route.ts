import { NextResponse } from 'next/server';
import { ClientRepository } from '@hour-tracker/database';
import {
  requireAuth,
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const clientRepo = new ClientRepository();

/**
 * GET /api/clients
 *
 * List clients for the authenticated user's tenant.
 * Supports pagination (`page`, `pageSize`) and optional `search` filter.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20));
    const search = url.searchParams.get('search')?.trim() || undefined;

    const offset = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      search
        ? clientRepo.searchByName(search, tenantId, { limit: pageSize, offset })
        : clientRepo.findByTenant(tenantId, { limit: pageSize, offset, orderBy: 'name' }),
      clientRepo.count(tenantId, search),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (err) {
    console.error('[GET /api/clients] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * POST /api/clients
 *
 * Create a new client. Requires admin role.
 */
export const POST = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const body = (await req.json()) as { name?: unknown };

    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (name.length === 0 || name.length > 255) {
      return NextResponse.json(
        { success: false, error: 'Name is required and must be between 1 and 255 characters.' },
        { status: 400 },
      );
    }

    const client = await clientRepo.create({ name } as Partial<import('@hour-tracker/types').Client>, tenantId);

    return NextResponse.json({ success: true, data: client }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/clients] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
