/**
 * OAuth 2.0 repositories for MCP remote server authentication.
 * Manages clients, authorization codes, access tokens, and refresh tokens.
 */

import { getPool } from '../connection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthClient {
  clientId: string;
  clientSecret: string | null;
  clientSecretExpiresAt: number;
  redirectUris: string[];
  clientName: string | null;
  tokenEndpointAuthMethod: string;
  grantTypes: string[];
  responseTypes: string[];
  scope: string | null;
  createdAt: Date;
}

export interface OAuthCode {
  code: string;
  clientId: string;
  userId: string;
  tenantId: string;
  redirectUri: string;
  scope: string | null;
  codeChallenge: string;
  resource: string | null;
  expiresAt: Date;
}

export interface OAuthToken {
  token: string;
  clientId: string;
  userId: string;
  tenantId: string;
  scope: string | null;
  expiresAt: Date;
}

export interface OAuthRefreshToken {
  token: string;
  accessToken: string;
  clientId: string;
  userId: string;
  tenantId: string;
  scope: string | null;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Client Repository
// ---------------------------------------------------------------------------

export class OAuthClientRepository {
  async getClient(clientId: string): Promise<OAuthClient | null> {
    const { rows } = await getPool().query(
      `SELECT client_id AS "clientId",
              client_secret AS "clientSecret",
              client_secret_expires_at AS "clientSecretExpiresAt",
              redirect_uris AS "redirectUris",
              client_name AS "clientName",
              token_endpoint_auth_method AS "tokenEndpointAuthMethod",
              grant_types AS "grantTypes",
              response_types AS "responseTypes",
              scope,
              created_at AS "createdAt"
       FROM oauth_clients WHERE client_id = $1`,
      [clientId],
    );
    return (rows[0] as OAuthClient) ?? null;
  }

  async registerClient(data: {
    clientId: string;
    clientSecret: string | null;
    clientSecretExpiresAt: number;
    redirectUris: string[];
    clientName: string | null;
    tokenEndpointAuthMethod: string;
    grantTypes: string[];
    responseTypes: string[];
    scope: string | null;
  }): Promise<OAuthClient> {
    const { rows } = await getPool().query(
      `INSERT INTO oauth_clients (
         client_id, client_secret, client_secret_expires_at,
         redirect_uris, client_name, token_endpoint_auth_method,
         grant_types, response_types, scope
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING client_id AS "clientId",
                 client_secret AS "clientSecret",
                 client_secret_expires_at AS "clientSecretExpiresAt",
                 redirect_uris AS "redirectUris",
                 client_name AS "clientName",
                 token_endpoint_auth_method AS "tokenEndpointAuthMethod",
                 grant_types AS "grantTypes",
                 response_types AS "responseTypes",
                 scope,
                 created_at AS "createdAt"`,
      [
        data.clientId,
        data.clientSecret,
        data.clientSecretExpiresAt,
        data.redirectUris,
        data.clientName,
        data.tokenEndpointAuthMethod,
        data.grantTypes,
        data.responseTypes,
        data.scope,
      ],
    );
    return rows[0] as OAuthClient;
  }
}

// ---------------------------------------------------------------------------
// Code Repository
// ---------------------------------------------------------------------------

export class OAuthCodeRepository {
  async createCode(data: {
    code: string;
    clientId: string;
    userId: string;
    tenantId: string;
    redirectUri: string;
    scope: string | null;
    codeChallenge: string;
    resource: string | null;
    expiresAt: Date;
  }): Promise<void> {
    await getPool().query(
      `INSERT INTO oauth_codes (
         code, client_id, user_id, tenant_id, redirect_uri,
         scope, code_challenge, resource, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        data.code,
        data.clientId,
        data.userId,
        data.tenantId,
        data.redirectUri,
        data.scope,
        data.codeChallenge,
        data.resource,
        data.expiresAt,
      ],
    );
  }

  async getCode(code: string): Promise<OAuthCode | null> {
    const { rows } = await getPool().query(
      `SELECT code,
              client_id AS "clientId",
              user_id AS "userId",
              tenant_id AS "tenantId",
              redirect_uri AS "redirectUri",
              scope,
              code_challenge AS "codeChallenge",
              resource,
              expires_at AS "expiresAt"
       FROM oauth_codes WHERE code = $1`,
      [code],
    );
    return (rows[0] as OAuthCode) ?? null;
  }

  async deleteCode(code: string): Promise<void> {
    await getPool().query('DELETE FROM oauth_codes WHERE code = $1', [code]);
  }

  async deleteExpired(): Promise<void> {
    await getPool().query('DELETE FROM oauth_codes WHERE expires_at < now()');
  }
}

// ---------------------------------------------------------------------------
// Token Repository
// ---------------------------------------------------------------------------

export class OAuthTokenRepository {
  async createToken(data: {
    token: string;
    clientId: string;
    userId: string;
    tenantId: string;
    scope: string | null;
    expiresAt: Date;
  }): Promise<void> {
    await getPool().query(
      `INSERT INTO oauth_tokens (token, client_id, user_id, tenant_id, scope, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [data.token, data.clientId, data.userId, data.tenantId, data.scope, data.expiresAt],
    );
  }

  async getToken(token: string): Promise<OAuthToken | null> {
    const { rows } = await getPool().query(
      `SELECT token,
              client_id AS "clientId",
              user_id AS "userId",
              tenant_id AS "tenantId",
              scope,
              expires_at AS "expiresAt"
       FROM oauth_tokens WHERE token = $1 AND expires_at > now()`,
      [token],
    );
    return (rows[0] as OAuthToken) ?? null;
  }

  async deleteToken(token: string): Promise<void> {
    await getPool().query('DELETE FROM oauth_tokens WHERE token = $1', [token]);
  }

  async deleteExpired(): Promise<void> {
    await getPool().query('DELETE FROM oauth_tokens WHERE expires_at < now()');
  }
}

// ---------------------------------------------------------------------------
// Refresh Token Repository
// ---------------------------------------------------------------------------

export class OAuthRefreshTokenRepository {
  async createRefreshToken(data: {
    token: string;
    accessToken: string;
    clientId: string;
    userId: string;
    tenantId: string;
    scope: string | null;
    expiresAt: Date;
  }): Promise<void> {
    await getPool().query(
      `INSERT INTO oauth_refresh_tokens (
         token, access_token, client_id, user_id, tenant_id, scope, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.token,
        data.accessToken,
        data.clientId,
        data.userId,
        data.tenantId,
        data.scope,
        data.expiresAt,
      ],
    );
  }

  async getRefreshToken(token: string): Promise<OAuthRefreshToken | null> {
    const { rows } = await getPool().query(
      `SELECT token,
              access_token AS "accessToken",
              client_id AS "clientId",
              user_id AS "userId",
              tenant_id AS "tenantId",
              scope,
              expires_at AS "expiresAt"
       FROM oauth_refresh_tokens WHERE token = $1 AND expires_at > now()`,
      [token],
    );
    return (rows[0] as OAuthRefreshToken) ?? null;
  }

  async deleteByAccessToken(accessToken: string): Promise<void> {
    await getPool().query(
      'DELETE FROM oauth_refresh_tokens WHERE access_token = $1',
      [accessToken],
    );
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await getPool().query('DELETE FROM oauth_refresh_tokens WHERE token = $1', [token]);
  }

  async deleteExpired(): Promise<void> {
    await getPool().query('DELETE FROM oauth_refresh_tokens WHERE expires_at < now()');
  }
}
