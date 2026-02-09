import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { TimeEntryRepository } from '@hour-tracker/database';
import type { TimeEntryWithClient } from '@hour-tracker/database';
import {
  requireAuth,
  getTenantId,
  getUserId,
  isAdmin,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const timeEntryRepo = new TimeEntryRepository();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportFilters {
  startDate?: string;
  endDate?: string;
  projectId?: string;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function toDurationHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/reports/csv
 *
 * Generate a CSV export of time entries using papaparse.
 *
 * Body:
 *   - startDate: ISO8601 (optional)
 *   - endDate: ISO8601 (optional)
 *   - projectId: UUID (optional)
 *   - userId: UUID (optional, admin only)
 *
 * Returns: CSV file
 *
 * Columns:
 *   Date, User, Client, Project, Task, Start Time, End Time,
 *   Duration (hours), Description
 */
export const POST = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const currentUserId = getUserId(req);
    const userIsAdmin = isAdmin(req);

    const body = (await req.json()) as ExportFilters;

    const startDate = body.startDate ? new Date(body.startDate) : undefined;
    const endDate = body.endDate ? new Date(body.endDate) : undefined;

    if (startDate && isNaN(startDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid startDate.' },
        { status: 400 },
      );
    }
    if (endDate && isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid endDate.' },
        { status: 400 },
      );
    }

    const effectiveUserId = userIsAdmin
      ? body.userId || undefined
      : currentUserId;

    // Fetch entries with client names
    const entries = await timeEntryRepo.findFilteredWithClient(tenantId, {
      userId: effectiveUserId,
      projectId: body.projectId || undefined,
      startDate,
      endDate,
    });

    // Map to CSV row objects
    const rows = entries.map((e: TimeEntryWithClient) => ({
      Date: formatDate(e.startTime),
      User: e.userEmail,
      Client: e.clientName,
      Project: e.projectName,
      Task: e.taskName,
      'Start Time': formatTime(e.startTime),
      'End Time': formatTime(e.endTime),
      'Duration (hours)': toDurationHours(e.duration),
      Description: e.description ?? '',
    }));

    // Add totals row
    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
    rows.push({
      Date: '',
      User: '',
      Client: '',
      Project: '',
      Task: '',
      'Start Time': '',
      'End Time': 'TOTAL',
      'Duration (hours)': toDurationHours(totalMinutes),
      Description: '',
    });

    // Generate CSV with papaparse
    const csv = Papa.unparse(rows, {
      quotes: true,
      header: true,
    });

    // Build filename
    const dateSlug = startDate
      ? `${formatDate(startDate).replace(/[, ]+/g, '-')}`
      : 'all';
    const filename = `report-${dateSlug}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(Buffer.byteLength(csv, 'utf-8')),
      },
    });
  } catch (err) {
    console.error('[POST /api/reports/csv] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
