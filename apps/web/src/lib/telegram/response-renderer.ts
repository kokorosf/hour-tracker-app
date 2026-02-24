// ---------------------------------------------------------------------------
// Response renderer – formats action results into concise Telegram messages.
// ---------------------------------------------------------------------------

import type {
  ActionResult,
  HoursResult,
  LogResult,
  DisambiguationResult,
  RecentResult,
  StatusResult,
  ErrorResult,
} from './action-executor';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderHours(result: HoursResult): string {
  const duration = formatDuration(result.totalMinutes);
  if (result.period === 'today') {
    return `Today: ${duration} (${result.entryCount} entries)`;
  }
  return `This week: ${duration} (${result.entryCount} entries)\n${result.dateRange.start} to ${result.dateRange.end}`;
}

function renderLog(result: LogResult): string {
  const duration = formatDuration(result.durationMinutes);
  let msg = `Logged ${duration} to ${result.clientName} / ${result.projectName} / ${result.taskName} for ${result.date}.`;
  if (result.note) {
    msg += `\nNote: ${result.note}`;
  }
  return msg;
}

function renderDisambiguation(result: DisambiguationResult): string {
  const lines = [result.message, ''];
  result.matches.forEach((m, i) => {
    const extra = m.extra ? ` (${m.extra})` : '';
    lines.push(`${i + 1}. ${m.name}${extra}`);
  });
  return lines.join('\n');
}

function renderRecent(result: RecentResult): string {
  if (result.entries.length === 0) {
    return 'No recent time entries found.';
  }

  const lines = ['Recent entries:', ''];
  for (const e of result.entries) {
    const desc = e.description ? ` - ${e.description}` : '';
    lines.push(`${e.date}  ${e.duration}  ${e.project} / ${e.task}${desc}`);
  }
  return lines.join('\n');
}

function renderStatus(result: StatusResult): string {
  const lines = [
    `Today: ${formatDuration(result.todayMinutes)} (${result.todayEntries} entries)`,
    `This week: ${formatDuration(result.weekMinutes)} (${result.weekEntries} entries)`,
  ];

  if (result.recentProjects.length > 0) {
    lines.push('', 'Active projects this week:');
    for (const p of result.recentProjects) {
      lines.push(`  - ${p}`);
    }
  }

  return lines.join('\n');
}

function renderError(result: ErrorResult): string {
  return result.message;
}

function renderHelp(): string {
  return [
    'Available commands:',
    '',
    '/hours today - Total hours logged today',
    '/hours week - Total hours logged this week',
    '/log <duration> project:Name task:Name note:Optional',
    '  e.g. /log 1h30m project:Website task:Bugfix note:Fixed navbar',
    '/recent - Last 10 time entries',
    '/status - Today + week summary',
    '/link your@email.com - Link your Telegram to your account',
    '/help - Show this message',
    '',
    'You can also ask questions in natural language!',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export function renderResponse(result: ActionResult): string {
  switch (result.type) {
    case 'hours':
      return renderHours(result);
    case 'log':
      return renderLog(result);
    case 'disambiguation':
      return renderDisambiguation(result);
    case 'recent':
      return renderRecent(result);
    case 'status':
      return renderStatus(result);
    case 'error':
      return renderError(result);
  }
}

export { renderHelp };
