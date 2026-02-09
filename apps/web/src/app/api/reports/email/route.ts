import { NextResponse } from 'next/server';
import { TimeEntryRepository, UserRepository } from '@hour-tracker/database';
import {
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const timeEntryRepo = new TimeEntryRepository();
const userRepo = new UserRepository();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

interface EmailReportBody {
  startDate?: string;
  endDate?: string;
  projectId?: string;
  userId?: string;
}

/**
 * POST /api/reports/email
 *
 * Send a report summary via email to all admin users.
 * Admin only.
 *
 * Body:
 *   - startDate: ISO8601 (optional)
 *   - endDate: ISO8601 (optional)
 *   - projectId: UUID (optional)
 *   - userId: UUID (optional)
 */
export const POST = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const body = (await req.json()) as EmailReportBody;

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

    // Fetch matching entries
    const entries = await timeEntryRepo.findFiltered(tenantId, {
      userId: body.userId || undefined,
      projectId: body.projectId || undefined,
      startDate,
      endDate,
    });

    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);

    // Fetch admin users to "send" the email to
    const admins = await userRepo.findByTenant(tenantId);
    const adminEmails = admins
      .filter((u) => u.role === 'admin')
      .map((u) => u.email);

    // Build email body (in a real app this would be sent via an email service)
    const dateRange =
      startDate && endDate
        ? `${formatDate(startDate)} - ${formatDate(endDate)}`
        : 'All dates';

    const emailSubject = `Time Entry Report - ${dateRange}`;
    const emailBody = buildEmailBody(entries, totalMinutes, dateRange);

    // Log the email (placeholder for actual email sending)
    console.log('[Email Report]');
    console.log(`  To: ${adminEmails.join(', ')}`);
    console.log(`  Subject: ${emailSubject}`);
    console.log(`  Entries: ${entries.length}`);
    console.log(`  Total: ${formatDuration(totalMinutes)}`);

    return NextResponse.json({
      success: true,
      data: {
        recipients: adminEmails,
        subject: emailSubject,
        entriesCount: entries.length,
        totalDuration: formatDuration(totalMinutes),
        message: 'Report email queued successfully.',
        // In production, integrate with an email service like SendGrid, AWS SES, etc.
        _note: emailBody.slice(0, 200) + '...',
      },
    });
  } catch (err) {
    console.error('[POST /api/reports/email] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

function buildEmailBody(
  entries: Array<{
    startTime: Date;
    userEmail: string;
    projectName: string;
    taskName: string;
    duration: number;
    description: string | null;
  }>,
  totalMinutes: number,
  dateRange: string,
): string {
  let body = `Time Entry Report\n`;
  body += `Date Range: ${dateRange}\n`;
  body += `Total Entries: ${entries.length}\n`;
  body += `Total Duration: ${formatDuration(totalMinutes)}\n\n`;
  body += `${'Date'.padEnd(14)}${'User'.padEnd(30)}${'Project'.padEnd(20)}${'Task'.padEnd(20)}${'Duration'.padEnd(10)}Description\n`;
  body += '-'.repeat(120) + '\n';

  for (const e of entries) {
    body += `${formatDate(e.startTime).padEnd(14)}`;
    body += `${e.userEmail.slice(0, 28).padEnd(30)}`;
    body += `${e.projectName.slice(0, 18).padEnd(20)}`;
    body += `${e.taskName.slice(0, 18).padEnd(20)}`;
    body += `${formatDuration(e.duration).padEnd(10)}`;
    body += `${(e.description ?? '').slice(0, 40)}\n`;
  }

  body += '-'.repeat(120) + '\n';
  body += `${'TOTAL'.padEnd(84)}${formatDuration(totalMinutes)}\n`;

  return body;
}
