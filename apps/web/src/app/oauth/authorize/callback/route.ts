/**
 * OAuth 2.0 Authorization Callback
 *
 * POST /oauth/authorize/callback
 * Receives credentials + OAuth params, validates the user,
 * generates an authorization code, and redirects to the client's redirect_uri.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { compare } from 'bcryptjs';
import {
  UserRepository,
  OAuthClientRepository,
  OAuthCodeRepository,
} from '@hour-tracker/database';

const userRepo = new UserRepository();
const clientRepo = new OAuthClientRepository();
const codeRepo = new OAuthCodeRepository();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { email, password, client_id, redirect_uri, code_challenge, state, scope, resource } = body;

    if (!email || !password || !client_id || !redirect_uri || !code_challenge) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing required fields' },
        { status: 400 },
      );
    }

    // Validate client
    const client = await clientRepo.getClient(client_id);
    if (!client) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Unknown client' },
        { status: 400 },
      );
    }

    if (!client.redirectUris.includes(redirect_uri)) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Unregistered redirect_uri' },
        { status: 400 },
      );
    }

    // Authenticate user
    const user = await userRepo.findByEmailGlobal(email);
    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'access_denied', error_description: 'Invalid email or password' },
        { status: 401 },
      );
    }

    const passwordValid = await compare(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: 'access_denied', error_description: 'Invalid email or password' },
        { status: 401 },
      );
    }

    // Generate authorization code
    const code = randomUUID();
    await codeRepo.createCode({
      code,
      clientId: client_id,
      userId: user.id,
      tenantId: user.tenantId,
      redirectUri: redirect_uri,
      scope: scope || null,
      codeChallenge: code_challenge,
      resource: resource || null,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    // Build redirect URL with code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);

    // Return as JSON since the client-side fetch handles the redirect
    return NextResponse.json({ redirect: redirectUrl.toString() });
  } catch (error) {
    console.error('[oauth/authorize/callback] error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 },
    );
  }
}
