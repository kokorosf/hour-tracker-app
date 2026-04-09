/**
 * HTTP client wrapper for the Pure Track /api/mcp endpoint.
 * Used by the remote MCP server route to proxy tool calls to the backend.
 */

export interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

export interface ApiClient {
  call(method: string, params?: Record<string, unknown>): Promise<ApiResponse>;
}

export function createApiClient(baseUrl: string, token: string): ApiClient {
  const endpoint = baseUrl.replace(/\/+$/, '') + '/api/mcp';

  return {
    async call(
      method: string,
      params: Record<string, unknown> = {},
    ): Promise<ApiResponse> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ method, params }),
      });

      let body: ApiResponse;
      try {
        body = (await response.json()) as ApiResponse;
      } catch {
        throw new Error(
          `API returned non-JSON response (HTTP ${response.status} ${response.statusText})`,
        );
      }

      if (!response.ok && !body.error) {
        throw new Error(
          `API returned HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return body;
    },
  };
}
