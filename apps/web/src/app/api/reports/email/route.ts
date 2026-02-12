import { NextResponse } from 'next/server';
import {
  TimeEntryRepository,
  UserRepository,
  getTenantById,
} from '@hour-tracker/database';
import {
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import { sendReport, type ReportData } from '@/lib/email/service';
import { generateReportPdf, formatDuration, formatDate } from '@/lib/reports/pdf-generator';

const timeEntryRepo = new TimeEntryRepository();
const userRepo = new UserRepository();

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
 * Generates a PDF attachment and sends it using the email service.
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

    // Fetch matching entries with client names
    const entries = await timeEntryRepo.findFilteredWithClient(tenantId, {
      userId: body.userId || undefined,
      projectId: body.projectId || undefined,
      startDate,
      endDate,
    });

    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
    const uniqueProjects = new Set(entries.map((e) => e.projectId)).size;
    const uniqueUsers = new Set(entries.map((e) => e.userId)).size;

    // Fetch admin users as recipients
    const admins = await userRepo.findByTenant(tenantId);
    const adminEmails = admins
      .filter((u) => u.role === 'admin')
      .map((u) => u.email);

    if (adminEmails.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No admin recipients found.' },
        { status: 400 },
      );
    }

    const dateRange =
      startDate && endDate
        ? `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`
        : 'All dates';

    const emailSubject = `Time Entry Report \u2013 ${dateRange}`;

    // Generate PDF attachment
    const tenant = await getTenantById(tenantId);
    const companyName = tenant?.name ?? 'Hour Tracker';
    const pdfBuffer = generateReportPdf(companyName, entries, dateRange);

    // Send email
    const reportData: ReportData = {
      dateRange,
      totalEntries: entries.length,
      totalDuration: formatDuration(totalMinutes),
      projectCount: uniqueProjects,
      userCount: uniqueUsers,
    };

    await sendReport(adminEmails, emailSubject, reportData, pdfBuffer);

    return NextResponse.json({
      success: true,
      data: {
        recipients: adminEmails,
        subject: emailSubject,
        entriesCount: entries.length,
        totalDuration: formatDuration(totalMinutes),
        message: 'Report email sent successfully.',
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
