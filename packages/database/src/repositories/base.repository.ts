import { getPool } from '../connection';

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------

/** Sort direction. */
export type SortDirection = 'ASC' | 'DESC';

/** Pagination and ordering options accepted by list queries. */
export interface RepositoryQueryOptions {
  /** Maximum number of rows to return. */
  limit?: number;
  /** Number of rows to skip (for offset-based pagination). */
  offset?: number;
  /** Column to order by (use the **database** column name, e.g. `created_at`). */
  orderBy?: string;
  /** Sort direction – defaults to `'ASC'`. */
  orderDirection?: SortDirection;
  /** When `true`, include soft-deleted rows. Defaults to `false`. */
  includeDeleted?: boolean;
}

// ---------------------------------------------------------------------------
// camelCase ↔ snake_case helpers
// ---------------------------------------------------------------------------

/** Convert a camelCase string to snake_case. */
function toSnake(str: string): string {
  return str.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

/** Convert a snake_case string to camelCase. */
function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * Convert every key in `obj` from snake_case to camelCase.
 * Postgres returns snake_case column names by default.
 */
export function rowToCamel<T>(obj: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    out[toCamel(key)] = obj[key];
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Allowed order-by columns (SQL injection prevention)
// ---------------------------------------------------------------------------

const SAFE_ORDER_PATTERN = /^[a-z_][a-z0-9_]*$/;

// ---------------------------------------------------------------------------
// BaseRepository
// ---------------------------------------------------------------------------

/**
 * Abstract base repository that provides standard CRUD + soft-delete
 * operations for any tenant-scoped table.
 *
 * Subclasses only need to supply the table name and column map; all query
 * logic lives here.
 *
 * ```ts
 * class ClientRepository extends BaseRepository<Client> {
 *   constructor() {
 *     super('clients', [
 *       'id', 'tenant_id', 'name',
 *       'deleted_at', 'created_at', 'updated_at',
 *     ]);
 *   }
 * }
 * ```
 *
 * @typeParam T - The entity interface returned to callers (camelCase fields).
 */
export abstract class BaseRepository<T extends { id: string }> {
  /**
   * @param tableName   - PostgreSQL table name (snake_case).
   * @param columns     - All column names in the table (snake_case).
   * @param softDelete  - Set to `false` for tables without a `deleted_at`
   *                      column (e.g. `tenants`). Defaults to `true`.
   */
  protected constructor(
    protected readonly tableName: string,
    protected readonly columns: string[],
    protected readonly softDelete: boolean = true,
  ) {}

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  /**
   * Return all rows for a tenant, excluding soft-deleted records by default.
   *
   * @param tenantId - Owning tenant UUID.
   * @param options  - Pagination, ordering, and soft-delete filter.
   */
  async findByTenant(
    tenantId: string,
    options: RepositoryQueryOptions = {},
  ): Promise<T[]> {
    const {
      limit,
      offset,
      orderBy = 'created_at',
      orderDirection = 'ASC',
      includeDeleted = false,
    } = options;

    const params: unknown[] = [tenantId];
    const conditions: string[] = ['tenant_id = $1'];

    if (this.softDelete && !includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    let sql = `SELECT ${this.selectColumns()} FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`;

    // Order
    const safeOrder = SAFE_ORDER_PATTERN.test(orderBy) ? orderBy : 'created_at';
    const dir = orderDirection === 'DESC' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${safeOrder} ${dir}`;

    // Pagination
    if (limit !== undefined) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (offset !== undefined) {
      params.push(offset);
      sql += ` OFFSET $${params.length}`;
    }

    const { rows } = await getPool().query(sql, params);
    return rows.map((r: Record<string, unknown>) => rowToCamel<T>(r));
  }

  /**
   * Find a single row by primary key, scoped to a tenant.
   *
   * Returns `null` when the row does not exist, belongs to a different
   * tenant, or has been soft-deleted.
   */
  async findById(id: string, tenantId: string): Promise<T | null> {
    const conditions = ['id = $1', 'tenant_id = $2'];
    if (this.softDelete) {
      conditions.push('deleted_at IS NULL');
    }

    const sql = `SELECT ${this.selectColumns()} FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`;
    const { rows } = await getPool().query(sql, [id, tenantId]);

    if (rows.length === 0) return null;
    return rowToCamel<T>(rows[0] as Record<string, unknown>);
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  /**
   * Insert a new row.
   *
   * `id`, `tenant_id`, `created_at`, and `updated_at` are set automatically.
   * Callers should pass only the domain-specific fields (the DTO).
   */
  async create(data: Partial<T>, tenantId: string): Promise<T> {
    const now = new Date();
    const record: Record<string, unknown> = {};

    // Map incoming camelCase keys to snake_case.
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === 'id' || key === 'tenantId' || key === 'createdAt' || key === 'updatedAt') {
        continue; // managed by the repository
      }
      record[toSnake(key)] = value;
    }

    record['id'] = crypto.randomUUID();
    record['tenant_id'] = tenantId;
    record['created_at'] = now;
    record['updated_at'] = now;

    const cols = Object.keys(record);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = cols.map((c) => record[c]);

    const sql = `INSERT INTO ${this.tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${this.selectColumns()}`;

    const { rows } = await getPool().query(sql, values);
    return rowToCamel<T>(rows[0] as Record<string, unknown>);
  }

  /**
   * Update an existing row.
   *
   * Only the supplied fields are changed; `updated_at` is set automatically.
   * Throws if the row does not exist or belongs to a different tenant.
   */
  async update(id: string, data: Partial<T>, tenantId: string): Promise<T> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === 'id' || key === 'tenantId' || key === 'createdAt' || key === 'updatedAt') {
        continue;
      }
      sets.push(`${toSnake(key)} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }

    // Always bump updated_at.
    sets.push(`updated_at = $${paramIdx}`);
    values.push(new Date());
    paramIdx++;

    // WHERE id = … AND tenant_id = …
    values.push(id);
    const idIdx = paramIdx;
    paramIdx++;

    values.push(tenantId);
    const tenantIdx = paramIdx;

    const conditions = [`id = $${idIdx}`, `tenant_id = $${tenantIdx}`];
    if (this.softDelete) {
      conditions.push('deleted_at IS NULL');
    }

    const sql = `UPDATE ${this.tableName} SET ${sets.join(', ')} WHERE ${conditions.join(' AND ')} RETURNING ${this.selectColumns()}`;

    const { rows } = await getPool().query(sql, values);

    if (rows.length === 0) {
      throw new Error(`${this.tableName} row not found (id=${id}, tenantId=${tenantId})`);
    }
    return rowToCamel<T>(rows[0] as Record<string, unknown>);
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  /**
   * Soft-delete a row by setting `deleted_at = now()`.
   *
   * Throws if the row does not exist or belongs to a different tenant.
   * Has no effect if the table does not support soft-delete.
   */
  async softDelete(id: string, tenantId: string): Promise<void> {
    if (!this.softDelete) {
      throw new Error(`${this.tableName} does not support soft-delete`);
    }

    const sql = `UPDATE ${this.tableName} SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL`;
    const { rowCount } = await getPool().query(sql, [new Date(), id, tenantId]);

    if (rowCount === 0) {
      throw new Error(`${this.tableName} row not found (id=${id}, tenantId=${tenantId})`);
    }
  }

  /**
   * Permanently remove a row from the database.
   *
   * **Use with caution** – this cannot be undone.  Prefer {@link softDelete}
   * for everyday operations.
   *
   * Throws if the row does not exist or belongs to a different tenant.
   */
  async hardDelete(id: string, tenantId: string): Promise<void> {
    const sql = `DELETE FROM ${this.tableName} WHERE id = $1 AND tenant_id = $2`;
    const { rowCount } = await getPool().query(sql, [id, tenantId]);

    if (rowCount === 0) {
      throw new Error(`${this.tableName} row not found (id=${id}, tenantId=${tenantId})`);
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Comma-separated column list for SELECT statements. */
  private selectColumns(): string {
    return this.columns.join(', ');
  }
}
