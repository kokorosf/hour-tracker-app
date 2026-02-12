import { NextResponse } from 'next/server';
import { compare, genSalt, hash } from 'bcryptjs';
import { UserRepository, getPool } from '@hour-tracker/database';
import {
  requireAuth,
  type AuthenticatedRequest,
} from '@/lib/auth/middleware';

const userRepo = new UserRepository();

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * PUT /api/users/me/password
 *
 * Change the authenticated user's password.
 * Body: { currentPassword: string, newPassword: string }
 */
export const PUT = requireAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = (await req.json()) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    const currentPassword =
      typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Current password and new password are required.' },
        { status: 400 },
      );
    }

    if (!PASSWORD_RE.test(newPassword)) {
      return NextResponse.json(
        {
          success: false,
          error: 'New password must be at least 8 characters with one uppercase letter and one number.',
        },
        { status: 400 },
      );
    }

    // Fetch user to verify current password.
    const user = await userRepo.findByEmailGlobal(req.user.email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found.' },
        { status: 404 },
      );
    }

    const valid = await compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect.' },
        { status: 403 },
      );
    }

    // Hash new password and update.
    const salt = await genSalt(10);
    const passwordHash = await hash(newPassword, salt);

    await getPool().query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
      [passwordHash, req.user.id],
    );

    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    console.error('[PUT /api/users/me/password] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
});
