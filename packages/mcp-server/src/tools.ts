/**
 * MCP tool definitions for Pure Track.
 *
 * Each tool maps 1:1 to a method on the /api/mcp endpoint.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResponse } from './api-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an API response into the MCP CallToolResult format.
 * Success → formatted JSON text. Failure → error text with isError flag.
 */
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

/**
 * Wrap a tool handler with consistent error handling for network failures,
 * JSON parse errors, etc. Prevents the MCP server process from crashing.
 */
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

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer, client: ApiClient): void {
  // ── 1. query_clients ────────────────────────────────────────────────
  server.tool(
    'query_clients',
    'List all active clients in the tenant. Returns client names and IDs. ' +
      'Use this first when the user wants to browse their organizational ' +
      'structure or before looking up projects for a specific client.',
    {},
    async () =>
      safeCall(async () => {
        const res = await client.call('query_clients');
        return formatResult(res);
      }),
  );

  // ── 2. query_projects ───────────────────────────────────────────────
  server.tool(
    'query_projects',
    'List active projects, optionally filtered by client. Returns project ' +
      'names, IDs, and whether they are billable. Use this to find a project ' +
      'ID before logging time. If the user mentions a client name, call ' +
      'query_clients first to get the clientId, then pass it here to filter.',
    {
      clientId: z
        .string()
        .optional()
        .describe(
          'UUID of a client to filter projects by. Omit to list all projects.',
        ),
    },
    async ({ clientId }) =>
      safeCall(async () => {
        const params: Record<string, unknown> = {};
        if (clientId) params.clientId = clientId;
        const res = await client.call('query_projects', params);
        return formatResult(res);
      }),
  );

  // ── 3. query_tasks ──────────────────────────────────────────────────
  server.tool(
    'query_tasks',
    'List active tasks for a specific project. Returns task names and IDs. ' +
      'You need a projectId to call this — get one from query_projects first. ' +
      'Use this before logging time to find the correct taskId.',
    {
      projectId: z
        .string()
        .describe('UUID of the project whose tasks to list. Required.'),
    },
    async ({ projectId }) =>
      safeCall(async () => {
        const res = await client.call('query_tasks', { projectId });
        return formatResult(res);
      }),
  );

  // ── 4. log_time_entry ───────────────────────────────────────────────
  server.tool(
    'log_time_entry',
    'Log a new time entry for the authenticated user. The entry is recorded ' +
      "for today. Requires a projectId and taskId — use query_projects and " +
      'query_tasks to find them. Duration accepts flexible formats: "2h", ' +
      '"30m", "1h30m", "1.5h", or a plain number of minutes (e.g. "90"). ' +
      'Returns the created time entry with its ID.',
    {
      projectId: z
        .string()
        .describe('UUID of the project to log time against.'),
      taskId: z.string().describe('UUID of the task to log time against.'),
      duration: z
        .string()
        .describe(
          'How long was worked. Accepts: "2h", "30m", "1h30m", "1.5h", ' +
            'or plain minutes like "90".',
        ),
      description: z
        .string()
        .optional()
        .describe(
          'Optional description of what was worked on. E.g. "Implemented login page".',
        ),
    },
    async ({ projectId, taskId, duration, description }) =>
      safeCall(async () => {
        const params: Record<string, unknown> = {
          projectId,
          taskId,
          duration,
        };
        if (description) params.description = description;
        const res = await client.call('log_time_entry', params);
        return formatResult(res);
      }),
  );

  // ── 5. get_user_status ──────────────────────────────────────────────
  server.tool(
    'get_user_status',
    'Get the current user\'s status: profile info, total hours logged this ' +
      'week (Monday–Sunday), and the 5 most recent time entries. Use this ' +
      'when the user asks "how many hours this week", "what\'s my status", ' +
      'or "show recent entries".',
    {},
    async () =>
      safeCall(async () => {
        const res = await client.call('get_user_status');
        return formatResult(res);
      }),
  );

  // ── 6. get_time_entries ─────────────────────────────────────────────
  server.tool(
    'get_time_entries',
    'Get time entries for the authenticated user with optional filters. ' +
      'Supports date range filtering, project filtering, and pagination. ' +
      'Use this for detailed queries like "show my entries last week" or ' +
      '"what did I log on Project X".',
    {
      startDate: z
        .string()
        .optional()
        .describe(
          'Filter entries on or after this ISO 8601 date. E.g. "2025-03-01".',
        ),
      endDate: z
        .string()
        .optional()
        .describe(
          'Filter entries on or before this ISO 8601 date. E.g. "2025-03-07".',
        ),
      projectId: z
        .string()
        .optional()
        .describe('UUID of a project to filter entries by.'),
      limit: z
        .number()
        .optional()
        .describe('Max entries to return (1–100). Defaults to 20.'),
      offset: z
        .number()
        .optional()
        .describe('Number of entries to skip for pagination. Defaults to 0.'),
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

  // ── 7. update_time_entry ────────────────────────────────────────────
  server.tool(
    'update_time_entry',
    'Update an existing time entry. Only the fields you provide will be ' +
      'changed. Use get_time_entries or get_user_status to find the entryId ' +
      'first. Can update project, task, description, start time, and end ' +
      'time. If start/end times are changed, duration is recalculated ' +
      'automatically.',
    {
      entryId: z
        .string()
        .describe('UUID of the time entry to update. Required.'),
      projectId: z.string().optional().describe('New project UUID.'),
      taskId: z.string().optional().describe('New task UUID.'),
      description: z
        .string()
        .optional()
        .describe('New description. Pass empty string to clear it.'),
      startTime: z
        .string()
        .optional()
        .describe('New start time as ISO 8601 datetime.'),
      endTime: z
        .string()
        .optional()
        .describe('New end time as ISO 8601 datetime.'),
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

  // ── 8. delete_time_entry ────────────────────────────────────────────
  server.tool(
    'delete_time_entry',
    'Soft-delete a time entry. The entry is not permanently removed and can ' +
      'be recovered by an admin. Use get_time_entries or get_user_status to ' +
      'find the entryId. Always confirm with the user before deleting.',
    {
      entryId: z
        .string()
        .describe('UUID of the time entry to delete. Required.'),
    },
    async ({ entryId }) =>
      safeCall(async () => {
        const res = await client.call('delete_time_entry', { entryId });
        return formatResult(res);
      }),
  );
}
