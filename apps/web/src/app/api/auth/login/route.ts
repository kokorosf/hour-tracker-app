import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { UserRepository } from '@hour-tracker/database';
import type { ExtendedUser } from '@hour-tracker/types';
import { encode } from 'next-auth/jwt';
import { authConfig } from '@/lib/auth/config';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const userRepo = new UserRepository();
const loginLimiter = createRateLimiter({ limit: 10, windowSeconds: 900 });

export async function POST(request: Request) {
  try {
    const blocked = loginLimiter.check(getClientIp(request));
    if (blocked) return blocked;
    const body = (await request.json()) as { email?: unknown; password?: unknown };

    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 },
      );
    }

    const user = await userRepo.findByEmailGlobal(email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 },
      );
    }

    const passwordValid = await compare(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 },
      );
    }

    const extendedUser: ExtendedUser = {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    const secret = authConfig.secret ?? process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error('AUTH_SECRET is not configured');
    }

    const token = await encode({
      secret,
      salt: 'authjs.session-token',
      token: {
        userId: extendedUser.id,
        email: extendedUser.email,
        tenantId: extendedUser.tenantId,
        role: extendedUser.role,
      },
    });

    return NextResponse.json({
      success: true,
      token,
      user: extendedUser,
    });
  } catch (err) {
    console.error('[login] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
