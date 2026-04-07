#!/usr/bin/env node

/**
 * Pure Track MCP Server
 *
 * A Model Context Protocol server that exposes Pure Track tools to AI
 * assistants like Claude Desktop and Claude Code. Communicates over stdio
 * and forwards tool calls to the deployed Pure Track API.
 *
 * Required environment variables:
 *   HOUR_TRACKER_API_URL   — URL of the deployed app (e.g. https://your-app.run.app)
 *   HOUR_TRACKER_API_TOKEN — A valid JWT bearer token
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient } from './api-client.js';
import { registerTools } from './tools.js';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(
      `ERROR: Missing required environment variable: ${name}\n\n` +
        'The Pure Track MCP server requires:\n' +
        '  HOUR_TRACKER_API_URL   — URL of the deployed app (e.g. https://your-app.run.app)\n' +
        '  HOUR_TRACKER_API_TOKEN — A valid JWT bearer token\n\n' +
        'Set these in your Claude Desktop config or shell environment.\n',
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const apiUrl = getRequiredEnv('HOUR_TRACKER_API_URL');
  const apiToken = getRequiredEnv('HOUR_TRACKER_API_TOKEN');

  const client = createApiClient(apiUrl, apiToken);

  const server = new McpServer({
    name: 'hour-tracker',
    version: '0.1.0',
  });

  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr — stdout is reserved for MCP JSON-RPC protocol
  process.stderr.write('Pure Track MCP server running on stdio\n');
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error}\n`);
  process.exit(1);
});
