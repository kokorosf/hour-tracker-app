-- Processed messages: idempotency table to prevent duplicate processing of
-- Telegram updates during retries.
CREATE TABLE IF NOT EXISTS processed_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT        NOT NULL DEFAULT 'telegram',
  message_id    TEXT        NOT NULL,
  tenant_id     UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each message is only processed once per channel.
  UNIQUE (channel, message_id)
);

-- Auto-clean old rows (older than 7 days) via a partial index for efficient lookups.
CREATE INDEX idx_processed_messages_lookup ON processed_messages (channel, message_id);
CREATE INDEX idx_processed_messages_cleanup ON processed_messages (processed_at);
