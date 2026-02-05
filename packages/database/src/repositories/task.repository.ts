import type { Task } from '@hour-tracker/types';
import { getPool } from '../connection';
import { BaseRepository, RepositoryQueryOptions, rowToCamel } from './base.repository';

const COLUMNS = [
  'id',
  'tenant_id',
  'project_id',
  'name',
  'deleted_at',
  'created_at',
  'updated_at',
];

/** A task row joined with its project name. */
export interface TaskWithProjectName extends Task {
  projectName: string;
}

export class TaskRepository extends BaseRepository<Task> {
  constructor() {
    super('tasks', COLUMNS);
  }

  /**
   * Return all active tasks that belong to a specific project.
   */
  async findByProject(
    projectId: string,
    tenantId: string,
    options: RepositoryQueryOptions = {},
  ): Promise<Task[]> {
    const { limit, offset } = options;
    const params: unknown[] = [tenantId, projectId];

    let sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM tasks
       WHERE tenant_id = $1
         AND project_id = $2
         AND deleted_at IS NULL
       ORDER BY created_at ASC
    `;

    if (limit !== undefined) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (offset !== undefined) {
      params.push(offset);
      sql += ` OFFSET $${params.length}`;
    }

    const { rows } = await getPool().query(sql, params);
    return rows.map((r: Record<string, unknown>) => rowToCamel<Task>(r));
  }

  /**
   * List active tasks with the parent project name joined in.
   * Optionally filter by `projectId`.  Supports pagination.
   */
  async findWithProjectName(
    tenantId: string,
    options: RepositoryQueryOptions & { projectId?: string } = {},
  ): Promise<TaskWithProjectName[]> {
    const { limit, offset, projectId } = options;
    const params: unknown[] = [tenantId];
    const conditions = ['t.tenant_id = $1', 't.deleted_at IS NULL'];

    if (projectId) {
      params.push(projectId);
      conditions.push(`t.project_id = $${params.length}`);
    }

    let sql = `
      SELECT t.id, t.tenant_id, t.project_id, t.name,
             t.deleted_at, t.created_at, t.updated_at,
             p.name AS project_name
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.name ASC
    `;

    if (limit !== undefined) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (offset !== undefined) {
      params.push(offset);
      sql += ` OFFSET $${params.length}`;
    }

    const { rows } = await getPool().query(sql, params);
    return rows.map((r: Record<string, unknown>) => rowToCamel<TaskWithProjectName>(r));
  }

  /**
   * Find a single task by ID with the project name joined in.
   */
  async findByIdWithProjectName(
    id: string,
    tenantId: string,
  ): Promise<TaskWithProjectName | null> {
    const sql = `
      SELECT t.id, t.tenant_id, t.project_id, t.name,
             t.deleted_at, t.created_at, t.updated_at,
             p.name AS project_name
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
       WHERE t.id = $1
         AND t.tenant_id = $2
         AND t.deleted_at IS NULL
    `;
    const { rows } = await getPool().query(sql, [id, tenantId]);
    if (rows.length === 0) return null;
    return rowToCamel<TaskWithProjectName>(rows[0] as Record<string, unknown>);
  }

  /**
   * Count active tasks for a tenant, optionally filtered by project.
   */
  async count(tenantId: string, projectId?: string): Promise<number> {
    const params: unknown[] = [tenantId];
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];

    if (projectId) {
      params.push(projectId);
      conditions.push(`project_id = $${params.length}`);
    }

    const sql = `SELECT COUNT(*)::int AS total FROM tasks WHERE ${conditions.join(' AND ')}`;
    const { rows } = await getPool().query(sql, params);
    return (rows[0] as { total: number }).total;
  }

  /**
   * Count active time entries that reference a given task.
   * Used to prevent deleting tasks with existing time entries.
   */
  async countTimeEntries(taskId: string, tenantId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*)::int AS total
        FROM time_entries
       WHERE task_id = $1
         AND tenant_id = $2
         AND deleted_at IS NULL
    `;
    const { rows } = await getPool().query(sql, [taskId, tenantId]);
    return (rows[0] as { total: number }).total;
  }

  /**
   * Soft-delete all active tasks that belong to a given project.
   * Used when cascading a project soft-delete.
   */
  async softDeleteByProject(projectId: string, tenantId: string): Promise<number> {
    const now = new Date();
    const sql = `
      UPDATE tasks
         SET deleted_at = $1, updated_at = $1
       WHERE project_id = $2
         AND tenant_id = $3
         AND deleted_at IS NULL
    `;
    const { rowCount } = await getPool().query(sql, [now, projectId, tenantId]);
    return rowCount ?? 0;
  }
}
