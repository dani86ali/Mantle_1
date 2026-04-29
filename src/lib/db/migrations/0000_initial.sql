-- BOMatic Initial Migration
-- Creates all Phase 1 tables with indexes and RLS setup

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Tenants ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  region VARCHAR(50) NOT NULL,
  price_list_id VARCHAR(100) NOT NULL DEFAULT 'Global Price List Emerging (USD)',
  branding_config JSONB NOT NULL DEFAULT '{}',
  standards_config JSONB NOT NULL DEFAULT '{}',
  onboarding_state VARCHAR(50) NOT NULL DEFAULT 'LEAD',
  locale VARCHAR(10) NOT NULL DEFAULT 'en-US',
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cco_username_enc TEXT NOT NULL,
  cco_password_enc TEXT NOT NULL,
  client_id_enc TEXT NOT NULL,
  client_secret_enc TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'engineer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_users_email ON tenant_users(tenant_id, email);

-- ─── Intakes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  path VARCHAR(20) NOT NULL,
  source VARCHAR(30) NOT NULL,
  customer_name VARCHAR(500) NOT NULL,
  region VARCHAR(50) NOT NULL,
  country VARCHAR(100),
  domain VARCHAR(50) NOT NULL,
  requirements_json JSONB NOT NULL DEFAULT '{}',
  uploaded_file_url TEXT,
  raw_email_s3_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_intakes_tenant_status ON intakes(tenant_id, status);
CREATE INDEX idx_intakes_tenant_created ON intakes(tenant_id, created_at DESC);
CREATE INDEX idx_intakes_customer ON intakes(tenant_id, customer_name);
CREATE INDEX idx_intakes_customer_trgm ON intakes USING gin (customer_name gin_trgm_ops);

-- ─── Agent Runs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  intake_id UUID NOT NULL REFERENCES intakes(id),
  step VARCHAR(30),
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  llm_calls_json JSONB NOT NULL DEFAULT '[]',
  cisco_calls_json JSONB NOT NULL DEFAULT '[]',
  token_usage_json JSONB NOT NULL DEFAULT '{"totalInputTokens": 0, "totalOutputTokens": 0}',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_runs_tenant_intake ON agent_runs(tenant_id, intake_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(tenant_id, status);

-- ─── BoM Drafts (optimistic locking via version column) ──────────────────

CREATE TABLE IF NOT EXISTS bom_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  intake_id UUID NOT NULL REFERENCES intakes(id),
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id),
  version INTEGER NOT NULL DEFAULT 1,
  assigned_engineer_id UUID,
  lines_json JSONB NOT NULL DEFAULT '[]',
  validation_report_json JSONB NOT NULL DEFAULT '{}',
  summary JSONB NOT NULL DEFAULT '{}',
  estimate_id VARCHAR(100),
  ccw_url TEXT,
  quote_advisory JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'AGENT_PROCESSING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bom_drafts_tenant_status ON bom_drafts(tenant_id, status);
CREATE INDEX idx_bom_drafts_tenant_created ON bom_drafts(tenant_id, created_at DESC);
CREATE INDEX idx_bom_drafts_estimate_id ON bom_drafts(tenant_id, estimate_id);
CREATE INDEX idx_bom_drafts_intake ON bom_drafts(tenant_id, intake_id);

-- ─── Reviews ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  bom_draft_id UUID NOT NULL REFERENCES bom_drafts(id),
  engineer_id UUID NOT NULL,
  decision VARCHAR(30) NOT NULL,
  line_overrides_json JSONB NOT NULL DEFAULT '[]',
  comments_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_tenant_bom ON reviews(tenant_id, bom_draft_id);
CREATE INDEX idx_reviews_engineer ON reviews(tenant_id, engineer_id, created_at DESC);

-- ─── Exports ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  bom_draft_id UUID NOT NULL REFERENCES bom_drafts(id),
  type VARCHAR(30) NOT NULL,
  destination VARCHAR(255) NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exports_tenant_bom ON exports(tenant_id, bom_draft_id);

-- ─── Audit Log (append-only) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  event_type VARCHAR(100) NOT NULL,
  actor_id UUID,
  payload_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tenant_time ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_event_type ON audit_log(tenant_id, event_type, created_at DESC);

-- ─── Onboarding Events ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  from_state VARCHAR(50) NOT NULL,
  to_state VARCHAR(50) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── RAG Chunks (Phase 2 — schema prepared) ──────────────────────────────

CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_doc TEXT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row-Level Security ──────────────────────────────────────────────────
-- RLS enforces tenant isolation at the database level.
-- Application sets current_setting('app.tenant_id') before each query.

ALTER TABLE intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- Create policies for each table
CREATE POLICY tenant_isolation_intakes ON intakes
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_agent_runs ON agent_runs
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_bom_drafts ON bom_drafts
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_reviews ON reviews
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_exports ON exports
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_audit_log ON audit_log
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_onboarding ON onboarding_events
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_credentials ON tenant_credentials
  USING (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY tenant_isolation_users ON tenant_users
  USING (tenant_id::text = current_setting('app.tenant_id', true));
