import { Pool } from 'pg';

import type { Tenant } from '@hour-tracker/types';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function getTenantById(id: string): Promise<Tenant | null> {
  const result = await pool.query<Tenant>(
    'SELECT id, name, plan, created_at as "createdAt", updated_at as "updatedAt" FROM tenants WHERE id = $1',
    [id],
  );

  return result.rows[0] ?? null;
}
