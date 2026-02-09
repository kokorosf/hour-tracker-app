import { ApiClient, ApiRequestError } from '../client';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeClient(token: string | null = 'test-token'): ApiClient {
  return new ApiClient(() => token);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ApiClient', () => {
  describe('get', () => {
    it('makes a GET request and returns data on success', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { id: '1', name: 'Test' } }),
      );

      const client = makeClient();
      const result = await client.get<{ id: string; name: string }>('/api/test');

      expect(result).toEqual({ id: '1', name: 'Test' });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/test');
      expect(init.method).toBe('GET');
    });

    it('includes Authorization header when token is present', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: {} }),
      );

      const client = makeClient('my-jwt');
      await client.get('/api/test');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['Authorization']).toBe('Bearer my-jwt');
    });

    it('omits Authorization header when no token', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: {} }),
      );

      const client = makeClient(null);
      await client.get('/api/test');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['Authorization']).toBeUndefined();
    });

    it('appends query params to the URL', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [] }),
      );

      const client = makeClient();
      await client.get('/api/items', { page: 2, search: 'hello' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('page=2');
      expect(url).toContain('search=hello');
    });

    it('skips undefined query params', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [] }),
      );

      const client = makeClient();
      await client.get('/api/items', { page: 1, search: undefined });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('page=1');
      expect(url).not.toContain('search');
    });

    it('returns undefined for 204 No Content', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const client = makeClient();
      const result = await client.get('/api/empty');

      expect(result).toBeUndefined();
    });
  });

  describe('post', () => {
    it('makes a POST request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { id: 'new-1' } }, 201),
      );

      const client = makeClient();
      const result = await client.post<{ id: string }>('/api/items', { name: 'New Item' });

      expect(result).toEqual({ id: 'new-1' });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ name: 'New Item' });
    });
  });

  describe('put', () => {
    it('makes a PUT request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { id: '1', name: 'Updated' } }),
      );

      const client = makeClient();
      const result = await client.put<{ id: string; name: string }>('/api/items/1', { name: 'Updated' });

      expect(result).toEqual({ id: '1', name: 'Updated' });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('PUT');
    });
  });

  describe('delete', () => {
    it('makes a DELETE request', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const client = makeClient();
      await client.delete('/api/items/1');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.method).toBe('DELETE');
    });
  });

  describe('error handling', () => {
    it('throws ApiRequestError on API error response', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'Not found.' }, 404),
      );

      const client = makeClient();

      await expect(client.get('/api/missing')).rejects.toThrow(ApiRequestError);
    });

    it('includes error message and status from API response', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'Not found.', details: { id: '999' } }, 404),
      );

      const client = makeClient();

      try {
        await client.get('/api/missing');
        fail('Expected ApiRequestError');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError);
        const apiErr = err as ApiRequestError;
        expect(apiErr.message).toBe('Not found.');
        expect(apiErr.status).toBe(404);
        expect(apiErr.details).toEqual({ id: '999' });
      }
    });

    it('retries on 5xx errors and eventually throws', async () => {
      // All 3 attempts return 500
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Server error' }, 500))
        .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Server error' }, 500))
        .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Server error' }, 500));

      const client = makeClient();

      await expect(client.get('/api/failing')).rejects.toThrow(ApiRequestError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 15_000);

    it('succeeds on retry after initial 5xx', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Server error' }, 500))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { recovered: true } }));

      const client = makeClient();
      const result = await client.get<{ recovered: boolean }>('/api/flaky');

      expect(result).toEqual({ recovered: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }, 15_000);

    it('does not retry on 4xx errors', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ success: false, error: 'Bad request' }, 400),
      );

      const client = makeClient();

      await expect(client.get('/api/bad')).rejects.toThrow(ApiRequestError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws on network error after retries', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const client = makeClient();

      await expect(client.get('/api/down')).rejects.toThrow(ApiRequestError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 15_000);
  });

  describe('ApiRequestError', () => {
    it('has correct name, status, and details', () => {
      const error = new ApiRequestError('Bad request', 400, { field: 'name' });
      expect(error.name).toBe('ApiRequestError');
      expect(error.message).toBe('Bad request');
      expect(error.status).toBe(400);
      expect(error.details).toEqual({ field: 'name' });
    });

    it('is an instance of Error', () => {
      const error = new ApiRequestError('fail', 500);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
