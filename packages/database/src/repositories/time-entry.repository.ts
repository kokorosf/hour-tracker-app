import type { TimeEntry } from '@hour-tracker/types';
import { getPool } from '../connection';
import { BaseRepository, RepositoryQueryOptions, rowToCamel } from './base.repository';

const COLUMNS = [
  'id',
  'tenant_id',
  'user_id',
  'project_id',
  'task_id',
  'start_time',
  'end_time',
  'duration',
  'description',
  'deleted_at',
  'created_at',
  'updated_at',
];

/** Aggregated hours per project returned by {@link TimeEntryRepository.sumHoursByProject}. */
export interface ProjectHoursSummary {
  projectId: string;
  totalMinutes: number;
}

export class TimeEntryRepository extends BaseRepository<TimeEntry> {
  constructor() {
    super('time_entries', COLUMNS);
  }

  /**
   * Return active time entries whose `start_time` falls within the
   * given date range (inclusive on both ends).
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    tenantId: string,
    options: RepositoryQueryOptions = {},
  ): Promise<TimeEntry[]> {
    const { limit, offset } = options;
    const params: unknown[] = [tenantId, startDate, endDate];

    let sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM time_entries
       WHERE tenant_id = $1
         AND start_time >= $2
         AND start_time <= $3
         AND deleted_at IS NULL
       ORDER BY start_time ASC
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
    return rows.map((r: Record<string, unknown>) => rowToCamel<TimeEntry>(r));
  }

  /**
   * Return all active time entries logged by a specific user.
   */
  async findByUser(
    userId: string,
    tenantId: string,
    options: RepositoryQueryOptions = {},
  ): Promise<TimeEntry[]> {
    const { limit, offset } = options;
    const params: unknown[] = [tenantId, userId];

    let sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM time_entries
       WHERE tenant_id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       ORDER BY start_time DESC
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
    return rows.map((r: Record<string, unknown>) => rowToCamel<TimeEntry>(r));
  }

  /**
   * Return all active time entries for a specific project.
   */
  async findByProject(
    projectId: string,
    tenantId: string,
    options: RepositoryQueryOptions = {},
  ): Promise<TimeEntry[]> {
    const { limit, offset } = options;
    const params: unknown[] = [tenantId, projectId];

    let sql = `
      SELECT ${COLUMNS.join(', ')}
        FROM time_entries
       WHERE tenant_id = $1
         AND project_id = $2
         AND deleted_at IS NULL
       ORDER BY start_time DESC
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
    return rows.map((r: Record<string, unknown>) => rowToCamel<TimeEntry>(r));
  }

  /**
   * Return the total logged minutes grouped by project.
   *
   * Optionally restrict to a date range.  Only active (non-deleted) entries
   * are included.
   */
  async sumHoursByProject(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ProjectHoursSummary[]> {
    const params: unknown[] = [tenantId];
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];

    if (startDate) {
      params.push(startDate);
      conditions.push(`start_time >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`start_time <= $${params.length}`);
    }

    const sql = `
      SELECT project_id,
             COALESCE(SUM(duration), 0)::int AS total_minutes
        FROM time_entries
       WHERE ${conditions.join(' AND ')}
       GROUP BY project_id
       ORDER BY total_minutes DESC
    `;

    const { rows } = await getPool().query(sql, params);
    return rows.map((r: Record<string, unknown>) => rowToCamel<ProjectHoursSummary>(r));
  }
}
