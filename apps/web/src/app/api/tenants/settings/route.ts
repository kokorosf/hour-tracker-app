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
      data: {
        accountantEmail: tenant.accountantEmail,
        telegramChatId: tenant.telegramChatId,
      },
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
    const body = (await req.json()) as {
      accountantEmail?: unknown;
      telegramChatId?: unknown;
    };

    const updateData: { accountantEmail?: string | null; telegramChatId?: string | null } = {};

    // Validate accountant email if provided.
    if (body.accountantEmail !== undefined) {
      const raw = body.accountantEmail;
      if (typeof raw === 'string' && raw.trim() !== '') {
        const trimmed = raw.trim().toLowerCase();
        if (!EMAIL_RE.test(trimmed)) {
          return NextResponse.json(
            { success: false, error: 'Invalid email address.' },
            { status: 400 },
          );
        }
        updateData.accountantEmail = trimmed;
      } else {
        updateData.accountantEmail = null;
      }
    }

    // Validate telegram chat ID if provided.
    if (body.telegramChatId !== undefined) {
      const raw = body.telegramChatId;
      if (typeof raw === 'string' && raw.trim() !== '') {
        updateData.telegramChatId = raw.trim();
      } else {
        updateData.telegramChatId = null;
      }
    }

    const updated = await updateTenant(tenantId, updateData);

    return NextResponse.json({
      success: true,
      data: {
        accountantEmail: updated?.accountantEmail ?? null,
        telegramChatId: updated?.telegramChatId ?? null,
      },
    });
  } catch (err) {
    console.error('[PUT /api/tenants/settings] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
