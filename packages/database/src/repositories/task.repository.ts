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
}
