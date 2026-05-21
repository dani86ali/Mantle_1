import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Tenants ──────────────────────────────────────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  region: varchar("region", { length: 50 }).notNull(),
  priceListId: varchar("price_list_id", { length: 100 })
    .notNull()
    .default("Global Price List Emerging (USD)"),
  brandingConfig: jsonb("branding_config").notNull().default({}),
  standardsConfig: jsonb("standards_config").notNull().default({}),
  tenantConfig: jsonb("tenant_config").notNull().default({}),
  onboardingState: varchar("onboarding_state", { length: 50 })
    .notNull()
    .default("LEAD"),
  locale: varchar("locale", { length: 10 }).notNull().default("en-US"),
  timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tenantCredentials = pgTable("tenant_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ccoUsernameEnc: text("cco_username_enc").notNull(),
  ccoPasswordEnc: text("cco_password_enc").notNull(),
  clientIdEnc: text("client_id_enc").notNull(),
  clientSecretEnc: text("client_secret_enc").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tenantUsers = pgTable(
  "tenant_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("engineer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_tenant_users_email").on(table.tenantId, table.email),
  ]
);

// ─── Intakes ──────────────────────────────────────────────────────────────

export const intakes = pgTable(
  "intakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    path: varchar("path", { length: 20 }).notNull(),
    source: varchar("source", { length: 30 }).notNull(),
    customerName: varchar("customer_name", { length: 500 }).notNull(),
    region: varchar("region", { length: 50 }).notNull(),
    country: varchar("country", { length: 100 }),
    domain: varchar("domain", { length: 50 }).notNull(),
    requirementsJson: jsonb("requirements_json").notNull().default({}),
    uploadedFileUrl: text("uploaded_file_url"),
    rawEmailS3Url: text("raw_email_s3_url"),
    status: varchar("status", { length: 30 }).notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_intakes_tenant_status").on(table.tenantId, table.status),
    index("idx_intakes_tenant_created").on(table.tenantId, table.createdAt),
    index("idx_intakes_customer").on(table.tenantId, table.customerName),
  ]
);

// ─── Agent Runs ───────────────────────────────────────────────────────────

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    intakeId: uuid("intake_id")
      .notNull()
      .references(() => intakes.id),
    step: varchar("step", { length: 30 }),
    status: varchar("status", { length: 30 }).notNull().default("PENDING"),
    llmCallsJson: jsonb("llm_calls_json").notNull().default([]),
    ciscoCallsJson: jsonb("cisco_calls_json").notNull().default([]),
    tokenUsageJson: jsonb("token_usage_json")
      .notNull()
      .default({ totalInputTokens: 0, totalOutputTokens: 0 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_agent_runs_tenant_intake").on(table.tenantId, table.intakeId),
    index("idx_agent_runs_status").on(table.tenantId, table.status),
  ]
);

// ─── BoM Drafts (optimistic locking via version column) ──────────────────

export const bomDrafts = pgTable(
  "bom_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    intakeId: uuid("intake_id")
      .notNull()
      .references(() => intakes.id),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    version: integer("version").notNull().default(1),
    assignedEngineerId: uuid("assigned_engineer_id"),
    linesJson: jsonb("lines_json").notNull().default([]),
    validationReportJson: jsonb("validation_report_json").notNull().default({}),
    summary: jsonb("summary").notNull().default({}),
    estimateId: varchar("estimate_id", { length: 100 }),
    ccwUrl: text("ccw_url"),
    quoteAdvisory: jsonb("quote_advisory"),
    status: varchar("status", { length: 30 })
      .notNull()
      .default("AGENT_PROCESSING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_bom_drafts_tenant_status").on(table.tenantId, table.status),
    index("idx_bom_drafts_tenant_created").on(
      table.tenantId,
      table.createdAt
    ),
    index("idx_bom_drafts_estimate_id").on(table.tenantId, table.estimateId),
    index("idx_bom_drafts_intake").on(table.tenantId, table.intakeId),
  ]
);

// ─── Reviews ──────────────────────────────────────────────────────────────

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    bomDraftId: uuid("bom_draft_id")
      .notNull()
      .references(() => bomDrafts.id),
    engineerId: uuid("engineer_id").notNull(),
    decision: varchar("decision", { length: 30 }).notNull(),
    lineOverridesJson: jsonb("line_overrides_json").notNull().default([]),
    commentsJson: jsonb("comments_json").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_reviews_tenant_bom").on(table.tenantId, table.bomDraftId),
    index("idx_reviews_engineer").on(
      table.tenantId,
      table.engineerId,
      table.createdAt
    ),
  ]
);

// ─── Exports ──────────────────────────────────────────────────────────────

export const exports = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    bomDraftId: uuid("bom_draft_id")
      .notNull()
      .references(() => bomDrafts.id),
    type: varchar("type", { length: 30 }).notNull(),
    destination: varchar("destination", { length: 255 }).notNull().default(""),
    payloadJson: jsonb("payload_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_exports_tenant_bom").on(table.tenantId, table.bomDraftId),
  ]
);

// ─── Audit Log (append-only) ─────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    actorId: uuid("actor_id"),
    payloadJson: jsonb("payload_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_audit_log_tenant_time").on(table.tenantId, table.createdAt),
    index("idx_audit_log_event_type").on(
      table.tenantId,
      table.eventType,
      table.createdAt
    ),
  ]
);

// ─── Onboarding Events ───────────────────────────────────────────────────

export const onboardingEvents = pgTable("onboarding_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  fromState: varchar("from_state", { length: 50 }).notNull(),
  toState: varchar("to_state", { length: 50 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Pipeline Runs (Phase 3 — coordinator state + engine artifacts) ─────

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey(),
    opportunityId: varchar("opportunity_id", { length: 255 }).notNull(),
    intakeId: uuid("intake_id").unique(),
    state: jsonb("state"),
    e1Artifacts: jsonb("e1_artifacts"),
    e2Artifacts: jsonb("e2_artifacts"),
    e3Artifacts: jsonb("e3_artifacts"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_pipeline_runs_opportunity").on(table.opportunityId),
    index("idx_pipeline_runs_intake").on(table.intakeId),
  ]
);

// ---- Canonical Project State (MVP repair - alongside legacy tables) --------
// New Project aggregate tables live in a separate file to keep this one under
// budget. Not yet wired to runtime. See src/lib/db/project-schema.ts.
export * from "./project-schema";

// ─── RAG Chunks (Phase 2 — schema prepared) ──────────────────────────────

export const ragChunks = pgTable("rag_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sourceDoc: text("source_doc").notNull(),
  chunkText: text("chunk_text").notNull(),
  // pgvector column — will be added in migration as vector(1536)
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
