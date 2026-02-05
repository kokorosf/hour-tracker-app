import type { Client } from '@hour-tracker/types';
import { getPool } from '../connection';
import { BaseRepository, RepositoryQueryOptions, rowToCamel } from './base.repository';

const COLUMNS = [
  'id',
  'tenant_id',
  'name',
  'deleted_at',
  'created_at',
  'updated_at',
];

export class ClientRepository extends BaseRepository<Client> {
  constructor() {
    super('clients', COLUMNS);
  }

  /**
   * Find clients whose name matches the given string exactly (case-insensitive).
   * Only returns active (non-deleted) clients for the tenant.
   */
  async findByName(name: string, tenantId: string): Promise<Client[]> {
    const sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM clients
       WHERE tenant_id = $1
         AND LOWER(name) = LOWER($2)
         AND deleted_at IS NULL
       ORDER BY created_at ASC
    `;
    const { rows } = await getPool().query(sql, [tenantId, name]);
    return rows.map((r: Record<string, unknown>) => rowToCamel<Client>(r));
  }

  /**
   * Search clients by partial name match (case-insensitive ILIKE).
   * Supports pagination via `limit` and `offset`.
   */
  async searchByName(
    search: string,
    tenantId: string,
    options: RepositoryQueryOptions = {},
  ): Promise<Client[]> {
    const { limit, offset } = options;
    const params: unknown[] = [tenantId, `%${search}%`];

    let sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM clients
       WHERE tenant_id = $1
         AND name ILIKE $2
         AND deleted_at IS NULL
       ORDER BY name ASC
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
    return rows.map((r: Record<string, unknown>) => rowToCamel<Client>(r));
  }

  /**
   * Count active clients for a tenant, optionally filtered by a partial
   * name search.
   */
  async count(tenantId: string, search?: string): Promise<number> {
    const params: unknown[] = [tenantId];
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }

    const sql = `SELECT COUNT(*)::int AS total FROM clients WHERE ${conditions.join(' AND ')}`;
    const { rows } = await getPool().query(sql, params);
    return (rows[0] as { total: number }).total;
  }
}
