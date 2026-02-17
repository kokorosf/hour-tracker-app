import { NextResponse } from 'next/server';
import {
  TimeEntryRepository,
  ProjectRepository,
  TaskRepository,
  writeAuditLog,
} from '@hour-tracker/database';
import {
  requireAuth,
  getTenantId,
  getUserId,
  isAdmin,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import type { TimeEntry } from '@hour-tracker/types';
import { generateRequestId } from '@/lib/request-id';

const timeEntryRepo = new TimeEntryRepository();
const projectRepo = new ProjectRepository();
const taskRepo = new TaskRepository();

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Check that the authenticated user is the owner of the entry or an admin.
 */
function canAccess(req: AuthenticatedRequest, entryUserId: string): boolean {
  return isAdmin(req) || getUserId(req) === entryUserId;
}

/**
 * GET /api/time-entries/:id
 *
 * Fetch a single time entry with full details.
 * Users can only view their own entries unless they are admins.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;

    const entry = await timeEntryRepo.findByIdDetailed(id, tenantId);
    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Time entry not found.' },
        { status: 404 },
      );
    }

    if (!canAccess(req, entry.userId)) {
      return NextResponse.json(
        { success: false, error: 'Time entry not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: entry });
  } catch (err) {
    const requestId = generateRequestId();
    console.error(`[GET /api/time-entries/:id] error (${requestId}):`, err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.', requestId },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/time-entries/:id
 *
 * Update an existing time entry.
 * Users can only edit their own entries; admins can edit any.
 */
export const PUT = requireAuth(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      projectId?: unknown;
      taskId?: unknown;
      startTime?: unknown;
      endTime?: unknown;
      description?: unknown;
    };

    // --- Verify entry exists and user has access ---
    const existing = await timeEntryRepo.findById(id, tenantId);
    if (!existing || !canAccess(req, existing.userId)) {
      return NextResponse.json(
        { success: false, error: 'Time entry not found.' },
        { status: 404 },
      );
    }

    // --- Build update payload ---
    const updates: Partial<TimeEntry> = {};

    // Resolve final values (use existing if not provided) for overlap check.
    let finalProjectId = existing.projectId;
    let finalTaskId = existing.taskId;
    let finalStart = existing.startTime;
    let finalEnd = existing.endTime;

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
      finalProjectId = projectId;
    }

    if (body.taskId !== undefined) {
      const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
      if (!taskId) {
        return NextResponse.json(
          { success: false, error: 'taskId must be a non-empty string.' },
          { status: 400 },
        );
      }
      const task = await taskRepo.findById(taskId, tenantId);
      if (!task) {
        return NextResponse.json(
          { success: false, error: 'Task not found in this tenant.' },
          { status: 400 },
        );
      }
      updates.taskId = taskId;
      finalTaskId = taskId;
    }

    if (body.startTime !== undefined) {
      const d = new Date(body.startTime as string);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: 'startTime is not a valid date.' },
          { status: 400 },
        );
      }
      updates.startTime = d;
      finalStart = d;
    }

    if (body.endTime !== undefined) {
      const d = new Date(body.endTime as string);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: 'endTime is not a valid date.' },
          { status: 400 },
        );
      }
      updates.endTime = d;
      finalEnd = d;
    }

    if (finalEnd <= finalStart) {
      return NextResponse.json(
        { success: false, error: 'endTime must be after startTime.' },
        { status: 400 },
      );
    }

    // Recalculate duration whenever times change.
    if (updates.startTime || updates.endTime) {
      updates.duration = Math.round((finalEnd.getTime() - finalStart.getTime()) / 60_000);
    }

    if (body.description !== undefined) {
      updates.description =
        body.description === null
          ? null
          : typeof body.description === 'string'
            ? body.description.trim() || null
            : null;
    }

    // --- Overlap check (exclude self) ---
    if (updates.startTime || updates.endTime) {
      const overlapping = await timeEntryRepo.findOverlapping(
        existing.userId,
        tenantId,
        finalStart,
        finalEnd,
        id,
      );
      if (overlapping.length > 0) {
        return NextResponse.json(
          { success: false, error: 'This time entry overlaps with an existing entry.' },
          { status: 409 },
        );
      }
    }

    const updated = await timeEntryRepo.update(id, updates, tenantId);

    writeAuditLog({
      tenantId,
      userId: getUserId(req),
      action: 'update',
      entityType: 'time_entry',
      entityId: id,
      beforeData: existing as unknown as Record<string, unknown>,
      afterData: updated as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const requestId = generateRequestId();
    console.error(`[PUT /api/time-entries/:id] error (${requestId}):`, err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.', requestId },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/time-entries/:id
 *
 * Soft-delete a time entry.
 * Users can only delete their own entries; admins can delete any.
 * Returns 204 No Content on success.
 */
export const DELETE = requireAuth(async (req: AuthenticatedRequest, ctx: RouteCtx) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = await ctx.params;

    const existing = await timeEntryRepo.findById(id, tenantId);
    if (!existing || !canAccess(req, existing.userId)) {
      return NextResponse.json(
        { success: false, error: 'Time entry not found.' },
        { status: 404 },
      );
    }

    await timeEntryRepo.softDelete(id, tenantId);

    writeAuditLog({
      tenantId,
      userId: getUserId(req),
      action: 'delete',
      entityType: 'time_entry',
      entityId: id,
      beforeData: existing as unknown as Record<string, unknown>,
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const requestId = generateRequestId();
    console.error(`[DELETE /api/time-entries/:id] error (${requestId}):`, err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.', requestId },
      { status: 500 },
    );
  }
});
