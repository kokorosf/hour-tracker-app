-- Chat identity mappings: link Telegram (or future channel) senders to app users.
CREATE TABLE IF NOT EXISTS chat_identity_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT        NOT NULL DEFAULT 'telegram',
  sender_id     TEXT        NOT NULL,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each sender can only be linked once per channel.
  UNIQUE (channel, sender_id)
);

CREATE INDEX idx_chat_identity_channel_sender ON chat_identity_mappings (channel, sender_id);
CREATE INDEX idx_chat_identity_tenant         ON chat_identity_mappings (tenant_id);
