import type { Client } from '@hour-tracker/types';
import { getPool } from '../connection';
import { BaseRepository, rowToCamel } from './base.repository';

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
   * Find clients whose name matches the given string (case-insensitive).
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
}
