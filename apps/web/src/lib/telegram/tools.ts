// ---------------------------------------------------------------------------
// Claude tool definitions and execution logic for the Telegram bot.
// ---------------------------------------------------------------------------

import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import {
  TimeEntryRepository,
  UserRepository,
  ProjectRepository,
  ClientRepository,
} from '@hour-tracker/database';

// ---------------------------------------------------------------------------
// Repository instances
// ---------------------------------------------------------------------------

const timeEntryRepo = new TimeEntryRepository();
const userRepo = new UserRepository();
const projectRepo = new ProjectRepository();
const clientRepo = new ClientRepository();

// ---------------------------------------------------------------------------
// Tool definitions (sent to Claude)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'get_user_hours',
    description:
      'Get the total hours worked by a specific user in a date range. ' +
      'Provide the user email (or part of it) and a start/end date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'The email address (or partial email) of the user.',
        },
        start_date: {
          type: 'string',
          description: 'Start date in ISO 8601 format (YYYY-MM-DD).',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO 8601 format (YYYY-MM-DD).',
        },
      },
      required: ['email', 'start_date', 'end_date'],
    },
  },
  {
    name: 'get_project_hours',
    description:
      'Get total hours grouped by project for a date range. ' +
      'Optionally filter by project name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: {
          type: 'string',
          description: 'Optional project name to filter by (partial match).',
        },
        start_date: {
          type: 'string',
          description: 'Start date in ISO 8601 format (YYYY-MM-DD).',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO 8601 format (YYYY-MM-DD).',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'list_users',
    description: 'List all employees (users) in the organisation with their roles and emails.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_projects',
    description: 'List all active projects with their client names and billable status.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_summary',
    description:
      'Get a high-level summary of hours for a date range: total hours, ' +
      'number of entries, per-user breakdown, and top projects.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in ISO 8601 format (YYYY-MM-DD).',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO 8601 format (YYYY-MM-DD).',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

interface ToolInput {
  email?: string;
  project_name?: string;
  start_date?: string;
  end_date?: string;
}

/**
 * Execute a tool call and return a JSON-serialisable result.
 */
export async function executeTool(
  name: string,
  input: ToolInput,
  tenantId: string,
): Promise<unknown> {
  switch (name) {
    case 'get_user_hours':
      return getUserHours(tenantId, input);
    case 'get_project_hours':
      return getProjectHours(tenantId, input);
    case 'list_users':
      return listUsers(tenantId);
    case 'list_projects':
      return listProjects(tenantId);
    case 'get_summary':
      return getSummary(tenantId, input);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function getUserHours(tenantId: string, input: ToolInput) {
  const { email, start_date, end_date } = input;
  if (!email || !start_date || !end_date) {
    return { error: 'Missing required parameters: email, start_date, end_date.' };
  }

  // Try exact match first, then partial.
  let user = await userRepo.findByEmail(email, tenantId);
  if (!user) {
    // Try partial match — list all users and find closest match.
    const allUsers = await userRepo.findByTenant(tenantId);
    user = allUsers.find(
      (u) =>
        u.email.toLowerCase().includes(email.toLowerCase()) ||
        email.toLowerCase().includes(u.email.toLowerCase()),
    ) ?? null;
  }

  if (!user) {
    return { error: `No user found matching "${email}".` };
  }

  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  endDate.setHours(23, 59, 59, 999);

  const entries = await timeEntryRepo.findFiltered(tenantId, {
    userId: user.id,
    startDate,
    endDate,
  });

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    user: { email: user.email, role: user.role },
    dateRange: { start: start_date, end: end_date },
    totalEntries: entries.length,
    totalMinutes,
    totalFormatted: `${hours}h ${minutes}m`,
    entries: entries.slice(0, 50).map((e) => ({
      date: e.startTime,
      duration: e.duration,
      project: e.projectName,
      task: e.taskName,
      description: e.description,
    })),
  };
}

async function getProjectHours(tenantId: string, input: ToolInput) {
  const { project_name, start_date, end_date } = input;
  if (!start_date || !end_date) {
    return { error: 'Missing required parameters: start_date, end_date.' };
  }

  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  endDate.setHours(23, 59, 59, 999);

  const projectSummaries = await timeEntryRepo.sumHoursByProject(tenantId, startDate, endDate);
  const allProjects = await projectRepo.findWithClientName(tenantId);

  let results = projectSummaries.map((ps) => {
    const project = allProjects.find((p) => p.id === ps.projectId);
    return {
      projectName: project?.name ?? 'Unknown',
      clientName: project?.clientName ?? 'Unknown',
      isBillable: project?.isBillable ?? false,
      totalMinutes: ps.totalMinutes,
      totalFormatted: `${Math.floor(ps.totalMinutes / 60)}h ${ps.totalMinutes % 60}m`,
    };
  });

  // Filter by project name if provided.
  if (project_name) {
    results = results.filter((r) =>
      r.projectName.toLowerCase().includes(project_name.toLowerCase()),
    );
  }

  const grandTotal = results.reduce((sum, r) => sum + r.totalMinutes, 0);

  return {
    dateRange: { start: start_date, end: end_date },
    projects: results,
    grandTotalMinutes: grandTotal,
    grandTotalFormatted: `${Math.floor(grandTotal / 60)}h ${grandTotal % 60}m`,
  };
}

async function listUsers(tenantId: string) {
  const users = await userRepo.findByTenant(tenantId);
  return {
    count: users.length,
    users: users.map((u) => ({
      email: u.email,
      role: u.role,
    })),
  };
}

async function listProjects(tenantId: string) {
  const projects = await projectRepo.findWithClientName(tenantId);
  const clients = await clientRepo.findByTenant(tenantId);

  return {
    projectCount: projects.length,
    clientCount: clients.length,
    projects: projects.map((p) => ({
      name: p.name,
      clientName: p.clientName,
      isBillable: p.isBillable,
    })),
  };
}

async function getSummary(tenantId: string, input: ToolInput) {
  const { start_date, end_date } = input;
  if (!start_date || !end_date) {
    return { error: 'Missing required parameters: start_date, end_date.' };
  }

  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  endDate.setHours(23, 59, 59, 999);

  const entries = await timeEntryRepo.findFiltered(tenantId, { startDate, endDate });
  const projectSummaries = await timeEntryRepo.sumHoursByProject(tenantId, startDate, endDate);
  const allProjects = await projectRepo.findWithClientName(tenantId);

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);

  // Per-user breakdown.
  const userMap = new Map<string, { email: string; totalMinutes: number }>();
  for (const e of entries) {
    const existing = userMap.get(e.userId) ?? { email: e.userEmail, totalMinutes: 0 };
    existing.totalMinutes += e.duration;
    userMap.set(e.userId, existing);
  }

  const perUser = Array.from(userMap.values())
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .map((u) => ({
      email: u.email,
      totalMinutes: u.totalMinutes,
      totalFormatted: `${Math.floor(u.totalMinutes / 60)}h ${u.totalMinutes % 60}m`,
    }));

  // Top projects.
  const topProjects = projectSummaries.slice(0, 10).map((ps) => {
    const project = allProjects.find((p) => p.id === ps.projectId);
    return {
      projectName: project?.name ?? 'Unknown',
      clientName: project?.clientName ?? 'Unknown',
      totalMinutes: ps.totalMinutes,
      totalFormatted: `${Math.floor(ps.totalMinutes / 60)}h ${ps.totalMinutes % 60}m`,
    };
  });

  return {
    dateRange: { start: start_date, end: end_date },
    totalEntries: entries.length,
    totalMinutes,
    totalFormatted: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
    uniqueUsers: userMap.size,
    uniqueProjects: projectSummaries.length,
    perUser,
    topProjects,
  };
}
