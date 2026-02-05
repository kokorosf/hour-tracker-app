CREATE TABLE projects (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id),
  client_id   UUID         NOT NULL REFERENCES clients(id),
  name        VARCHAR(255) NOT NULL,
  is_billable BOOLEAN      NOT NULL DEFAULT true,
  deleted_at  TIMESTAMP,
  created_at  TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_tenant_deleted ON projects (tenant_id, deleted_at);
CREATE INDEX idx_projects_client_id      ON projects (client_id);
