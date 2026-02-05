import { NextResponse } from 'next/server';
import {
  ProjectRepository,
  ClientRepository,
  TaskRepository,
  transaction,
} from '@hour-tracker/database';
import {
  requireAuth,
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import type { Project } from '@hour-tracker/types';

const projectRepo = new ProjectRepository();
const clientRepo = new ClientRepository();
const taskRepo = new TaskRepository();

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id
 *
 * Fetch a single project with client name.
 * Returns 404 if the project does not exist or belongs to a different tenant.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;

    const project = await projectRepo.findByIdWithClientName(id, tenantId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: project });
  } catch (err) {
    console.error('[GET /api/projects/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/projects/:id
 *
 * Update an existing project. Requires admin role.
 * Body: { name?: string, clientId?: string, isBillable?: boolean }
 */
export const PUT = requireRole('admin')(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      name?: unknown;
      clientId?: unknown;
      isBillable?: unknown;
    };

    // --- Verify project exists ---
    const existing = await projectRepo.findById(id, tenantId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Project not found.' },
        { status: 404 },
      );
    }

    // --- Build update payload, validating each provided field ---
    const updates: Partial<Project> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length === 0 || name.length > 255) {
        return NextResponse.json(
          { success: false, error: 'Name must be between 1 and 255 characters.' },
          { status: 400 },
        );
      }
      updates.name = name;
    }

    if (body.clientId !== undefined) {
      const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
      if (!clientId) {
        return NextResponse.json(
          { success: false, error: 'clientId must be a non-empty string.' },
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
      updates.clientId = clientId;
    }

    if (body.isBillable !== undefined) {
      if (typeof body.isBillable !== 'boolean') {
        return NextResponse.json(
          { success: false, error: 'isBillable must be a boolean.' },
          { status: 400 },
        );
      }
      updates.isBillable = body.isBillable;
    }

    const updated = await projectRepo.update(id, updates, tenantId);

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[PUT /api/projects/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/projects/:id
 *
 * Soft-delete a project **and** all its tasks. Requires admin role.
 * Both operations run inside a transaction so they succeed or fail together.
 * Returns 204 No Content on success.
 */
export const DELETE = requireRole('admin')(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;

    const existing = await projectRepo.findById(id, tenantId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Project not found.' },
        { status: 404 },
      );
    }

    await transaction(async (client) => {
      const now = new Date();

      // Soft-delete all tasks under this project.
      await client.query(
        `UPDATE tasks SET deleted_at = $1, updated_at = $1
          WHERE project_id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
        [now, id, tenantId],
      );

      // Soft-delete the project itself.
      await client.query(
        `UPDATE projects SET deleted_at = $1, updated_at = $1
          WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
        [now, id, tenantId],
      );
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[DELETE /api/projects/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
