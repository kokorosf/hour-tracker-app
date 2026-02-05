import { Pool, PoolClient, QueryResultRow } from 'pg';

// ---------------------------------------------------------------------------
// Pool singleton
// ---------------------------------------------------------------------------

let pool: Pool | null = null;

/**
 * Return the shared connection pool, creating it on first call.
 *
 * Reads `DATABASE_URL` from the environment.  Pool settings are tuned for a
 * typical web-app workload – adjust if you run heavy batch jobs.
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
    });

    pool.on('error', (err) => {
      console.error('[database] unexpected pool error:', err.message);
    });

    pool.on('connect', () => {
      console.log('[database] new client connected');
    });
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Query helper
// ---------------------------------------------------------------------------

export interface QueryOptions<T extends QueryResultRow> {
  /** SQL statement – use $1, $2, … for parameter placeholders. */
  sql: string;
  /** Positional parameters bound to the SQL placeholders. */
  params?: unknown[];
  /**
   * When provided the query is automatically scoped to this tenant.
   *
   * A `WHERE tenant_id = $N` clause is **appended** (with `AND` when the SQL
   * already contains a `WHERE`) and the tenant id is added to the params
   * array.  This keeps tenant isolation consistent across the codebase.
   */
  tenantId?: string;
}

/**
 * Execute a single SQL query against the pool.
 *
 * ```ts
 * const rows = await query<User>({
 *   sql: 'SELECT * FROM users',
 *   tenantId: ctx.tenantId,
 * });
 * ```
 */
export async function query<T extends QueryResultRow>(
  opts: QueryOptions<T>,
): Promise<T[]> {
  const { sql, params = [], tenantId } = opts;

  let finalSql = sql;
  const finalParams = [...params];

  if (tenantId) {
    const paramIndex = finalParams.length + 1;
    const clause = `tenant_id = $${paramIndex}`;
    finalSql = /\bWHERE\b/i.test(finalSql)
      ? `${finalSql} AND ${clause}`
      : `${finalSql} WHERE ${clause}`;
    finalParams.push(tenantId);
  }

  try {
    const result = await getPool().query<T>(finalSql, finalParams);
    return result.rows;
  } catch (err) {
    console.error('[database] query error:', (err as Error).message);
    console.error('[database] sql:', finalSql);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------

/**
 * Run `callback` inside a database transaction.
 *
 * The callback receives a dedicated `PoolClient` that **must** be used for
 * every query inside the transaction.  The transaction is committed when the
 * callback resolves and rolled back if it throws.
 *
 * ```ts
 * const user = await transaction(async (client) => {
 *   await client.query('INSERT INTO users …');
 *   const { rows } = await client.query('SELECT …');
 *   return rows[0];
 * });
 * ```
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[database] transaction rolled back:', (err as Error).message);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Verify that the database is reachable.
 *
 * Returns `true` when a simple `SELECT 1` succeeds, `false` otherwise.
 * Useful for readiness probes and startup checks.
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    console.log('[database] connection test passed');
    return true;
  } catch (err) {
    console.error('[database] connection test failed:', (err as Error).message);
    return false;
  }
}
