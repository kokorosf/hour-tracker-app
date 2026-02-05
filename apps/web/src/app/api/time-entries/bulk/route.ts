import { NextResponse } from 'next/server';
import {
  TimeEntryRepository,
  ProjectRepository,
  TaskRepository,
  transaction,
} from '@hour-tracker/database';
import {
  requireAuth,
  getTenantId,
  getUserId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const projectRepo = new ProjectRepository();
const taskRepo = new TaskRepository();
const timeEntryRepo = new TimeEntryRepository();

interface BulkEntryInput {
  projectId?: unknown;
  taskId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  description?: unknown;
}

/**
 * POST /api/time-entries/bulk
 *
 * Create multiple time entries in a single transaction.
 * All entries are created for the authenticated user.
 * If any single entry fails validation, the entire batch is rejected.
 */
export const POST = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const body = (await req.json()) as { entries?: unknown };

    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'entries must be a non-empty array.' },
        { status: 400 },
      );
    }

    if (body.entries.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Maximum 100 entries per batch.' },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // Phase 1: validate every entry before touching the database
    // ------------------------------------------------------------------
    const validated: Array<{
      projectId: string;
      taskId: string;
      startTime: Date;
      endTime: Date;
      duration: number;
      description: string | null;
    }> = [];

    for (let i = 0; i < body.entries.length; i++) {
      const raw = body.entries[i] as BulkEntryInput;
      const idx = i + 1; // 1-based for user messages

      const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : '';
      if (!projectId) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: projectId is required.` },
          { status: 400 },
        );
      }

      const taskId = typeof raw.taskId === 'string' ? raw.taskId.trim() : '';
      if (!taskId) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: taskId is required.` },
          { status: 400 },
        );
      }

      const startRaw = typeof raw.startTime === 'string' ? raw.startTime : null;
      const endRaw = typeof raw.endTime === 'string' ? raw.endTime : null;
      if (!startRaw) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: startTime is required (ISO 8601).` },
          { status: 400 },
        );
      }
      if (!endRaw) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: endTime is required (ISO 8601).` },
          { status: 400 },
        );
      }

      const startTime = new Date(startRaw);
      const endTime = new Date(endRaw);
      if (isNaN(startTime.getTime())) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: startTime is not a valid date.` },
          { status: 400 },
        );
      }
      if (isNaN(endTime.getTime())) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: endTime is not a valid date.` },
          { status: 400 },
        );
      }
      if (endTime <= startTime) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: endTime must be after startTime.` },
          { status: 400 },
        );
      }

      const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60_000);

      const description =
        raw.description === undefined || raw.description === null
          ? null
          : typeof raw.description === 'string'
            ? raw.description.trim() || null
            : null;

      // Verify foreign keys exist.
      const [project, task] = await Promise.all([
        projectRepo.findById(projectId, tenantId),
        taskRepo.findById(taskId, tenantId),
      ]);
      if (!project) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: project not found in this tenant.` },
          { status: 400 },
        );
      }
      if (!task) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: task not found in this tenant.` },
          { status: 400 },
        );
      }

      // Check overlap against existing DB entries.
      const overlapping = await timeEntryRepo.findOverlapping(userId, tenantId, startTime, endTime);
      if (overlapping.length > 0) {
        return NextResponse.json(
          { success: false, error: `Entry ${idx}: overlaps with an existing time entry.` },
          { status: 409 },
        );
      }

      // Check overlap within the batch itself.
      for (let j = 0; j < validated.length; j++) {
        const prev = validated[j]!;
        if (startTime < prev.endTime && endTime > prev.startTime) {
          return NextResponse.json(
            { success: false, error: `Entry ${idx}: overlaps with entry ${j + 1} in this batch.` },
            { status: 409 },
          );
        }
      }

      validated.push({ projectId, taskId, startTime, endTime, duration, description });
    }

    // ------------------------------------------------------------------
    // Phase 2: insert all entries in a single transaction
    // ------------------------------------------------------------------
    const created = await transaction(async (client) => {
      const results = [];
      const now = new Date();

      for (const entry of validated) {
        const { rows } = await client.query(
          `INSERT INTO time_entries
             (id, tenant_id, user_id, project_id, task_id,
              start_time, end_time, duration, description,
              created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
           RETURNING *`,
          [
            tenantId,
            userId,
            entry.projectId,
            entry.taskId,
            entry.startTime,
            entry.endTime,
            entry.duration,
            entry.description,
            now,
          ],
        );
        results.push(rows[0]);
      }

      return results;
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/time-entries/bulk] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
