/**
 * Tests for POST /api/clients and GET /api/clients
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next-auth/jwt (used by the auth middleware)
const mockDecode = jest.fn();
jest.mock('next-auth/jwt', () => ({
  decode: (...args: unknown[]) => mockDecode(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbMock = require('@hour-tracker/database') as {
  mockFindByTenant: jest.Mock;
  mockSearchByName: jest.Mock;
  mockCount: jest.Mock;
  mockCreate: jest.Mock;
  query: jest.Mock;
};

// ---------------------------------------------------------------------------
// Import the route handlers AFTER mocks are in place
// ---------------------------------------------------------------------------

import { GET, POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_PAYLOAD = {
  userId: 'user-1',
  email: 'admin@example.com',
  tenantId: 'tenant-1',
  role: 'admin',
};

const USER_PAYLOAD = {
  ...ADMIN_PAYLOAD,
  role: 'user',
};

function makeRequest(
  url: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): NextRequest {
  const { method = 'GET', body, token = 'valid-token' } = options;
  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return new NextRequest(new URL(url), {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const dummyCtx = { params: Promise.resolve({}) };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUTH_SECRET = 'test-secret';
  mockDecode.mockResolvedValue(ADMIN_PAYLOAD);
});

// ---------------------------------------------------------------------------
// GET /api/clients
// ---------------------------------------------------------------------------

describe('GET /api/clients', () => {
  const sampleClients = [
    { id: 'c1', tenantId: 'tenant-1', name: 'Acme Corp', deletedAt: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 'c2', tenantId: 'tenant-1', name: 'Beta Inc', deletedAt: null, createdAt: new Date(), updatedAt: new Date() },
  ];

  it('returns paginated clients with project counts', async () => {
    dbMock.mockFindByTenant.mockResolvedValueOnce(sampleClients);
    dbMock.mockCount.mockResolvedValueOnce(2);
    dbMock.query.mockResolvedValueOnce([
      { client_id: 'c1', count: '3' },
      { client_id: 'c2', count: '1' },
    ]);

    const req = makeRequest('http://localhost:3000/api/clients?page=1&pageSize=20');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].projectCount).toBe(3);
    expect(body.data.items[1].projectCount).toBe(1);
    expect(body.data.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('uses search filter when search param is provided', async () => {
    dbMock.mockSearchByName.mockResolvedValueOnce([sampleClients[0]]);
    dbMock.mockCount.mockResolvedValueOnce(1);
    dbMock.query.mockResolvedValueOnce([
      { client_id: 'c1', count: '3' },
    ]);

    const req = makeRequest('http://localhost:3000/api/clients?search=Acme');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(200);
    expect(dbMock.mockSearchByName).toHaveBeenCalledWith('Acme', 'tenant-1', expect.any(Object));
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/clients', { token: 'bad' });
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('defaults projectCount to 0 when no projects exist', async () => {
    dbMock.mockFindByTenant.mockResolvedValueOnce(sampleClients);
    dbMock.mockCount.mockResolvedValueOnce(2);
    dbMock.query.mockResolvedValueOnce([]);

    const req = makeRequest('http://localhost:3000/api/clients');
    const res = await GET(req, dummyCtx);

    const body = await res.json();
    expect(body.data.items[0].projectCount).toBe(0);
    expect(body.data.items[1].projectCount).toBe(0);
  });

  it('clamps pageSize to max 100', async () => {
    dbMock.mockFindByTenant.mockResolvedValueOnce([]);
    dbMock.mockCount.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/clients?pageSize=999');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindByTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('returns 500 on unexpected database error', async () => {
    dbMock.mockFindByTenant.mockRejectedValueOnce(new Error('DB connection lost'));
    dbMock.mockCount.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('http://localhost:3000/api/clients');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/clients
// ---------------------------------------------------------------------------

describe('POST /api/clients', () => {
  it('creates a client and returns 201', async () => {
    const newClient = {
      id: 'c-new',
      tenantId: 'tenant-1',
      name: 'New Client',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbMock.mockCreate.mockResolvedValueOnce(newClient);

    const req = makeRequest('http://localhost:3000/api/clients', {
      method: 'POST',
      body: { name: 'New Client' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New Client');
  });

  it('returns 400 when name is empty', async () => {
    const req = makeRequest('http://localhost:3000/api/clients', {
      method: 'POST',
      body: { name: '' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when name is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/clients', {
      method: 'POST',
      body: {},
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const req = makeRequest('http://localhost:3000/api/clients', {
      method: 'POST',
      body: { name: 'x'.repeat(256) },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
  });

  it('trims whitespace from name', async () => {
    dbMock.mockCreate.mockResolvedValueOnce({
      id: 'c-new',
      tenantId: 'tenant-1',
      name: 'Trimmed',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = makeRequest('http://localhost:3000/api/clients', {
      method: 'POST',
      body: { name: '  Trimmed  ' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    expect(dbMock.mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Trimmed' }),
      'tenant-1',
    );
  });

  it('returns 403 when non-admin tries to create', async () => {
    mockDecode.mockResolvedValue(USER_PAYLOAD);

    const req = makeRequest('http://localhost:3000/api/clients', {
      method: 'POST',
      body: { name: 'Test' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/clients', {
      method: 'POST',
      body: { name: 'Test' },
      token: '',
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on database error during creation', async () => {
    dbMock.mockCreate.mockRejectedValueOnce(new Error('DB write failed'));

    const req = makeRequest('http://localhost:3000/api/clients', {
      method: 'POST',
      body: { name: 'Test' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
