/**
 * RFP HLD design-model review/approval service (Stage 6D-005a).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Records one approve/reject decision against the EXACT hld_design_model artifact
 * version named by the caller, on the hld_design_delta_review stage. It loads the
 * Project and the exact artifact, gates on rfp mode, the hld_design_model type
 * within the hld_design_delta_review stage, and reviewable status, then persists
 * exactly one approval via createProjectApproval (its only mutation; it creates no
 * artifact version and updates no payload).
 *
 * Because an approved design model becomes the structured authority future HLD/LLD
 * work consumes, APPROVAL additionally fails closed unless the persisted payload is
 * still current: it re-validates the exact persisted payload against the Stage 6C
 * contract, recomputes the design-model readiness over the live artifacts (must be
 * ready), resolves the current approved source bundle that readiness identifies,
 * confirms the artifact row sourceArtifactIds is exactly [currentSourceBundle.id],
 * and re-runs the Stage 6C source-compatibility check for the persisted payload
 * against that current bundle. A malformed payload is invalid; a blocked readiness,
 * missing bundle, source-id mismatch, or compatibility mismatch is stale - either
 * records nothing. A REJECTION skips every payload check so a malformed or stale
 * draft can still be rejected.
 *
 * This service runs no AI and makes no SKU/pricing/catalog/configuration/design
 * decision; configuration authority stays the approved upstream artifacts. It
 * imports exactly the project/artifact/approval stores, the pure approval helper,
 * the Stage 6C contract, the pure Stage 6C readiness helper, and canonical project
 * types - no fs/path, no raw-document reader, no AI/provider, no pricing/SKU/catalog/
 * config service, no route or UI. Summaries are lean and serializable (ISO dates,
 * copied arrays, no payload body, no tenantId).
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import { validateRfpHldDesignModelPayload } from "@/lib/projects/project-rfp-hld-design-model";
import {
  getRfpHldDesignModelReadinessReport,
  validateRfpHldDesignModelSourceCompatibility,
} from "@/lib/projects/project-rfp-hld-design-model-readiness";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

const DESIGN_MODEL_TYPE: ProjectArtifact["type"] = "hld_design_model";
const DESIGN_MODEL_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";

export interface ReviewRfpHldDesignModelArtifactInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt?: Date;
  note?: string;
}

export interface RfpHldDesignModelReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDesignModelReviewArtifactSummary {
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
export type RfpHldDesignModelStaleCode =
  | "source_readiness_blocked"
  | "source_bundle_not_found"
  | "source_artifact_ids_mismatch"
  | "source_compatibility_mismatch";

export type ReviewRfpHldDesignModelArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_design_model";
      artifact: RfpHldDesignModelReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldDesignModelReviewArtifactSummary;
    }
  | {
      status: "invalid_hld_design_model_payload";
      artifact: RfpHldDesignModelReviewArtifactSummary;
    }
  | {
      status: "stale_hld_design_model_payload";
      artifact: RfpHldDesignModelReviewArtifactSummary;
      staleCode: RfpHldDesignModelStaleCode;
      messages?: string[];
      errors?: string[];
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpHldDesignModelReviewArtifactSummary;
    };

function toProjectSummary(project: Project): RfpHldDesignModelReviewProjectSummary {
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
): RfpHldDesignModelReviewArtifactSummary {
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
 * circuit the approval, or null when the persisted model is valid and still ties to
 * the current approved source bundle. Reads stores but mutates nothing and never
 * leaks the payload body.
 */
async function evaluatePersistedModel(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<ReviewRfpHldDesignModelArtifactResult | null> {
  const validation = validateRfpHldDesignModelPayload(artifact.payload);
  if (!validation.valid) {
    return {
      status: "invalid_hld_design_model_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const artifacts = await listProjectArtifacts(tenantId, projectId);

  const readiness = getRfpHldDesignModelReadinessReport({ projectId, artifacts });
  if (readiness.status !== "ready" || readiness.sourceBundle === undefined) {
    return {
      status: "stale_hld_design_model_payload",
      artifact: toArtifactSummary(artifact),
      staleCode: "source_readiness_blocked",
      messages: [...readiness.messages],
    };
  }

  // Re-resolve the exact current source bundle by its own store call so a
  // divergence (e.g. a concurrent delete) is caught rather than assumed.
  const sourceBundle = await getProjectArtifactById(
    tenantId,
    projectId,
    readiness.sourceBundle.artifactId
  );
  if (sourceBundle === null || sourceBundle.projectId !== projectId) {
    return {
      status: "stale_hld_design_model_payload",
      artifact: toArtifactSummary(artifact),
      staleCode: "source_bundle_not_found",
      messages: ["The current approved hld_source_bundle could not be resolved."],
    };
  }

  if (
    artifact.sourceArtifactIds.length !== 1 ||
    artifact.sourceArtifactIds[0] !== sourceBundle.id
  ) {
    return {
      status: "stale_hld_design_model_payload",
      artifact: toArtifactSummary(artifact),
      staleCode: "source_artifact_ids_mismatch",
      messages: [
        "The artifact sourceArtifactIds no longer equals the current source bundle id.",
      ],
    };
  }

  const compatibility = validateRfpHldDesignModelSourceCompatibility({
    payload: artifact.payload,
    sourceBundleArtifact: sourceBundle,
  });
  if (!compatibility.valid) {
    return {
      status: "stale_hld_design_model_payload",
      artifact: toArtifactSummary(artifact),
      staleCode: "source_compatibility_mismatch",
      errors: compatibility.errors.slice(),
    };
  }

  return null;
}

/**
 * Review (approve/reject) one EXACT hld_design_model artifact version, tenant
 * scoped on every store call. Validates nonblank artifactId then decidedBy before
 * any store call. Gates in order: project existence, rfp mode, exact artifact
 * existence (including a route-project id match), hld_design_model type in the
 * hld_design_delta_review stage, reviewable status. An APPROVAL additionally
 * re-validates the persisted payload and re-ties it to the current approved source
 * bundle (blocking with invalid_hld_design_model_payload or
 * stale_hld_design_model_payload, the payload body never leaked); a REJECTION skips
 * those checks so a malformed/stale draft can still be rejected. On a passing path
 * it persists exactly one approval (the only mutation) and returns the approval, the
 * post-decision artifact/stage statuses, and the pre-approval artifact summary. Only
 * a null createProjectApproval maps to approval_failed; other store errors bubble.
 */
export async function reviewRfpHldDesignModelArtifact(
  input: ReviewRfpHldDesignModelArtifactInput
): Promise<ReviewRfpHldDesignModelArtifactResult> {
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
  if (artifact.type !== DESIGN_MODEL_TYPE || artifact.stageId !== DESIGN_MODEL_STAGE) {
    return {
      status: "artifact_not_hld_design_model",
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
    const blocked = await evaluatePersistedModel(tenantId, projectId, artifact);
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
