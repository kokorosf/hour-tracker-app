import { NextResponse } from 'next/server';
import { TaskRepository, ProjectRepository, query, writeAuditLog } from '@hour-tracker/database';
import {
  requireAuth,
  requireRole,
  getTenantId,
  getUserId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import type { Task } from '@hour-tracker/types';

const taskRepo = new TaskRepository();
const projectRepo = new ProjectRepository();

/**
 * GET /api/tasks
 *
 * List tasks for the authenticated user's tenant.
 * Supports pagination (`page`, `pageSize`) and optional `projectId` filter.
 * Each task includes the parent project name and client name.
 */
export const GET = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20));
    const projectId = url.searchParams.get('projectId') || undefined;
    const offset = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      taskRepo.findWithProjectName(tenantId, { limit: pageSize, offset, projectId }),
      taskRepo.count(tenantId, projectId),
    ]);

    // Fetch client names for each task's project in a single query.
    const projectIds = [...new Set(items.map((t) => t.projectId))];
    let clientNames: Record<string, string> = {};

    if (projectIds.length > 0) {
      const placeholders = projectIds.map((_, i) => `$${i + 2}`).join(', ');
      const rows = await query<{ id: string; client_name: string }>({
        sql: `SELECT p.id, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.tenant_id = $1 AND p.id IN (${placeholders})`,
        params: [tenantId, ...projectIds],
      });
      clientNames = Object.fromEntries(rows.map((r) => [r.id, r.client_name]));
    }

    const itemsWithClient = items.map((t) => ({
      ...t,
      clientName: clientNames[t.projectId] ?? '',
    }));

    return NextResponse.json({
      success: true,
      data: {
        items: itemsWithClient,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (err) {
    console.error('[GET /api/tasks] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * POST /api/tasks
 *
 * Create a new task. Requires admin role.
 * Body: { name: string, projectId: string }
 */
export const POST = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const body = (await req.json()) as {
      name?: unknown;
      projectId?: unknown;
    };

    // --- Validate name ---
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0 || name.length > 255) {
      return NextResponse.json(
        { success: false, error: 'Name is required and must be between 1 and 255 characters.' },
        { status: 400 },
      );
    }

    // --- Validate projectId ---
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
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
        { status: 400 },
      );
    }

    const task = await taskRepo.create(
      { name, projectId } as Partial<Task>,
      tenantId,
    );

    writeAuditLog({
      tenantId,
      userId: getUserId(req),
      action: 'create',
      entityType: 'task',
      entityId: task.id,
      afterData: task as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
