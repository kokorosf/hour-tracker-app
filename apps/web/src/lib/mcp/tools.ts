/**
 * MCP tool definitions for Pure Track.
 * Each tool maps 1:1 to a method on the /api/mcp endpoint.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResponse } from './api-client';

function formatResult(response: ApiResponse) {
  if (response.success) {
    const text = JSON.stringify(
      response.data ?? response.message ?? 'OK',
      null,
      2,
    );
    return { content: [{ type: 'text' as const, text }] };
  }
  return {
    content: [
      { type: 'text' as const, text: `Error: ${response.error ?? 'Unknown error'}` },
    ],
    isError: true,
  };
}

async function safeCall(
  fn: () => Promise<ReturnType<typeof formatResult>>,
): Promise<ReturnType<typeof formatResult>> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: `Network/API error: ${message}` }],
      isError: true,
    };
  }
}

export function registerTools(server: McpServer, client: ApiClient): void {
  server.tool(
    'query_clients',
    'List all active clients in the tenant.',
    {},
    async () =>
      safeCall(async () => {
        const res = await client.call('query_clients');
        return formatResult(res);
      }),
  );

  server.tool(
    'query_projects',
    'List active projects, optionally filtered by client.',
    {
      clientId: z
        .string()
        .optional()
        .describe('UUID of a client to filter projects by.'),
    },
    async ({ clientId }) =>
      safeCall(async () => {
        const params: Record<string, unknown> = {};
        if (clientId) params.clientId = clientId;
        const res = await client.call('query_projects', params);
        return formatResult(res);
      }),
  );

  server.tool(
    'query_tasks',
    'List active tasks for a specific project.',
    {
      projectId: z.string().describe('UUID of the project whose tasks to list.'),
    },
    async ({ projectId }) =>
      safeCall(async () => {
        const res = await client.call('query_tasks', { projectId });
        return formatResult(res);
      }),
  );

  server.tool(
    'log_time_entry',
    'Log a new time entry for today. Duration accepts: "2h", "30m", "1h30m", "1.5h", or plain minutes.',
    {
      projectId: z.string().describe('UUID of the project.'),
      taskId: z.string().describe('UUID of the task.'),
      duration: z.string().describe('Duration: "2h", "30m", "1h30m", "1.5h", or minutes like "90".'),
      description: z.string().optional().describe('Optional description of the work.'),
    },
    async ({ projectId, taskId, duration, description }) =>
      safeCall(async () => {
        const params: Record<string, unknown> = { projectId, taskId, duration };
        if (description) params.description = description;
        const res = await client.call('log_time_entry', params);
        return formatResult(res);
      }),
  );

  server.tool(
    'get_user_status',
    'Get profile info, total hours this week, and 5 most recent time entries.',
    {},
    async () =>
      safeCall(async () => {
        const res = await client.call('get_user_status');
        return formatResult(res);
      }),
  );

  server.tool(
    'get_time_entries',
    'Get time entries with optional date range, project filter, and pagination.',
    {
      startDate: z.string().optional().describe('Filter entries on or after this ISO 8601 date.'),
      endDate: z.string().optional().describe('Filter entries on or before this ISO 8601 date.'),
      projectId: z.string().optional().describe('UUID of a project to filter by.'),
      limit: z.number().optional().describe('Max entries to return (1-100). Defaults to 20.'),
      offset: z.number().optional().describe('Entries to skip for pagination. Defaults to 0.'),
    },
    async ({ startDate, endDate, projectId, limit, offset }) =>
      safeCall(async () => {
        const params: Record<string, unknown> = {};
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (projectId) params.projectId = projectId;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        const res = await client.call('get_time_entries', params);
        return formatResult(res);
      }),
  );

  server.tool(
    'update_time_entry',
    'Update an existing time entry. Only provided fields are changed.',
    {
      entryId: z.string().describe('UUID of the time entry to update.'),
      projectId: z.string().optional().describe('New project UUID.'),
      taskId: z.string().optional().describe('New task UUID.'),
      description: z.string().optional().describe('New description.'),
      startTime: z.string().optional().describe('New start time (ISO 8601).'),
      endTime: z.string().optional().describe('New end time (ISO 8601).'),
    },
    async ({ entryId, projectId, taskId, description, startTime, endTime }) =>
      safeCall(async () => {
        const params: Record<string, unknown> = { entryId };
        if (projectId !== undefined) params.projectId = projectId;
        if (taskId !== undefined) params.taskId = taskId;
        if (description !== undefined) params.description = description;
        if (startTime !== undefined) params.startTime = startTime;
        if (endTime !== undefined) params.endTime = endTime;
        const res = await client.call('update_time_entry', params);
        return formatResult(res);
      }),
  );

  server.tool(
    'delete_time_entry',
    'Soft-delete a time entry.',
    {
      entryId: z.string().describe('UUID of the time entry to delete.'),
    },
    async ({ entryId }) =>
      safeCall(async () => {
        const res = await client.call('delete_time_entry', { entryId });
        return formatResult(res);
      }),
  );
}
