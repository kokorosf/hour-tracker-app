import { NextResponse } from 'next/server';
import { getPool } from '@hour-tracker/database';
import {
  requireAuth,
  getTenantId,
  getUserId,
  isAdmin,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

/**
 * GET /api/reports/summary
 *
 * Return aggregated statistics for the dashboard.
 *
 * Query params:
 *   - startDate: ISO8601 date string (required)
 *   - endDate: ISO8601 date string (required)
 *   - userId: UUID (optional, admin only - filter by specific user)
 *
 * Returns:
 *   - totalHours: total hours logged in the period
 *   - billableHours: hours on billable projects
 *   - nonBillableHours: hours on non-billable projects
 *   - projectBreakdown: Array<{ projectId, projectName, hours, billable }>
 *   - dailyHours: Array<{ date, hours }>
 *   - topProjects: Array<{ projectId, projectName, hours }> (top 10)
 *   - userBreakdown: Array<{ userId, userName, hours }> (admin only)
 *   - activeProjects: count of projects with time logged
 *   - pendingEntries: entries with no description
 */
export const GET = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const currentUserId = getUserId(req);
    const userIsAdmin = isAdmin(req);
    const url = new URL(req.url);

    // --- Parse and validate query params ---
    const startDateStr = url.searchParams.get('startDate');
    const endDateStr = url.searchParams.get('endDate');
    const userIdFilter = url.searchParams.get('userId');

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

    // Non-admins can only view their own data
    const effectiveUserId = userIsAdmin ? userIdFilter : currentUserId;

    const pool = getPool();

    // Build common WHERE conditions
    const baseParams: unknown[] = [tenantId, startDate, endDate];
    let userCondition = '';
    if (effectiveUserId) {
      baseParams.push(effectiveUserId);
      userCondition = ` AND te.user_id = $${baseParams.length}`;
    }

    // Run all queries in parallel for performance
    const [
      totalsResult,
      projectBreakdownResult,
      dailyHoursResult,
      activeProjectsResult,
      pendingEntriesResult,
      clientBreakdownResult,
    ] = await Promise.all([
      // 1. Total and billable hours
      pool.query<{ total_minutes: string; billable_minutes: string }>(
        `SELECT
           COALESCE(SUM(te.duration), 0)::bigint AS total_minutes,
           COALESCE(SUM(CASE WHEN p.is_billable THEN te.duration ELSE 0 END), 0)::bigint AS billable_minutes
         FROM time_entries te
         JOIN projects p ON p.id = te.project_id
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL${userCondition}`,
        baseParams,
      ),

      // 2. Project breakdown (all projects with hours and billable status)
      pool.query<{ project_id: string; project_name: string; total_minutes: string; is_billable: boolean }>(
        `SELECT
           te.project_id,
           p.name AS project_name,
           COALESCE(SUM(te.duration), 0)::bigint AS total_minutes,
           p.is_billable
         FROM time_entries te
         JOIN projects p ON p.id = te.project_id
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL${userCondition}
         GROUP BY te.project_id, p.name, p.is_billable
         ORDER BY total_minutes DESC`,
        baseParams,
      ),

      // 3. Daily hours
      pool.query<{ date: string; total_minutes: string }>(
        `SELECT
           DATE(te.start_time) AS date,
           COALESCE(SUM(te.duration), 0)::bigint AS total_minutes
         FROM time_entries te
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL${userCondition}
         GROUP BY DATE(te.start_time)
         ORDER BY date ASC`,
        baseParams,
      ),

      // 4. Active projects count
      pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT project_id)::int AS count
         FROM time_entries te
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL${userCondition}`,
        baseParams,
      ),

      // 5. Pending entries (no description)
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM time_entries te
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL
           AND (te.description IS NULL OR te.description = '')${userCondition}`,
        baseParams,
      ),

      // 6. Client breakdown (hours aggregated at client level)
      pool.query<{ client_id: string; client_name: string; total_minutes: string }>(
        `SELECT
           c.id AS client_id,
           c.name AS client_name,
           COALESCE(SUM(te.duration), 0)::bigint AS total_minutes
         FROM time_entries te
         JOIN projects p ON p.id = te.project_id
         JOIN clients c ON c.id = p.client_id
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL${userCondition}
         GROUP BY c.id, c.name
         ORDER BY total_minutes DESC`,
        baseParams,
      ),
    ]);

    // 7. User breakdown (admin only, without user filter)
    let userBreakdownResult: { rows: { user_id: string; user_email: string; total_minutes: string }[] } | null = null;
    if (userIsAdmin && !userIdFilter) {
      userBreakdownResult = await pool.query<{ user_id: string; user_email: string; total_minutes: string }>(
        `SELECT
           te.user_id,
           u.email AS user_email,
           COALESCE(SUM(te.duration), 0)::bigint AS total_minutes
         FROM time_entries te
         JOIN users u ON u.id = te.user_id
         WHERE te.tenant_id = $1
           AND te.start_time >= $2
           AND te.start_time < $3
           AND te.deleted_at IS NULL
         GROUP BY te.user_id, u.email
         ORDER BY total_minutes DESC`,
        [tenantId, startDate, endDate],
      );
    }

    const totalMinutes = Number(totalsResult.rows[0]?.total_minutes ?? 0);
    const billableMinutes = Number(totalsResult.rows[0]?.billable_minutes ?? 0);
    const nonBillableMinutes = totalMinutes - billableMinutes;

    // Convert minutes to hours (decimal)
    const toHours = (minutes: number) => Number((minutes / 60).toFixed(2));

    // Build response
    const response: Record<string, unknown> = {
      totalHours: toHours(totalMinutes),
      billableHours: toHours(billableMinutes),
      nonBillableHours: toHours(nonBillableMinutes),
      activeProjects: Number(activeProjectsResult.rows[0]?.count ?? 0),
      pendingEntries: Number(pendingEntriesResult.rows[0]?.count ?? 0),
      projectBreakdown: projectBreakdownResult.rows.map((row) => ({
        projectId: row.project_id,
        projectName: row.project_name,
        hours: toHours(Number(row.total_minutes)),
        billable: row.is_billable,
      })),
      topProjects: projectBreakdownResult.rows.slice(0, 10).map((row) => ({
        projectId: row.project_id,
        projectName: row.project_name,
        hours: toHours(Number(row.total_minutes)),
      })),
      dailyHours: dailyHoursResult.rows.map((row) => ({
        date: row.date,
        hours: toHours(Number(row.total_minutes)),
      })),
      clientBreakdown: clientBreakdownResult.rows.map((row) => ({
        clientId: row.client_id,
        clientName: row.client_name,
        hours: toHours(Number(row.total_minutes)),
      })),
      // Legacy fields for backward compatibility with dashboard
      totalMinutes,
      billableMinutes,
      billableBreakdown: {
        billable: billableMinutes,
        nonBillable: nonBillableMinutes,
      },
    };

    // Add user breakdown for admins (when not filtering by specific user)
    if (userIsAdmin && userBreakdownResult) {
      response.userBreakdown = userBreakdownResult.rows.map((row) => ({
        userId: row.user_id,
        userName: row.user_email,
        hours: toHours(Number(row.total_minutes)),
      }));
    }

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (err) {
    console.error('[GET /api/reports/summary] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
