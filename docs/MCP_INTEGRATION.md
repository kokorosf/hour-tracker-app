# MCP Integration Guide

This guide explains how to connect Hour Tracker to Claude Desktop or Claude Code using the Model Context Protocol (MCP). Once configured, you can log time, query projects, and check your status using natural language.

---

## Table of Contents

1. [Authentication Setup](#authentication-setup)
2. [Build the MCP Server](#build-the-mcp-server)
3. [Claude Desktop Configuration](#claude-desktop-configuration)
4. [Claude Code Configuration](#claude-code-configuration)
5. [Available Tools](#available-tools)
6. [Natural Language Duration Parsing](#natural-language-duration-parsing)
7. [Error Handling](#error-handling)
8. [Example Prompts](#example-prompts)

---

## Authentication Setup

The MCP server requires a valid JWT token to authenticate with the Hour Tracker API. To obtain one:

1. Log in to Hour Tracker at your deployed URL or `http://localhost:3000/login`.
2. Open your browser's developer tools (F12) and go to the **Application** tab.
3. Under **Local Storage**, find the `token` value.
4. Copy this token — you will use it as `HOUR_TRACKER_API_TOKEN` in the configuration below.

All requests are scoped to the tenant and user embedded in the JWT. Regular users can only log time and query data for their own tenant. Admin users have the same access.

---

## Build the MCP Server

The MCP server lives in `packages/mcp-server/`. Build it from the monorepo root:

```bash
npm run --workspace packages/mcp-server build
```

This compiles TypeScript to `packages/mcp-server/dist/`.

---

## Claude Desktop Configuration

Open your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the following entry:

```json
{
  "mcpServers": {
    "hour-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/dist/index.js"],
      "env": {
        "HOUR_TRACKER_API_URL": "https://your-cloud-run-url.run.app",
        "HOUR_TRACKER_API_TOKEN": "your-jwt-token"
      }
    }
  }
}
```

Replace:
- `/absolute/path/to/...` with the absolute path to the compiled MCP server
- `https://your-cloud-run-url.run.app` with your deployed app URL (or `http://localhost:3000` for local development)
- `your-jwt-token` with the token from the authentication step

After saving the configuration, restart Claude Desktop. The "hour-tracker" server should appear in the MCP servers list.

---

## Claude Code Configuration

Add the MCP server to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "hour-tracker": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "HOUR_TRACKER_API_URL": "https://your-cloud-run-url.run.app",
        "HOUR_TRACKER_API_TOKEN": "your-jwt-token"
      }
    }
  }
}
```

---

## Testing with MCP Inspector

You can test the MCP server interactively using the MCP Inspector:

```bash
HOUR_TRACKER_API_URL=https://your-app.run.app HOUR_TRACKER_API_TOKEN=your-token \
  npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js
```

This opens a web UI where you can invoke each tool and see the results.

---

## Available Tools

The MCP server exposes 8 tools that Claude can discover and use automatically. Below is a reference for each tool and the underlying API method it calls.

All tools call `POST /api/mcp` under the hood. Responses follow the envelope format `{ "success": true, "data": { ... } }`.

### query_clients

List all active clients for the tenant.

**Params:** none

**Request:**

```json
{
  "method": "query_clients",
  "params": {}
}
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "c1a2b3c4-...",
      "tenantId": "t1a2b3c4-...",
      "name": "Acme Corp",
      "deletedAt": null,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

---

### query_projects

List active projects, optionally filtered by client.

**Params:**

| Field      | Type   | Required | Description          |
|------------|--------|----------|----------------------|
| `clientId` | string | No       | Filter by client ID  |

**Request:**

```json
{
  "method": "query_projects",
  "params": { "clientId": "c1a2b3c4-..." }
}
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "p1a2b3c4-...",
      "tenantId": "t1a2b3c4-...",
      "clientId": "c1a2b3c4-...",
      "name": "Website Redesign",
      "isBillable": true,
      "deletedAt": null,
      "createdAt": "2025-02-01T09:00:00.000Z",
      "updatedAt": "2025-02-01T09:00:00.000Z"
    }
  ]
}
```

---

### query_tasks

List active tasks for a specific project.

**Params:**

| Field       | Type   | Required | Description         |
|-------------|--------|----------|---------------------|
| `projectId` | string | Yes      | The project UUID    |

**Request:**

```json
{
  "method": "query_tasks",
  "params": { "projectId": "p1a2b3c4-..." }
}
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "tk1a2b3c4-...",
      "tenantId": "t1a2b3c4-...",
      "projectId": "p1a2b3c4-...",
      "name": "Frontend Development",
      "deletedAt": null,
      "createdAt": "2025-02-01T09:00:00.000Z",
      "updatedAt": "2025-02-01T09:00:00.000Z"
    }
  ]
}
```

---

### log_time_entry

Create a new time entry for the authenticated user. The entry is logged for today.

**Params:**

| Field         | Type             | Required | Description                              |
|---------------|------------------|----------|------------------------------------------|
| `projectId`   | string           | Yes      | The project UUID                         |
| `taskId`      | string           | Yes      | The task UUID                            |
| `duration`    | string or number | Yes      | Duration (see parsing rules below)       |
| `description` | string           | No       | What was worked on                       |

**Request:**

```json
{
  "method": "log_time_entry",
  "params": {
    "projectId": "p1a2b3c4-...",
    "taskId": "tk1a2b3c4-...",
    "duration": "1h30m",
    "description": "Implemented login page"
  }
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "te1a2b3c4-...",
    "tenantId": "t1a2b3c4-...",
    "userId": "u1a2b3c4-...",
    "projectId": "p1a2b3c4-...",
    "taskId": "tk1a2b3c4-...",
    "startTime": "2025-02-09T09:00:00.000Z",
    "endTime": "2025-02-09T10:30:00.000Z",
    "duration": 90,
    "description": "Implemented login page",
    "deletedAt": null,
    "createdAt": "2025-02-09T14:00:00.000Z",
    "updatedAt": "2025-02-09T14:00:00.000Z"
  }
}
```

---

### get_user_status

Get the current user's profile, hours logged this week, and recent entries.

**Params:** none

**Request:**

```json
{
  "method": "get_user_status",
  "params": {}
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "u1a2b3c4-...",
      "tenantId": "t1a2b3c4-...",
      "email": "alice@example.com",
      "role": "user",
      "createdAt": "2025-01-10T08:00:00.000Z",
      "updatedAt": "2025-01-10T08:00:00.000Z"
    },
    "weekHours": 32.5,
    "recentEntries": [
      {
        "id": "te1a2b3c4-...",
        "projectName": "Website Redesign",
        "taskName": "Frontend Development",
        "userEmail": "alice@example.com",
        "duration": 120,
        "startTime": "2025-02-09T09:00:00.000Z",
        "endTime": "2025-02-09T11:00:00.000Z",
        "description": "Built dashboard components"
      }
    ]
  }
}
```

---

## Natural Language Duration Parsing

The `log_time_entry` method accepts duration in several formats:

| Input      | Parsed as |
|------------|-----------|
| `"2h"`     | 120 min   |
| `"30m"`    | 30 min    |
| `"1h30m"`  | 90 min    |
| `"1.5h"`   | 90 min    |
| `"90"`     | 90 min    |
| `90`       | 90 min    |

Invalid or zero/negative values return a `400` error with a descriptive message.

---

## Error Handling

All errors follow the same envelope:

```json
{
  "success": false,
  "error": "Description of what went wrong."
}
```

### HTTP Status Codes

| Code | Meaning                                              |
|------|------------------------------------------------------|
| 200  | Success                                              |
| 201  | Resource created (log_time_entry)                    |
| 400  | Bad request — missing or invalid params              |
| 401  | Authentication required — missing or invalid token   |
| 404  | Resource not found (project, task, or user)          |
| 409  | Conflict — time entry overlaps an existing one       |
| 500  | Internal server error                                |

### Common error scenarios

**Missing method:**

```json
{ "success": false, "error": "method is required." }
```

**Unknown method:**

```json
{ "success": false, "error": "Unknown method \"foo\". Supported: query_clients, query_projects, query_tasks, log_time_entry, get_user_status" }
```

**Missing required param:**

```json
{ "success": false, "error": "projectId is required." }
```

**Invalid duration:**

```json
{ "success": false, "error": "duration is required. Use a number (minutes) or a string like \"2h\", \"30m\", \"1h30m\"." }
```

**Overlapping entry:**

```json
{ "success": false, "error": "This time entry overlaps with an existing entry." }
```

**Expired or invalid token:**

```json
{ "success": false, "error": "Authentication required." }
```

---

## Example Prompts

Once Claude Desktop is connected to the hour-tracker MCP server, try these prompts:

### Browsing data

> "Show me all my clients."

> "What projects does Acme Corp have?"

> "List the tasks for the Website Redesign project."

### Logging time

> "Log 2 hours on the Website Redesign project, Frontend Development task. I worked on the login page."

> "I spent 1h30m doing code review on the Mobile App project, QA task."

> "Log 45 minutes on API Integration, Backend Development. Fixed the authentication bug."

### Checking status

> "How many hours have I logged this week?"

> "What's my status?"

> "Show me my recent time entries."

### Multi-step workflows

> "Find the Acme Corp client, then show me their projects and log 3 hours on the first one."

> "Check my hours this week. If I'm under 40, log 2 hours on the Website Redesign project."

---

## Troubleshooting

**Claude Desktop doesn't show the MCP server:**
- Verify the config JSON is valid (no trailing commas).
- Check that the path to `dist/index.js` is absolute.
- Make sure you built the server first: `npm run --workspace packages/mcp-server build`
- Restart Claude Desktop after changing the config.

**"Missing required environment variable" error:**
- Ensure both `HOUR_TRACKER_API_URL` and `HOUR_TRACKER_API_TOKEN` are set in the config.

**401 errors on every request:**
- Your JWT may have expired. Log in again and copy a fresh token.
- Make sure `HOUR_TRACKER_API_TOKEN` in the config has no extra whitespace.

**Connection refused:**
- Ensure the Hour Tracker app is running at the URL specified in `HOUR_TRACKER_API_URL`.
- For local development, use `http://localhost:3000`.
- Check that no firewall is blocking connections.
