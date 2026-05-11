-- Phase 3: pipeline_runs table
-- Persists coordinator PipelineState and per-engine artifact JSON.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY,
  opportunity_id VARCHAR(255) NOT NULL,
  intake_id UUID UNIQUE,
  state JSONB,
  e1_artifacts JSONB,
  e2_artifacts JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_opportunity
  ON pipeline_runs(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_intake
  ON pipeline_runs(intake_id);
