import { NextResponse } from 'next/server';
import { ClientRepository, query, writeAuditLog } from '@hour-tracker/database';
import {
  requireAuth,
  requireRole,
  getTenantId,
  getUserId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const clientRepo = new ClientRepository();

/**
 * GET /api/clients
 *
 * List clients for the authenticated user's tenant.
 * Supports pagination (`page`, `pageSize`) and optional `search` filter.
 * Each item includes `projectCount` — the number of active projects.
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

    // Fetch project counts for each client in a single query.
    const clientIds = items.map((c) => c.id);
    let projectCounts: Record<string, number> = {};

    if (clientIds.length > 0) {
      const placeholders = clientIds.map((_, i) => `$${i + 2}`).join(', ');
      const rows = await query<{ client_id: string; count: string }>({
        sql: `SELECT client_id, COUNT(*)::int AS count FROM projects WHERE tenant_id = $1 AND client_id IN (${placeholders}) AND deleted_at IS NULL GROUP BY client_id`,
        params: [tenantId, ...clientIds],
      });
      projectCounts = Object.fromEntries(rows.map((r) => [r.client_id, Number(r.count)]));
    }

    const itemsWithCount = items.map((c) => ({
      ...c,
      projectCount: projectCounts[c.id] ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        items: itemsWithCount,
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

    writeAuditLog({
      tenantId,
      userId: getUserId(req),
      action: 'create',
      entityType: 'client',
      entityId: client.id,
      afterData: client as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, data: client }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/clients] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
