-- 011: Audit log for tracking data mutations.
--
-- Records who did what, when, and to which entity.  Stores the previous
-- state of the row as a JSONB snapshot so changes can be reviewed or undone.

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(20) NOT NULL,           -- 'create', 'update', 'delete'
  entity_type VARCHAR(50) NOT NULL,           -- 'time_entry', 'client', 'project', etc.
  entity_id   UUID        NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  created_at  TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_tenant_entity
  ON audit_log (tenant_id, entity_type, entity_id);

CREATE INDEX idx_audit_log_tenant_created
  ON audit_log (tenant_id, created_at DESC);
