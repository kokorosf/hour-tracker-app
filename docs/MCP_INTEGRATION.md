# MCP Integration Guide

This guide explains how to connect Hour Tracker to Claude Desktop using the Model Context Protocol (MCP). Once configured, you can log time, query projects, and check your status using natural language.

---

## Table of Contents

1. [Authentication Setup](#authentication-setup)
2. [Claude Desktop Configuration](#claude-desktop-configuration)
3. [Available Methods](#available-methods)
4. [Natural Language Duration Parsing](#natural-language-duration-parsing)
5. [Error Handling](#error-handling)
6. [Example Prompts](#example-prompts)

---

## Authentication Setup

The MCP endpoint requires a valid JWT token. To obtain one:

1. Log in to Hour Tracker at `http://localhost:3000/login`.
2. Open your browser's developer tools (F12) and go to the **Application** tab.
3. Under **Local Storage**, find the `token` value.
4. Copy this token — you will use it as your `API_KEY` in the Claude Desktop configuration.

All requests are scoped to the tenant and user embedded in the JWT. Regular users can only log time and query data for their own tenant. Admin users have the same access.

---

## Claude Desktop Configuration

### 1. Create the MCP client script

Create a file called `mcp-client.js` in your project (or anywhere on your machine):

```js
const http = require("http");
const readline = require("readline");

const API_URL = process.env.API_URL || "http://localhost:3000/api/mcp";
const API_KEY = process.env.API_KEY || "";

async function callMcp(method, params = {}) {
  const body = JSON.stringify({ method, params });
  const url = new URL(API_URL);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Simple stdin/stdout JSON-RPC loop for Claude Desktop
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  try {
    const { method, params } = JSON.parse(line);
    const result = await callMcp(method, params);
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err.message }));
  }
});
```

### 2. Configure Claude Desktop

Open your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the following entry:

```json
{
  "mcpServers": {
    "hour-tracker": {
      "command": "node",
      "args": ["path/to/mcp-client.js"],
      "env": {
        "API_URL": "http://localhost:3000/api/mcp",
        "API_KEY": "your-jwt-token"
      }
    }
  }
}
```

Replace `path/to/mcp-client.js` with the absolute path to the script and `your-jwt-token` with the token from the authentication step.

### 3. Restart Claude Desktop

After saving the configuration, restart Claude Desktop. The "hour-tracker" server should appear in the MCP servers list.

---

## Available Methods

All methods are called via `POST /api/mcp` with the body:

```json
{
  "method": "<method_name>",
  "params": { ... }
}
```

Every response follows the envelope format:

```json
{
  "success": true,
  "data": { ... }
}
```

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
- Check that the path to `mcp-client.js` is absolute.
- Restart Claude Desktop after changing the config.

**401 errors on every request:**
- Your JWT may have expired. Log in again and copy a fresh token.
- Make sure `API_KEY` in the config has no extra whitespace.

**Connection refused:**
- Ensure the Hour Tracker dev server is running on `http://localhost:3000`.
- Check that no firewall is blocking localhost connections.
