import type { Project } from '@hour-tracker/types';
import { getPool } from '../connection';
import { BaseRepository, RepositoryQueryOptions, rowToCamel } from './base.repository';

const COLUMNS = [
  'id',
  'tenant_id',
  'client_id',
  'name',
  'is_billable',
  'deleted_at',
  'created_at',
  'updated_at',
];

export class ProjectRepository extends BaseRepository<Project> {
  constructor() {
    super('projects', COLUMNS);
  }

  /**
   * Return all active projects that belong to a specific client.
   */
  async findByClient(
    clientId: string,
    tenantId: string,
    options: RepositoryQueryOptions = {},
  ): Promise<Project[]> {
    const { limit, offset } = options;
    const params: unknown[] = [tenantId, clientId];

    let sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM projects
       WHERE tenant_id = $1
         AND client_id = $2
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
    return rows.map((r: Record<string, unknown>) => rowToCamel<Project>(r));
  }

  /**
   * Return all active billable projects for a tenant.
   */
  async findBillable(tenantId: string): Promise<Project[]> {
    const sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM projects
       WHERE tenant_id = $1
         AND is_billable = true
         AND deleted_at IS NULL
       ORDER BY created_at ASC
    `;
    const { rows } = await getPool().query(sql, [tenantId]);
    return rows.map((r: Record<string, unknown>) => rowToCamel<Project>(r));
  }
}
