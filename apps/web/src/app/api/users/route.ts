import { NextResponse } from 'next/server';
import { genSalt, hash } from 'bcryptjs';
import { UserRepository, getPool, getTenantById } from '@hour-tracker/database';
import {
  requireAuth,
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';
import { sendInvitation } from '@/lib/email/service';
import { generateRequestId } from '@/lib/request-id';

const userRepo = new UserRepository();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/users
 *
 * List users for the authenticated user's tenant.
 * Supports pagination (`page`, `pageSize`). Requires admin role.
 */
export const GET = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20));
    const offset = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      userRepo.findByTenant(tenantId, { limit: pageSize, offset, orderBy: 'created_at', orderDirection: 'DESC' }),
      userRepo.count(tenantId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (err) {
    const requestId = generateRequestId();
    console.error(`[GET /api/users] error (${requestId}):`, err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.', requestId },
      { status: 500 },
    );
  }
});

/**
 * POST /api/users
 *
 * Invite (create) a new user in the same tenant. Requires admin role.
 * Body: { email: string, role: 'admin' | 'user' }
 *
 * Creates the user with a random temporary password, generates an invite
 * token, and sends an invitation email with a link to set their password.
 */
export const POST = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const body = (await req.json()) as {
      email?: unknown;
      role?: unknown;
    };

    // --- Validate email ---
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, error: 'A valid email address is required.' },
        { status: 400 },
      );
    }

    // --- Validate role ---
    const role = body.role === 'admin' || body.role === 'user' ? body.role : null;
    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role must be "admin" or "user".' },
        { status: 400 },
      );
    }

    // --- Check for duplicate ---
    const existing = await userRepo.findByEmail(email, tenantId);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A user with this email already exists in this tenant.' },
        { status: 409 },
      );
    }

    // --- Create user with a temporary hashed password ---
    const tempPassword = crypto.randomUUID();
    const salt = await genSalt(10);
    const passwordHash = await hash(tempPassword, salt);

    const pool = getPool();
    const userId = crypto.randomUUID();
    const now = new Date();

    const userSql = `
      INSERT INTO users (id, tenant_id, email, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      RETURNING id, tenant_id, email, role, created_at, updated_at
    `;
    const { rows } = await pool.query(userSql, [userId, tenantId, email, passwordHash, role, now]);
    const user = rows[0];

    // --- Generate invite token ---
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await pool.query(
      `INSERT INTO invite_tokens (user_id, tenant_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, tenantId, token, expiresAt],
    );

    // --- Build invite link ---
    const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const inviteLink = `${baseUrl}/invite/${token}`;

    // --- Send invitation email (best-effort) ---
    const tenant = await getTenantById(tenantId);
    const tenantName = tenant?.name ?? 'Hour Tracker';
    try {
      await sendInvitation(email, req.user.email, tenantName, inviteLink);
    } catch (emailErr) {
      console.warn('[POST /api/users] email send failed (invite link still valid):', emailErr);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: user.id,
          tenantId: user.tenant_id,
          email: user.email,
          role: user.role,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          inviteLink,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const requestId = generateRequestId();
    console.error(`[POST /api/users] error (${requestId}):`, err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.', requestId },
      { status: 500 },
    );
  }
});
