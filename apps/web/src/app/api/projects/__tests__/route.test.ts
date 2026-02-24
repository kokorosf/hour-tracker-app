/**
 * Tests for GET /api/projects and POST /api/projects
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
  mockFindWithClientName: jest.Mock;
  mockFindById: jest.Mock;
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
// GET /api/projects
// ---------------------------------------------------------------------------

describe('GET /api/projects', () => {
  const sampleProjects = [
    { id: 'p1', tenantId: 'tenant-1', name: 'Project A', clientId: 'c1', clientName: 'Acme Corp', isBillable: true, deletedAt: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 'p2', tenantId: 'tenant-1', name: 'Project B', clientId: 'c2', clientName: 'Beta Inc', isBillable: false, deletedAt: null, createdAt: new Date(), updatedAt: new Date() },
  ];

  it('returns paginated projects with task counts', async () => {
    dbMock.mockFindWithClientName.mockResolvedValueOnce(sampleProjects);
    dbMock.mockCount.mockResolvedValueOnce(2);
    dbMock.query.mockResolvedValueOnce([
      { project_id: 'p1', count: '5' },
      { project_id: 'p2', count: '2' },
    ]);

    const req = makeRequest('http://localhost:3000/api/projects?page=1&pageSize=20');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].taskCount).toBe(5);
    expect(body.data.items[1].taskCount).toBe(2);
    expect(body.data.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('passes clientId filter when provided', async () => {
    dbMock.mockFindWithClientName.mockResolvedValueOnce([sampleProjects[0]]);
    dbMock.mockCount.mockResolvedValueOnce(1);
    dbMock.query.mockResolvedValueOnce([
      { project_id: 'p1', count: '5' },
    ]);

    const req = makeRequest('http://localhost:3000/api/projects?clientId=c1');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(200);
    expect(dbMock.mockFindWithClientName).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ clientId: 'c1' }),
    );
    expect(dbMock.mockCount).toHaveBeenCalledWith('tenant-1', 'c1');
  });

  it('defaults taskCount to 0 when no tasks exist', async () => {
    dbMock.mockFindWithClientName.mockResolvedValueOnce(sampleProjects);
    dbMock.mockCount.mockResolvedValueOnce(2);
    dbMock.query.mockResolvedValueOnce([]);

    const req = makeRequest('http://localhost:3000/api/projects');
    const res = await GET(req, dummyCtx);

    const body = await res.json();
    expect(body.data.items[0].taskCount).toBe(0);
    expect(body.data.items[1].taskCount).toBe(0);
  });

  it('clamps pageSize to max 100', async () => {
    dbMock.mockFindWithClientName.mockResolvedValueOnce([]);
    dbMock.mockCount.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/projects?pageSize=999');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindWithClientName).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/projects', { token: 'bad' });
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on unexpected database error', async () => {
    dbMock.mockFindWithClientName.mockRejectedValueOnce(new Error('DB connection lost'));
    dbMock.mockCount.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('http://localhost:3000/api/projects');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/projects
// ---------------------------------------------------------------------------

describe('POST /api/projects', () => {
  it('creates a project and returns 201', async () => {
    const newProject = {
      id: 'p-new',
      tenantId: 'tenant-1',
      name: 'New Project',
      clientId: 'c1',
      isBillable: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbMock.mockFindById.mockResolvedValueOnce({ id: 'c1', tenantId: 'tenant-1', name: 'Acme' });
    dbMock.mockCreate.mockResolvedValueOnce(newProject);

    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: 'New Project', clientId: 'c1', isBillable: true },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New Project');
  });

  it('defaults isBillable to true when not provided', async () => {
    dbMock.mockFindById.mockResolvedValueOnce({ id: 'c1', tenantId: 'tenant-1', name: 'Acme' });
    dbMock.mockCreate.mockResolvedValueOnce({
      id: 'p-new',
      tenantId: 'tenant-1',
      name: 'Test',
      clientId: 'c1',
      isBillable: true,
    });

    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: 'Test', clientId: 'c1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    expect(dbMock.mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ isBillable: true }),
      'tenant-1',
    );
  });

  it('returns 400 when name is empty', async () => {
    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: '', clientId: 'c1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when name is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { clientId: 'c1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: 'x'.repeat(256), clientId: 'c1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
  });

  it('returns 400 when clientId is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: 'Project' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/clientId/i);
  });

  it('returns 400 when client is not found in tenant', async () => {
    dbMock.mockFindById.mockResolvedValueOnce(null);

    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: 'Project', clientId: 'nonexistent' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/client not found/i);
  });

  it('trims whitespace from name', async () => {
    dbMock.mockFindById.mockResolvedValueOnce({ id: 'c1', tenantId: 'tenant-1', name: 'Acme' });
    dbMock.mockCreate.mockResolvedValueOnce({
      id: 'p-new',
      tenantId: 'tenant-1',
      name: 'Trimmed',
      clientId: 'c1',
      isBillable: true,
    });

    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: '  Trimmed  ', clientId: 'c1' },
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

    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: 'Test', clientId: 'c1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: 'Test', clientId: 'c1' },
      token: '',
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on database error during creation', async () => {
    dbMock.mockFindById.mockResolvedValueOnce({ id: 'c1', tenantId: 'tenant-1', name: 'Acme' });
    dbMock.mockCreate.mockRejectedValueOnce(new Error('DB write failed'));

    const req = makeRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: { name: 'Test', clientId: 'c1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
