import { NextResponse } from 'next/server';
import { getTenantById, updateTenant } from '@hour-tracker/database';
import {
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/tenants/settings
 *
 * Return the current tenant's settings. Admin only.
 */
export const GET = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const tenant = await getTenantById(tenantId);

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { accountantEmail: tenant.accountantEmail },
    });
  } catch (err) {
    console.error('[GET /api/tenants/settings] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/tenants/settings
 *
 * Update the current tenant's settings. Admin only.
 * Body: { accountantEmail?: string | null }
 */
export const PUT = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const body = (await req.json()) as { accountantEmail?: unknown };

    const raw = body.accountantEmail;
    let accountantEmail: string | null = null;

    if (typeof raw === 'string' && raw.trim() !== '') {
      const trimmed = raw.trim().toLowerCase();
      if (!EMAIL_RE.test(trimmed)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email address.' },
          { status: 400 },
        );
      }
      accountantEmail = trimmed;
    }

    const updated = await updateTenant(tenantId, { accountantEmail });

    return NextResponse.json({
      success: true,
      data: { accountantEmail: updated?.accountantEmail ?? null },
    });
  } catch (err) {
    console.error('[PUT /api/tenants/settings] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
