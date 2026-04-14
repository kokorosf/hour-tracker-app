/**
 * Remote MCP Server — Streamable HTTP endpoint
 *
 * Exposes Pure Track MCP tools over HTTP so tenants can connect
 * from the Claude mobile app or any MCP-compatible client.
 *
 * URL: https://puretrack.duckdns.org/api/mcp-remote
 * Auth: Bearer token — supports both OAuth access tokens and legacy JWT tokens
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { encode } from 'next-auth/jwt';
import { OAuthTokenRepository, UserRepository } from '@hour-tracker/database';
import { authConfig } from '@/lib/auth/config';
import { createApiClient } from '@/lib/mcp/api-client';
import { registerTools } from '@/lib/mcp/tools';

const oauthTokenRepo = new OAuthTokenRepository();
const userRepo = new UserRepository();

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

interface Session {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of stale sessions
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        session.transport.close();
        session.server.close();
        sessions.delete(id);
      }
    }
    if (sessions.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(req: Request): string {
  const host = req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  };
}

/**
 * Resolve a Bearer token to a JWT suitable for the /api/mcp endpoint.
 * First tries OAuth token lookup; falls back to treating it as a legacy JWT.
 */
async function resolveToJwt(bearerToken: string): Promise<string> {
  // Try OAuth token lookup
  const oauthToken = await oauthTokenRepo.getToken(bearerToken);
  if (oauthToken) {
    // Look up user to get email and role for the JWT
    const user = await userRepo.findByIdGlobal(oauthToken.userId);
    if (!user) throw new Error('User not found for OAuth token');

    const secret = authConfig.secret ?? process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET is not configured');

    const jwt = await encode({
      secret,
      salt: 'authjs.session-token',
      token: {
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
      },
    });
    return jwt;
  }

  // Fall back to legacy JWT (pass through as-is)
  return bearerToken;
}

function createMcpServerWithTools(token: string, baseUrl: string): McpServer {
  const client = createApiClient(baseUrl, token);
  const server = new McpServer({
    name: 'hour-tracker',
    version: '0.1.0',
  });
  registerTools(server, client);
  return server;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** CORS preflight */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/** POST — MCP messages (initialize + tool calls) */
export async function POST(req: Request) {
  const token = extractBearerToken(req);
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization header' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
    );
  }

  const body = await req.json();
  const sessionId = req.headers.get('mcp-session-id');

  // Existing session — forward the request
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActivity = Date.now();
    const response = await session.transport.handleRequest(req, { parsedBody: body });
    return addCorsHeaders(response);
  }

  // New session — only allowed for initialize requests
  if (sessionId && !sessions.has(sessionId)) {
    return new Response(
      JSON.stringify({ error: 'Session not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
    );
  }

  // No session ID — must be an initialize request
  const messages = Array.isArray(body) ? body : [body];
  const hasInit = messages.some((msg: unknown) => isInitializeRequest(msg));
  if (!hasInit) {
    return new Response(
      JSON.stringify({ error: 'Missing Mcp-Session-Id header for non-initialize request' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
    );
  }

  // Resolve OAuth/JWT token
  const jwt = await resolveToJwt(token);

  // Create new transport + server
  const baseUrl = getBaseUrl(req);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { transport, server, lastActivity: Date.now() });
      ensureCleanup();
    },
    onsessionclosed: (id) => {
      const s = sessions.get(id);
      if (s) {
        s.server.close();
        sessions.delete(id);
      }
    },
  });

  const server = createMcpServerWithTools(jwt, baseUrl);
  await server.connect(transport);

  const response = await transport.handleRequest(req, { parsedBody: body });
  return addCorsHeaders(response);
}

/** GET — SSE stream for server-initiated messages */
export async function GET(req: Request) {
  const token = extractBearerToken(req);
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization header' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
    );
  }

  const sessionId = req.headers.get('mcp-session-id');
  if (!sessionId || !sessions.has(sessionId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid or missing session ID' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
    );
  }

  const session = sessions.get(sessionId)!;
  session.lastActivity = Date.now();
  const response = await session.transport.handleRequest(req);
  return addCorsHeaders(response);
}

/** DELETE — close a session */
export async function DELETE(req: Request) {
  const sessionId = req.headers.get('mcp-session-id');
  if (!sessionId || !sessions.has(sessionId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid or missing session ID' }),
      { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() } },
    );
  }

  const session = sessions.get(sessionId)!;
  const response = await session.transport.handleRequest(req);
  return addCorsHeaders(response);
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
