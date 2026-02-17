import { NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TimeEntryRepository, getTenantById } from '@hour-tracker/database';
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

function formatDuration(minutes: number): string {
  const hours = (minutes / 60).toFixed(2);
  return `${hours}`;
}

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

function formatHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/reports/pdf
 *
 * Generate a PDF report of time entries.
 *
 * Body:
 *   - startDate: ISO8601 (optional)
 *   - endDate: ISO8601 (optional)
 *   - projectId: UUID (optional)
 *   - userId: UUID (optional, admin only)
 *
 * Returns: PDF blob
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

    // Fetch tenant info for company name
    const tenant = await getTenantById(tenantId);
    const companyName = tenant?.name ?? 'Hour Tracker';

    // Fetch entries with client names
    const entries = await timeEntryRepo.findFilteredWithClient(tenantId, {
      userId: effectiveUserId,
      projectId: body.projectId || undefined,
      startDate,
      endDate,
    });

    // Compute summary stats
    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
    const uniqueProjects = new Set(entries.map((e) => e.projectId)).size;
    const uniqueUsers = new Set(entries.map((e) => e.userId)).size;
    const billableEntries = entries.length; // all entries returned

    const dateRange =
      startDate && endDate
        ? `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`
        : 'All dates';

    // -----------------------------------------------------------------------
    // Build PDF with jsPDF + autoTable
    // -----------------------------------------------------------------------

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // -- Header: Company name --
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName, 14, 18);

    // -- Report title and date range --
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Time Entry Report', 14, 27);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date Range: ${dateRange}`, 14, 33);
    doc.text(`Generated: ${formatDate(new Date())}`, 14, 38);
    doc.setTextColor(0, 0, 0);

    // -- Summary statistics boxes --
    const summaryY = 44;
    const boxWidth = 55;
    const boxHeight = 18;
    const boxGap = 6;

    const summaryItems = [
      { label: 'Total Hours', value: formatHoursMinutes(totalMinutes) },
      { label: 'Total Entries', value: String(entries.length) },
      { label: 'Projects', value: String(uniqueProjects) },
      { label: 'Users', value: String(uniqueUsers) },
    ];

    summaryItems.forEach((item, i) => {
      const x = 14 + i * (boxWidth + boxGap);

      // Box background
      doc.setFillColor(245, 247, 250);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(x, summaryY, boxWidth, boxHeight, 2, 2, 'FD');

      // Label
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(item.label, x + 4, summaryY + 6);

      // Value
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(item.value, x + 4, summaryY + 14);
      doc.setFont('helvetica', 'normal');
    });

    // -- Time entries table --
    const tableStartY = summaryY + boxHeight + 8;

    const tableHead = [
      ['Date', 'User', 'Client', 'Project', 'Task', 'Start', 'End', 'Hours', 'Description'],
    ];

    const tableBody = entries.map((e) => [
      formatDate(e.startTime),
      e.userEmail,
      e.clientName,
      e.projectName,
      e.taskName,
      formatTime(e.startTime),
      formatTime(e.endTime),
      formatDuration(e.duration),
      (e.description ?? '').slice(0, 60),
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: tableHead,
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [59, 130, 246], // blue-500
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [50, 50, 50],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50
      },
      columnStyles: {
        0: { cellWidth: 22 },  // Date
        1: { cellWidth: 38 },  // User
        2: { cellWidth: 28 },  // Client
        3: { cellWidth: 28 },  // Project
        4: { cellWidth: 28 },  // Task
        5: { cellWidth: 16 },  // Start
        6: { cellWidth: 16 },  // End
        7: { cellWidth: 16, halign: 'right' }, // Hours
        8: { cellWidth: 'auto' },  // Description
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        // Footer on every page
        const pageCount = doc.getNumberOfPages();
        const pageNum = data.pageNumber;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${pageNum} of ${pageCount}`,
          pageWidth - 14,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'right' },
        );
        doc.text(
          companyName,
          14,
          doc.internal.pageSize.getHeight() - 8,
        );
      },
    });

    // -- Totals row after table --
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? tableStartY + 20;

    doc.setFillColor(240, 242, 245);
    doc.rect(14, finalY + 2, pageWidth - 28, 10, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('TOTAL', 18, finalY + 9);
    doc.text(
      `${formatHoursMinutes(totalMinutes)} (${formatDuration(totalMinutes)} hrs)`,
      pageWidth - 18,
      finalY + 9,
      { align: 'right' },
    );

    // Generate buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-${startDate ? formatDate(startDate).replace(/[, ]+/g, '-') : 'all'}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error('[POST /api/reports/pdf] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
