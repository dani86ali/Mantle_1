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
 * Project.mode is immutable after creation (section 2): this module exposes no
 * updateProjectMode. Tenant scoping is enforced on every read; the canonical
 * tables duplicate tenant_id per row, but the TS child shapes do not surface it.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "./index";
import { projects, projectStages } from "./schema";
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

  return db.transaction(async (tx) => {
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
  projectId: string
): Promise<Project | null> {
  const [projectRow] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!projectRow) return null;

  const stageRows = await db
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
}
