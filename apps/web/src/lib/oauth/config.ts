/**
 * OAuth 2.0 configuration and helpers for the MCP remote server.
 */

/** Get the public-facing base URL (e.g. https://puretrack.duckdns.org) */
export function getBaseUrl(): string {
  return (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  );
}

/** MCP resource server URL */
export function getMcpResourceUrl(): string {
  return `${getBaseUrl()}/api/mcp-remote`;
}

/** OAuth metadata for RFC 8414 */
export function getAuthorizationServerMetadata() {
  const base = getBaseUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    scopes_supported: ['mcp:tools'],
  };
}

/** Protected resource metadata for RFC 9728 */
export function getProtectedResourceMetadata() {
  const base = getBaseUrl();
  return {
    resource: getMcpResourceUrl(),
    authorization_servers: [base],
    scopes_supported: ['mcp:tools'],
    resource_name: 'Pure Track MCP Server',
  };
}
