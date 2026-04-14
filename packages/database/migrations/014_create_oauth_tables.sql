-- OAuth 2.0 tables for MCP remote server authentication
-- Supports dynamic client registration (RFC 7591), authorization codes with PKCE,
-- access tokens, and refresh tokens.

-- OAuth clients (dynamically registered by Claude, etc.)
CREATE TABLE oauth_clients (
  client_id                  VARCHAR(255) PRIMARY KEY,
  client_secret              VARCHAR(255),
  client_secret_expires_at   BIGINT DEFAULT 0,
  redirect_uris              TEXT[] NOT NULL,
  client_name                VARCHAR(255),
  token_endpoint_auth_method VARCHAR(50) DEFAULT 'client_secret_post',
  grant_types                TEXT[] DEFAULT '{authorization_code,refresh_token}',
  response_types             TEXT[] DEFAULT '{code}',
  scope                      VARCHAR(500),
  created_at                 TIMESTAMP NOT NULL DEFAULT now()
);

-- Authorization codes (short-lived, single use)
CREATE TABLE oauth_codes (
  code            VARCHAR(255) PRIMARY KEY,
  client_id       VARCHAR(255) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  redirect_uri    VARCHAR(2048) NOT NULL,
  scope           VARCHAR(500),
  code_challenge  VARCHAR(255) NOT NULL,
  resource        VARCHAR(2048),
  expires_at      TIMESTAMP NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_codes_expires ON oauth_codes (expires_at);

-- Access tokens
CREATE TABLE oauth_tokens (
  token      VARCHAR(255) PRIMARY KEY,
  client_id  VARCHAR(255) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope      VARCHAR(500),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens (expires_at);

-- Refresh tokens
CREATE TABLE oauth_refresh_tokens (
  token        VARCHAR(255) PRIMARY KEY,
  access_token VARCHAR(255) NOT NULL,
  client_id    VARCHAR(255) NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope        VARCHAR(500),
  expires_at   TIMESTAMP NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_refresh_tokens_expires ON oauth_refresh_tokens (expires_at);
