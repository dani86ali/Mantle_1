/**
 * Canonical Project-state tables (MVP repair).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * TS shapes + union/section docs: src/types/project.ts
 *
 * These tables live ALONGSIDE the legacy intake/pipeline/bom tables in
 * schema.ts; no runtime behavior is wired to them yet. The Project aggregate
 * is the primary product object: files, evidence, stages, artifacts, and
 * approvals belong to a Project.
 *
 * Multi-tenancy: tenant_id is duplicated onto every child table for
 * row-level-security simplicity and index locality. The child TS interfaces
 * (ProjectFile, ProjectEvidenceItem, ProjectStage, ProjectArtifact,
 * ProjectApproval) do NOT surface tenantId - mappers project it out. This is
 * intentional, not a drift bug. Enum columns (mode, decision) are CHECK-
 * constrained in migration 0004; other status/role columns rely on the TS
 * unions in project.ts.
 *
 * Tenant/project consistency: every parent reference is a COMPOSITE foreign
 * key that includes tenant_id (and project_id for grandchildren), so the DB
 * rejects child rows whose tenant_id/project_id do not match the parent. The
 * direct tenant_id -> tenants(id) reference is kept because RLS and the tenant
 * indexes depend on it.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { tenants } from "./schema";

// ---- Projects ---------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    customerName: text("customer_name"),
    mode: varchar("mode", { length: 20 }).notNull(), // ProjectMode; immutable
    pricingConfig: jsonb("pricing_config"), // ProjectPricingConfig
    // Soft archive (QBM-LOG-006). NULL = active; non-null = archived at that time.
    // Archive is non-destructive: archived Projects are hidden from active surfaces
    // but remain openable for read-only inspection and can be restored. No hard delete.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Composite uniqueness so child tables can FK (id, tenant_id).
    unique("uq_projects_id_tenant").on(table.id, table.tenantId),
    index("idx_projects_tenant_created").on(table.tenantId, table.createdAt),
    index("idx_projects_tenant_mode").on(table.tenantId, table.mode),
  ]
);

// ---- Project Files (uploaded source evidence, retained >= 1 year) -----------

export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fileRole: varchar("file_role", { length: 30 }).notNull(), // ProjectFileRole
    fileName: text("file_name").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    retainUntil: timestamp("retain_until", { withTimezone: true }).notNull(),
    roleCorrectedBy: uuid("role_corrected_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "fk_project_files_project",
      columns: [table.projectId, table.tenantId],
      foreignColumns: [projects.id, projects.tenantId],
    }).onDelete("cascade"),
    // Lets evidence FK back to the exact same (file, project, tenant) triple.
    unique("uq_project_files_id_project_tenant").on(
      table.id,
      table.projectId,
      table.tenantId
    ),
    index("idx_project_files_project_role").on(table.projectId, table.fileRole),
    index("idx_project_files_tenant_uploaded").on(
      table.tenantId,
      table.uploadedAt
    ),
  ]
);

// ---- Project Evidence Items (extracted from source files) -------------------

export const projectEvidenceItems = pgTable(
  "project_evidence_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceFileId: uuid("source_file_id").notNull(),
    kind: varchar("kind", { length: 50 }).notNull(),
    content: jsonb("content").notNull().default({}),
    extractedAt: timestamp("extracted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    retainUntil: timestamp("retain_until", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "fk_project_evidence_project",
      columns: [table.projectId, table.tenantId],
      foreignColumns: [projects.id, projects.tenantId],
    }).onDelete("cascade"),
    foreignKey({
      name: "fk_project_evidence_file",
      columns: [table.sourceFileId, table.projectId, table.tenantId],
      foreignColumns: [
        projectFiles.id,
        projectFiles.projectId,
        projectFiles.tenantId,
      ],
    }).onDelete("cascade"),
    index("idx_project_evidence_project_kind").on(table.projectId, table.kind),
    index("idx_project_evidence_source_file").on(table.sourceFileId),
  ]
);

// ---- Project Stages (materialized per Project, ordering hardcoded in TS) ----

export const projectStages = pgTable(
  "project_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    stageId: varchar("stage_id", { length: 50 }).notNull(), // ProjectStageId
    stageOrder: integer("stage_order").notNull(),
    status: varchar("status", { length: 20 }).notNull(), // ProjectStageStatus
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "fk_project_stages_project",
      columns: [table.projectId, table.tenantId],
      foreignColumns: [projects.id, projects.tenantId],
    }).onDelete("cascade"),
    unique("uq_project_stages_project_stage").on(table.projectId, table.stageId),
    unique("uq_project_stages_project_order").on(
      table.projectId,
      table.stageOrder
    ),
    index("idx_project_stages_project_status").on(table.projectId, table.status),
  ]
);

// ---- Project Artifacts (versioned; JSONB payload, large files by path) ------

export const projectArtifacts = pgTable(
  "project_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    stageId: varchar("stage_id", { length: 50 }).notNull(), // ProjectStageId
    type: varchar("type", { length: 30 }).notNull(), // ProjectArtifactType
    status: varchar("status", { length: 20 }).notNull(), // ProjectArtifactStatus
    version: integer("version").notNull().default(1),
    payload: jsonb("payload").notNull().default({}),
    filePath: text("file_path"),
    sourceFileIds: jsonb("source_file_ids").notNull().default([]),
    sourceArtifactIds: jsonb("source_artifact_ids").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "fk_project_artifacts_project",
      columns: [table.projectId, table.tenantId],
      foreignColumns: [projects.id, projects.tenantId],
    }).onDelete("cascade"),
    unique("uq_project_artifacts_project_type_version").on(
      table.projectId,
      table.type,
      table.version
    ),
    // Lets approvals FK back to the exact (artifact, project, tenant, version).
    unique("uq_project_artifacts_id_project_tenant_version").on(
      table.id,
      table.projectId,
      table.tenantId,
      table.version
    ),
    index("idx_project_artifacts_project_type_status").on(
      table.projectId,
      table.type,
      table.status
    ),
    index("idx_project_artifacts_project_stage").on(
      table.projectId,
      table.stageId
    ),
  ]
);

// ---- Project Approvals (per stage/artifact, points to exact version) --------

export const projectApprovals = pgTable(
  "project_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    stageId: varchar("stage_id", { length: 50 }).notNull(), // ProjectStageId
    artifactId: uuid("artifact_id").notNull(),
    artifactVersion: integer("artifact_version").notNull(),
    decision: varchar("decision", { length: 20 }).notNull(), // approved|rejected
    decidedBy: uuid("decided_by").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text("note"),
  },
  (table) => [
    foreignKey({
      name: "fk_project_approvals_project",
      columns: [table.projectId, table.tenantId],
      foreignColumns: [projects.id, projects.tenantId],
    }).onDelete("cascade"),
    // No ON DELETE: approvals are an audit record of an exact artifact version.
    foreignKey({
      name: "fk_project_approvals_artifact",
      columns: [
        table.artifactId,
        table.projectId,
        table.tenantId,
        table.artifactVersion,
      ],
      foreignColumns: [
        projectArtifacts.id,
        projectArtifacts.projectId,
        projectArtifacts.tenantId,
        projectArtifacts.version,
      ],
    }),
    index("idx_project_approvals_project_stage").on(
      table.projectId,
      table.stageId
    ),
    index("idx_project_approvals_artifact_version").on(
      table.artifactId,
      table.artifactVersion
    ),
  ]
);
