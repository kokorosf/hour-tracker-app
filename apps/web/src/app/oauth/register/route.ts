/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * POST /oauth/register
 * Allows MCP clients (like Claude) to register themselves dynamically.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { OAuthClientRepository } from '@hour-tracker/database';

const clientRepo = new OAuthClientRepository();

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      return NextResponse.json(
        { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' },
        { status: 400, headers: corsHeaders() },
      );
    }

    // Validate redirect URIs
    for (const uri of redirectUris) {
      try {
        new URL(uri);
      } catch {
        return NextResponse.json(
          { error: 'invalid_client_metadata', error_description: `Invalid redirect_uri: ${uri}` },
          { status: 400, headers: corsHeaders() },
        );
      }
    }

    const clientId = randomUUID();
    const clientSecret = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const client = await clientRepo.registerClient({
      clientId,
      clientSecret,
      clientSecretExpiresAt: 0, // never expires
      redirectUris,
      clientName: body.client_name ?? null,
      tokenEndpointAuthMethod: body.token_endpoint_auth_method ?? 'client_secret_post',
      grantTypes: body.grant_types ?? ['authorization_code', 'refresh_token'],
      responseTypes: body.response_types ?? ['code'],
      scope: body.scope ?? null,
    });

    return NextResponse.json(
      {
        client_id: client.clientId,
        client_secret: client.clientSecret,
        client_id_issued_at: now,
        client_secret_expires_at: 0,
        redirect_uris: client.redirectUris,
        client_name: client.clientName,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        scope: client.scope,
      },
      { status: 201, headers: corsHeaders() },
    );
  } catch (error) {
    console.error('[oauth/register] error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500, headers: corsHeaders() },
    );
  }
}
