// ---------------------------------------------------------------------------
// API client – a thin, typed wrapper around fetch for calling our REST routes.
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? // explicit override
  (typeof window !== 'undefined' ? '' : 'http://localhost:3000'); // SSR fallback

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Standard success envelope returned by every API route. */
interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Standard error envelope returned by every API route. */
interface ApiError {
  success: false;
  error: string;
  details?: Record<string, unknown>;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * Thrown when the API returns `{ success: false }`.
 * Consumers can inspect `.status`, `.details`, and `.message`.
 */
export class ApiRequestError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Token accessor
// ---------------------------------------------------------------------------

type TokenGetter = () => string | null;

const defaultGetToken: TokenGetter = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, BASE_URL || 'http://localhost:3000');

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // When BASE_URL is empty (client-side relative), return pathname + search.
  if (!BASE_URL) return `${url.pathname}${url.search}`;
  return url.toString();
}

function isRetryable(status: number): boolean {
  return status >= 500 && status < 600;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

export class ApiClient {
  private getToken: TokenGetter;

  constructor(getToken: TokenGetter = defaultGetToken) {
    this.getToken = getToken;
  }

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete(path: string): Promise<void> {
    await this.requestRaw('DELETE', path);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private buildHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Execute the fetch with timeout, retries on 5xx, and envelope parsing.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const res = await this.requestRaw(method, path, body, params);

    // 204 No Content — nothing to parse.
    if (res.status === 204) return undefined as unknown as T;

    const json = (await res.json()) as ApiResponse<T>;

    if (!json.success) {
      throw new ApiRequestError(
        (json as ApiError).error,
        res.status,
        (json as ApiError).details,
      );
    }

    return (json as ApiSuccess<T>).data;
  }

  /**
   * Low-level fetch with timeout and 5xx retry logic.
   * Returns the raw `Response`. Throws on network / non-retryable errors.
   */
  private async requestRaw(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<Response> {
    const url = buildUrl(path, params);
    const headers = this.buildHeaders();
    const init: RequestInit = {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);

        // Success or client error — return immediately.
        if (!isRetryable(res.status)) return res;

        // 5xx — retry after backoff (unless last attempt).
        lastError = new ApiRequestError(
          `Server error (${res.status})`,
          res.status,
        );

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BACKOFF_MS * attempt);
        }
      } catch (err) {
        clearTimeout(timer);

        if ((err as Error).name === 'AbortError') {
          throw new ApiRequestError('Request timed out.', 0);
        }

        lastError = err;

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BACKOFF_MS * attempt);
        }
      }
    }

    // All retries exhausted.
    if (lastError instanceof ApiRequestError) throw lastError;
    throw new ApiRequestError(
      (lastError as Error)?.message ?? 'Network request failed.',
      0,
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const api = new ApiClient();
