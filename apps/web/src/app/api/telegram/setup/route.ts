import { NextResponse } from 'next/server';
import { setWebhook, deleteWebhook } from '@/lib/telegram/client';
import {
  requireRole,
  getTenantId,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /api/telegram/setup
 *
 * Register the Telegram webhook. Admin only.
 * The webhook URL is derived from the request's host.
 */
export const POST = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);

    // Build the webhook URL from the incoming request.
    const host = req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const webhookUrl = `${proto}://${host}/api/telegram/webhook`;

    const result = await setWebhook(webhookUrl);

    if (!result.ok) {
      console.error('[telegram/setup] setWebhook failed:', result.description);
      return NextResponse.json(
        { success: false, error: result.description ?? 'Failed to set webhook.' },
        { status: 500 },
      );
    }

    console.log(`[telegram/setup] Webhook registered for tenant ${tenantId}: ${webhookUrl}`);

    return NextResponse.json({
      success: true,
      data: { webhookUrl },
    });
  } catch (err) {
    console.error('[telegram/setup] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/telegram/setup
 *
 * Unregister the Telegram webhook. Admin only.
 */
export const DELETE = requireRole('admin')(async (req: AuthenticatedRequest) => {
  try {
    const tenantId = getTenantId(req);
    const result = await deleteWebhook();

    if (!result.ok) {
      console.error('[telegram/setup] deleteWebhook failed:', result.description);
      return NextResponse.json(
        { success: false, error: result.description ?? 'Failed to remove webhook.' },
        { status: 500 },
      );
    }

    console.log(`[telegram/setup] Webhook removed for tenant ${tenantId}.`);

    return NextResponse.json({ success: true, data: {} });
  } catch (err) {
    console.error('[telegram/setup] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
