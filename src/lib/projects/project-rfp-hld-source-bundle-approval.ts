/**
 * RFP HLD source-bundle review/approval service (Stage 6B-003B).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Records one approve/reject decision against the EXACT hld_source_bundle artifact
 * version named by the caller, on the hld_design_delta_review stage. It loads the
 * Project and the exact artifact, gates on rfp mode, the hld_source_bundle type
 * within the hld_design_delta_review stage, and reviewable status, then persists
 * exactly one approval via createProjectApproval (its only mutation; it creates no
 * artifact version).
 *
 * Because the approved bundle becomes the structured authority package future HLD
 * work consumes, APPROVAL additionally fails closed unless the persisted payload is
 * still current: it re-validates the exact persisted payload against the Stage
 * 6B-001 contract, confirms the artifact row source ids equal the payload source
 * ids, and recompiles the current bundle with the pure Stage 6B-002 assembler over
 * the live files/artifacts (reusing the persisted createdBy/createdAt so timestamps
 * never cause a false mismatch). A blocked, invalid, or structurally different
 * recompile is reported as stale and records nothing - this stops approving a
 * source bundle after an upstream authority, the configuration gate, the readiness
 * snapshot, or a knowledge pack changed. A REJECTION skips every payload check so a
 * malformed or stale draft can still be rejected.
 *
 * This service runs no AI and makes no SKU/pricing/catalog/configuration/design
 * decision; configuration authority stays the approved Project artifact and its
 * gate. It imports exactly the project/file/artifact/approval stores, the pure
 * approval helper, the Stage 6B-001 contract, the pure Stage 6B-002 assembler, and
 * canonical project types - no fs/path, no raw-document reader, no AI/provider, no
 * pricing/SKU/catalog/config service, no route or UI. Summaries are lean and
 * serializable (ISO dates, copied arrays, no payload body, no tenantId).
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import { listProjectFiles } from "@/lib/db/project-file-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  validateRfpHldSourceBundlePayload,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import { buildRfpHldSourceBundleDraft } from "@/lib/projects/project-rfp-hld-source-bundle-assembler";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

const SOURCE_BUNDLE_ARTIFACT_TYPE: ProjectArtifact["type"] = "hld_source_bundle";
const SOURCE_BUNDLE_STAGE_ID: ProjectArtifact["stageId"] = "hld_design_delta_review";

export interface ReviewRfpHldSourceBundleArtifactInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt?: Date;
  note?: string;
}

export interface RfpHldSourceBundleReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldSourceBundleReviewArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Stable sub-reason for a stale approval block (never leaks the payload body). */
export type RfpHldSourceBundleStaleCode =
  | "source_artifact_ids_mismatch"
  | "recompute_blocked"
  | "recompute_invalid_payload"
  | "recomputed_bundle_mismatch";

export type ReviewRfpHldSourceBundleArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldSourceBundleReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_source_bundle";
      artifact: RfpHldSourceBundleReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldSourceBundleReviewArtifactSummary;
    }
  | {
      status: "invalid_hld_source_bundle_payload";
      artifact: RfpHldSourceBundleReviewArtifactSummary;
    }
  | {
      status: "stale_hld_source_bundle_payload";
      artifact: RfpHldSourceBundleReviewArtifactSummary;
      staleCode: RfpHldSourceBundleStaleCode;
      messages?: string[];
      errors?: string[];
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpHldSourceBundleReviewArtifactSummary;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Order-sensitive element-wise equality for the source id arrays. */
function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Structural deep equality: order-sensitive for arrays, order-independent for
 * object keys (robust to JSON store key reordering). Both payloads are reference
 * compilations of JSON primitives, so this never touches Dates or class instances.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (isPlainRecord(a) && isPlainRecord(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function toProjectSummary(project: Project): RfpHldSourceBundleReviewProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldSourceBundleReviewArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/**
 * Approval-only currency gate. Returns the invalid/stale result that must short-
 * circuit the approval, or null when the persisted bundle is valid and still equals
 * a fresh recompile over the live files/artifacts. Reads stores but mutates nothing
 * and never leaks the payload body. Recompiles with the persisted createdBy/createdAt
 * so timestamps do not cause a false mismatch.
 */
async function evaluatePersistedBundle(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<ReviewRfpHldSourceBundleArtifactResult | null> {
  const validation = validateRfpHldSourceBundlePayload(artifact.payload);
  if (!validation.valid) {
    return {
      status: "invalid_hld_source_bundle_payload",
      artifact: toArtifactSummary(artifact),
    };
  }
  const persisted = artifact.payload as unknown as RfpHldSourceBundlePayload;

  if (!arraysEqual(artifact.sourceArtifactIds, persisted.sourceArtifactIds)) {
    return {
      status: "stale_hld_source_bundle_payload",
      artifact: toArtifactSummary(artifact),
      staleCode: "source_artifact_ids_mismatch",
      messages: [
        "The artifact source ids no longer match the persisted source bundle payload.",
      ],
    };
  }

  const [files, artifacts] = await Promise.all([
    listProjectFiles(tenantId, projectId),
    listProjectArtifacts(tenantId, projectId),
  ]);

  const recompiled = buildRfpHldSourceBundleDraft({
    projectId,
    files,
    artifacts,
    createdBy: persisted.createdBy,
    createdAt: new Date(persisted.createdAt),
  });
  if (recompiled.status === "blocked") {
    return {
      status: "stale_hld_source_bundle_payload",
      artifact: toArtifactSummary(artifact),
      staleCode: "recompute_blocked",
      messages: recompiled.messages.slice(),
    };
  }
  if (recompiled.status === "invalid_payload") {
    return {
      status: "stale_hld_source_bundle_payload",
      artifact: toArtifactSummary(artifact),
      staleCode: "recompute_invalid_payload",
      errors: recompiled.errors.slice(),
    };
  }
  if (!deepEqual(recompiled.payload, artifact.payload)) {
    return {
      status: "stale_hld_source_bundle_payload",
      artifact: toArtifactSummary(artifact),
      staleCode: "recomputed_bundle_mismatch",
      messages: [
        "The current source bundle no longer matches the persisted payload; recompile before approval.",
      ],
    };
  }
  return null;
}

/**
 * Review (approve/reject) one EXACT hld_source_bundle artifact version, tenant
 * scoped on every store call. Validates nonblank artifactId then decidedBy before
 * any store call. Gates in order: project existence, rfp mode, exact artifact
 * existence (including a route-project id match), hld_source_bundle type in the
 * hld_design_delta_review stage, reviewable status. An APPROVAL additionally
 * re-validates and recompiles the persisted payload (blocking with
 * invalid_hld_source_bundle_payload or stale_hld_source_bundle_payload, the payload
 * body never leaked); a REJECTION skips those checks so a malformed/stale draft can
 * still be rejected. On a passing path it persists exactly one approval (the only
 * mutation) and returns the approval, the post-decision artifact/stage statuses, and
 * the pre-approval artifact summary. Only a null createProjectApproval maps to
 * approval_failed; other store errors bubble.
 */
export async function reviewRfpHldSourceBundleArtifact(
  input: ReviewRfpHldSourceBundleArtifactInput
): Promise<ReviewRfpHldSourceBundleArtifactResult> {
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }
  if (!input.decidedBy || input.decidedBy.trim() === "") {
    throw new Error("decidedBy is required.");
  }

  const { tenantId, projectId, artifactId, decision, decidedBy } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  // Defense in depth on top of the tenant/project-scoped store lookup.
  if (artifact === null || artifact.projectId !== projectId) {
    return { status: "artifact_not_found" };
  }
  if (
    artifact.type !== SOURCE_BUNDLE_ARTIFACT_TYPE ||
    artifact.stageId !== SOURCE_BUNDLE_STAGE_ID
  ) {
    return {
      status: "artifact_not_hld_source_bundle",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  if (decision === "approved") {
    const blocked = await evaluatePersistedBundle(tenantId, projectId, artifact);
    if (blocked !== null) return blocked;
  }

  const artifactSummary = toArtifactSummary(artifact);

  const created = await createProjectApproval({
    tenantId,
    projectId,
    artifactId: artifact.id,
    decision,
    decidedBy,
    ...(input.decidedAt !== undefined ? { decidedAt: input.decidedAt } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  if (created === null) return { status: "approval_failed" };

  return {
    status: "ok",
    approval: created.approval,
    artifactStatus: created.artifactStatus,
    stageStatus: created.stageStatus,
    artifact: artifactSummary,
  };
}
