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

/**
 * GET /api/tasks
 *
 * List tasks for the authenticated user's tenant.
 * Supports pagination (`page`, `pageSize`) and optional `projectId` filter.
 * Each task includes the parent project name.
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

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/tasks] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
