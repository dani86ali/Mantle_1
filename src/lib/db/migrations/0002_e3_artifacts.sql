-- Phase 3: E3 proposal artifacts column on pipeline_runs.
-- Stores the full E3Output JSON (sections, tiers, margin, file paths).

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS e3_artifacts JSONB;
