-- Project soft archive (QBM-LOG-006).
-- Additive: adds a nullable archived_at to projects. NULL = active; non-null =
-- archived at that timestamp. Archive is non-destructive (no hard delete);
-- archived Projects are hidden from active surfaces but remain readable and
-- restorable. A partial index keeps the default active-only listing fast.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_tenant_active
  ON projects(tenant_id, updated_at DESC)
  WHERE archived_at IS NULL;
