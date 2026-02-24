/**
 * Tests for GET /api/tasks and POST /api/tasks
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
  mockFindWithProjectName: jest.Mock;
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
// GET /api/tasks
// ---------------------------------------------------------------------------

describe('GET /api/tasks', () => {
  const sampleTasks = [
    { id: 't1', tenantId: 'tenant-1', name: 'Task A', projectId: 'p1', projectName: 'Project A', deletedAt: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 't2', tenantId: 'tenant-1', name: 'Task B', projectId: 'p2', projectName: 'Project B', deletedAt: null, createdAt: new Date(), updatedAt: new Date() },
  ];

  it('returns paginated tasks with client names', async () => {
    dbMock.mockFindWithProjectName.mockResolvedValueOnce(sampleTasks);
    dbMock.mockCount.mockResolvedValueOnce(2);
    dbMock.query.mockResolvedValueOnce([
      { id: 'p1', client_name: 'Acme Corp' },
      { id: 'p2', client_name: 'Beta Inc' },
    ]);

    const req = makeRequest('http://localhost:3000/api/tasks?page=1&pageSize=20');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].clientName).toBe('Acme Corp');
    expect(body.data.items[1].clientName).toBe('Beta Inc');
    expect(body.data.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('passes projectId filter when provided', async () => {
    dbMock.mockFindWithProjectName.mockResolvedValueOnce([sampleTasks[0]]);
    dbMock.mockCount.mockResolvedValueOnce(1);
    dbMock.query.mockResolvedValueOnce([
      { id: 'p1', client_name: 'Acme Corp' },
    ]);

    const req = makeRequest('http://localhost:3000/api/tasks?projectId=p1');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(200);
    expect(dbMock.mockFindWithProjectName).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ projectId: 'p1' }),
    );
    expect(dbMock.mockCount).toHaveBeenCalledWith('tenant-1', 'p1');
  });

  it('defaults clientName to empty string when no client data exists', async () => {
    dbMock.mockFindWithProjectName.mockResolvedValueOnce(sampleTasks);
    dbMock.mockCount.mockResolvedValueOnce(2);
    dbMock.query.mockResolvedValueOnce([]);

    const req = makeRequest('http://localhost:3000/api/tasks');
    const res = await GET(req, dummyCtx);

    const body = await res.json();
    expect(body.data.items[0].clientName).toBe('');
    expect(body.data.items[1].clientName).toBe('');
  });

  it('clamps pageSize to max 100', async () => {
    dbMock.mockFindWithProjectName.mockResolvedValueOnce([]);
    dbMock.mockCount.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/tasks?pageSize=999');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindWithProjectName).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/tasks', { token: 'bad' });
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on unexpected database error', async () => {
    dbMock.mockFindWithProjectName.mockRejectedValueOnce(new Error('DB connection lost'));
    dbMock.mockCount.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('http://localhost:3000/api/tasks');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('deduplicates project IDs for the client name query', async () => {
    const tasksWithSameProject = [
      { id: 't1', tenantId: 'tenant-1', name: 'Task A', projectId: 'p1', projectName: 'Project A' },
      { id: 't2', tenantId: 'tenant-1', name: 'Task B', projectId: 'p1', projectName: 'Project A' },
    ];
    dbMock.mockFindWithProjectName.mockResolvedValueOnce(tasksWithSameProject);
    dbMock.mockCount.mockResolvedValueOnce(2);
    dbMock.query.mockResolvedValueOnce([
      { id: 'p1', client_name: 'Acme Corp' },
    ]);

    const req = makeRequest('http://localhost:3000/api/tasks');
    const res = await GET(req, dummyCtx);

    const body = await res.json();
    expect(body.data.items[0].clientName).toBe('Acme Corp');
    expect(body.data.items[1].clientName).toBe('Acme Corp');
    // The query should use deduplicated project IDs
    expect(dbMock.query).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks
// ---------------------------------------------------------------------------

describe('POST /api/tasks', () => {
  it('creates a task and returns 201', async () => {
    const newTask = {
      id: 't-new',
      tenantId: 'tenant-1',
      name: 'New Task',
      projectId: 'p1',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbMock.mockFindById.mockResolvedValueOnce({ id: 'p1', tenantId: 'tenant-1', name: 'Project A' });
    dbMock.mockCreate.mockResolvedValueOnce(newTask);

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: 'New Task', projectId: 'p1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New Task');
  });

  it('returns 400 when name is empty', async () => {
    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: '', projectId: 'p1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when name is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { projectId: 'p1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: 'x'.repeat(256), projectId: 'p1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
  });

  it('returns 400 when projectId is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: 'Task' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/projectId/i);
  });

  it('returns 400 when project is not found in tenant', async () => {
    dbMock.mockFindById.mockResolvedValueOnce(null);

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: 'Task', projectId: 'nonexistent' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/project not found/i);
  });

  it('trims whitespace from name', async () => {
    dbMock.mockFindById.mockResolvedValueOnce({ id: 'p1', tenantId: 'tenant-1', name: 'Project A' });
    dbMock.mockCreate.mockResolvedValueOnce({
      id: 't-new',
      tenantId: 'tenant-1',
      name: 'Trimmed',
      projectId: 'p1',
    });

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: '  Trimmed  ', projectId: 'p1' },
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

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: 'Test', projectId: 'p1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: 'Test', projectId: 'p1' },
      token: '',
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on database error during creation', async () => {
    dbMock.mockFindById.mockResolvedValueOnce({ id: 'p1', tenantId: 'tenant-1', name: 'Project A' });
    dbMock.mockCreate.mockRejectedValueOnce(new Error('DB write failed'));

    const req = makeRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { name: 'Test', projectId: 'p1' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
