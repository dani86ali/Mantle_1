-- Canonical Project state (MVP repair).
-- Creates the six Project-aggregate tables alongside the legacy
-- intake/pipeline/bom tables. No runtime wiring; schema/migration only.
-- Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
--
-- tenant_id is carried on every table for RLS simplicity and index locality.
-- Composite foreign keys include tenant_id (and project_id for grandchildren)
-- so the DB rejects child rows whose tenant_id/project_id do not match the
-- referenced parent.

-- ---- Projects ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  customer_name TEXT,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('quick_bom', 'rfp')),
  pricing_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_projects_id_tenant UNIQUE (id, tenant_id)
);

CREATE INDEX idx_projects_tenant_created ON projects(tenant_id, created_at DESC);
CREATE INDEX idx_projects_tenant_mode ON projects(tenant_id, mode);

-- ---- Project Files (uploaded source evidence, retained >= 1 year) -----------

CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  file_role VARCHAR(30) NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retain_until TIMESTAMPTZ NOT NULL,
  role_corrected_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_project_files_project
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES projects(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT uq_project_files_id_project_tenant UNIQUE (id, project_id, tenant_id)
);

CREATE INDEX idx_project_files_project_role ON project_files(project_id, file_role);
CREATE INDEX idx_project_files_tenant_uploaded ON project_files(tenant_id, uploaded_at DESC);

-- ---- Project Evidence Items (extracted from source files) -------------------

CREATE TABLE IF NOT EXISTS project_evidence_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_file_id UUID NOT NULL,
  kind VARCHAR(50) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retain_until TIMESTAMPTZ NOT NULL,
  CONSTRAINT fk_project_evidence_project
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES projects(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT fk_project_evidence_file
    FOREIGN KEY (source_file_id, project_id, tenant_id)
    REFERENCES project_files(id, project_id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_project_evidence_project_kind ON project_evidence_items(project_id, kind);
CREATE INDEX idx_project_evidence_source_file ON project_evidence_items(source_file_id);

-- ---- Project Stages (materialized per Project, ordering hardcoded in TS) ----

CREATE TABLE IF NOT EXISTS project_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stage_id VARCHAR(50) NOT NULL,
  stage_order INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_stages_project_stage UNIQUE (project_id, stage_id),
  CONSTRAINT uq_project_stages_project_order UNIQUE (project_id, stage_order),
  CONSTRAINT fk_project_stages_project
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES projects(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_project_stages_project_status ON project_stages(project_id, status);

-- ---- Project Artifacts (versioned; JSONB payload, large files by path) ------

CREATE TABLE IF NOT EXISTS project_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stage_id VARCHAR(50) NOT NULL,
  type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}',
  file_path TEXT,
  source_file_ids JSONB NOT NULL DEFAULT '[]',
  source_artifact_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_artifacts_project_type_version UNIQUE (project_id, type, version),
  CONSTRAINT uq_project_artifacts_id_project_tenant_version UNIQUE (id, project_id, tenant_id, version),
  CONSTRAINT fk_project_artifacts_project
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES projects(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX idx_project_artifacts_project_type_status ON project_artifacts(project_id, type, status);
CREATE INDEX idx_project_artifacts_project_stage ON project_artifacts(project_id, stage_id);

-- ---- Project Approvals (per stage/artifact, points to exact version) --------

CREATE TABLE IF NOT EXISTS project_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stage_id VARCHAR(50) NOT NULL,
  artifact_id UUID NOT NULL,
  artifact_version INTEGER NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by UUID NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  CONSTRAINT fk_project_approvals_project
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES projects(id, tenant_id) ON DELETE CASCADE,
  -- No ON DELETE: approvals are an audit record of an exact artifact version.
  CONSTRAINT fk_project_approvals_artifact
    FOREIGN KEY (artifact_id, project_id, tenant_id, artifact_version)
    REFERENCES project_artifacts(id, project_id, tenant_id, version)
);

CREATE INDEX idx_project_approvals_project_stage ON project_approvals(project_id, stage_id);
CREATE INDEX idx_project_approvals_artifact_version ON project_approvals(artifact_id, artifact_version);

-- ---- Row-Level Security -----------------------------------------------------
-- RLS enforces tenant isolation at the database level.
-- Application sets current_setting('app.tenant_id') before each query.

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_projects ON projects
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_project_files ON project_files
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_project_evidence_items ON project_evidence_items
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_project_stages ON project_stages
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_project_artifacts ON project_artifacts
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_project_approvals ON project_approvals
  USING (tenant_id::text = current_setting('app.tenant_id', true));
