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
 * After those gates pass, APPROVAL additionally fails closed (Stage 6E-B / 6H-0H-A)
 * unless a current valid OpenAI ADVISORY hld_design_model_review exists for this
 * exact model and the current source bundle: the latest non-retired review of the
 * model must validate against the Stage 6E-B review contract, tie to the model and
 * current bundle, carry reviewer.type "ai_advisory" (a deterministic/engineer review
 * no longer satisfies the mandatory gate), and carry no blocking findings. A missing
 * OR non-ai_advisory latest review -> hld_design_model_review_required; an invalid
 * latest review payload -> invalid_hld_design_model_review_payload; a current valid
 * review with blocking findings -> blocking_hld_design_model_review_findings. Warnings
 * and suggestions are advisory and proceed to engineer approval. Retired
 * (stale/rejected/failed/missing/not_applicable) reviews are ignored. This gate runs
 * purely over the live artifacts snapshot already loaded by the currency gate.
 *
 * This service runs no AI and makes no SKU/pricing/catalog/configuration/design
 * decision; configuration authority stays the approved upstream artifacts. It
 * imports exactly the project/artifact/approval stores, the pure approval helper,
 * the Stage 6C contract, the pure Stage 6C readiness helper, the rebuild-request
 * contract used for redo budget metadata, the Stage 6E-B review contract, and
 * canonical project types - no fs/path, no raw-document reader, no AI/provider,
 * no pricing/SKU/catalog/config service, no route or UI. Summaries are lean and
 * serializable (ISO dates, copied arrays, no payload body, no tenantId).
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
import {
  validateRfpHldDesignModelRebuildRequestPayload,
  type RfpHldDesignModelRebuildRequestPayload,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-request";
import {
  validateRfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewRecommendation,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

const DESIGN_MODEL_TYPE: ProjectArtifact["type"] = "hld_design_model";
const DESIGN_MODEL_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";
const DESIGN_MODEL_REVIEW_TYPE: ProjectArtifact["type"] = "hld_design_model_review";
const DESIGN_MODEL_REBUILD_REQUEST_TYPE: ProjectArtifact["type"] =
  "hld_design_model_rebuild_request";

/** Rebuild-request row statuses that are still open/consumable for the pair check. */
const OPEN_REBUILD_REQUEST_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review"]);

/**
 * Review artifact statuses that may still gate an approval. Retired statuses
 * (stale/rejected/failed/missing/not_applicable) are ignored as if no review
 * existed, so an obsolete review never blocks or satisfies the gate.
 */
const ALLOWED_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

/** Per-severity advisory finding tally surfaced on a blocking-review block. */
export interface RfpHldDesignModelReviewFindingCounts {
  blocking: number;
  warning: number;
  suggestion: number;
}

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
  | {
      status: "hld_design_model_review_required";
      artifact: RfpHldDesignModelReviewArtifactSummary;
    }
  | {
      status: "invalid_hld_design_model_review_payload";
      artifact: RfpHldDesignModelReviewArtifactSummary;
      reviewArtifact: RfpHldDesignModelReviewArtifactSummary;
      errors: string[];
    }
  | {
      status: "blocking_hld_design_model_review_findings";
      artifact: RfpHldDesignModelReviewArtifactSummary;
      reviewArtifact: RfpHldDesignModelReviewArtifactSummary;
      recommendation: RfpHldDesignModelReviewRecommendation;
      findingCounts: RfpHldDesignModelReviewFindingCounts;
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpHldDesignModelReviewArtifactSummary;
    };

/**
 * Count valid, non-rejected `initial_openai_gate` OpenAI-forced rebuild requests for the
 * SAME source bundle. A rejected redo does not consume the budget; any other
 * non-rejected row does. A count >= 1 means the bounded initial OpenAI-forced redo
 * has already been spent for this source bundle. Malformed historical rows never
 * consume the budget.
 */
function countInitialOpenAiRedos(
  artifacts: readonly ProjectArtifact[],
  bundleId: string
): number {
  let count = 0;
  for (const a of artifacts) {
    if (a.type !== DESIGN_MODEL_REBUILD_REQUEST_TYPE) continue;
    if (a.status === "rejected") continue;
    if (!validateRfpHldDesignModelRebuildRequestPayload(a.payload).valid) continue;
    const p = a.payload as unknown as RfpHldDesignModelRebuildRequestPayload;
    if (p.requestSource !== "openai_advisory") continue;
    if (p.redoPhase !== "initial_openai_gate") continue;
    if (p.sourceHldSourceBundleArtifactId !== bundleId) continue;
    count += 1;
  }
  return count;
}

/**
 * True when an OpenAI-forced initial rebuild request is still open for this EXACT
 * current model/review pair. Such a valid active request means the forced redo is
 * in flight, so the blocking review must keep blocking rather than let approval proceed.
 */
function hasOpenOpenAiRedoForPair(
  artifacts: readonly ProjectArtifact[],
  modelId: string,
  reviewId: string
): boolean {
  for (const a of artifacts) {
    if (a.type !== DESIGN_MODEL_REBUILD_REQUEST_TYPE) continue;
    if (!OPEN_REBUILD_REQUEST_STATUSES.has(a.status)) continue;
    if (!validateRfpHldDesignModelRebuildRequestPayload(a.payload).valid) continue;
    const p = a.payload as unknown as RfpHldDesignModelRebuildRequestPayload;
    if (p.status !== "active") continue;
    if (p.requestSource !== "openai_advisory") continue;
    if (p.redoPhase !== "initial_openai_gate") continue;
    if (p.sourceHldDesignModelArtifactId !== modelId) continue;
    if (p.sourceReviewArtifactId !== reviewId) continue;
    return true;
  }
  return false;
}

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
 * Outcome of the approval-only currency gate. `block` is the invalid/stale result
 * that must short-circuit the approval; when it is null the persisted model is valid
 * and still ties to the resolved current approved source bundle, and the live
 * artifacts list plus that bundle are handed back so the review gate can run over the
 * same snapshot without a second store read.
 */
type EvaluatePersistedModelOutcome =
  | { block: ReviewRfpHldDesignModelArtifactResult }
  | { block: null; artifacts: ProjectArtifact[]; sourceBundle: ProjectArtifact };

/**
 * Approval-only currency gate. Reads stores but mutates nothing and never leaks the
 * payload body. Behavior and result statuses are unchanged from the prior version;
 * it now also returns the live artifacts snapshot and resolved source bundle on the
 * passing path so the caller's review gate reuses them.
 */
async function evaluatePersistedModel(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<EvaluatePersistedModelOutcome> {
  const validation = validateRfpHldDesignModelPayload(artifact.payload);
  if (!validation.valid) {
    return {
      block: {
        status: "invalid_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
      },
    };
  }

  const artifacts = await listProjectArtifacts(tenantId, projectId);

  const readiness = getRfpHldDesignModelReadinessReport({ projectId, artifacts });
  if (readiness.status !== "ready" || readiness.sourceBundle === undefined) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_readiness_blocked",
        messages: [...readiness.messages],
      },
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
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_bundle_not_found",
        messages: ["The current approved hld_source_bundle could not be resolved."],
      },
    };
  }

  // Fail closed unless the resolved bundle is itself an approved hld_source_bundle
  // on the hld_design_delta_review stage. Defensive: a divergent type/stage/status
  // means the model no longer ties to a valid source authority.
  const bundleErrors: string[] = [];
  if (sourceBundle.type !== "hld_source_bundle") {
    bundleErrors.push(
      `Source bundle type ${sourceBundle.type} is not hld_source_bundle.`
    );
  }
  if (sourceBundle.stageId !== DESIGN_MODEL_STAGE) {
    bundleErrors.push(
      `Source bundle stage ${sourceBundle.stageId} is not ${DESIGN_MODEL_STAGE}.`
    );
  }
  if (sourceBundle.status !== "approved") {
    bundleErrors.push(
      `Source bundle status ${sourceBundle.status} is not approved.`
    );
  }
  if (bundleErrors.length > 0) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_compatibility_mismatch",
        errors: bundleErrors,
      },
    };
  }

  if (
    artifact.sourceArtifactIds.length !== 1 ||
    artifact.sourceArtifactIds[0] !== sourceBundle.id
  ) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_artifact_ids_mismatch",
        messages: [
          "The artifact sourceArtifactIds no longer equals the current source bundle id.",
        ],
      },
    };
  }

  const compatibility = validateRfpHldDesignModelSourceCompatibility({
    payload: artifact.payload,
    sourceBundleArtifact: sourceBundle,
  });
  if (!compatibility.valid) {
    return {
      block: {
        status: "stale_hld_design_model_payload",
        artifact: toArtifactSummary(artifact),
        staleCode: "source_compatibility_mismatch",
        errors: compatibility.errors.slice(),
      },
    };
  }

  return { block: null, artifacts, sourceBundle };
}

/**
 * Advisory review gate (Stage 6E-B). Runs only after the currency gate passes,
 * purely over the already-fetched artifacts snapshot - it reads no store and runs no
 * AI. Returns the result that must short-circuit the approval, or null when a current
 * valid matching review with no blocking findings clears the model to engineer
 * approval. Warnings/suggestions are advisory and do not block. Summaries stay lean
 * (no payload body, no tenantId).
 */
function evaluateReviewGate(
  model: ProjectArtifact,
  sourceBundle: ProjectArtifact,
  artifacts: ProjectArtifact[]
): ReviewRfpHldDesignModelArtifactResult | null {
  // Candidate reviews of THIS model: correct project/type/stage, a non-retired
  // status, and a row-level link whose first source is this model artifact. The
  // link is payload-independent so an invalid-payload review is still detected.
  const candidates = artifacts
    .filter(
      (a) =>
        a.projectId === model.projectId &&
        a.type === DESIGN_MODEL_REVIEW_TYPE &&
        a.stageId === DESIGN_MODEL_STAGE &&
        ALLOWED_REVIEW_STATUSES.has(a.status) &&
        a.sourceArtifactIds.length > 0 &&
        a.sourceArtifactIds[0] === model.id
    )
    .sort(
      (a, b) =>
        b.version - a.version || b.createdAt.getTime() - a.createdAt.getTime()
    );

  if (candidates.length === 0) {
    return {
      status: "hld_design_model_review_required",
      artifact: toArtifactSummary(model),
    };
  }

  // Fail closed on the LATEST candidate only; an older review never rescues it.
  const latest = candidates[0];
  const validation = validateRfpHldDesignModelReviewPayload(latest.payload);
  if (!validation.valid) {
    return {
      status: "invalid_hld_design_model_review_payload",
      artifact: toArtifactSummary(model),
      reviewArtifact: toArtifactSummary(latest),
      errors: validation.errors.slice(),
    };
  }

  const payload = latest.payload as unknown as RfpHldDesignModelReviewPayload;
  // A structurally valid review that points at a different model/bundle, or whose
  // row sources are not exactly [model, current bundle], is not current - treat it
  // as if no matching review exists so a fresh review is required.
  const tiesToCurrent =
    payload.sourceHldDesignModelArtifactId === model.id &&
    payload.sourceHldSourceBundleArtifactId === sourceBundle.id &&
    latest.sourceArtifactIds.length === 2 &&
    latest.sourceArtifactIds[0] === model.id &&
    latest.sourceArtifactIds[1] === sourceBundle.id;
  if (!tiesToCurrent) {
    return {
      status: "hld_design_model_review_required",
      artifact: toArtifactSummary(model),
    };
  }

  // The mandatory quality gate is the OpenAI advisory review (Stage 6H-0H-A). A
  // current, valid deterministic/engineer review no longer satisfies approval -
  // treat it as if no matching review exists so a fresh ai_advisory review is run.
  if (payload.reviewer.type !== "ai_advisory") {
    return {
      status: "hld_design_model_review_required",
      artifact: toArtifactSummary(model),
    };
  }

  const findingCounts: RfpHldDesignModelReviewFindingCounts = {
    blocking: 0,
    warning: 0,
    suggestion: 0,
  };
  for (const finding of payload.findings) {
    if (finding.severity === "blocking") findingCounts.blocking += 1;
    else if (finding.severity === "warning") findingCounts.warning += 1;
    else if (finding.severity === "suggestion") findingCounts.suggestion += 1;
  }

  if (findingCounts.blocking > 0) {
    // A blocking OpenAI review keeps blocking while the initial OpenAI-forced redo is
    // still available, or while a forced redo for this exact model/review pair is
    // still open. Once the initial budget is exhausted for this source bundle and no
    // forced redo is open for the pair, approval may proceed to SE review with the
    // remaining findings still visible through the existing review artifacts.
    const budgetExhausted = countInitialOpenAiRedos(artifacts, sourceBundle.id) >= 1;
    const activeForPair = hasOpenOpenAiRedoForPair(artifacts, model.id, latest.id);
    const mayProceedWithRemainingFindings = budgetExhausted && !activeForPair;
    if (!mayProceedWithRemainingFindings) {
      return {
        status: "blocking_hld_design_model_review_findings",
        artifact: toArtifactSummary(model),
        reviewArtifact: toArtifactSummary(latest),
        recommendation: payload.recommendation,
        findingCounts,
      };
    }
  }

  // Current, valid, no blocking findings (or the initial OpenAI-forced redo budget is
  // exhausted with no open forced redo): advisory findings proceed to engineer review.
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
    const evaluated = await evaluatePersistedModel(tenantId, projectId, artifact);
    if (evaluated.block !== null) return evaluated.block;
    const reviewBlocked = evaluateReviewGate(
      artifact,
      evaluated.sourceBundle,
      evaluated.artifacts
    );
    if (reviewBlocked !== null) return reviewBlocked;
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
