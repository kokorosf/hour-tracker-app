CREATE TABLE time_entries (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID      NOT NULL REFERENCES tenants(id),
  user_id     UUID      NOT NULL REFERENCES users(id),
  project_id  UUID      NOT NULL REFERENCES projects(id),
  task_id     UUID      NOT NULL REFERENCES tasks(id),
  start_time  TIMESTAMP NOT NULL,
  end_time    TIMESTAMP NOT NULL,
  duration    INTEGER   NOT NULL, -- minutes
  description TEXT,
  deleted_at  TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now(),

  CHECK (end_time > start_time)
);

CREATE INDEX idx_time_entries_tenant_user_start ON time_entries (tenant_id, user_id, start_time);
CREATE INDEX idx_time_entries_tenant_project    ON time_entries (tenant_id, project_id);
CREATE INDEX idx_time_entries_tenant_deleted     ON time_entries (tenant_id, deleted_at);
