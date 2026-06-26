/**
 * RFP HLD diagram-draft review/approval service (Stage 6G-B-001).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Records one approve/reject decision against the EXACT internal hld_diagram draft
 * artifact version named by the caller, on the hld_design_delta_review stage. It
 * loads the Project and the exact artifact, gates on rfp mode, the hld_diagram type
 * within the hld_design_delta_review stage, and reviewable status, then persists
 * exactly one approval through createProjectApproval (its only mutation).
 *
 * Because an approved diagram draft becomes the reviewed topology future HLD work
 * builds on, APPROVAL additionally fails closed unless the persisted draft is still
 * sound: the payload re-validates against the Stage 6G-A contract, the artifact row
 * source ids equal the payload's [model, bundle, review] ids, and each of the three
 * upstream artifacts still resolves on the hld_design_delta_review stage with the
 * right type and an active status (the design model and source bundle approved, the
 * design-model review generated/needs_review/approved) and ties back through the
 * expected source chain. A malformed payload is invalid; a broken source chain is
 * stale - either records nothing. A REJECTION skips every diagram payload and
 * source-chain check so a malformed or stale draft can still be retired.
 *
 * Configuration authority stays with the approved upstream artifacts. The service
 * reads only Project state through the project/artifact stores and never reads an
 * upstream payload body. Summaries are lean and serializable (ISO dates, copied
 * arrays, no payload body, no tenantId).
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  validateRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

const DIAGRAM_TYPE: ProjectArtifact["type"] = "hld_diagram";
const HLD_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";
const MODEL_TYPE: ProjectArtifact["type"] = "hld_design_model";
const SOURCE_BUNDLE_TYPE: ProjectArtifact["type"] = "hld_source_bundle";
const REVIEW_TYPE: ProjectArtifact["type"] = "hld_design_model_review";

/**
 * Active advisory-review statuses that may still back an approved diagram draft. A
 * referenced review outside this set (rejected / failed / stale / missing /
 * not_applicable) is treated as unavailable, so an obsolete review blocks approval.
 */
const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

export interface ReviewRfpHldDiagramArtifactInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt?: Date;
  note?: string;
}

export interface RfpHldDiagramReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDiagramReviewArtifactSummary {
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

/** Stable sub-reason for a stale source-chain approval block (never leaks payload). */
export type RfpHldDiagramStaleCode =
  | "source_artifact_ids_mismatch"
  | "source_model_unavailable"
  | "source_bundle_unavailable"
  | "source_review_unavailable"
  | "source_chain_mismatch";

export type ReviewRfpHldDiagramArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDiagramReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_diagram";
      artifact: RfpHldDiagramReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldDiagramReviewArtifactSummary;
    }
  | {
      status: "invalid_hld_diagram_payload";
      artifact: RfpHldDiagramReviewArtifactSummary;
    }
  | {
      status: "stale_hld_diagram_source_chain";
      artifact: RfpHldDiagramReviewArtifactSummary;
      staleCode: RfpHldDiagramStaleCode;
      messages?: string[];
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpHldDiagramReviewArtifactSummary;
    };

/** Order-sensitive element-wise equality for the source id arrays. */
function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toProjectSummary(project: Project): RfpHldDiagramReviewProjectSummary {
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
): RfpHldDiagramReviewArtifactSummary {
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

function staleResult(
  artifact: ProjectArtifact,
  staleCode: RfpHldDiagramStaleCode,
  messages: string[]
): ReviewRfpHldDiagramArtifactResult {
  return {
    status: "stale_hld_diagram_source_chain",
    artifact: toArtifactSummary(artifact),
    staleCode,
    messages,
  };
}

/** True when an upstream artifact is the approved `type` on the HLD stage. */
function isApprovedTypeOnStage(
  artifact: ProjectArtifact | null,
  projectId: string,
  type: ProjectArtifact["type"]
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === type &&
    artifact.stageId === HLD_STAGE &&
    artifact.status === "approved"
  );
}

/** True when the review is an active design-model review on the HLD stage. */
function isActiveReviewOnStage(
  artifact: ProjectArtifact | null,
  projectId: string
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === REVIEW_TYPE &&
    artifact.stageId === HLD_STAGE &&
    ACTIVE_REVIEW_STATUSES.has(artifact.status)
  );
}

/**
 * Approval-only source-chain gate. Returns the invalid/stale result that must
 * short-circuit the approval, or null when the persisted diagram payload is valid
 * and still ties through the approved model/bundle/review chain. Reads the artifact
 * store but mutates nothing, reads no upstream payload body, and never leaks the
 * diagram payload. The hard contract validator guarantees the three payload source
 * ids are present, non-blank, mutually distinct, and equal to the payload's own
 * sourceArtifactIds before this gate reads them.
 */
async function evaluateDiagramSourceChain(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<ReviewRfpHldDiagramArtifactResult | null> {
  const validation = validateRfpHldDiagramDraftPayload(artifact.payload);
  if (!validation.valid) {
    return {
      status: "invalid_hld_diagram_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = artifact.payload as unknown as RfpHldDiagramDraftPayload;
  const modelId = payload.sourceHldDesignModelArtifactId;
  const bundleId = payload.sourceHldSourceBundleArtifactId;
  const reviewId = payload.sourceReviewArtifactId;

  // Row-level tie: the artifact row source ids must equal [model, bundle, review].
  if (!sameOrdered(artifact.sourceArtifactIds, [modelId, bundleId, reviewId])) {
    return staleResult(artifact, "source_artifact_ids_mismatch", [
      "The diagram artifact source ids no longer equal [model, bundle, review].",
    ]);
  }

  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isApprovedTypeOnStage(model, projectId, MODEL_TYPE)) {
    return staleResult(artifact, "source_model_unavailable", [
      "The source design model is not an approved hld_design_model on the hld_design_delta_review stage.",
    ]);
  }
  const bundle = await getProjectArtifactById(tenantId, projectId, bundleId);
  if (!isApprovedTypeOnStage(bundle, projectId, SOURCE_BUNDLE_TYPE)) {
    return staleResult(artifact, "source_bundle_unavailable", [
      "The source bundle is not an approved hld_source_bundle on the hld_design_delta_review stage.",
    ]);
  }
  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isActiveReviewOnStage(review, projectId)) {
    return staleResult(artifact, "source_review_unavailable", [
      "The source review is not an active hld_design_model_review on the hld_design_delta_review stage.",
    ]);
  }

  // Defense in depth: the model must tie to exactly [bundle] and the review to
  // exactly [model, bundle], matching the upstream Stage 6 source-chain contracts.
  const modelArtifact = model as ProjectArtifact;
  const reviewArtifact = review as ProjectArtifact;
  if (
    !sameOrdered(modelArtifact.sourceArtifactIds, [bundleId]) ||
    !sameOrdered(reviewArtifact.sourceArtifactIds, [modelId, bundleId])
  ) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The model/review source ids no longer match the expected [bundle] and [model, bundle] chain.",
    ]);
  }

  return null;
}

/**
 * Review (approve/reject) one EXACT hld_diagram draft artifact version, tenant
 * scoped on every store call. Validates nonblank artifactId then decidedBy before
 * any store call. Gates in order: project existence, rfp mode, exact artifact
 * existence (including a route-project id match), hld_diagram type in the
 * hld_design_delta_review stage, reviewable status. An APPROVAL additionally
 * re-validates the persisted diagram payload and re-ties it through the approved
 * model/bundle/review source chain (blocking with invalid_hld_diagram_payload or
 * stale_hld_diagram_source_chain, the payload body never leaked); a REJECTION skips
 * those checks so a malformed/stale draft can still be retired. On a passing path it
 * persists exactly one approval (the only mutation) and returns the approval, the
 * post-decision artifact/stage statuses, and the pre-approval artifact summary. Only
 * a null createProjectApproval maps to approval_failed; other store errors bubble.
 */
export async function reviewRfpHldDiagramArtifact(
  input: ReviewRfpHldDiagramArtifactInput
): Promise<ReviewRfpHldDiagramArtifactResult> {
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
  if (artifact.type !== DIAGRAM_TYPE || artifact.stageId !== HLD_STAGE) {
    return {
      status: "artifact_not_hld_diagram",
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
    const blocked = await evaluateDiagramSourceChain(tenantId, projectId, artifact);
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
