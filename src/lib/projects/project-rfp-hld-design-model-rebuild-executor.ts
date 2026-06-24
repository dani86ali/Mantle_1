/**
 * Tenant-scoped RFP HLD design-model REBUILD EXECUTION service (Stage 6E-C-003b).
 *
 * Executes exactly ONE bounded `hld_design_model_rebuild_request`: it redrafts a
 * candidate `hld_design_model` from the SAME current approved `hld_source_bundle`
 * after the model's advisory `hld_design_model_review`, then persists exactly one
 * new candidate model as `needs_review`. The flow is fail-closed and consumes the
 * request EXACTLY ONCE: every deterministic gate runs first, then - only after an
 * executor is confirmed available - the request is atomically retired to `stale`
 * by flipping its exact observed version+status BEFORE the executor is invoked. A
 * concurrent or repeat caller that observed the same request loses the claim (the
 * narrow retire helper returns null) and never reaches the executor, so no
 * duplicate model is ever drafted or persisted.
 *
 * Runtime AI is NOT design authority here. The executor output is candidate-only
 * and untrusted: it is hard-gated by the deterministic source-compatibility
 * validator before any persistence, stays `needs_review`, and remains subordinate
 * to a fresh deterministic review and human engineer approval. This service does
 * NOT auto-run review after the rebuilt model is created - the existing approval
 * gate forces a fresh deterministic review tied to the new model. It reads only
 * Project state through the Project stores; reads no raw RFP/PDF/DOCX/XLSX
 * document, storage path, or file body; constructs no provider adapter; makes no
 * pricing/SKU/catalog/configuration/topology/scope decision; substitutes no SKU;
 * and emits no final HLD document, HTML, diagram, draw.io/XML, Mermaid, SVG,
 * TP/proposal, export, or customer deliverable.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifacts,
  retireProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  getRfpHldDesignModelReadinessReport,
  validateRfpHldDesignModelSourceCompatibility,
  type RfpHldDesignModelSourceBundleSummary,
} from "@/lib/projects/project-rfp-hld-design-model-readiness";
import {
  buildRfpHldDesignModelCandidateInput,
  type RfpHldDesignModelCandidateInputBlockedReason,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import {
  buildRfpHldDesignModelRebuildCandidateInput,
  type RfpHldDesignModelRebuildCandidateInputBlockedReason,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-candidate-input";
import {
  draftRfpHldDesignModelCandidate,
  getConfiguredRfpHldDesignModelDraftingExecutor,
  type RfpHldDesignModelDraftingExecutor,
} from "@/lib/projects/project-rfp-hld-design-model-drafting-executor";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  validateRfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewPayload,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  validateRfpHldDesignModelRebuildRequestPayload,
  type RfpHldDesignModelRebuildRequestPayload,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-request";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const MODEL_TYPE: ProjectArtifactType = "hld_design_model";
const REVIEW_TYPE: ProjectArtifactType = "hld_design_model_review";
const REQUEST_TYPE: ProjectArtifactType = "hld_design_model_rebuild_request";

/** The fixed, provider-free code returned when the executor pass fails. */
const DRAFTING_FAILED_CODE = "hld_design_model_rebuild_drafting_failed" as const;

/** Request ROW statuses that are still open/consumable (not yet retired). */
const OPEN_REQUEST_ROW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review"]);

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldDesignModelRebuildExecutionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDesignModelRebuildExecutionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean counts/provenance projection over an already-validated rebuilt payload. */
export interface RfpHldDesignModelRebuildExecutionPayloadSummary {
  payloadKind: typeof RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  sourceHldSourceBundleArtifactId: string;
  sourceBundleVersion: number;
  sourceArtifactCount: number;
  coveredDomainCount: number;
  excludedDomainCount: number;
  sourceReferenceCount: number;
  designSectionCount: number;
  topologyNodeCount: number;
  topologyLinkCount: number;
  topologyZoneCount: number;
  diagramIntentCount: number;
  validationFindingCount: number;
}

/** Why the deterministic rebuild candidate input could not be built. */
export type RfpHldDesignModelRebuildExecutionCandidateBlockedReason =
  | RfpHldDesignModelCandidateInputBlockedReason
  | RfpHldDesignModelRebuildCandidateInputBlockedReason
  | "invalid_model_payload"
  | "invalid_review_payload"
  | "invalid_request_payload";

/** Input for {@link executeRfpHldDesignModelRebuild}. */
export interface ExecuteRfpHldDesignModelRebuildInput {
  tenantId: string;
  projectId: string;
  rebuildRequestArtifactId: string;
  executedBy: string;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  createdAt?: Date;
  /**
   * The injected drafting executor. When absent the configured factory is used
   * (null while no provider is wired, so the service fails safely as
   * `drafting_unavailable` and consumes nothing). An explicit null is the same
   * unavailable seam. Availability is checked BEFORE the request is consumed.
   */
  executor?: RfpHldDesignModelDraftingExecutor | null;
}

/** Discriminated result of {@link executeRfpHldDesignModelRebuild}. */
export type ExecuteRfpHldDesignModelRebuildResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDesignModelRebuildExecutionProjectSummary }
  | { status: "request_not_found" }
  | {
      status: "artifact_not_rebuild_request";
      artifact: RfpHldDesignModelRebuildExecutionArtifactSummary;
    }
  | {
      status: "request_not_active";
      artifact: RfpHldDesignModelRebuildExecutionArtifactSummary;
    }
  | { status: "request_payload_invalid"; errors: string[] }
  | { status: "source_model_unavailable" }
  | { status: "source_review_unavailable" }
  | { status: "source_review_does_not_justify_rebuild" }
  | { status: "stale_source_bundle" }
  | { status: "invalid_source_bundle_payload"; errors: string[] }
  | {
      status: "candidate_input_blocked";
      reason: RfpHldDesignModelRebuildExecutionCandidateBlockedReason;
    }
  | { status: "drafting_unavailable" }
  | { status: "request_retire_failed"; intendedStatus: "stale" | "failed" }
  | { status: "drafting_failed"; error: typeof DRAFTING_FAILED_CODE }
  | { status: "invalid_draft_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDesignModelRebuildExecutionArtifactSummary;
      consumedRequest: RfpHldDesignModelRebuildExecutionArtifactSummary;
      sourceBundle: RfpHldDesignModelSourceBundleSummary;
      payloadSummary: RfpHldDesignModelRebuildExecutionPayloadSummary;
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toProjectSummary(
  project: Project
): RfpHldDesignModelRebuildExecutionProjectSummary {
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
): RfpHldDesignModelRebuildExecutionArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: [...artifact.sourceFileIds],
    sourceArtifactIds: [...artifact.sourceArtifactIds],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

function toSourceBundleSummary(
  summary: RfpHldDesignModelSourceBundleSummary
): RfpHldDesignModelSourceBundleSummary {
  return {
    ...summary,
    sourceArtifactIds: [...summary.sourceArtifactIds],
    coveredDomains: [...summary.coveredDomains],
    excludedDomains: [...summary.excludedDomains],
  };
}

function toPayloadSummary(
  payload: RfpHldDesignModelPayload
): RfpHldDesignModelRebuildExecutionPayloadSummary {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: payload.createdBy,
    createdAt: payload.createdAt,
    sourceHldSourceBundleArtifactId: payload.sourceHldSourceBundleArtifactId,
    sourceBundleVersion: payload.sourceBundleVersion,
    sourceArtifactCount: payload.sourceArtifactIds.length,
    coveredDomainCount: payload.coveredDomains.length,
    excludedDomainCount: payload.excludedDomains.length,
    sourceReferenceCount: payload.sourceReferences.length,
    designSectionCount: payload.designSections.length,
    topologyNodeCount: payload.topology.nodes.length,
    topologyLinkCount: payload.topology.links.length,
    topologyZoneCount: payload.topology.zones.length,
    diagramIntentCount: payload.diagramIntents.length,
    validationFindingCount: payload.validationFindings.length,
  };
}

/** True if `model` is a reviewable source model on the HLD stage of this project. */
function isUsableSourceModel(model: ProjectArtifact, projectId: string): boolean {
  return (
    model.projectId === projectId &&
    model.type === MODEL_TYPE &&
    model.stageId === HLD_STAGE &&
    isArtifactReviewable(model)
  );
}

/**
 * True if `review` is a valid `hld_design_model_review` on the HLD stage of this
 * project whose payload references the SAME source model.
 */
function isUsableReview(
  review: ProjectArtifact,
  projectId: string,
  modelId: string
): boolean {
  if (
    review.projectId !== projectId ||
    review.type !== REVIEW_TYPE ||
    review.stageId !== HLD_STAGE
  ) {
    return false;
  }
  if (!validateRfpHldDesignModelReviewPayload(review.payload).valid) return false;
  return review.payload.sourceHldDesignModelArtifactId === modelId;
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Execute one bounded `hld_design_model_rebuild_request`, tenant-scoped, only
 * after every deterministic gate passes (see the per-gate result statuses below).
 * Throws on blank required ids before any store call. The EXACTLY-ONCE seam: once
 * an executor is confirmed available, the request is atomically retired to `stale`
 * on its exact observed version+status BEFORE the executor runs - a lost claim is
 * request_retire_failed and the executor is never called. After the claim, a
 * thrown/failed executor or an invalid draft marks the SAME request `failed`
 * (request_retire_failed if that mark cannot match) and returns a controlled
 * drafting_failed / invalid_draft_payload with no provider detail. On a valid draft
 * it persists exactly one needs_review `hld_design_model` (empty sourceFileIds,
 * sourceArtifactIds [the approved source-bundle id]); the request stays retired and
 * is NOT retired again. Returns only lean summaries - never a raw payload body or
 * the tenant id - and runs no review afterward; the approval gate forces a fresh one.
 */
export async function executeRfpHldDesignModelRebuild(
  input: ExecuteRfpHldDesignModelRebuildInput
): Promise<ExecuteRfpHldDesignModelRebuildResult> {
  const { tenantId, projectId } = input;
  const rebuildRequestArtifactId = asTrimmed(input.rebuildRequestArtifactId);
  const executedBy = asTrimmed(input.executedBy);
  if (rebuildRequestArtifactId === "") {
    throw new Error("HLD design-model rebuild requires a rebuildRequestArtifactId.");
  }
  if (executedBy === "") {
    throw new Error("HLD design-model rebuild requires an executedBy.");
  }

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // Load the bounded rebuild request and fail closed on its row/payload state.
  const request = await getProjectArtifactById(tenantId, projectId, rebuildRequestArtifactId);
  if (request === null) return { status: "request_not_found" };
  if (request.type !== REQUEST_TYPE || request.stageId !== HLD_STAGE) {
    return { status: "artifact_not_rebuild_request", artifact: toArtifactSummary(request) };
  }
  if (!OPEN_REQUEST_ROW_STATUSES.has(request.status)) {
    return { status: "request_not_active", artifact: toArtifactSummary(request) };
  }
  if (request.payload.status !== "active") {
    return { status: "request_not_active", artifact: toArtifactSummary(request) };
  }
  const requestValidation = validateRfpHldDesignModelRebuildRequestPayload(request.payload);
  if (!requestValidation.valid) {
    return { status: "request_payload_invalid", errors: [...requestValidation.errors] };
  }
  const requestPayload = request.payload as unknown as RfpHldDesignModelRebuildRequestPayload;
  const sourceModelArtifactId = requestPayload.sourceHldDesignModelArtifactId;
  const sourceReviewArtifactId = requestPayload.sourceReviewArtifactId;

  // The source model must still be a reviewable candidate model on this stage.
  const model = await getProjectArtifactById(tenantId, projectId, sourceModelArtifactId);
  if (model === null || !isUsableSourceModel(model, projectId)) {
    return { status: "source_model_unavailable" };
  }

  // The source review must be valid and about exactly this source model.
  const review = await getProjectArtifactById(tenantId, projectId, sourceReviewArtifactId);
  if (review === null || !isUsableReview(review, projectId, sourceModelArtifactId)) {
    return { status: "source_review_unavailable" };
  }
  const reviewPayload = review.payload as unknown as RfpHldDesignModelReviewPayload;

  // The advisory review must actually justify a redraft.
  const hasBlocking = reviewPayload.findings.some((f) => f.severity === "blocking");
  const recommendsRebuild =
    reviewPayload.recommendation === "rebuild_recommended" ||
    reviewPayload.recommendation === "reject_required";
  if (!hasBlocking && !recommendsRebuild) {
    return { status: "source_review_does_not_justify_rebuild" };
  }

  // Resolve the CURRENT approved source bundle and require the model + review to
  // build on exactly it; a newer or different approved basis is stale.
  const artifacts = await listProjectArtifacts(tenantId, projectId);
  const readiness = getRfpHldDesignModelReadinessReport({ projectId, artifacts });
  if (readiness.status !== "ready" || readiness.sourceBundle === undefined) {
    if (readiness.blockedCode === "invalid_source_bundle_payload") {
      return { status: "invalid_source_bundle_payload", errors: [...readiness.messages] };
    }
    return { status: "stale_source_bundle" };
  }
  // Capture the resolved summary now; later returns must not depend on
  // re-narrowing readiness.sourceBundle across the executor awaits.
  const resolvedSourceBundle = readiness.sourceBundle;
  const sourceBundleId = resolvedSourceBundle.artifactId;
  const sourceBundleArtifact = artifacts.find((a) => a.id === sourceBundleId);
  if (sourceBundleArtifact === undefined) {
    return { status: "stale_source_bundle" };
  }
  const modelOnBundle =
    model.sourceArtifactIds.length === 1 && model.sourceArtifactIds[0] === sourceBundleId;
  if (!modelOnBundle || reviewPayload.sourceHldSourceBundleArtifactId !== sourceBundleId) {
    return { status: "stale_source_bundle" };
  }

  // Deterministic base + rebuild candidate inputs from that exact approved bundle.
  const createdAtIso = (input.createdAt ?? new Date()).toISOString();
  const baseCandidate = buildRfpHldDesignModelCandidateInput({
    projectId,
    artifact: sourceBundleArtifact,
    createdBy: executedBy,
    createdAt: createdAtIso,
  });
  if (baseCandidate.status === "invalid_source_bundle_payload") {
    return { status: "invalid_source_bundle_payload", errors: [...baseCandidate.errors] };
  }
  if (baseCandidate.status === "blocked") {
    return { status: "candidate_input_blocked", reason: baseCandidate.reason };
  }
  const rebuildCandidate = buildRfpHldDesignModelRebuildCandidateInput({
    baseCandidateInput: baseCandidate.bundle,
    sourceModelArtifact: model,
    sourceReviewArtifact: review,
    rebuildRequestArtifact: request,
  });
  if (rebuildCandidate.status !== "ok") {
    return {
      status: "candidate_input_blocked",
      reason:
        rebuildCandidate.status === "blocked"
          ? rebuildCandidate.reason
          : rebuildCandidate.status,
    };
  }

  // Confirm an executor BEFORE consuming the request; if none, do not retire.
  const executor =
    input.executor !== undefined
      ? input.executor
      : getConfiguredRfpHldDesignModelDraftingExecutor();
  if (executor === null || executor === undefined) {
    return { status: "drafting_unavailable" };
  }

  // PRE-EXECUTOR CLAIM: atomically retire the request to stale on its exact
  // observed version+status. If the claim does not match (a concurrent or repeat
  // caller already consumed it), fail closed and never call the executor.
  const claimedRequest = await retireProjectArtifactVersion({
    tenantId,
    projectId,
    artifactId: request.id,
    expectedVersion: request.version,
    expectedStatus: request.status,
    retiredStatus: "stale",
  });
  if (claimedRequest === null) {
    return { status: "request_retire_failed", intendedStatus: "stale" };
  }

  // After the claim, any post-executor failure marks the SAME request failed
  // (stale -> failed). If that mark cannot match, surface request_retire_failed
  // with intendedStatus failed and never leak provider detail.
  const failClaimedRequest = async (
    outcome:
      | { status: "drafting_failed"; error: typeof DRAFTING_FAILED_CODE }
      | { status: "invalid_draft_payload"; errors: string[] }
  ): Promise<ExecuteRfpHldDesignModelRebuildResult> => {
    const marked = await retireProjectArtifactVersion({
      tenantId,
      projectId,
      artifactId: request.id,
      expectedVersion: request.version,
      expectedStatus: "stale",
      retiredStatus: "failed",
    });
    if (marked === null) {
      return { status: "request_retire_failed", intendedStatus: "failed" };
    }
    return outcome;
  };

  let drafting;
  try {
    drafting = await draftRfpHldDesignModelCandidate({
      candidateInput: rebuildCandidate.bundle,
      executor,
    });
  } catch {
    // The thrown detail (provider error, prompt, stack) is never surfaced.
    return failClaimedRequest({ status: "drafting_failed", error: DRAFTING_FAILED_CODE });
  }
  if (drafting.status !== "drafted") {
    return failClaimedRequest({ status: "drafting_failed", error: DRAFTING_FAILED_CODE });
  }

  // HARD GATE: the untrusted candidate payload must validate against the
  // deterministic model/source-compatibility contract before any persistence.
  const compatibility = validateRfpHldDesignModelSourceCompatibility({
    payload: drafting.draft.payload,
    sourceBundleArtifact,
  });
  if (!compatibility.valid) {
    return failClaimedRequest({
      status: "invalid_draft_payload",
      errors: [...compatibility.errors],
    });
  }

  // Validated: persist exactly one reviewable hld_design_model. The request was
  // already retired stale before the executor, so it is NOT retired again here.
  const validatedPayload = drafting.draft.payload as RfpHldDesignModelPayload;
  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: HLD_STAGE,
    type: MODEL_TYPE,
    status: "needs_review",
    payload: drafting.draft.payload as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [sourceBundleId],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    consumedRequest: toArtifactSummary(claimedRequest),
    sourceBundle: toSourceBundleSummary(resolvedSourceBundle),
    payloadSummary: toPayloadSummary(validatedPayload),
  };
}
