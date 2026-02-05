export { getPool, query, transaction, testConnection } from './connection';
export type { QueryOptions } from './connection';

export { BaseRepository } from './repositories/base.repository';
export type { RepositoryQueryOptions, SortDirection } from './repositories/base.repository';

export { ClientRepository } from './repositories/client.repository';
export { ProjectRepository } from './repositories/project.repository';
export type { ProjectWithClientName } from './repositories/project.repository';
export { TaskRepository } from './repositories/task.repository';
export type { TaskWithProjectName } from './repositories/task.repository';
export { TimeEntryRepository } from './repositories/time-entry.repository';
export type { ProjectHoursSummary } from './repositories/time-entry.repository';
export { UserRepository } from './repositories/user.repository';

import { query } from './connection';

import type { Tenant } from '@hour-tracker/types';

export async function getTenantById(id: string): Promise<Tenant | null> {
  const rows = await query<Tenant & import('pg').QueryResultRow>({
    sql: 'SELECT id, name, plan, created_at as "createdAt", updated_at as "updatedAt" FROM tenants WHERE id = $1',
    params: [id],
  });

  return rows[0] ?? null;
}
