import { NextResponse } from 'next/server';
import { TimeEntryRepository } from '@hour-tracker/database';
import {
  requireAuth,
  getTenantId,
  getUserId,
  isAdmin,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const timeEntryRepo = new TimeEntryRepository();

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

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * GET /api/reports/export
 *
 * Export time entries as CSV or PDF.
 *
 * Query params:
 *   - format: 'csv' | 'pdf' (required)
 *   - startDate: ISO8601 (optional)
 *   - endDate: ISO8601 (optional)
 *   - projectId: UUID (optional)
 *   - userId: UUID (optional, admin only)
 */
export const GET = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const currentUserId = getUserId(req);
    const userIsAdmin = isAdmin(req);
    const url = new URL(req.url);

    const format = url.searchParams.get('format');
    if (format !== 'csv' && format !== 'pdf') {
      return NextResponse.json(
        { success: false, error: 'format must be "csv" or "pdf".' },
        { status: 400 },
      );
    }

    const startDateStr = url.searchParams.get('startDate');
    const endDateStr = url.searchParams.get('endDate');
    const projectId = url.searchParams.get('projectId') || undefined;
    const userIdFilter = userIsAdmin
      ? url.searchParams.get('userId') || undefined
      : currentUserId;

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr) : undefined;

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

    // Fetch all matching entries (no pagination limit for export)
    const entries = await timeEntryRepo.findFiltered(tenantId, {
      userId: userIsAdmin ? userIdFilter : currentUserId,
      projectId,
      startDate,
      endDate,
    });

    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);

    if (format === 'csv') {
      return buildCsvResponse(entries, totalMinutes);
    }

    return buildPdfResponse(entries, totalMinutes, startDate, endDate);
  } catch (err) {
    console.error('[GET /api/reports/export] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

// ---------------------------------------------------------------------------
// CSV builder
// ---------------------------------------------------------------------------

function buildCsvResponse(
  entries: Array<{
    startTime: Date;
    userEmail: string;
    projectName: string;
    taskName: string;
    duration: number;
    description: string | null;
  }>,
  totalMinutes: number,
): NextResponse {
  const header = 'Date,User,Project,Task,Duration,Description';
  const rows = entries.map((e) =>
    [
      escapeCSV(formatDate(e.startTime)),
      escapeCSV(e.userEmail),
      escapeCSV(e.projectName),
      escapeCSV(e.taskName),
      escapeCSV(formatDuration(e.duration)),
      escapeCSV(e.description ?? ''),
    ].join(','),
  );

  // Add totals row
  rows.push('');
  rows.push(`Total,,,,"${formatDuration(totalMinutes)}",`);

  const csv = [header, ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="report.csv"',
    },
  });
}

// ---------------------------------------------------------------------------
// PDF builder (plain text-based PDF)
// ---------------------------------------------------------------------------

function buildPdfResponse(
  entries: Array<{
    startTime: Date;
    userEmail: string;
    projectName: string;
    taskName: string;
    duration: number;
    description: string | null;
  }>,
  totalMinutes: number,
  startDate?: Date,
  endDate?: Date,
): NextResponse {
  // Build a simple PDF using raw PDF syntax (no external library needed)
  const title = 'Time Entry Report';
  const dateRange =
    startDate && endDate
      ? `${formatDate(startDate)} - ${formatDate(endDate)}`
      : 'All dates';

  const lines: string[] = [];
  lines.push(title);
  lines.push(`Date Range: ${dateRange}`);
  lines.push(`Generated: ${formatDate(new Date())}`);
  lines.push(`Total Entries: ${entries.length}`);
  lines.push(`Total Duration: ${formatDuration(totalMinutes)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Table header
  lines.push(
    padRight('Date', 14) +
      padRight('User', 30) +
      padRight('Project', 20) +
      padRight('Task', 20) +
      padRight('Duration', 10) +
      'Description',
  );
  lines.push('-'.repeat(120));

  for (const e of entries) {
    lines.push(
      padRight(formatDate(e.startTime), 14) +
        padRight(truncate(e.userEmail, 28), 30) +
        padRight(truncate(e.projectName, 18), 20) +
        padRight(truncate(e.taskName, 18), 20) +
        padRight(formatDuration(e.duration), 10) +
        truncate(e.description ?? '', 40),
    );
  }

  lines.push('-'.repeat(120));
  lines.push(
    padRight('TOTAL', 84) + padRight(formatDuration(totalMinutes), 10),
  );

  const textContent = lines.join('\n');

  // Generate a minimal valid PDF
  const pdfBytes = generateMinimalPdf(textContent);

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="report.pdf"',
    },
  });
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Generate a minimal valid PDF containing the given text.
 * Uses a fixed-width font (Courier) for table alignment.
 */
function generateMinimalPdf(text: string): Uint8Array {
  const textLines = text.split('\n');
  const fontSize = 8;
  const lineHeight = fontSize * 1.4;
  const marginLeft = 30;
  const marginTop = 30;
  const pageWidth = 842; // A4 landscape width in points
  const pageHeight = 595; // A4 landscape height in points
  const usableHeight = pageHeight - marginTop * 2;
  const linesPerPage = Math.floor(usableHeight / lineHeight);

  // Split into pages
  const pages: string[][] = [];
  for (let i = 0; i < textLines.length; i += linesPerPage) {
    pages.push(textLines.slice(i, i + linesPerPage));
  }

  if (pages.length === 0) pages.push(['No data']);

  // Build PDF objects
  const objects: string[] = [];
  const offsets: number[] = [];

  // Helper to add an object
  const addObj = (content: string) => {
    objects.push(content);
  };

  // Obj 1: Catalog
  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  // Obj 2: Pages (will reference page objects)
  const pageObjStart = 4; // page objects start at obj 4
  const pageRefs = pages
    .map((_, i) => `${pageObjStart + i * 2} 0 R`)
    .join(' ');
  addObj(
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>\nendobj`,
  );

  // Obj 3: Font
  addObj(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj',
  );

  // Generate page + stream pairs
  for (let p = 0; p < pages.length; p++) {
    const pageLines = pages[p]!;
    const pageObjNum = pageObjStart + p * 2;
    const streamObjNum = pageObjNum + 1;

    // Build stream content
    let streamContent = `BT\n/F1 ${fontSize} Tf\n`;
    for (let l = 0; l < pageLines.length; l++) {
      const x = marginLeft;
      const y = pageHeight - marginTop - l * lineHeight;
      const line = pageLines[l] ?? '';
      const escaped = line
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
      streamContent += `${x} ${y.toFixed(1)} Td\n(${escaped}) Tj\n-${x} -${y.toFixed(1)} Td\n`;
    }
    streamContent += 'ET';

    // Page object
    addObj(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamObjNum} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj`,
    );

    // Stream object
    addObj(
      `${streamObjNum} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`,
    );
  }

  // Assemble PDF
  let pdf = '%PDF-1.4\n';

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += objects[i] + '\n';
  }

  // Cross-reference table
  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  // Trailer
  pdf += 'trailer\n';
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF\n';

  return new TextEncoder().encode(pdf);
}
