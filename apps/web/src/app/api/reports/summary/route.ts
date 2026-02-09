import { NextResponse } from 'next/server';
import { getPool } from '@hour-tracker/database';
import {
  requireAuth,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

/**
 * GET /api/reports/summary
 *
 * Return aggregated statistics for the dashboard.
 * Query params:
 *   - startDate: ISO date string (required)
 *   - endDate: ISO date string (required)
 *
 * Returns:
 *   - totalMinutes: total hours logged in the period
 *   - billableMinutes: hours on billable projects
 *   - activeProjects: count of projects with time logged in period
 *   - pendingEntries: entries with no description
 *   - billableBreakdown: { billable, nonBillable } minutes
 *   - topProjects: top 10 projects by hours [{ projectId, projectName, totalMinutes }]
 *   - dailyHours: hours per day [{ date, totalMinutes }]
 */
export const GET = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const url = new URL(req.url);

    const startDateStr = url.searchParams.get('startDate');
    const endDateStr = url.searchParams.get('endDate');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { success: false, error: 'startDate and endDate are required.' },
        { status: 400 },
      );
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid date format.' },
        { status: 400 },
      );
    }

    const pool = getPool();

    // Run all queries in parallel for performance
    const [
      totalsResult,
      activeProjectsResult,
      pendingEntriesResult,
      topProjectsResult,
      dailyHoursResult,
    ] = await Promise.all([
      // Total and billable minutes
      pool.query<{ total_minutes: string; billable_minutes: string }>(
        `SELECT
           COALESCE(SUM(te.duration), 0)::bigint AS total_minutes,
           COALESCE(SUM(CASE WHEN p.is_billable THEN te.duration ELSE 0 END), 0)::bigint AS billable_minutes
         FROM time_entries te
         JOIN projects p ON p.id = te.project_id
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL`,
        [tenantId, startDate, endDate],
      ),

      // Active projects count (projects with time logged in period)
      pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT project_id)::int AS count
         FROM time_entries
         WHERE tenant_id = $1
           AND start_time >= $2
           AND start_time < $3
           AND deleted_at IS NULL`,
        [tenantId, startDate, endDate],
      ),

      // Pending entries (no description)
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM time_entries
         WHERE tenant_id = $1
           AND start_time >= $2
           AND start_time < $3
           AND deleted_at IS NULL
           AND (description IS NULL OR description = '')`,
        [tenantId, startDate, endDate],
      ),

      // Top 10 projects by hours
      pool.query<{ project_id: string; project_name: string; total_minutes: string }>(
        `SELECT
           te.project_id,
           p.name AS project_name,
           COALESCE(SUM(te.duration), 0)::bigint AS total_minutes
         FROM time_entries te
         JOIN projects p ON p.id = te.project_id
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL
         GROUP BY te.project_id, p.name
         ORDER BY total_minutes DESC
         LIMIT 10`,
        [tenantId, startDate, endDate],
      ),

      // Hours per day (last 30 days or custom range)
      pool.query<{ date: string; total_minutes: string }>(
        `SELECT
           DATE(te.start_time) AS date,
           COALESCE(SUM(te.duration), 0)::bigint AS total_minutes
         FROM time_entries te
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL
         GROUP BY DATE(te.start_time)
         ORDER BY date ASC`,
        [tenantId, startDate, endDate],
      ),
    ]);

    const totalMinutes = Number(totalsResult.rows[0]?.total_minutes ?? 0);
    const billableMinutes = Number(totalsResult.rows[0]?.billable_minutes ?? 0);
    const activeProjects = Number(activeProjectsResult.rows[0]?.count ?? 0);
    const pendingEntries = Number(pendingEntriesResult.rows[0]?.count ?? 0);

    return NextResponse.json({
      success: true,
      data: {
        totalMinutes,
        billableMinutes,
        activeProjects,
        pendingEntries,
        billableBreakdown: {
          billable: billableMinutes,
          nonBillable: totalMinutes - billableMinutes,
        },
        topProjects: topProjectsResult.rows.map((row) => ({
          projectId: row.project_id,
          projectName: row.project_name,
          totalMinutes: Number(row.total_minutes),
        })),
        dailyHours: dailyHoursResult.rows.map((row) => ({
          date: row.date,
          totalMinutes: Number(row.total_minutes),
        })),
      },
    });
  } catch (err) {
    console.error('[GET /api/reports/summary] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
