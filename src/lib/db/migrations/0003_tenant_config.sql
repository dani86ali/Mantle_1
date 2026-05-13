-- Phase 3: tenant configuration column for settings page.
-- Stores company profile, pricing defaults, and boilerplate overrides as a single JSON blob.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_config JSONB NOT NULL DEFAULT '{}';
