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

/** A time entry row joined with project, task, and user names. */
export interface TimeEntryDetailed extends TimeEntry {
  projectName: string;
  taskName: string;
  userEmail: string;
}

/** Filter options for {@link TimeEntryRepository.findFiltered}. */
export interface TimeEntryFilterOptions extends RepositoryQueryOptions {
  userId?: string;
  projectId?: string;
  startDate?: Date;
  endDate?: Date;
}

export class TimeEntryRepository extends BaseRepository<TimeEntry> {
  constructor() {
    super('time_entries', COLUMNS);
  }

  // -----------------------------------------------------------------------
  // Filtered / detailed queries
  // -----------------------------------------------------------------------

  /**
   * List active time entries with project, task, and user details joined in.
   * Supports filtering by userId, projectId, and date range, plus pagination.
   */
  async findFiltered(
    tenantId: string,
    options: TimeEntryFilterOptions = {},
  ): Promise<TimeEntryDetailed[]> {
    const { limit, offset, userId, projectId, startDate, endDate } = options;
    const params: unknown[] = [tenantId];
    const conditions = ['te.tenant_id = $1', 'te.deleted_at IS NULL'];

    if (userId) {
      params.push(userId);
      conditions.push(`te.user_id = $${params.length}`);
    }
    if (projectId) {
      params.push(projectId);
      conditions.push(`te.project_id = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`te.start_time >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`te.start_time <= $${params.length}`);
    }

    let sql = `
      SELECT te.id, te.tenant_id, te.user_id, te.project_id, te.task_id,
             te.start_time, te.end_time, te.duration, te.description,
             te.deleted_at, te.created_at, te.updated_at,
             p.name  AS project_name,
             t.name  AS task_name,
             u.email AS user_email
        FROM time_entries te
        JOIN projects p ON p.id = te.project_id
        JOIN tasks    t ON t.id = te.task_id
        JOIN users    u ON u.id = te.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY te.start_time DESC
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
    return rows.map((r: Record<string, unknown>) => rowToCamel<TimeEntryDetailed>(r));
  }

  /**
   * Find a single time entry by ID with project, task, and user details.
   */
  async findByIdDetailed(
    id: string,
    tenantId: string,
  ): Promise<TimeEntryDetailed | null> {
    const sql = `
      SELECT te.id, te.tenant_id, te.user_id, te.project_id, te.task_id,
             te.start_time, te.end_time, te.duration, te.description,
             te.deleted_at, te.created_at, te.updated_at,
             p.name  AS project_name,
             t.name  AS task_name,
             u.email AS user_email
        FROM time_entries te
        JOIN projects p ON p.id = te.project_id
        JOIN tasks    t ON t.id = te.task_id
        JOIN users    u ON u.id = te.user_id
       WHERE te.id = $1
         AND te.tenant_id = $2
         AND te.deleted_at IS NULL
    `;
    const { rows } = await getPool().query(sql, [id, tenantId]);
    if (rows.length === 0) return null;
    return rowToCamel<TimeEntryDetailed>(rows[0] as Record<string, unknown>);
  }

  /**
   * Count active time entries matching the given filters.
   */
  async countFiltered(
    tenantId: string,
    options: Omit<TimeEntryFilterOptions, 'limit' | 'offset'> = {},
  ): Promise<number> {
    const { userId, projectId, startDate, endDate } = options;
    const params: unknown[] = [tenantId];
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }
    if (projectId) {
      params.push(projectId);
      conditions.push(`project_id = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`start_time >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`start_time <= $${params.length}`);
    }

    const sql = `SELECT COUNT(*)::int AS total FROM time_entries WHERE ${conditions.join(' AND ')}`;
    const { rows } = await getPool().query(sql, params);
    return (rows[0] as { total: number }).total;
  }

  /**
   * Check whether a user already has an active time entry that overlaps the
   * given time range.  Optionally exclude a specific entry (for update checks).
   */
  async findOverlapping(
    userId: string,
    tenantId: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string,
  ): Promise<TimeEntry[]> {
    const params: unknown[] = [tenantId, userId, startTime, endTime];
    const conditions = [
      'tenant_id = $1',
      'user_id = $2',
      'deleted_at IS NULL',
      'start_time < $4',
      'end_time > $3',
    ];

    if (excludeId) {
      params.push(excludeId);
      conditions.push(`id != $${params.length}`);
    }

    const sql = `SELECT ${COLUMNS.join(', ')} FROM time_entries WHERE ${conditions.join(' AND ')}`;
    const { rows } = await getPool().query(sql, params);
    return rows.map((r: Record<string, unknown>) => rowToCamel<TimeEntry>(r));
  }

  // -----------------------------------------------------------------------
  // Original convenience queries
  // -----------------------------------------------------------------------

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
