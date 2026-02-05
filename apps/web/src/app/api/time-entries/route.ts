import { NextResponse } from 'next/server';
import {
  TimeEntryRepository,
  ProjectRepository,
  TaskRepository,
} from '@hour-tracker/database';
import {
  requireAuth,
  getTenantId,
  getUserId,
  isAdmin,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import type { TimeEntry } from '@hour-tracker/types';

const timeEntryRepo = new TimeEntryRepository();
const projectRepo = new ProjectRepository();
const taskRepo = new TaskRepository();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

interface EntryInput {
  projectId?: unknown;
  taskId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  description?: unknown;
}

interface ValidatedEntry {
  projectId: string;
  taskId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  description: string | null;
}

async function validateEntryInput(
  body: EntryInput,
  tenantId: string,
): Promise<{ data?: ValidatedEntry; error?: string }> {
  // --- projectId ---
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  if (!projectId) return { error: 'projectId is required.' };

  // --- taskId ---
  const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
  if (!taskId) return { error: 'taskId is required.' };

  // --- startTime / endTime ---
  const startRaw = typeof body.startTime === 'string' ? body.startTime : null;
  const endRaw = typeof body.endTime === 'string' ? body.endTime : null;
  if (!startRaw) return { error: 'startTime is required (ISO 8601).' };
  if (!endRaw) return { error: 'endTime is required (ISO 8601).' };

  const startTime = new Date(startRaw);
  const endTime = new Date(endRaw);
  if (isNaN(startTime.getTime())) return { error: 'startTime is not a valid date.' };
  if (isNaN(endTime.getTime())) return { error: 'endTime is not a valid date.' };
  if (endTime <= startTime) return { error: 'endTime must be after startTime.' };

  // --- duration (auto-calculated) ---
  const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60_000);

  // --- description ---
  const description =
    body.description === undefined || body.description === null
      ? null
      : typeof body.description === 'string'
        ? body.description.trim() || null
        : null;

  // --- Verify foreign keys ---
  const [project, task] = await Promise.all([
    projectRepo.findById(projectId, tenantId),
    taskRepo.findById(taskId, tenantId),
  ]);
  if (!project) return { error: 'Project not found in this tenant.' };
  if (!task) return { error: 'Task not found in this tenant.' };

  return { data: { projectId, taskId, startTime, endTime, duration, description } };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/time-entries
 *
 * List time entries for the authenticated user's tenant.
 * Regular users only see their own entries; admins see all.
 * Supports: startDate, endDate, projectId, userId, page, pageSize.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const admin = isAdmin(req);
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20));
    const offset = (page - 1) * pageSize;

    const startDateStr = url.searchParams.get('startDate');
    const endDateStr = url.searchParams.get('endDate');
    const projectId = url.searchParams.get('projectId') || undefined;
    // Admins can filter by any userId; regular users are always scoped to self.
    const filterUserId = admin
      ? url.searchParams.get('userId') || undefined
      : userId;

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

    if (startDate && isNaN(startDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'startDate is not a valid date.' },
        { status: 400 },
      );
    }
    if (endDate && isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'endDate is not a valid date.' },
        { status: 400 },
      );
    }

    const filterOpts = {
      userId: admin ? filterUserId : userId,
      projectId,
      startDate,
      endDate,
    };

    const [items, total] = await Promise.all([
      timeEntryRepo.findFiltered(tenantId, { ...filterOpts, limit: pageSize, offset }),
      timeEntryRepo.countFiltered(tenantId, filterOpts),
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
    console.error('[GET /api/time-entries] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * POST /api/time-entries
 *
 * Create a time entry for the authenticated user.
 * Validates foreign keys, time ordering, and overlap.
 */
export const POST = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const body = (await req.json()) as EntryInput;

    const result = await validateEntryInput(body, tenantId);
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    const { projectId, taskId, startTime, endTime, duration, description } = result.data!;

    // --- Overlap check ---
    const overlapping = await timeEntryRepo.findOverlapping(userId, tenantId, startTime, endTime);
    if (overlapping.length > 0) {
      return NextResponse.json(
        { success: false, error: 'This time entry overlaps with an existing entry.' },
        { status: 409 },
      );
    }

    const entry = await timeEntryRepo.create(
      { userId, projectId, taskId, startTime, endTime, duration, description } as Partial<TimeEntry>,
      tenantId,
    );

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/time-entries] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
