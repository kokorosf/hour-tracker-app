CREATE TABLE tasks (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL REFERENCES tenants(id),
  project_id UUID         NOT NULL REFERENCES projects(id),
  name       VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_tenant_deleted ON tasks (tenant_id, deleted_at);
CREATE INDEX idx_tasks_project_id     ON tasks (project_id);
