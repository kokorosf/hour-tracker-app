import { NextResponse } from 'next/server';
import {
  ClientRepository,
  ProjectRepository,
  TaskRepository,
  TimeEntryRepository,
  UserRepository,
} from '@hour-tracker/database';
import {
  requireAuth,
  getTenantId,
  getUserId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import type { TimeEntry } from '@hour-tracker/types';

const clientRepo = new ClientRepository();
const projectRepo = new ProjectRepository();
const taskRepo = new TaskRepository();
const timeEntryRepo = new TimeEntryRepository();
const userRepo = new UserRepository();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface McpRequest {
  method: string;
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Duration parser
// ---------------------------------------------------------------------------

/**
 * Parse a human-readable duration string into minutes.
 *
 * Supported formats:
 *   "2h"       → 120
 *   "30m"      → 30
 *   "1h30m"    → 90
 *   "1.5h"     → 90
 *   "90"       → 90  (plain number treated as minutes)
 */
function parseDuration(input: unknown): number | null {
  if (typeof input === 'number') return Math.round(input);

  if (typeof input !== 'string') return null;
  const str = input.trim().toLowerCase();
  if (!str) return null;

  // Plain number → minutes
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.round(parseFloat(str));
  }

  let totalMinutes = 0;
  let matched = false;

  // Match hours component (e.g. "2h" or "1.5h")
  const hoursMatch = str.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hoursMatch) {
    totalMinutes += parseFloat(hoursMatch[1]!) * 60;
    matched = true;
  }

  // Match minutes component (e.g. "30m")
  const minsMatch = str.match(/(\d+(?:\.\d+)?)\s*m/);
  if (minsMatch) {
    totalMinutes += parseFloat(minsMatch[1]!);
    matched = true;
  }

  if (!matched) return null;
  return Math.round(totalMinutes);
}

// ---------------------------------------------------------------------------
// Method handlers
// ---------------------------------------------------------------------------

async function queryClients(
  tenantId: string,
): Promise<NextResponse> {
  const clients = await clientRepo.findByTenant(tenantId);
  return NextResponse.json({ success: true, data: clients });
}

async function queryProjects(
  tenantId: string,
  params: Record<string, unknown>,
): Promise<NextResponse> {
  const clientId =
    typeof params.clientId === 'string' ? params.clientId : undefined;

  const projects = clientId
    ? await projectRepo.findByClient(clientId, tenantId)
    : await projectRepo.findByTenant(tenantId);

  return NextResponse.json({ success: true, data: projects });
}

async function queryTasks(
  tenantId: string,
  params: Record<string, unknown>,
): Promise<NextResponse> {
  const projectId =
    typeof params.projectId === 'string' ? params.projectId : '';

  if (!projectId) {
    return NextResponse.json(
      { success: false, error: 'projectId is required.' },
      { status: 400 },
    );
  }

  const project = await projectRepo.findById(projectId, tenantId);
  if (!project) {
    return NextResponse.json(
      { success: false, error: 'Project not found in this tenant.' },
      { status: 404 },
    );
  }

  const tasks = await taskRepo.findByProject(projectId, tenantId);
  return NextResponse.json({ success: true, data: tasks });
}

async function logTimeEntry(
  tenantId: string,
  userId: string,
  params: Record<string, unknown>,
): Promise<NextResponse> {
  // --- Validate required fields ---
  const projectId =
    typeof params.projectId === 'string' ? params.projectId.trim() : '';
  if (!projectId) {
    return NextResponse.json(
      { success: false, error: 'projectId is required.' },
      { status: 400 },
    );
  }

  const taskId =
    typeof params.taskId === 'string' ? params.taskId.trim() : '';
  if (!taskId) {
    return NextResponse.json(
      { success: false, error: 'taskId is required.' },
      { status: 400 },
    );
  }

  const duration = parseDuration(params.duration);
  if (duration === null || duration <= 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          'duration is required. Use a number (minutes) or a string like "2h", "30m", "1h30m".',
      },
      { status: 400 },
    );
  }

  const description =
    typeof params.description === 'string'
      ? params.description.trim() || null
      : null;

  // --- Verify foreign keys ---
  const [project, task] = await Promise.all([
    projectRepo.findById(projectId, tenantId),
    taskRepo.findById(taskId, tenantId),
  ]);

  if (!project) {
    return NextResponse.json(
      { success: false, error: 'Project not found in this tenant.' },
      { status: 404 },
    );
  }
  if (!task) {
    return NextResponse.json(
      { success: false, error: 'Task not found in this tenant.' },
      { status: 404 },
    );
  }

  // --- Build start/end time for today ---
  const now = new Date();
  const startTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    9,
    0,
    0,
  );
  const endTime = new Date(startTime.getTime() + duration * 60_000);

  // --- Overlap check ---
  const overlapping = await timeEntryRepo.findOverlapping(
    userId,
    tenantId,
    startTime,
    endTime,
  );
  if (overlapping.length > 0) {
    return NextResponse.json(
      { success: false, error: 'This time entry overlaps with an existing entry.' },
      { status: 409 },
    );
  }

  const entry = await timeEntryRepo.create(
    {
      userId,
      projectId,
      taskId,
      startTime,
      endTime,
      duration,
      description,
    } as Partial<TimeEntry>,
    tenantId,
  );

  return NextResponse.json({ success: true, data: entry }, { status: 201 });
}

async function getUserStatus(
  tenantId: string,
  userId: string,
): Promise<NextResponse> {
  const user = await userRepo.findById(userId, tenantId);
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'User not found.' },
      { status: 404 },
    );
  }

  // Week boundaries (Monday–Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - diffToMonday,
  );
  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 6,
    23,
    59,
    59,
    999,
  );

  const [weekEntries, recentEntries] = await Promise.all([
    timeEntryRepo.findFiltered(tenantId, {
      userId,
      startDate: weekStart,
      endDate: weekEnd,
    }),
    timeEntryRepo.findFiltered(tenantId, {
      userId,
      limit: 5,
    }),
  ]);

  const weekMinutes = weekEntries.reduce((sum, e) => sum + e.duration, 0);
  const weekHours = parseFloat((weekMinutes / 60).toFixed(2));

  return NextResponse.json({
    success: true,
    data: {
      user,
      weekHours,
      recentEntries,
    },
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/mcp
 *
 * Machine-callable protocol endpoint that dispatches to internal methods.
 *
 * Body:
 *   - method: string — one of the supported method names
 *   - params: object — method-specific parameters
 *
 * Supported methods:
 *   query_clients, query_projects, query_tasks, log_time_entry, get_user_status
 */
export const POST = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = (await req.json()) as McpRequest;
    const { method, params = {} } = body;

    if (!method || typeof method !== 'string') {
      return NextResponse.json(
        { success: false, error: 'method is required.' },
        { status: 400 },
      );
    }

    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    switch (method) {
      case 'query_clients':
        return queryClients(tenantId);

      case 'query_projects':
        return queryProjects(tenantId, params);

      case 'query_tasks':
        return queryTasks(tenantId, params);

      case 'log_time_entry':
        return logTimeEntry(tenantId, userId, params);

      case 'get_user_status':
        return getUserStatus(tenantId, userId);

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown method "${method}". Supported: query_clients, query_projects, query_tasks, log_time_entry, get_user_status`,
          },
          { status: 400 },
        );
    }
  } catch (err) {
    console.error('[POST /api/mcp] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
