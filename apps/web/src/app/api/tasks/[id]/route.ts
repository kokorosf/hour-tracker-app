import { NextResponse } from 'next/server';
import { TaskRepository, ProjectRepository } from '@hour-tracker/database';
import {
  requireAuth,
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import type { Task } from '@hour-tracker/types';

const taskRepo = new TaskRepository();
const projectRepo = new ProjectRepository();

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/tasks/:id
 *
 * Fetch a single task with project name.
 * Returns 404 if the task does not exist or belongs to a different tenant.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;

    const task = await taskRepo.findByIdWithProjectName(id, tenantId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: task });
  } catch (err) {
    console.error('[GET /api/tasks/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/tasks/:id
 *
 * Update an existing task. Requires admin role.
 * Body: { name?: string, projectId?: string }
 */
export const PUT = requireRole('admin')(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      name?: unknown;
      projectId?: unknown;
    };

    // --- Verify task exists ---
    const existing = await taskRepo.findById(id, tenantId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Task not found.' },
        { status: 404 },
      );
    }

    // --- Build update payload ---
    const updates: Partial<Task> = {};

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

    if (body.projectId !== undefined) {
      const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: 'projectId must be a non-empty string.' },
          { status: 400 },
        );
      }
      const project = await projectRepo.findById(projectId, tenantId);
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found in this tenant.' },
          { status: 400 },
        );
      }
      updates.projectId = projectId;
    }

    const updated = await taskRepo.update(id, updates, tenantId);

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('[PUT /api/tasks/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/tasks/:id
 *
 * Soft-delete a task. Requires admin role.
 * Returns 409 if the task still has active time entries.
 * Returns 204 No Content on success.
 */
export const DELETE = requireRole('admin')(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;

    // --- Verify task exists ---
    const existing = await taskRepo.findById(id, tenantId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Task not found.' },
        { status: 404 },
      );
    }

    // --- Check for active time entries ---
    const entryCount = await taskRepo.countTimeEntries(id, tenantId);
    if (entryCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete task: ${entryCount} active time ${entryCount === 1 ? 'entry references' : 'entries reference'} this task.`,
        },
        { status: 409 },
      );
    }

    await taskRepo.softDelete(id, tenantId);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[DELETE /api/tasks/:id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
