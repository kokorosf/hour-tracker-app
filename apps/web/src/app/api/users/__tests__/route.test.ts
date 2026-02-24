/**
 * Tests for GET /api/users and POST /api/users
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

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('mock-salt'),
  hash: jest.fn().mockResolvedValue('mock-hash'),
}));

// Mock the email service
const mockSendInvitation = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/email/service', () => ({
  sendInvitation: (...args: unknown[]) => mockSendInvitation(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbMock = require('@hour-tracker/database') as {
  mockFindByTenant: jest.Mock;
  mockFindByEmail: jest.Mock;
  mockCount: jest.Mock;
  getPool: jest.Mock;
  getTenantById: jest.Mock;
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

// Mock pool.query for user creation
const mockPoolQuery = jest.fn();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUTH_SECRET = 'test-secret';
  mockDecode.mockResolvedValue(ADMIN_PAYLOAD);
  dbMock.getPool.mockReturnValue({ query: mockPoolQuery });
  dbMock.getTenantById.mockResolvedValue({ id: 'tenant-1', name: 'Test Tenant' });
});

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------

describe('GET /api/users', () => {
  const sampleUsers = [
    { id: 'u1', tenantId: 'tenant-1', email: 'alice@example.com', role: 'admin', createdAt: new Date(), updatedAt: new Date() },
    { id: 'u2', tenantId: 'tenant-1', email: 'bob@example.com', role: 'user', createdAt: new Date(), updatedAt: new Date() },
  ];

  it('returns paginated users', async () => {
    dbMock.mockFindByTenant.mockResolvedValueOnce(sampleUsers);
    dbMock.mockCount.mockResolvedValueOnce(2);

    const req = makeRequest('http://localhost:3000/api/users?page=1&pageSize=20');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('orders by created_at DESC', async () => {
    dbMock.mockFindByTenant.mockResolvedValueOnce([]);
    dbMock.mockCount.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/users');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindByTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ orderBy: 'created_at', orderDirection: 'DESC' }),
    );
  });

  it('clamps pageSize to max 100', async () => {
    dbMock.mockFindByTenant.mockResolvedValueOnce([]);
    dbMock.mockCount.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/users?pageSize=999');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindByTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('returns 403 when non-admin tries to list users', async () => {
    mockDecode.mockResolvedValue(USER_PAYLOAD);

    const req = makeRequest('http://localhost:3000/api/users');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/users', { token: 'bad' });
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on unexpected database error', async () => {
    dbMock.mockFindByTenant.mockRejectedValueOnce(new Error('DB connection lost'));
    dbMock.mockCount.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('http://localhost:3000/api/users');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------

describe('POST /api/users', () => {
  it('creates (invites) a user and returns 201', async () => {
    dbMock.mockFindByEmail.mockResolvedValueOnce(null); // no existing user
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          tenant_id: 'tenant-1',
          email: 'newuser@example.com',
          role: 'user',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // invite token insert

    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'newuser@example.com', role: 'user' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('newuser@example.com');
    expect(body.data.role).toBe('user');
    expect(body.data.inviteLink).toBeDefined();
  });

  it('sends an invitation email after creating the user', async () => {
    dbMock.mockFindByEmail.mockResolvedValueOnce(null);
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          tenant_id: 'tenant-1',
          email: 'newuser@example.com',
          role: 'user',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'newuser@example.com', role: 'user' },
    });
    await POST(req, dummyCtx);

    expect(mockSendInvitation).toHaveBeenCalledWith(
      'newuser@example.com',
      'admin@example.com',
      'Test Tenant',
      expect.stringContaining('/invite/'),
    );
  });

  it('still succeeds if invitation email fails (best-effort)', async () => {
    dbMock.mockFindByEmail.mockResolvedValueOnce(null);
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          tenant_id: 'tenant-1',
          email: 'newuser@example.com',
          role: 'admin',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    mockSendInvitation.mockRejectedValueOnce(new Error('SMTP down'));

    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'newuser@example.com', role: 'admin' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
  });

  it('returns 400 when email is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { role: 'user' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 when email is invalid', async () => {
    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'not-an-email', role: 'user' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 when role is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'valid@example.com' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/role/i);
  });

  it('returns 400 when role is invalid', async () => {
    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'valid@example.com', role: 'superadmin' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/role/i);
  });

  it('returns 409 when user with email already exists in tenant', async () => {
    dbMock.mockFindByEmail.mockResolvedValueOnce({
      id: 'existing-user',
      email: 'existing@example.com',
    });

    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'existing@example.com', role: 'user' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('normalizes email to lowercase and trims whitespace', async () => {
    dbMock.mockFindByEmail.mockResolvedValueOnce(null);
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'new-user-id',
          tenant_id: 'tenant-1',
          email: 'test@example.com',
          role: 'user',
          created_at: new Date(),
          updated_at: new Date(),
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: '  Test@Example.COM  ', role: 'user' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    expect(dbMock.mockFindByEmail).toHaveBeenCalledWith('test@example.com', 'tenant-1');
  });

  it('returns 403 when non-admin tries to invite', async () => {
    mockDecode.mockResolvedValue(USER_PAYLOAD);

    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'newuser@example.com', role: 'user' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'newuser@example.com', role: 'user' },
      token: '',
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on database error during creation', async () => {
    dbMock.mockFindByEmail.mockResolvedValueOnce(null);
    mockPoolQuery.mockRejectedValueOnce(new Error('DB write failed'));

    const req = makeRequest('http://localhost:3000/api/users', {
      method: 'POST',
      body: { email: 'newuser@example.com', role: 'user' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
