CREATE TABLE clients (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL REFERENCES tenants(id),
  name       VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_tenant_deleted ON clients (tenant_id, deleted_at);
