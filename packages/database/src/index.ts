import { Pool } from 'pg';

import type { Tenant } from '@hour-tracker/types';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const result = await pool.query<Tenant>(
    'SELECT id, name, slug, created_at as "createdAt" FROM tenants WHERE slug = $1',
    [slug]
  );

  return result.rows[0] ?? null;
}
