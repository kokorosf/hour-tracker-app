import { NextResponse } from 'next/server';
import { UserRepository, getPool } from '@hour-tracker/database';
import { sendPasswordReset } from '@/lib/email/service';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const userRepo = new UserRepository();
const resetLimiter = createRateLimiter({ limit: 5, windowSeconds: 900 });

/**
 * POST /api/auth/request-reset
 *
 * Request a password reset email.
 * Body: { email: string }
 *
 * Always returns 200 regardless of whether the email exists, to avoid
 * leaking user enumeration information.
 */
export async function POST(request: Request) {
  try {
    const blocked = resetLimiter.check(getClientIp(request));
    if (blocked) return blocked;
    const body = (await request.json()) as { email?: unknown };
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required.' },
        { status: 400 },
      );
    }

    // Always return success to prevent user enumeration.
    const successResponse = NextResponse.json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.',
    });

    const user = await userRepo.findByEmailGlobal(email);
    if (!user) return successResponse;

    // Generate token (1 hour expiry).
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const pool = getPool();
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt],
    );

    const baseUrl =
      process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password/${token}`;

    try {
      await sendPasswordReset(email, resetLink);
    } catch (emailErr) {
      console.warn('[request-reset] email send failed:', emailErr);
    }

    return successResponse;
  } catch (err) {
    console.error('[request-reset] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
