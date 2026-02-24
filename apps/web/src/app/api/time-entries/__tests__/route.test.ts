/**
 * Tests for GET /api/time-entries and POST /api/time-entries
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
  mockFindFiltered: jest.Mock;
  mockCountFiltered: jest.Mock;
  mockFindById: jest.Mock;
  mockFindOverlapping: jest.Mock;
  mockSumMinutesForDay: jest.Mock;
  mockCreate: jest.Mock;
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
// GET /api/time-entries
// ---------------------------------------------------------------------------

describe('GET /api/time-entries', () => {
  const sampleEntries = [
    { id: 'te1', tenantId: 'tenant-1', userId: 'user-1', projectId: 'p1', taskId: 't1', startTime: new Date('2025-01-01T09:00:00Z'), endTime: new Date('2025-01-01T10:00:00Z'), duration: 60 },
    { id: 'te2', tenantId: 'tenant-1', userId: 'user-1', projectId: 'p1', taskId: 't2', startTime: new Date('2025-01-01T10:00:00Z'), endTime: new Date('2025-01-01T11:00:00Z'), duration: 60 },
  ];

  it('returns paginated time entries', async () => {
    dbMock.mockFindFiltered.mockResolvedValueOnce(sampleEntries);
    dbMock.mockCountFiltered.mockResolvedValueOnce(2);

    const req = makeRequest('http://localhost:3000/api/time-entries?page=1&pageSize=20');
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

  it('admin can filter by userId', async () => {
    dbMock.mockFindFiltered.mockResolvedValueOnce([]);
    dbMock.mockCountFiltered.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/time-entries?userId=user-2');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindFiltered).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ userId: 'user-2' }),
    );
  });

  it('non-admin is always scoped to own user ID', async () => {
    mockDecode.mockResolvedValue(USER_PAYLOAD);
    dbMock.mockFindFiltered.mockResolvedValueOnce([]);
    dbMock.mockCountFiltered.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/time-entries?userId=other-user');
    await GET(req, dummyCtx);

    // Even though userId=other-user is requested, non-admin should be scoped to own ID
    expect(dbMock.mockFindFiltered).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('passes date filters when provided', async () => {
    dbMock.mockFindFiltered.mockResolvedValueOnce([]);
    dbMock.mockCountFiltered.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/time-entries?startDate=2025-01-01&endDate=2025-01-31');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindFiltered).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      }),
    );
  });

  it('passes projectId filter when provided', async () => {
    dbMock.mockFindFiltered.mockResolvedValueOnce([]);
    dbMock.mockCountFiltered.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/time-entries?projectId=p1');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindFiltered).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ projectId: 'p1' }),
    );
  });

  it('returns 400 for invalid startDate', async () => {
    const req = makeRequest('http://localhost:3000/api/time-entries?startDate=not-a-date');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/startDate/i);
  });

  it('returns 400 for invalid endDate', async () => {
    const req = makeRequest('http://localhost:3000/api/time-entries?endDate=not-a-date');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/endDate/i);
  });

  it('clamps pageSize to max 100', async () => {
    dbMock.mockFindFiltered.mockResolvedValueOnce([]);
    dbMock.mockCountFiltered.mockResolvedValueOnce(0);

    const req = makeRequest('http://localhost:3000/api/time-entries?pageSize=999');
    await GET(req, dummyCtx);

    expect(dbMock.mockFindFiltered).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/time-entries', { token: 'bad' });
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on unexpected database error', async () => {
    dbMock.mockFindFiltered.mockRejectedValueOnce(new Error('DB connection lost'));
    dbMock.mockCountFiltered.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = makeRequest('http://localhost:3000/api/time-entries');
    const res = await GET(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/time-entries
// ---------------------------------------------------------------------------

describe('POST /api/time-entries', () => {
  const validBody = {
    projectId: 'p1',
    taskId: 't1',
    startTime: '2025-01-15T09:00:00Z',
    endTime: '2025-01-15T10:00:00Z',
    description: 'Working on feature',
  };

  const newEntry = {
    id: 'te-new',
    tenantId: 'tenant-1',
    userId: 'user-1',
    projectId: 'p1',
    taskId: 't1',
    startTime: new Date('2025-01-15T09:00:00Z'),
    endTime: new Date('2025-01-15T10:00:00Z'),
    duration: 60,
    description: 'Working on feature',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('creates a time entry and returns 201', async () => {
    // findById for project and task (called by validateEntryInput)
    dbMock.mockFindById
      .mockResolvedValueOnce({ id: 'p1', tenantId: 'tenant-1', name: 'Project A' }) // project
      .mockResolvedValueOnce({ id: 't1', tenantId: 'tenant-1', name: 'Task A' });   // task
    dbMock.mockFindOverlapping.mockResolvedValueOnce([]);
    dbMock.mockSumMinutesForDay.mockResolvedValueOnce(0);
    dbMock.mockCreate.mockResolvedValueOnce(newEntry);

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: validBody,
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.projectId).toBe('p1');
    expect(body.data.taskId).toBe('t1');
  });

  it('auto-calculates duration in minutes', async () => {
    dbMock.mockFindById
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 't1' });
    dbMock.mockFindOverlapping.mockResolvedValueOnce([]);
    dbMock.mockSumMinutesForDay.mockResolvedValueOnce(0);
    dbMock.mockCreate.mockResolvedValueOnce(newEntry);

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: {
        projectId: 'p1',
        taskId: 't1',
        startTime: '2025-01-15T09:00:00Z',
        endTime: '2025-01-15T11:30:00Z', // 2.5 hours = 150 minutes
      },
    });
    await POST(req, dummyCtx);

    expect(dbMock.mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 150 }),
      'tenant-1',
    );
  });

  it('allows null description', async () => {
    dbMock.mockFindById
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 't1' });
    dbMock.mockFindOverlapping.mockResolvedValueOnce([]);
    dbMock.mockSumMinutesForDay.mockResolvedValueOnce(0);
    dbMock.mockCreate.mockResolvedValueOnce({ ...newEntry, description: null });

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: {
        projectId: 'p1',
        taskId: 't1',
        startTime: '2025-01-15T09:00:00Z',
        endTime: '2025-01-15T10:00:00Z',
      },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
    expect(dbMock.mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
      'tenant-1',
    );
  });

  it('returns 400 when projectId is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: { taskId: 't1', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T10:00:00Z' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/projectId/i);
  });

  it('returns 400 when taskId is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: { projectId: 'p1', startTime: '2025-01-15T09:00:00Z', endTime: '2025-01-15T10:00:00Z' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/taskId/i);
  });

  it('returns 400 when startTime is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: { projectId: 'p1', taskId: 't1', endTime: '2025-01-15T10:00:00Z' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/startTime/i);
  });

  it('returns 400 when endTime is missing', async () => {
    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: { projectId: 'p1', taskId: 't1', startTime: '2025-01-15T09:00:00Z' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/endTime/i);
  });

  it('returns 400 when startTime is not a valid date', async () => {
    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: { projectId: 'p1', taskId: 't1', startTime: 'not-a-date', endTime: '2025-01-15T10:00:00Z' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/startTime/i);
  });

  it('returns 400 when endTime is before or equal to startTime', async () => {
    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: { projectId: 'p1', taskId: 't1', startTime: '2025-01-15T10:00:00Z', endTime: '2025-01-15T09:00:00Z' },
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/endTime must be after startTime/i);
  });

  it('returns 400 when project is not found in tenant', async () => {
    dbMock.mockFindById
      .mockResolvedValueOnce(null)  // project not found
      .mockResolvedValueOnce({ id: 't1' }); // task found

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: validBody,
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/project not found/i);
  });

  it('returns 400 when task is not found in tenant', async () => {
    dbMock.mockFindById
      .mockResolvedValueOnce({ id: 'p1' })  // project found
      .mockResolvedValueOnce(null);           // task not found

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: validBody,
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/task not found/i);
  });

  it('returns 409 when time entry overlaps with an existing one', async () => {
    dbMock.mockFindById
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 't1' });
    dbMock.mockFindOverlapping.mockResolvedValueOnce([{ id: 'existing-entry' }]);

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: validBody,
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/overlaps/i);
  });

  it('returns 409 when adding entry would exceed 24 hours for the day', async () => {
    dbMock.mockFindById
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 't1' });
    dbMock.mockFindOverlapping.mockResolvedValueOnce([]);
    dbMock.mockSumMinutesForDay.mockResolvedValueOnce(1400); // 1400 + 60 = 1460 > 1440

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: validBody,
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/24 hours/i);
  });

  it('regular user can create time entries (not admin-only)', async () => {
    mockDecode.mockResolvedValue(USER_PAYLOAD);

    dbMock.mockFindById
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 't1' });
    dbMock.mockFindOverlapping.mockResolvedValueOnce([]);
    dbMock.mockSumMinutesForDay.mockResolvedValueOnce(0);
    dbMock.mockCreate.mockResolvedValueOnce(newEntry);

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: validBody,
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(201);
  });

  it('returns 401 when not authenticated', async () => {
    mockDecode.mockResolvedValue(null);

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: validBody,
      token: '',
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(401);
  });

  it('returns 500 on database error during creation', async () => {
    dbMock.mockFindById
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 't1' });
    dbMock.mockFindOverlapping.mockResolvedValueOnce([]);
    dbMock.mockSumMinutesForDay.mockResolvedValueOnce(0);
    dbMock.mockCreate.mockRejectedValueOnce(new Error('DB write failed'));

    const req = makeRequest('http://localhost:3000/api/time-entries', {
      method: 'POST',
      body: validBody,
    });
    const res = await POST(req, dummyCtx);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
