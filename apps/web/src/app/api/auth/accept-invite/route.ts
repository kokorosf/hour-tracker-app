import { NextResponse } from 'next/server';
import { genSalt, hash } from 'bcryptjs';
import { getPool } from '@hour-tracker/database';

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * POST /api/auth/accept-invite
 *
 * Accept an invitation by setting a password for the invited user.
 * Body: { token: string, password: string }
 *
 * This is a public endpoint (no auth required).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: unknown;
      password?: unknown;
    };

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Invite token is required.' },
        { status: 400 },
      );
    }

    if (!password || !PASSWORD_RE.test(password)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password must be at least 8 characters with one uppercase letter and one number.',
        },
        { status: 400 },
      );
    }

    const pool = getPool();

    // Look up the invite token.
    const { rows: tokenRows } = await pool.query(
      `SELECT id, user_id, tenant_id, expires_at, used_at
       FROM invite_tokens
       WHERE token = $1`,
      [token],
    );

    if (tokenRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired invite link.' },
        { status: 404 },
      );
    }

    const invite = tokenRows[0];

    if (invite.used_at) {
      return NextResponse.json(
        { success: false, error: 'This invite link has already been used.' },
        { status: 410 },
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'This invite link has expired.' },
        { status: 410 },
      );
    }

    // Hash the new password.
    const salt = await genSalt(10);
    const passwordHash = await hash(password, salt);

    // Update the user's password and mark the token as used.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
        [passwordHash, invite.user_id],
      );

      await client.query(
        'UPDATE invite_tokens SET used_at = now() WHERE id = $1',
        [invite.id],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Fetch the user's email for the response.
    const { rows: userRows } = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [invite.user_id],
    );

    return NextResponse.json({
      success: true,
      data: { email: userRows[0]?.email },
    });
  } catch (err) {
    console.error('[accept-invite] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
