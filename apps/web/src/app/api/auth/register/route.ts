import { NextResponse } from 'next/server';
import { genSalt, hash } from 'bcryptjs';
import { UserRepository, transaction } from '@hour-tracker/database';
import type { ExtendedUser } from '@hour-tracker/types';
import { encode } from 'next-auth/jwt';
import { authConfig } from '@/lib/auth/config';

const userRepo = new UserRepository();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

interface RegisterBody {
  email: unknown;
  password: unknown;
  tenantName: unknown;
}

function validateBody(body: RegisterBody): string | null {
  const { email, password, tenantName } = body;

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return 'Invalid email format.';
  }
  if (typeof password !== 'string' || !PASSWORD_RE.test(password)) {
    return 'Password must be at least 8 characters with at least one uppercase letter and one number.';
  }
  if (typeof tenantName !== 'string' || tenantName.trim().length === 0) {
    return 'Tenant name is required.';
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterBody;

    // ---- Validation ----
    const validationError = validateBody(body);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const email = (body.email as string).trim().toLowerCase();
    const password = body.password as string;
    const tenantName = (body.tenantName as string).trim();

    // ---- Duplicate check ----
    const existing = await userRepo.findByEmailGlobal(email);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    // ---- Hash password ----
    const salt = await genSalt(10);
    const passwordHash = await hash(password, salt);

    // ---- Create tenant + user in a transaction ----
    const { tenant, user } = await transaction(async (client) => {
      const tenantResult = await client.query(
        `INSERT INTO tenants (id, name, plan, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'free', now(), now())
         RETURNING id, name, plan, created_at, updated_at`,
        [tenantName],
      );
      const tenant = tenantResult.rows[0];

      const userResult = await client.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'admin', now(), now())
         RETURNING id, tenant_id, email, role`,
        [tenant.id, email, passwordHash],
      );
      const user = userResult.rows[0];

      return { tenant, user };
    });

    // ---- Generate JWT ----
    const extendedUser: ExtendedUser = {
      id: user.id,
      email: user.email,
      tenantId: user.tenant_id,
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

    return NextResponse.json(
      {
        success: true,
        token,
        user: extendedUser,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[register] error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}
