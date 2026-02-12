import { NextRequest, NextResponse } from 'next/server';
import {
  TimeEntryRepository,
  getTenantsWithAccountantEmail,
} from '@hour-tracker/database';
import { sendReport, type ReportData } from '@/lib/email/service';
import { generateReportPdf, formatDuration } from '@/lib/reports/pdf-generator';

const timeEntryRepo = new TimeEntryRepository();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the date range for the previous calendar month and a human-readable
 * label, e.g. "January 2026".
 */
function getPreviousMonthRange() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const label = startDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
  return { startDate, endDate, label };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/cron/accountant-report
 *
 * Triggered by an external cron scheduler (Vercel Cron, Cloud Scheduler, etc.)
 * on the 1st of every month.
 *
 * For every tenant that has an accountant email configured, this endpoint:
 *   1. Fetches all time entries from the previous calendar month.
 *   2. Generates a consolidated PDF report.
 *   3. Sends it to the tenant's accountant email.
 *
 * Protected by `CRON_SECRET` (bearer token), not JWT auth.
 */
export async function POST(req: NextRequest) {
  // Validate cron secret.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/accountant-report] CRON_SECRET is not configured.');
    return NextResponse.json(
      { error: 'Cron endpoint not configured.' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { startDate, endDate, label } = getPreviousMonthRange();
  const tenants = await getTenantsWithAccountantEmail();

  const results: Array<{
    tenantId: string;
    status: 'sent' | 'skipped' | 'error';
    reason?: string;
  }> = [];

  for (const tenant of tenants) {
    try {
      const entries = await timeEntryRepo.findFilteredWithClient(tenant.id, {
        startDate,
        endDate,
      });

      if (entries.length === 0) {
        results.push({ tenantId: tenant.id, status: 'skipped', reason: 'no entries' });
        continue;
      }

      // Generate PDF.
      const pdfBuffer = generateReportPdf(tenant.name, entries, label);

      // Build email data.
      const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
      const reportData: ReportData = {
        dateRange: label,
        totalEntries: entries.length,
        totalDuration: formatDuration(totalMinutes),
        projectCount: new Set(entries.map((e) => e.projectId)).size,
        userCount: new Set(entries.map((e) => e.userId)).size,
      };

      await sendReport(
        [tenant.accountantEmail!],
        `Monthly Time Report \u2013 ${tenant.name} \u2013 ${label}`,
        reportData,
        pdfBuffer,
      );

      results.push({ tenantId: tenant.id, status: 'sent' });
      console.log(`[cron/accountant-report] Sent report for tenant ${tenant.id} (${tenant.name}).`);
    } catch (err) {
      console.error(`[cron/accountant-report] Failed for tenant ${tenant.id}:`, err);
      results.push({
        tenantId: tenant.id,
        status: 'error',
        reason: (err as Error).message,
      });
    }
  }

  return NextResponse.json({ success: true, processed: tenants.length, results });
}
