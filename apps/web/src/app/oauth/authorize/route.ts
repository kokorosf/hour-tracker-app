/**
 * OAuth 2.0 Authorization Endpoint
 *
 * GET /oauth/authorize
 * Validates the OAuth params and redirects to the login page.
 * The login page will POST credentials back to /oauth/authorize/callback.
 */

import { NextResponse } from 'next/server';
import { OAuthClientRepository } from '@hour-tracker/database';

const clientRepo = new OAuthClientRepository();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const responseType = url.searchParams.get('response_type');
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');
  const state = url.searchParams.get('state');
  const scope = url.searchParams.get('scope');
  const resource = url.searchParams.get('resource');

  // Validate required params
  if (!clientId || !redirectUri || !responseType || !codeChallenge) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing required parameters' },
      { status: 400 },
    );
  }

  if (responseType !== 'code') {
    return NextResponse.json(
      { error: 'unsupported_response_type', error_description: 'Only code is supported' },
      { status: 400 },
    );
  }

  if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Only S256 code challenge method is supported' },
      { status: 400 },
    );
  }

  // Validate client
  const client = await clientRepo.getClient(clientId);
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client_id' },
      { status: 400 },
    );
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Unregistered redirect_uri' },
      { status: 400 },
    );
  }

  // Build the login page URL with all OAuth params forwarded
  const loginUrl = new URL('/oauth/authorize/login', url.origin);
  loginUrl.searchParams.set('client_id', clientId);
  loginUrl.searchParams.set('redirect_uri', redirectUri);
  loginUrl.searchParams.set('code_challenge', codeChallenge);
  if (state) loginUrl.searchParams.set('state', state);
  if (scope) loginUrl.searchParams.set('scope', scope);
  if (resource) loginUrl.searchParams.set('resource', resource);

  return NextResponse.redirect(loginUrl.toString());
}
