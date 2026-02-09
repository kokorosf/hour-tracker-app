import { NextRequest } from 'next/server';
import {
  requireAuth,
  requireRole,
  getTenantId,
  getUserId,
  getUserRole,
  isAdmin,
  type AuthenticatedRequest,
} from '../middleware';

// ---------------------------------------------------------------------------
// Mock next-auth/jwt
// ---------------------------------------------------------------------------

const mockDecode = jest.fn();

jest.mock('next-auth/jwt', () => ({
  decode: (...args: unknown[]) => mockDecode(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PAYLOAD = {
  userId: 'user-1',
  email: 'alice@example.com',
  tenantId: 'tenant-1',
  role: 'admin',
};

function makeRequest(token?: string): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new NextRequest('http://localhost:3000/api/test', { headers });
}

const dummyCtx = { params: Promise.resolve({}) };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUTH_SECRET = 'test-secret';
});

describe('requireAuth', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const handler = jest.fn();
    const wrapped = requireAuth(handler);
    const res = await wrapped(makeRequest(), dummyCtx);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/authentication/i);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      headers: { Authorization: 'Basic abc123' },
    });
    const handler = jest.fn();
    const wrapped = requireAuth(handler);
    const res = await wrapped(req, dummyCtx);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when token decoding fails', async () => {
    mockDecode.mockResolvedValue(null);

    const handler = jest.fn();
    const wrapped = requireAuth(handler);
    const res = await wrapped(makeRequest('bad-token'), dummyCtx);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 when token payload is incomplete', async () => {
    mockDecode.mockResolvedValue({ userId: 'user-1' }); // missing fields

    const handler = jest.fn();
    const wrapped = requireAuth(handler);
    const res = await wrapped(makeRequest('incomplete-token'), dummyCtx);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler with user attached when token is valid', async () => {
    mockDecode.mockResolvedValue(VALID_PAYLOAD);

    const handler = jest.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const wrapped = requireAuth(handler);
    await wrapped(makeRequest('valid-token'), dummyCtx);

    expect(handler).toHaveBeenCalledTimes(1);
    const passedReq = handler.mock.calls[0][0] as AuthenticatedRequest;
    expect(passedReq.user).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      tenantId: 'tenant-1',
      role: 'admin',
    });
  });

  it('returns 401 when decode throws', async () => {
    mockDecode.mockRejectedValue(new Error('decode failed'));

    const handler = jest.fn();
    const wrapped = requireAuth(handler);
    const res = await wrapped(makeRequest('bad'), dummyCtx);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  it('returns 403 when user role does not match', async () => {
    mockDecode.mockResolvedValue({ ...VALID_PAYLOAD, role: 'user' });

    const handler = jest.fn();
    const wrapped = requireRole('admin')(handler);
    const res = await wrapped(makeRequest('token'), dummyCtx);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/permission/i);
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler when role matches', async () => {
    mockDecode.mockResolvedValue(VALID_PAYLOAD);

    const handler = jest.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const wrapped = requireRole('admin')(handler);
    await wrapped(makeRequest('token'), dummyCtx);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('still returns 401 if token is missing (auth runs first)', async () => {
    const handler = jest.fn();
    const wrapped = requireRole('admin')(handler);
    const res = await wrapped(makeRequest(), dummyCtx);

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('accessor helpers', () => {
  it('getTenantId extracts tenantId from user', () => {
    const req = { user: { id: 'u1', tenantId: 'tenant-1', email: 'a@b.com', role: 'user' as const } } as AuthenticatedRequest;
    expect(getTenantId(req)).toBe('tenant-1');
  });

  it('getUserId extracts user id', () => {
    const req = { user: { id: 'u1', tenantId: 't1', email: 'a@b.com', role: 'user' as const } } as AuthenticatedRequest;
    expect(getUserId(req)).toBe('u1');
  });

  it('getUserRole extracts user role', () => {
    const req = { user: { id: 'u1', tenantId: 't1', email: 'a@b.com', role: 'admin' as const } } as AuthenticatedRequest;
    expect(getUserRole(req)).toBe('admin');
  });

  it('isAdmin returns true for admin role', () => {
    const req = { user: { id: 'u1', tenantId: 't1', email: 'a@b.com', role: 'admin' as const } } as AuthenticatedRequest;
    expect(isAdmin(req)).toBe(true);
  });

  it('isAdmin returns false for user role', () => {
    const req = { user: { id: 'u1', tenantId: 't1', email: 'a@b.com', role: 'user' as const } } as AuthenticatedRequest;
    expect(isAdmin(req)).toBe(false);
  });
});
