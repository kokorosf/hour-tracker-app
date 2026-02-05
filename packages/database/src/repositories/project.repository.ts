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

/** A project row joined with its client name. */
export interface ProjectWithClientName extends Project {
  clientName: string;
}

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

  /**
   * List active projects with the parent client name joined in.
   * Optionally filter by `clientId`.  Supports pagination.
   */
  async findWithClientName(
    tenantId: string,
    options: RepositoryQueryOptions & { clientId?: string } = {},
  ): Promise<ProjectWithClientName[]> {
    const { limit, offset, clientId } = options;
    const params: unknown[] = [tenantId];
    const conditions = ['p.tenant_id = $1', 'p.deleted_at IS NULL'];

    if (clientId) {
      params.push(clientId);
      conditions.push(`p.client_id = $${params.length}`);
    }

    let sql = `
      SELECT p.id, p.tenant_id, p.client_id, p.name, p.is_billable,
             p.deleted_at, p.created_at, p.updated_at,
             c.name AS client_name
        FROM projects p
        JOIN clients c ON c.id = p.client_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.name ASC
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
    return rows.map((r: Record<string, unknown>) => rowToCamel<ProjectWithClientName>(r));
  }

  /**
   * Find a single project by ID with the client name joined in.
   */
  async findByIdWithClientName(
    id: string,
    tenantId: string,
  ): Promise<ProjectWithClientName | null> {
    const sql = `
      SELECT p.id, p.tenant_id, p.client_id, p.name, p.is_billable,
             p.deleted_at, p.created_at, p.updated_at,
             c.name AS client_name
        FROM projects p
        JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1
         AND p.tenant_id = $2
         AND p.deleted_at IS NULL
    `;
    const { rows } = await getPool().query(sql, [id, tenantId]);
    if (rows.length === 0) return null;
    return rowToCamel<ProjectWithClientName>(rows[0] as Record<string, unknown>);
  }

  /**
   * Count active projects for a tenant, optionally filtered by client.
   */
  async count(tenantId: string, clientId?: string): Promise<number> {
    const params: unknown[] = [tenantId];
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];

    if (clientId) {
      params.push(clientId);
      conditions.push(`client_id = $${params.length}`);
    }

    const sql = `SELECT COUNT(*)::int AS total FROM projects WHERE ${conditions.join(' AND ')}`;
    const { rows } = await getPool().query(sql, params);
    return (rows[0] as { total: number }).total;
  }
}
