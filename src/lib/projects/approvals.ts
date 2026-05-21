/**
 * Pure Project approval helpers + insert-row materialization.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical unions/shapes: src/types/project.ts (section 13, 14, 16).
 *
 * This module is PURE: it validates that an artifact version is reviewable,
 * maps an approval decision to artifact/stage status values, and returns an
 * insert-ready plain object shaped for the Drizzle `project_approvals` table.
 * It does NOT import Drizzle, query the database, write rows, mutate its
 * inputs, or propagate downstream staleness. Those belong to later
 * repository/API work.
 *
 * Approval is per EXACT artifact version (section 16): the materialized row
 * derives artifactId, artifactVersion, projectId, and stageId from the target
 * artifact object itself - never from a loose type or a latest-version lookup.
 */
import type {
  ProjectApproval,
  ProjectArtifactStatus,
  ProjectStageStatus,
  ProjectStageId,
} from "@/types/project";

/** Approval decision, derived from the canonical ProjectApproval shape. */
export type ProjectApprovalDecision = ProjectApproval["decision"];

/** Artifact statuses that may be approved or rejected. (section 14, 16) */
const REVIEWABLE_ARTIFACT_STATUSES: readonly ProjectArtifactStatus[] = [
  "generated",
  "needs_review",
];

/**
 * Minimal shape needed to review/approve an exact artifact version. A
 * structural subset of {@link import("@/types/project").ProjectArtifact}, so
 * callers may pass full artifact rows directly. Tenant id is intentionally NOT
 * here - the TS artifact shape does not surface it; the approval carries it
 * explicitly from input.
 */
export interface ReviewableProjectArtifact {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  version: number;
  status: ProjectArtifactStatus;
}

/**
 * Insert-ready row shaped for the Drizzle `project_approvals` table. The `id`
 * and DB defaults are omitted; tenant id is carried explicitly (the table
 * duplicates it per row). Not a DB call.
 */
export interface MaterializedProjectApproval {
  projectId: string;
  tenantId: string;
  stageId: ProjectStageId;
  artifactId: string;
  artifactVersion: number;
  decision: ProjectApprovalDecision;
  decidedBy: string;
  decidedAt: Date;
  note?: string;
}

/** Input for {@link materializeProjectApproval}. */
export interface MaterializeProjectApprovalInput {
  /** The exact artifact version under review; identity is derived from it. */
  artifact: ReviewableProjectArtifact;
  /** Carried explicitly; the artifact shape does not surface tenant id. */
  tenantId: string;
  decision: ProjectApprovalDecision;
  decidedBy: string;
  /** Defaults to now; pass explicitly for deterministic callers/tests. */
  decidedAt?: Date;
  note?: string;
}

/** True if the artifact version is in a state that can be approved/rejected. */
export function isArtifactReviewable(
  artifact: Pick<ReviewableProjectArtifact, "status">
): boolean {
  return REVIEWABLE_ARTIFACT_STATUSES.includes(artifact.status);
}

/**
 * Throws a clear Error unless the artifact version is reviewable. Only
 * `generated` and `needs_review` are reviewable; `missing`, `approved`,
 * `rejected`, `stale`, `failed`, and `not_applicable` are rejected.
 */
export function assertArtifactReviewable(
  artifact: Pick<ReviewableProjectArtifact, "id" | "status">
): void {
  if (!isArtifactReviewable(artifact)) {
    throw new Error(
      `Artifact ${artifact.id} is not reviewable (status: "${artifact.status}"); ` +
        `reviewable statuses are ${REVIEWABLE_ARTIFACT_STATUSES.join(", ")}.`
    );
  }
}

/** The artifact status a decision transitions the version to. (section 16) */
export function getArtifactStatusForApprovalDecision(
  decision: ProjectApprovalDecision
): ProjectArtifactStatus {
  return decision === "approved" ? "approved" : "rejected";
}

/** The stage status a decision transitions the stage to. (section 13, 16) */
export function getStageStatusForApprovalDecision(
  decision: ProjectApprovalDecision
): ProjectStageStatus {
  return decision === "approved" ? "approved" : "rejected";
}

/**
 * Build an insert-ready approval row for the exact artifact version under
 * review. The artifact must be reviewable; artifactId, artifactVersion,
 * projectId, and stageId are derived from the target artifact (never a loose
 * type or latest-version lookup). The target artifact is NOT mutated and the
 * artifact/stage status transitions are NOT written here - use the
 * decision->status helpers and apply them in later repository work.
 */
export function materializeProjectApproval(
  input: MaterializeProjectApprovalInput
): MaterializedProjectApproval {
  const { artifact, tenantId, decision, decidedBy, note } = input;

  assertArtifactReviewable(artifact);

  const decidedAt = input.decidedAt ?? new Date();
  return {
    projectId: artifact.projectId,
    tenantId,
    stageId: artifact.stageId,
    artifactId: artifact.id,
    artifactVersion: artifact.version,
    decision,
    decidedBy,
    decidedAt,
    ...(note !== undefined ? { note } : {}),
  };
}
