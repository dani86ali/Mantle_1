/**
 * Narrow Project repository: creation + stage materialization, plus a
 * tenant-scoped readback. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts. Stage sequence: src/lib/projects/stages.ts.
 *
 * Scope (Prompt 7) is intentionally minimal: create a Project and materialize
 * its `project_stages` transactionally, and read one Project back by id within
 * its tenant. Files, evidence, artifacts, approvals, stale propagation, and
 * mutation are NOT handled here yet - the aggregate returns empty child arrays.
 *
 * QBM-LOG-001 adds one narrow tenant-scoped read, {@link quickBomProjectNameExists},
 * used by the Quick BoM creation guard. It reads only the canonical `projects`
 * table (no artifacts/files/approvals/payloads) and is scoped to mode quick_bom.
 *
 * Project.mode is immutable after creation (section 2): this module exposes no
 * updateProjectMode. Tenant scoping is enforced on every read; the canonical
 * tables duplicate tenant_id per row, but the TS child shapes do not surface it.
 */
import { and, asc, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { withTenantDb } from "./index";
import { projects, projectStages, projectArtifacts } from "./schema";
import { materializeProjectStages } from "@/lib/projects/stages";
import type {
  Project,
  ProjectMode,
  ProjectPricingConfig,
  ProjectStage,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

type ProjectRow = typeof projects.$inferSelect;
type ProjectStageRow = typeof projectStages.$inferSelect;

/** Input for {@link createProject}. */
export interface CreateProjectInput {
  tenantId: string;
  name: string;
  /** Immutable after creation. (section 2) */
  mode: ProjectMode;
  customerName?: string;
  pricingConfig?: ProjectPricingConfig;
  /** Also materialize mode-inactive stages as `not_applicable`. (section 13) */
  includeNotApplicableStages?: boolean;
}

export type ProjectListStatus =
  | "not_started"
  | "in_progress"
  | "needs_review"
  | "approved"
  | "rejected"
  | "blocked";

export interface ProjectListItem {
  id: string;
  tenantId: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  status: ProjectListStatus;
  activeStageId?: ProjectStageId;
  activeStageStatus?: ProjectStageStatus;
  stageCounts: {
    total: number;
    approved: number;
    needsReview: number;
    inProgress: number;
    blocked: number;
    rejected: number;
  };
  /** Soft archive timestamp ISO string (QBM-LOG-006); absent when active. */
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Archive filter for the Project list surface (QBM-LOG-006). `active` (default)
 * returns only non-archived Projects, `archived` only archived, `all` both.
 */
export type ProjectArchiveFilter = "active" | "archived" | "all";

/** Map a DB stage row to a ProjectStage; stageOrder -> order, tenantId dropped. */
function toProjectStage(row: ProjectStageRow): ProjectStage {
  return {
    id: row.id,
    projectId: row.projectId,
    stageId: row.stageId as ProjectStageId,
    order: row.stageOrder,
    status: row.status as ProjectStageStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Assemble the Project aggregate from a project row and its stage rows. Child
 * collections other than stages are empty for now (Prompt 7 scope). Stages are
 * sorted by global order; Date instances from the DB rows are preserved.
 */
function toProject(row: ProjectRow, stageRows: ProjectStageRow[]): Project {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    customerName: row.customerName ?? undefined,
    mode: row.mode as ProjectMode,
    pricingConfig:
      (row.pricingConfig as ProjectPricingConfig | null) ?? undefined,
    files: [],
    evidence: [],
    stages: [...stageRows]
      .sort((a, b) => a.stageOrder - b.stageOrder)
      .map(toProjectStage),
    artifacts: [],
    approvals: [],
    ...(row.archivedAt != null ? { archivedAt: row.archivedAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Quick BoM list status/progress derive from *effective* gate completion, not
 * the raw `project_stages` rows. The first Quick BoM gate (`boq_format_validation`)
 * is satisfied by a present, non-stale `normalized_boq` artifact - which is
 * intentionally NOT approval-gated (see quick-bom-readiness `SPINE`). So a project
 * can have an approved downstream spine yet a `boq_format_validation` row still
 * `not_started`. Treat that stage as effectively `approved` for the listing only,
 * without mutating any stored row. Statuses that carry an explicit human signal
 * (rejected/blocked/needs_review/already-approved) are preserved.
 */
const QUICK_BOM_OVERRIDABLE_STATUSES: ReadonlySet<ProjectStageStatus> =
  new Set<ProjectStageStatus>(["not_started", "in_progress"]);

/**
 * Latest `normalized_boq` artifact present and not stale - the present_non_stale
 * gate the readiness helper applies to the first Quick BoM step.
 */
function isNormalizedBoqGateMet(status: ProjectArtifactStatusValue | undefined): boolean {
  if (status === undefined) return false;
  const present = status !== "missing" && status !== "not_applicable";
  return present && status !== "stale";
}

type ProjectArtifactStatusValue = typeof projectArtifacts.$inferSelect["status"];

/**
 * Project the listing's effective stages: for Quick BoM projects, fold the
 * present/non-stale `normalized_boq` gate into `boq_format_validation`. RFP
 * projects and all other stages pass through unchanged.
 */
function toEffectiveStages(
  stages: readonly ProjectStage[],
  mode: ProjectMode,
  boqValidationGateMet: boolean
): ProjectStage[] {
  if (mode !== "quick_bom" || !boqValidationGateMet) return [...stages];
  return stages.map((stage) =>
    stage.stageId === "boq_format_validation" &&
    QUICK_BOM_OVERRIDABLE_STATUSES.has(stage.status)
      ? { ...stage, status: "approved" as const }
      : stage
  );
}

function deriveProjectListStatus(stages: readonly ProjectStage[]): ProjectListStatus {
  const active = stages.filter((stage) => stage.status !== "not_applicable");
  if (active.some((stage) => stage.status === "rejected")) return "rejected";
  if (active.some((stage) => stage.status === "blocked")) return "blocked";
  if (active.some((stage) => stage.status === "needs_review")) return "needs_review";
  if (active.some((stage) => stage.status === "in_progress")) return "in_progress";
  if (active.length > 0 && active.every((stage) => stage.status === "approved")) {
    return "approved";
  }
  if (active.some((stage) => stage.status === "approved")) return "in_progress";
  return "not_started";
}

function toProjectListItem(
  row: ProjectRow,
  stageRows: ProjectStageRow[],
  boqValidationGateMet: boolean
): ProjectListItem {
  const rawStages = [...stageRows]
    .sort((a, b) => a.stageOrder - b.stageOrder)
    .map(toProjectStage);
  const stages = toEffectiveStages(rawStages, row.mode as ProjectMode, boqValidationGateMet);
  const active = stages.filter((stage) => stage.status !== "not_applicable");
  const activeStage =
    active.find((stage) => stage.status !== "approved") ?? active[active.length - 1];

  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    customerName: row.customerName ?? undefined,
    mode: row.mode as ProjectMode,
    status: deriveProjectListStatus(stages),
    ...(activeStage !== undefined
      ? {
          activeStageId: activeStage.stageId,
          activeStageStatus: activeStage.status,
        }
      : {}),
    stageCounts: {
      total: active.length,
      approved: active.filter((stage) => stage.status === "approved").length,
      needsReview: active.filter((stage) => stage.status === "needs_review").length,
      inProgress: active.filter((stage) => stage.status === "in_progress").length,
      blocked: active.filter((stage) => stage.status === "blocked").length,
      rejected: active.filter((stage) => stage.status === "rejected").length,
    },
    ...(row.archivedAt != null ? { archivedAt: row.archivedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Create a Project and materialize its stages in one transaction. The project
 * row is inserted first; its DB-assigned id seeds {@link materializeProjectStages},
 * and all stage rows are inserted before the transaction commits. Returns the
 * Project aggregate with empty files/evidence/artifacts/approvals.
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const {
    tenantId,
    name,
    mode,
    customerName,
    pricingConfig,
    includeNotApplicableStages = false,
  } = input;

  return withTenantDb(tenantId, async (tx) => {
    const [projectRow] = await tx
      .insert(projects)
      .values({
        tenantId,
        name,
        mode,
        ...(customerName !== undefined ? { customerName } : {}),
        ...(pricingConfig !== undefined ? { pricingConfig } : {}),
      })
      .returning();

    const stageInserts = materializeProjectStages({
      projectId: projectRow.id,
      tenantId,
      mode,
      includeNotApplicable: includeNotApplicableStages,
    });
    const stageRows = await tx
      .insert(projectStages)
      .values(stageInserts)
      .returning();

    return toProject(projectRow, stageRows);
  });
}

/**
 * Load one Project by id, scoped to its tenant. Returns null when no project
 * with that (id, tenantId) pair exists. Stages are loaded for the same
 * tenant/project and returned sorted by global order.
 */
export async function getProjectById(
  tenantId: string,
  projectId: string,
  options: { includeArchived?: boolean } = {}
): Promise<Project | null> {
  return withTenantDb(tenantId, async (tx) => {
    const conditions = [
      eq(projects.id, projectId),
      eq(projects.tenantId, tenantId),
    ];
    // Default loaders exclude archived Projects; only read-only inspection
    // loaders opt in via { includeArchived: true } (QBM-LOG-006).
    if (!options.includeArchived) conditions.push(isNull(projects.archivedAt));
    const [projectRow] = await tx
      .select()
      .from(projects)
      .where(and(...conditions))
      .limit(1);
    if (!projectRow) return null;

    const stageRows = await tx
      .select()
      .from(projectStages)
      .where(
        and(
          eq(projectStages.projectId, projectId),
          eq(projectStages.tenantId, tenantId)
        )
      )
      .orderBy(asc(projectStages.stageOrder));

    return toProject(projectRow, stageRows);
  });
}

/**
 * List lean Project summaries for a tenant, ordered by most recently updated.
 * This is the Project-centered list surface used by Dashboard/Projects. It reads
 * only canonical Project tables and never consults legacy estimate/bom_draft APIs.
 */
export async function listProjectSummaries(
  tenantId: string,
  options: { archive?: ProjectArchiveFilter } = {}
): Promise<ProjectListItem[]> {
  const archive = options.archive ?? "active";
  return withTenantDb(tenantId, async (tx) => {
    // Default surface is active-only; SQL-level archive filtering with isNull/
    // isNotNull (QBM-LOG-006) so archived rows never load on active surfaces.
    const archiveCondition =
      archive === "active"
        ? isNull(projects.archivedAt)
        : archive === "archived"
        ? isNotNull(projects.archivedAt)
        : undefined;
    const projectRows = await tx
      .select()
      .from(projects)
      .where(
        archiveCondition === undefined
          ? eq(projects.tenantId, tenantId)
          : and(eq(projects.tenantId, tenantId), archiveCondition)
      )
      .orderBy(desc(projects.updatedAt));

    if (projectRows.length === 0) return [];

    const stageRows = await tx
      .select()
      .from(projectStages)
      .where(eq(projectStages.tenantId, tenantId))
      .orderBy(asc(projectStages.stageOrder));

    const stagesByProject = new Map<string, ProjectStageRow[]>();
    for (const stage of stageRows) {
      const rows = stagesByProject.get(stage.projectId) ?? [];
      rows.push(stage);
      stagesByProject.set(stage.projectId, rows);
    }

    // Quick BoM list progress folds the present/non-stale `normalized_boq` gate
    // into `boq_format_validation`. Load only status/version metadata (ordered by
    // version ascending so the last row per project is the latest) - never the
    // artifact payloads.
    const normalizedBoqRows = await tx
      .select({
        projectId: projectArtifacts.projectId,
        status: projectArtifacts.status,
        version: projectArtifacts.version,
      })
      .from(projectArtifacts)
      .where(
        and(
          eq(projectArtifacts.tenantId, tenantId),
          eq(projectArtifacts.type, "normalized_boq")
        )
      )
      .orderBy(asc(projectArtifacts.version));

    const latestNormalizedBoqStatus = new Map<string, ProjectArtifactStatusValue>();
    for (const artifact of normalizedBoqRows) {
      latestNormalizedBoqStatus.set(artifact.projectId, artifact.status);
    }

    return projectRows.map((project) =>
      toProjectListItem(
        project,
        stagesByProject.get(project.id) ?? [],
        isNormalizedBoqGateMet(latestNormalizedBoqStatus.get(project.id))
      )
    );
  });
}

/**
 * Normalize a Project name for duplicate comparison: trim, collapse internal
 * whitespace runs to a single space, and lowercase. This is a readability guard
 * only - the Project id remains the durable identifier (QBM-LOG-001).
 */
function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Whether a Quick BoM Project with the same normalized name already exists for
 * this tenant. Scoped to mode `quick_bom`, so RFP/legacy estimate names are never
 * considered. Reads only the canonical `projects` table (name/mode) within the
 * tenant - never artifacts, files, approvals, or payloads. A blank/whitespace
 * name normalizes to empty and is reported as not existing (the creation service
 * already rejects blank names before this read).
 */
export async function quickBomProjectNameExists(
  tenantId: string,
  name: string
): Promise<boolean> {
  const target = normalizeProjectName(name);
  if (target === "") return false;

  return withTenantDb(tenantId, async (tx) => {
    const rows = await tx
      .select({ name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.tenantId, tenantId),
          eq(projects.mode, "quick_bom"),
          // Archived Quick BoM projects do not occupy a name (QBM-LOG-006): a
          // restored project must be able to collide only with active names.
          isNull(projects.archivedAt)
        )
      )
      .orderBy(asc(projects.createdAt));

    return rows.some((row) => normalizeProjectName(row.name) === target);
  });
}

/**
 * Soft-archive a Project (QBM-LOG-006), tenant-scoped. Non-destructive: stamps
 * `archived_at` so the Project drops off active surfaces while remaining readable
 * and restorable. Idempotent: returns true whenever the tenant/project exists,
 * whether it was active or already archived (it may re-stamp `archived_at`).
 * Returns false for a wrong tenant or a missing project. No hard delete.
 */
export async function archiveProject(
  tenantId: string,
  projectId: string
): Promise<boolean> {
  return withTenantDb(tenantId, async (tx) => {
    const now = new Date();
    const rows = await tx
      .update(projects)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
      .returning({ id: projects.id });
    return rows.length > 0;
  });
}

/**
 * Restore an archived Project (QBM-LOG-006), tenant-scoped. Clears `archived_at`
 * so the Project returns to active surfaces. Idempotent: returns true whenever the
 * tenant/project exists, whether it was archived or already active (clearing an
 * already-null `archived_at` is acceptable). Returns false for a wrong tenant or a
 * missing project. The duplicate-name guard for Quick BoM restores lives at the
 * route layer; the store stays a pure state transition.
 */
export async function restoreProject(
  tenantId: string,
  projectId: string
): Promise<boolean> {
  return withTenantDb(tenantId, async (tx) => {
    const rows = await tx
      .update(projects)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
      .returning({ id: projects.id });
    return rows.length > 0;
  });
}
