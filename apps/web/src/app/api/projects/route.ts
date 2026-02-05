import { NextResponse } from 'next/server';
import { ProjectRepository, ClientRepository } from '@hour-tracker/database';
import {
  requireAuth,
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import type { Project } from '@hour-tracker/types';

const projectRepo = new ProjectRepository();
const clientRepo = new ClientRepository();

/**
 * GET /api/projects
 *
 * List projects for the authenticated user's tenant.
 * Supports pagination (`page`, `pageSize`) and optional `clientId` filter.
 * Each project includes the parent client name.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20));
    const clientId = url.searchParams.get('clientId') || undefined;
    const offset = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      projectRepo.findWithClientName(tenantId, { limit: pageSize, offset, clientId }),
      projectRepo.count(tenantId, clientId),
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
    console.error('[GET /api/projects] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * POST /api/projects
 *
 * Create a new project. Requires admin role.
 * Body: { name: string, clientId: string, isBillable?: boolean }
 */
export const POST = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const body = (await req.json()) as {
      name?: unknown;
      clientId?: unknown;
      isBillable?: unknown;
    };

    // --- Validate name ---
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0 || name.length > 255) {
      return NextResponse.json(
        { success: false, error: 'Name is required and must be between 1 and 255 characters.' },
        { status: 400 },
      );
    }

    // --- Validate clientId ---
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
    if (!clientId) {
      return NextResponse.json(
        { success: false, error: 'clientId is required.' },
        { status: 400 },
      );
    }

    const client = await clientRepo.findById(clientId, tenantId);
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Client not found in this tenant.' },
        { status: 400 },
      );
    }

    // --- Validate isBillable ---
    const isBillable = typeof body.isBillable === 'boolean' ? body.isBillable : true;

    const project = await projectRepo.create(
      { name, clientId, isBillable } as Partial<Project>,
      tenantId,
    );

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/projects] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
