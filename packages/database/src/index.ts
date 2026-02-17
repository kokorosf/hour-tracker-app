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
export type {
  ProjectHoursSummary,
  TimeEntryDetailed,
  TimeEntryWithClient,
  TimeEntryFilterOptions,
} from './repositories/time-entry.repository';
export { UserRepository } from './repositories/user.repository';

export { writeAuditLog } from './audit';
export type { AuditEntry } from './audit';

import { query } from './connection';

import type { Tenant } from '@hour-tracker/types';

export async function getTenantById(id: string): Promise<Tenant | null> {
  const rows = await query<Tenant & import('pg').QueryResultRow>({
    sql: `SELECT id, name, plan,
            accountant_email AS "accountantEmail",
            telegram_chat_id AS "telegramChatId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM tenants WHERE id = $1`,
    params: [id],
  });

  return rows[0] ?? null;
}

export async function updateTenant(
  id: string,
  data: { accountantEmail?: string | null; telegramChatId?: string | null },
): Promise<Tenant | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.accountantEmail !== undefined) {
    sets.push(`accountant_email = $${idx}`);
    values.push(data.accountantEmail);
    idx++;
  }

  if (data.telegramChatId !== undefined) {
    sets.push(`telegram_chat_id = $${idx}`);
    values.push(data.telegramChatId);
    idx++;
  }

  if (sets.length === 0) return getTenantById(id);

  sets.push(`updated_at = now()`);
  values.push(id);

  const sql = `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${idx}
               RETURNING id, name, plan,
                 accountant_email AS "accountantEmail",
                 telegram_chat_id AS "telegramChatId",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`;

  const rows = await query<Tenant & import('pg').QueryResultRow>({
    sql,
    params: values,
  });

  return rows[0] ?? null;
}

export async function getTenantsWithAccountantEmail(): Promise<Tenant[]> {
  const rows = await query<Tenant & import('pg').QueryResultRow>({
    sql: `SELECT id, name, plan,
            accountant_email AS "accountantEmail",
            telegram_chat_id AS "telegramChatId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM tenants
          WHERE accountant_email IS NOT NULL AND accountant_email != ''`,
  });

  return rows;
}

export async function getTenantByTelegramChatId(chatId: string): Promise<Tenant | null> {
  const rows = await query<Tenant & import('pg').QueryResultRow>({
    sql: `SELECT id, name, plan,
            accountant_email AS "accountantEmail",
            telegram_chat_id AS "telegramChatId",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM tenants
          WHERE telegram_chat_id = $1`,
    params: [chatId],
  });

  return rows[0] ?? null;
}
