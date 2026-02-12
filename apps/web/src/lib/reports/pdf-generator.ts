import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TimeEntryWithClient } from '@hour-tracker/database';

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

function formatDecimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

function formatDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export { formatDuration, formatDecimalHours, formatDate, formatTime };

/**
 * Generate a consolidated PDF report for the given time entries.
 *
 * Returns a `Buffer` containing the raw PDF bytes, ready to be sent as an
 * email attachment or streamed to the client.
 */
export function generateReportPdf(
  companyName: string,
  entries: TimeEntryWithClient[],
  dateRange: string,
): Buffer {
  const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
  const uniqueProjects = new Set(entries.map((e) => e.projectId)).size;
  const uniqueUsers = new Set(entries.map((e) => e.userId)).size;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, 14, 18);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Time Entry Report', 14, 27);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Date Range: ${dateRange}`, 14, 33);
  doc.text(`Generated: ${formatDate(new Date())}`, 14, 38);
  doc.setTextColor(0, 0, 0);

  // Summary boxes
  const summaryY = 44;
  const boxWidth = 55;
  const boxHeight = 18;
  const boxGap = 6;

  const summaryItems = [
    { label: 'Total Hours', value: formatDuration(totalMinutes) },
    { label: 'Total Entries', value: String(entries.length) },
    { label: 'Projects', value: String(uniqueProjects) },
    { label: 'Users', value: String(uniqueUsers) },
  ];

  summaryItems.forEach((item, i) => {
    const x = 14 + i * (boxWidth + boxGap);
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(x, summaryY, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(item.label, x + 4, summaryY + 6);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(item.value, x + 4, summaryY + 14);
    doc.setFont('helvetica', 'normal');
  });

  // Table
  const tableStartY = summaryY + boxHeight + 8;

  autoTable(doc, {
    startY: tableStartY,
    head: [['Date', 'User', 'Client', 'Project', 'Task', 'Start', 'End', 'Hours', 'Description']],
    body: entries.map((e) => [
      formatDate(e.startTime),
      e.userEmail,
      e.clientName,
      e.projectName,
      e.taskName,
      formatTime(e.startTime),
      formatTime(e.endTime),
      formatDecimalHours(e.duration),
      (e.description ?? '').slice(0, 60),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: [50, 50, 50] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 38 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 28 },
      5: { cellWidth: 16 },
      6: { cellWidth: 16 },
      7: { cellWidth: 16, halign: 'right' },
      8: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
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
      doc.text(companyName, 14, doc.internal.pageSize.getHeight() - 8);
    },
  });

  // Totals row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? tableStartY + 20;
  doc.setFillColor(240, 242, 245);
  doc.rect(14, finalY + 2, pageWidth - 28, 10, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('TOTAL', 18, finalY + 9);
  doc.text(
    `${formatDuration(totalMinutes)} (${formatDecimalHours(totalMinutes)} hrs)`,
    pageWidth - 18,
    finalY + 9,
    { align: 'right' },
  );

  return Buffer.from(doc.output('arraybuffer'));
}
