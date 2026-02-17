-- 010: Password reset tokens.
--
-- When a user requests a password reset, a row is created here with a unique
-- token.  The user visits /reset-password/<token> to set a new password.
-- Tokens expire after 1 hour and are single-use.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMP   NOT NULL,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_token
  ON password_reset_tokens (token)
  WHERE used_at IS NULL;
