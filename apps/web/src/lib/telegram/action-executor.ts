// ---------------------------------------------------------------------------
// Action executor – runs parsed intents against existing business logic.
// ---------------------------------------------------------------------------

import {
  TimeEntryRepository,
  ProjectRepository,
  TaskRepository,
  ClientRepository,
  writeAuditLog,
} from '@hour-tracker/database';
import type {
  HoursIntent,
  LogIntent,
  RecentIntent,
  StatusIntent,
} from './intent-parser';
import type { ChatContext } from './chat-router';

const timeEntryRepo = new TimeEntryRepository();
const projectRepo = new ProjectRepository();
const taskRepo = new TaskRepository();
const clientRepo = new ClientRepository();

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface HoursResult {
  type: 'hours';
  period: string;
  totalMinutes: number;
  entryCount: number;
  dateRange: { start: string; end: string };
}

export interface LogResult {
  type: 'log';
  durationMinutes: number;
  projectName: string;
  clientName: string;
  taskName: string;
  note: string | null;
  date: string;
  entryId: string;
}

export interface DisambiguationResult {
  type: 'disambiguation';
  entity: 'client' | 'project' | 'task';
  matches: Array<{ name: string; id: string; extra?: string }>;
  message: string;
  /** The original intent — used by the handler to resume after the user picks a number. */
  pendingIntent: LogIntent;
  /** The original Telegram message ID — preserved for the audit log. */
  originalMessageId: string;
}

export interface RecentResult {
  type: 'recent';
  entries: Array<{
    date: string;
    duration: string;
    project: string;
    task: string;
    description: string | null;
  }>;
}

export interface StatusResult {
  type: 'status';
  weekMinutes: number;
  todayMinutes: number;
  todayEntries: number;
  weekEntries: number;
  recentProjects: string[];
}

export interface ErrorResult {
  type: 'error';
  message: string;
}

export type ActionResult =
  | HoursResult
  | LogResult
  | DisambiguationResult
  | RecentResult
  | StatusResult
  | ErrorResult;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end, label: start.toISOString().split('T')[0]! };
}

function weekRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const day = now.getDay();
  // Monday = 1, Sunday = 0
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday,
    end: sunday,
    label: `${monday.toISOString().split('T')[0]} to ${sunday.toISOString().split('T')[0]}`,
  };
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// Execute: /hours
// ---------------------------------------------------------------------------

export async function executeHours(
  intent: HoursIntent,
  ctx: ChatContext,
): Promise<HoursResult> {
  const range = intent.period === 'today' ? todayRange() : weekRange();

  const userId = ctx.user?.id;
  const entries = await timeEntryRepo.findFiltered(ctx.tenant.id, {
    userId,
    startDate: range.start,
    endDate: range.end,
  });

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);

  return {
    type: 'hours',
    period: intent.period,
    totalMinutes,
    entryCount: entries.length,
    dateRange: {
      start: range.start.toISOString().split('T')[0]!,
      end: range.end.toISOString().split('T')[0]!,
    },
  };
}

// ---------------------------------------------------------------------------
// Execute: /log
// ---------------------------------------------------------------------------

export async function executeLog(
  intent: LogIntent,
  ctx: ChatContext,
  messageId: string,
): Promise<LogResult | DisambiguationResult | ErrorResult> {
  if (!ctx.user) {
    return {
      type: 'error',
      message:
        'You need to link your account first. Use /link your@email.com',
    };
  }

  const tenantId = ctx.tenant.id;

  // --- Resolve client ---
  let clientId: string | undefined = intent.resolvedClientId;
  if (!clientId && intent.client) {
    const clients = await clientRepo.findByTenant(tenantId);
    const matches = clients.filter((c) =>
      c.name.toLowerCase().includes(intent.client!.toLowerCase()),
    );
    if (matches.length === 0) {
      return { type: 'error', message: `No client matching "${intent.client}" found.` };
    }
    if (matches.length > 1) {
      return {
        type: 'disambiguation',
        entity: 'client',
        matches: matches.map((c) => ({ name: c.name, id: c.id })),
        message: `I found ${matches.length} matching clients. Reply with the number.`,
        pendingIntent: intent,
        originalMessageId: messageId,
      };
    }
    clientId = matches[0]!.id;
  }

  // --- Resolve project ---
  const projects = await projectRepo.findWithClientName(tenantId, { clientId });
  let resolvedProject: typeof projects[number] | undefined;

  if (intent.resolvedProjectId) {
    resolvedProject = projects.find((p) => p.id === intent.resolvedProjectId);
    if (!resolvedProject) {
      return { type: 'error', message: 'Resolved project not found (may have been deleted).' };
    }
  } else if (intent.project) {
    const matches = projects.filter((p) =>
      p.name.toLowerCase().includes(intent.project!.toLowerCase()),
    );
    if (matches.length === 0) {
      return { type: 'error', message: `No project matching "${intent.project}" found.` };
    }
    if (matches.length > 1) {
      return {
        type: 'disambiguation',
        entity: 'project',
        matches: matches.map((p) => ({
          name: p.name,
          id: p.id,
          extra: p.clientName,
        })),
        message: `I found ${matches.length} matching projects. Reply with the number.`,
        pendingIntent: intent,
        originalMessageId: messageId,
      };
    }
    resolvedProject = matches[0]!;
  } else if (projects.length === 1) {
    resolvedProject = projects[0]!;
  } else {
    return {
      type: 'error',
      message: 'Please specify a project. Usage: /log 1h project:Name task:Name',
    };
  }

  // --- Resolve task ---
  const tasks = await taskRepo.findByProject(resolvedProject.id, tenantId);
  let resolvedTask: typeof tasks[number] | undefined;

  if (intent.resolvedTaskId) {
    resolvedTask = tasks.find((t) => t.id === intent.resolvedTaskId);
    if (!resolvedTask) {
      return { type: 'error', message: 'Resolved task not found (may have been deleted).' };
    }
  } else if (intent.task) {
    const matches = tasks.filter((t) =>
      t.name.toLowerCase().includes(intent.task!.toLowerCase()),
    );
    if (matches.length === 0) {
      return { type: 'error', message: `No task matching "${intent.task}" in project "${resolvedProject.name}".` };
    }
    if (matches.length > 1) {
      return {
        type: 'disambiguation',
        entity: 'task',
        matches: matches.map((t) => ({ name: t.name, id: t.id })),
        message: `I found ${matches.length} matching tasks. Reply with the number.`,
        pendingIntent: intent,
        originalMessageId: messageId,
      };
    }
    resolvedTask = matches[0]!;
  } else if (tasks.length === 1) {
    resolvedTask = tasks[0]!;
  } else {
    return {
      type: 'error',
      message: `Please specify a task for project "${resolvedProject.name}". Usage: /log 1h project:Name task:Name`,
    };
  }

  // --- Build time entry ---
  const now = new Date();
  const startTime = new Date(now.getTime() - intent.durationMinutes * 60_000);

  // --- Overlap check (mirrors POST /api/time-entries) ---
  const overlapping = await timeEntryRepo.findOverlapping(
    ctx.user.id,
    tenantId,
    startTime,
    now,
  );
  if (overlapping.length > 0) {
    return {
      type: 'error',
      message: 'This time entry overlaps with an existing entry. Check /recent to see your logged entries.',
    };
  }

  // --- Daily cap check: 24 hours = 1440 minutes ---
  const existingMinutes = await timeEntryRepo.sumMinutesForDay(
    ctx.user.id,
    tenantId,
    startTime,
  );
  if (existingMinutes + intent.durationMinutes > 1440) {
    const remaining = 1440 - existingMinutes;
    return {
      type: 'error',
      message: `Adding this entry would exceed 24 hours for the day. You have ${formatDuration(remaining)} remaining today.`,
    };
  }

  const entry = await timeEntryRepo.create(
    {
      userId: ctx.user.id,
      projectId: resolvedProject.id,
      taskId: resolvedTask.id,
      startTime,
      endTime: now,
      duration: intent.durationMinutes,
      description: intent.note || null,
    } as Partial<import('@hour-tracker/types').TimeEntry>,
    tenantId,
  );

  // Audit log (fire-and-forget).
  writeAuditLog({
    tenantId,
    userId: ctx.user.id,
    action: 'create',
    entityType: 'time_entry',
    entityId: entry.id,
    afterData: {
      ...entry,
      _channel: 'telegram',
      _senderId: ctx.senderId,
      _messageId: messageId,
    },
  });

  return {
    type: 'log',
    durationMinutes: intent.durationMinutes,
    projectName: resolvedProject.name,
    clientName: resolvedProject.clientName,
    taskName: resolvedTask.name,
    note: intent.note || null,
    date: now.toISOString().split('T')[0]!,
    entryId: entry.id,
  };
}

// ---------------------------------------------------------------------------
// Execute: /recent
// ---------------------------------------------------------------------------

export async function executeRecent(
  _intent: RecentIntent,
  ctx: ChatContext,
): Promise<RecentResult> {
  const userId = ctx.user?.id;
  const entries = await timeEntryRepo.findFiltered(ctx.tenant.id, {
    userId,
    limit: 10,
  });

  return {
    type: 'recent',
    entries: entries.map((e) => ({
      date: new Date(e.startTime).toISOString().split('T')[0]!,
      duration: formatDuration(e.duration),
      project: e.projectName,
      task: e.taskName,
      description: e.description,
    })),
  };
}

// ---------------------------------------------------------------------------
// Execute: /status
// ---------------------------------------------------------------------------

export async function executeStatus(
  _intent: StatusIntent,
  ctx: ChatContext,
): Promise<StatusResult> {
  const userId = ctx.user?.id;

  const today = todayRange();
  const week = weekRange();

  const [todayEntries, weekEntries] = await Promise.all([
    timeEntryRepo.findFiltered(ctx.tenant.id, {
      userId,
      startDate: today.start,
      endDate: today.end,
    }),
    timeEntryRepo.findFiltered(ctx.tenant.id, {
      userId,
      startDate: week.start,
      endDate: week.end,
    }),
  ]);

  const todayMinutes = todayEntries.reduce((sum, e) => sum + e.duration, 0);
  const weekMinutes = weekEntries.reduce((sum, e) => sum + e.duration, 0);

  // Unique project names from this week.
  const projectSet = new Set(weekEntries.map((e) => e.projectName));

  return {
    type: 'status',
    weekMinutes,
    todayMinutes,
    todayEntries: todayEntries.length,
    weekEntries: weekEntries.length,
    recentProjects: Array.from(projectSet).slice(0, 5),
  };
}
