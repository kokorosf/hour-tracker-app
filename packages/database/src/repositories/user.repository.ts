import type { User, UserWithPassword } from '@hour-tracker/types';
import { getPool } from '../connection';
import { BaseRepository, rowToCamel } from './base.repository';

/** Columns returned for normal (non-auth) queries — excludes password_hash. */
const COLUMNS = [
  'id',
  'tenant_id',
  'email',
  'role',
  'created_at',
  'updated_at',
];

/** All columns including the password hash — used only by auth helpers. */
const ALL_COLUMNS = [...COLUMNS, 'password_hash'];

export class UserRepository extends BaseRepository<User> {
  constructor() {
    // Users table has no deleted_at column.
    super('users', COLUMNS, false);
  }

  /**
   * Find a user by email within a specific tenant.
   * Returns `null` if no match.
   */
  async findByEmail(email: string, tenantId: string): Promise<User | null> {
    const sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM users
       WHERE tenant_id = $1
         AND LOWER(email) = LOWER($2)
    `;
    const { rows } = await getPool().query(sql, [tenantId, email]);
    if (rows.length === 0) return null;
    return rowToCamel<User>(rows[0] as Record<string, unknown>);
  }

  /**
   * Count users within a tenant.
   */
  async count(tenantId: string): Promise<number> {
    const sql = `SELECT COUNT(*)::int AS total FROM users WHERE tenant_id = $1`;
    const { rows } = await getPool().query(sql, [tenantId]);
    return (rows[0] as { total: number }).total;
  }

  /**
   * Find a user by email across **all** tenants.
   *
   * Used during login when the tenant is not yet known.  Returns the
   * full record **including the password hash** so the caller can verify
   * credentials.
   */
  async findByEmailGlobal(email: string): Promise<UserWithPassword | null> {
    const sql = `
      SELECT ${ALL_COLUMNS.join(', ')}
        FROM users
       WHERE LOWER(email) = LOWER($1)
    `;
    const { rows } = await getPool().query(sql, [email]);
    if (rows.length === 0) return null;
    return rowToCamel<UserWithPassword>(rows[0] as Record<string, unknown>);
  }
}
