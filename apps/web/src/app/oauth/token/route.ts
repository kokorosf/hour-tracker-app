/**
 * OAuth 2.0 Token Endpoint
 *
 * POST /oauth/token
 * Exchanges authorization codes for access tokens (with PKCE validation),
 * and refresh tokens for new access tokens.
 */

import { NextResponse } from 'next/server';
import { randomUUID, createHash } from 'crypto';
import {
  OAuthClientRepository,
  OAuthCodeRepository,
  OAuthTokenRepository,
  OAuthRefreshTokenRepository,
} from '@hour-tracker/database';

const clientRepo = new OAuthClientRepository();
const codeRepo = new OAuthCodeRepository();
const tokenRepo = new OAuthTokenRepository();
const refreshTokenRepo = new OAuthRefreshTokenRepository();

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/** S256 PKCE: base64url(sha256(code_verifier)) */
function computeS256Challenge(codeVerifier: string): string {
  return createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  try {
    // Parse form-encoded or JSON body
    const contentType = req.headers.get('content-type') ?? '';
    let params: Record<string, string>;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      params = Object.fromEntries(new URLSearchParams(text));
    } else {
      params = await req.json();
    }

    const grantType = params.grant_type;

    if (grantType === 'authorization_code') {
      return await handleAuthorizationCode(params);
    } else if (grantType === 'refresh_token') {
      return await handleRefreshToken(params);
    } else {
      return NextResponse.json(
        { error: 'unsupported_grant_type', error_description: 'Supported: authorization_code, refresh_token' },
        { status: 400, headers: corsHeaders() },
      );
    }
  } catch (error) {
    console.error('[oauth/token] error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500, headers: corsHeaders() },
    );
  }
}

async function handleAuthorizationCode(params: Record<string, string>) {
  const { code, client_id, client_secret, code_verifier, redirect_uri } = params;

  if (!code || !client_id || !code_verifier) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing required parameters' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Validate client
  const client = await clientRepo.getClient(client_id);
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client' },
      { status: 401, headers: corsHeaders() },
    );
  }

  // If client has a secret, validate it
  if (client.clientSecret && client_secret !== client.clientSecret) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Invalid client credentials' },
      { status: 401, headers: corsHeaders() },
    );
  }

  // Look up and validate authorization code
  const codeData = await codeRepo.getCode(code);
  if (!codeData) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Check expiry
  if (new Date(codeData.expiresAt) < new Date()) {
    await codeRepo.deleteCode(code);
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Authorization code has expired' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Verify code was issued to this client
  if (codeData.clientId !== client_id) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Code was not issued to this client' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Verify redirect_uri matches (if provided)
  if (redirect_uri && redirect_uri !== codeData.redirectUri) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'redirect_uri mismatch' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // PKCE validation (S256)
  const computedChallenge = computeS256Challenge(code_verifier);
  if (computedChallenge !== codeData.codeChallenge) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Invalid code_verifier (PKCE validation failed)' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Delete the code (single use)
  await codeRepo.deleteCode(code);

  // Generate tokens
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  const now = Date.now();

  await tokenRepo.createToken({
    token: accessToken,
    clientId: client_id,
    userId: codeData.userId,
    tenantId: codeData.tenantId,
    scope: codeData.scope,
    expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
  });

  await refreshTokenRepo.createRefreshToken({
    token: refreshToken,
    accessToken,
    clientId: client_id,
    userId: codeData.userId,
    tenantId: codeData.tenantId,
    scope: codeData.scope,
    expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
  });

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: codeData.scope ?? '',
    },
    { headers: corsHeaders() },
  );
}

async function handleRefreshToken(params: Record<string, string>) {
  const { refresh_token, client_id, client_secret } = params;

  if (!refresh_token || !client_id) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing required parameters' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Validate client
  const client = await clientRepo.getClient(client_id);
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client' },
      { status: 401, headers: corsHeaders() },
    );
  }

  if (client.clientSecret && client_secret !== client.clientSecret) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Invalid client credentials' },
      { status: 401, headers: corsHeaders() },
    );
  }

  // Look up refresh token
  const refreshData = await refreshTokenRepo.getRefreshToken(refresh_token);
  if (!refreshData) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Invalid or expired refresh token' },
      { status: 400, headers: corsHeaders() },
    );
  }

  if (refreshData.clientId !== client_id) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Refresh token was not issued to this client' },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Revoke old tokens
  await tokenRepo.deleteToken(refreshData.accessToken);
  await refreshTokenRepo.deleteRefreshToken(refresh_token);

  // Issue new tokens
  const newAccessToken = randomUUID();
  const newRefreshToken = randomUUID();
  const now = Date.now();

  await tokenRepo.createToken({
    token: newAccessToken,
    clientId: client_id,
    userId: refreshData.userId,
    tenantId: refreshData.tenantId,
    scope: refreshData.scope,
    expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
  });

  await refreshTokenRepo.createRefreshToken({
    token: newRefreshToken,
    accessToken: newAccessToken,
    clientId: client_id,
    userId: refreshData.userId,
    tenantId: refreshData.tenantId,
    scope: refreshData.scope,
    expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
  });

  return NextResponse.json(
    {
      access_token: newAccessToken,
      token_type: 'bearer',
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: newRefreshToken,
      scope: refreshData.scope ?? '',
    },
    { headers: corsHeaders() },
  );
}
