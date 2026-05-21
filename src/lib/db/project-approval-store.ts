/**
 * Narrow Project approval repository: persist one approval for an EXACT
 * artifact version and transactionally mark that version and its stage
 * approved/rejected.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (16). Helpers: src/lib/projects/approvals.ts.
 *
 * Scope (Prompt 22) is intentionally minimal: insert exactly one
 * `project_approvals` row pointing at the artifact id/version loaded from the
 * row (never "latest by type"), then transition that version and its stage. It
 * does NOT create artifact versions, propagate downstream staleness, export, or
 * wire any API/UI. Tenant scoping is enforced on every read; `ProjectApproval`
 * does not surface tenantId - {@link toProjectApproval} projects it out.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "./index";
import { projectApprovals, projectArtifacts, projectStages } from "./schema";
import {
  materializeProjectApproval,
  getArtifactStatusForApprovalDecision,
  getStageStatusForApprovalDecision,
} from "@/lib/projects/approvals";
import type {
  ProjectApproval,
  ProjectArtifactStatus,
  ProjectStageId,
  ProjectStageStatus,
} from "@/types/project";

type ProjectApprovalRow = typeof projectApprovals.$inferSelect;

/** Input for {@link createProjectApproval}. */
export interface CreateProjectApprovalInput {
  tenantId: string;
  projectId: string;
  /** The exact artifact whose loaded version is approved/rejected. */
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  /** Defaults to now (via the materializer); used as the status updatedAt. */
  decidedAt?: Date;
  note?: string;
}

/** Result of a successful {@link createProjectApproval}. */
export interface CreateProjectApprovalResult {
  approval: ProjectApproval;
  artifactStatus: ProjectArtifactStatus;
  stageStatus: ProjectStageStatus;
}

/** Map a DB approval row to a ProjectApproval: drop tenantId, null note -> undefined. */
function toProjectApproval(row: ProjectApprovalRow): ProjectApproval {
  return {
    id: row.id,
    projectId: row.projectId,
    stageId: row.stageId as ProjectStageId,
    artifactId: row.artifactId,
    artifactVersion: row.artifactVersion,
    decision: row.decision as ProjectApproval["decision"],
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    note: row.note ?? undefined,
  };
}

/**
 * Record an approval/rejection for an exact artifact version in one
 * transaction. Loads the target artifact (returns null when absent, mutating
 * nothing); requires its stage row to exist (throws otherwise); materializes
 * the approval from the artifact row (non-reviewable artifacts bubble the pure
 * helper's error); then inserts one approval row and transitions the exact
 * artifact version and stage. Identity comes from the artifact row, never a
 * latest-version lookup; staleness is never propagated.
 */
export async function createProjectApproval(
  input: CreateProjectApprovalInput
): Promise<CreateProjectApprovalResult | null> {
  return db.transaction(async (tx) => {
    const [artifactRow] = await tx
      .select()
      .from(projectArtifacts)
      .where(
        and(
          eq(projectArtifacts.tenantId, input.tenantId),
          eq(projectArtifacts.projectId, input.projectId),
          eq(projectArtifacts.id, input.artifactId)
        )
      )
      .limit(1);
    if (!artifactRow) return null;

    const [stageRow] = await tx
      .select()
      .from(projectStages)
      .where(
        and(
          eq(projectStages.tenantId, input.tenantId),
          eq(projectStages.projectId, input.projectId),
          eq(projectStages.stageId, artifactRow.stageId)
        )
      )
      .limit(1);
    if (!stageRow) throw new Error("Project stage not found.");

    const record = materializeProjectApproval({
      artifact: {
        id: artifactRow.id,
        projectId: artifactRow.projectId,
        stageId: artifactRow.stageId as ProjectStageId,
        version: artifactRow.version,
        status: artifactRow.status as ProjectArtifactStatus,
      },
      tenantId: input.tenantId,
      decision: input.decision,
      decidedBy: input.decidedBy,
      ...(input.decidedAt !== undefined ? { decidedAt: input.decidedAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    });

    const [approvalRow] = await tx
      .insert(projectApprovals)
      .values(record)
      .returning();

    const artifactStatus = getArtifactStatusForApprovalDecision(input.decision);
    const stageStatus = getStageStatusForApprovalDecision(input.decision);

    await tx
      .update(projectArtifacts)
      .set({ status: artifactStatus, updatedAt: record.decidedAt })
      .where(
        and(
          eq(projectArtifacts.tenantId, input.tenantId),
          eq(projectArtifacts.projectId, input.projectId),
          eq(projectArtifacts.id, input.artifactId),
          eq(projectArtifacts.version, artifactRow.version)
        )
      );

    await tx
      .update(projectStages)
      .set({ status: stageStatus, updatedAt: record.decidedAt })
      .where(
        and(
          eq(projectStages.tenantId, input.tenantId),
          eq(projectStages.projectId, input.projectId),
          eq(projectStages.stageId, record.stageId)
        )
      );

    return {
      approval: toProjectApproval(approvalRow),
      artifactStatus,
      stageStatus,
    };
  });
}

/** List a Project's approvals, tenant/project scoped, ordered by decidedAt asc. */
export async function listProjectApprovals(
  tenantId: string,
  projectId: string
): Promise<ProjectApproval[]> {
  const rows = await db
    .select()
    .from(projectApprovals)
    .where(
      and(
        eq(projectApprovals.tenantId, tenantId),
        eq(projectApprovals.projectId, projectId)
      )
    )
    .orderBy(asc(projectApprovals.decidedAt));
  return rows.map(toProjectApproval);
}

/**
 * List the approval history for one artifact, tenant/project/artifact scoped,
 * ordered by artifactVersion ascending then decidedAt ascending.
 */
export async function listProjectApprovalsForArtifact(
  tenantId: string,
  projectId: string,
  artifactId: string
): Promise<ProjectApproval[]> {
  const rows = await db
    .select()
    .from(projectApprovals)
    .where(
      and(
        eq(projectApprovals.tenantId, tenantId),
        eq(projectApprovals.projectId, projectId),
        eq(projectApprovals.artifactId, artifactId)
      )
    )
    .orderBy(
      asc(projectApprovals.artifactVersion),
      asc(projectApprovals.decidedAt)
    );
  return rows.map(toProjectApproval);
}

/**
 * Load one approval by id, tenant/project scoped; null when no matching triple.
 */
export async function getProjectApprovalById(
  tenantId: string,
  projectId: string,
  approvalId: string
): Promise<ProjectApproval | null> {
  const [row] = await db
    .select()
    .from(projectApprovals)
    .where(
      and(
        eq(projectApprovals.tenantId, tenantId),
        eq(projectApprovals.projectId, projectId),
        eq(projectApprovals.id, approvalId)
      )
    )
    .limit(1);
  return row ? toProjectApproval(row) : null;
}
