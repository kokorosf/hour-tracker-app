-- 007: Invite tokens for the user invitation flow.
--
-- When an admin invites a user, a row is created here with a unique token.
-- The invited user visits /invite/<token> to set their password and activate
-- their account.  Tokens expire after 7 days and are single-use.

CREATE TABLE IF NOT EXISTS invite_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMP   NOT NULL,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_tokens_token ON invite_tokens (token) WHERE used_at IS NULL;
