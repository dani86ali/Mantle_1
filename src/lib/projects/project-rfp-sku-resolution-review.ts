/**
 * RFP SKU resolution review service: apply EXPLICIT per-line human
 * accept/reject/manual/out_of_scope decisions to one already-recorded
 * `needs_review` sku_resolution artifact, persisting them as a new version.
 * Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Scope (Prompt 89) is the single product step "review SKU resolution lines". It
 * verifies the Project (not_found / wrong_mode) and the exact sku_resolution
 * artifact (sku_resolution_not_found / artifact_not_sku_resolution /
 * sku_resolution_not_reviewable), then delegates the accept/reject application and
 * the new artifact version to the existing deterministic SKU review services. The
 * action input shape deliberately omits `decidedBy` and `decidedAt`: this wrapper
 * is the sole authority for the human actor (`decidedBy` from its input) and the
 * decided time is never settable by a caller. It does NO catalog/pricing/SKU
 * acceptance of its own and never imports the artifact-write helper, the approval/
 * evidence stores, the raw BoQ loader, pricing, configuration expansion, export,
 * any runner/coordinator/engine/adapter path, or an AI/catalog SDK. It translates
 * the lower-level services' known failures into discriminated statuses without
 * leaking internal/stack detail, re-throws anything unexpected for the route to map
 * to a safe 500, and returns serializable, lean summaries only (no artifact
 * payload, no decisions/suggestions, no pricing, no storage paths). It never
 * mutates its input, its actions, the source arrays, or the lower-level results.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import {
  createReviewedSkuResolutionArtifact,
  type CreateReviewedSkuResolutionArtifactResult,
  type ReviewedSkuResolutionArtifactPayload,
} from "@/lib/projects/sku-resolution-review-artifact";
import type {
  SkuResolutionReviewAction,
  SkuResolutionReviewResult,
} from "@/lib/projects/sku-resolution-review";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectMode,
  ProjectStageId,
} from "@/types/project";

/** Fields common to both review action inputs; never carries decidedBy/decidedAt. */
interface RfpSkuResolutionReviewActionInputBase {
  sourceFileId: string;
  sourceRowNumber: number;
  note?: string;
}

/** Accept a `needs_review` line by choosing one of its existing suggestions. */
export interface RfpSkuResolutionAcceptActionInput
  extends RfpSkuResolutionReviewActionInputBase {
  decision: "accept";
  acceptedSku: string;
}

/** Reject a `needs_review` line; carries no accepted SKU. */
export interface RfpSkuResolutionRejectActionInput
  extends RfpSkuResolutionReviewActionInputBase {
  decision: "reject";
}

/** Classify a line as a manual / third-party / non-Cisco commercial line; no accepted SKU. */
export interface RfpSkuResolutionManualActionInput
  extends RfpSkuResolutionReviewActionInputBase {
  decision: "manual";
}

/** Mark a line as intentionally excluded from Cisco RFP pricing; no accepted SKU. */
export interface RfpSkuResolutionOutOfScopeActionInput
  extends RfpSkuResolutionReviewActionInputBase {
  decision: "out_of_scope";
}

/** One explicit human review choice targeting a line by file + row. */
export type RfpSkuResolutionReviewActionInput =
  | RfpSkuResolutionAcceptActionInput
  | RfpSkuResolutionRejectActionInput
  | RfpSkuResolutionManualActionInput
  | RfpSkuResolutionOutOfScopeActionInput;

/** Input for {@link reviewProjectRfpSkuResolutionLines}. */
export interface ReviewProjectRfpSkuResolutionLinesInput {
  tenantId: string;
  projectId: string;
  skuResolutionArtifactId: string;
  /** Required human actor; the sole authority for every action's decidedBy. */
  decidedBy: string;
  actions: readonly RfpSkuResolutionReviewActionInput[];
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export interface RfpSkuResolutionReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpSkuResolutionReviewArtifactSummary {
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

/** Serializable payload summary: counts only, never decisions/source/catalog/pricing/paths. */
export interface RfpSkuResolutionReviewPayloadSummary {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceFileIds: string[];
  lineCount: number;
  summary: Record<string, number>;
}

/** Deterministic review counts surfaced to the caller. */
export interface RfpSkuResolutionReviewSummary {
  appliedCount: number;
  needsReviewCount: number;
  acceptedCount: number;
  rejectedCount: number;
  unresolvedCount: number;
  manualCount: number;
  outOfScopeCount: number;
}

/** Why a batch of actions was rejected as invalid. */
export type RfpSkuResolutionInvalidActionsReason =
  | "actions_required"
  | "accepted_sku_required"
  | "reject_has_accepted_sku"
  | "manual_or_out_of_scope_has_accepted_sku";

/** Discriminated result of {@link reviewProjectRfpSkuResolutionLines}. */
export type ReviewProjectRfpSkuResolutionLinesResult =
  | { status: "invalid_actions"; reason: RfpSkuResolutionInvalidActionsReason }
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpSkuResolutionReviewProjectSummary }
  | { status: "sku_resolution_not_found" }
  | {
      status: "artifact_not_sku_resolution";
      artifact?: RfpSkuResolutionReviewArtifactSummary;
    }
  | {
      status: "sku_resolution_not_reviewable";
      artifact: RfpSkuResolutionReviewArtifactSummary;
    }
  | { status: "invalid_sku_resolution_payload" }
  | { status: "review_action_not_reviewable" }
  | { status: "accepted_sku_not_suggested" }
  | { status: "accept_deferred_not_allowed" }
  | { status: "duplicate_action" }
  | { status: "action_target_not_found" }
  | {
      status: "ok";
      artifact: RfpSkuResolutionReviewArtifactSummary;
      payloadSummary: RfpSkuResolutionReviewPayloadSummary;
      reviewSummary: RfpSkuResolutionReviewSummary;
    };

/**
 * Exact messages thrown by the lower-level SKU review services. They are private
 * to those modules, so this wrapper mirrors the literals deliberately to translate
 * them into safe statuses without importing or editing them.
 */
const DECIDED_BY_REQUIRED_MESSAGE = "decidedBy is required.";
const MISSING_ARTIFACT_MESSAGE = "SKU resolution artifact not found.";
const WRONG_TYPE_MESSAGE = "Artifact is not a sku_resolution artifact.";
const INVALID_PAYLOAD_MESSAGE = "SKU resolution artifact payload is invalid.";
const DECISION_NOT_REVIEWABLE_MESSAGE = "SKU resolution decision is not reviewable.";
const ACCEPTED_SKU_REQUIRED_MESSAGE = "acceptedSku is required.";
const ACCEPTED_SKU_NO_MATCH_MESSAGE = "Accepted SKU must match an existing suggestion.";
const REJECT_HAS_ACCEPTED_SKU_MESSAGE = "Rejected SKU resolution cannot include acceptedSku.";
const UNSUPPORTED_HAS_ACCEPTED_SKU_MESSAGE =
  "Manual or out-of-scope SKU resolution cannot include acceptedSku.";
const ACCEPT_DEFERRED_NOT_ALLOWED_MESSAGE =
  "Deferred non-priced SKU resolution row cannot be accepted.";
const DUPLICATE_ACTION_MESSAGE = "Duplicate SKU resolution action for decision.";
const MISSING_TARGET_MESSAGE = "SKU resolution action target was not found.";

function isBlank(value: string): boolean {
  return value.trim() === "";
}

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpSkuResolutionReviewProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project an artifact to a serializable summary; source arrays copied, payload dropped. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpSkuResolutionReviewArtifactSummary {
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

function toSummarySafe(
  summary: ReviewedSkuResolutionArtifactPayload["summary"]
): Record<string, number> {
  const out: Record<string, number> = {};
  const numKeys = [
    "totalLines",
    "needsReviewCount",
    "acceptedCount",
    "rejectedCount",
    "unresolvedCount",
    "manualCount",
    "outOfScopeCount",
    "exactSuggestionCount",
    "normalizedSuggestionCount",
    "ambiguousCount",
  ] as const;
  for (const key of numKeys) {
    const value = summary[key];
    if (typeof value === "number") out[key] = value;
  }
  return out;
}

/** Project the reviewed payload to a lean summary; decisions/source/catalog/pricing/paths dropped. */
function toPayloadSummary(
  payload: ReviewedSkuResolutionArtifactPayload
): RfpSkuResolutionReviewPayloadSummary {
  return {
    sourceNormalizedBoqArtifactId: payload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: payload.sourceNormalizedBoqArtifactVersion,
    sourceFileIds: [...payload.sourceFileIds],
    lineCount: payload.lineCount,
    summary: toSummarySafe(payload.summary),
  };
}

/** Copy the review counts; never aliases the lower-level result. */
function toReviewSummary(
  result: SkuResolutionReviewResult
): RfpSkuResolutionReviewSummary {
  return {
    appliedCount: result.appliedCount,
    needsReviewCount: result.needsReviewCount,
    acceptedCount: result.acceptedCount,
    rejectedCount: result.rejectedCount,
    unresolvedCount: result.unresolvedCount,
    manualCount: result.manualCount,
    outOfScopeCount: result.outOfScopeCount,
  };
}

/**
 * Copy each action input into a lower-level review action, stamping `decidedBy`
 * from the service input (never from the action). The decided time is never set,
 * so the lower helper defaults it; only an accept action forwards an accepted SKU,
 * while reject/manual/out_of_scope carry none. Returns fresh objects in a fresh
 * array so the input actions are never aliased.
 */
function toLowerActions(
  actions: readonly RfpSkuResolutionReviewActionInput[],
  decidedBy: string
): SkuResolutionReviewAction[] {
  return actions.map((action): SkuResolutionReviewAction => {
    if (action.decision === "accept") {
      return {
        decision: "accept",
        sourceFileId: action.sourceFileId,
        sourceRowNumber: action.sourceRowNumber,
        acceptedSku: action.acceptedSku,
        decidedBy,
        ...(action.note !== undefined ? { note: action.note } : {}),
      };
    }
    if (action.decision === "manual" || action.decision === "out_of_scope") {
      return {
        decision: action.decision,
        sourceFileId: action.sourceFileId,
        sourceRowNumber: action.sourceRowNumber,
        decidedBy,
        ...(action.note !== undefined ? { note: action.note } : {}),
      };
    }
    return {
      decision: "reject",
      sourceFileId: action.sourceFileId,
      sourceRowNumber: action.sourceRowNumber,
      decidedBy,
      ...(action.note !== undefined ? { note: action.note } : {}),
    };
  });
}

/** Translate a lower-level review error into a safe status, or null if unexpected. */
function translateReviewError(
  message: string
): ReviewProjectRfpSkuResolutionLinesResult | null {
  if (message === MISSING_ARTIFACT_MESSAGE) return { status: "sku_resolution_not_found" };
  if (message === WRONG_TYPE_MESSAGE) return { status: "artifact_not_sku_resolution" };
  if (message === INVALID_PAYLOAD_MESSAGE) {
    return { status: "invalid_sku_resolution_payload" };
  }
  if (message === DECISION_NOT_REVIEWABLE_MESSAGE) {
    return { status: "review_action_not_reviewable" };
  }
  if (message === ACCEPTED_SKU_REQUIRED_MESSAGE) {
    return { status: "invalid_actions", reason: "accepted_sku_required" };
  }
  if (message === ACCEPTED_SKU_NO_MATCH_MESSAGE) {
    return { status: "accepted_sku_not_suggested" };
  }
  if (message === REJECT_HAS_ACCEPTED_SKU_MESSAGE) {
    return { status: "invalid_actions", reason: "reject_has_accepted_sku" };
  }
  if (message === UNSUPPORTED_HAS_ACCEPTED_SKU_MESSAGE) {
    return {
      status: "invalid_actions",
      reason: "manual_or_out_of_scope_has_accepted_sku",
    };
  }
  if (message === ACCEPT_DEFERRED_NOT_ALLOWED_MESSAGE) {
    return { status: "accept_deferred_not_allowed" };
  }
  if (message === DUPLICATE_ACTION_MESSAGE) return { status: "duplicate_action" };
  if (message === MISSING_TARGET_MESSAGE) return { status: "action_target_not_found" };
  return null;
}

/**
 * Apply explicit per-line human accept/reject/manual/out_of_scope decisions to one
 * RFP sku_resolution artifact. `decidedBy` must be nonblank (a programming invariant;
 * throws otherwise) and at least one action is required (invalid_actions /
 * actions_required) - both checked before any store call. It verifies the Project
 * within its tenant (not_found / wrong_mode, lean summary) and then the exact
 * artifact: sku_resolution_not_found when absent, artifact_not_sku_resolution when
 * it is the wrong type, and sku_resolution_not_reviewable when its status is not
 * `needs_review`; none persist anything. For a reviewable artifact it stamps every
 * action with `decidedBy` and delegates to
 * {@link createReviewedSkuResolutionArtifact}, translating that service's known
 * failures into safe discriminated statuses and re-throwing anything unexpected. On
 * success it returns lean, serializable summaries of the new artifact, its payload
 * (no decisions/pricing), and the review counts. Inputs, actions, source arrays,
 * and the lower-level results are never mutated.
 */
export async function reviewProjectRfpSkuResolutionLines(
  input: ReviewProjectRfpSkuResolutionLinesInput
): Promise<ReviewProjectRfpSkuResolutionLinesResult> {
  const { tenantId, projectId, skuResolutionArtifactId, decidedBy, actions } = input;

  if (isBlank(decidedBy)) throw new Error(DECIDED_BY_REQUIRED_MESSAGE);
  if (actions.length === 0) {
    return { status: "invalid_actions", reason: "actions_required" };
  }

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const sourceArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    skuResolutionArtifactId
  );
  if (sourceArtifact === null) return { status: "sku_resolution_not_found" };
  if (sourceArtifact.type !== "sku_resolution") {
    return {
      status: "artifact_not_sku_resolution",
      artifact: toArtifactSummary(sourceArtifact),
    };
  }
  if (sourceArtifact.status !== "needs_review") {
    return {
      status: "sku_resolution_not_reviewable",
      artifact: toArtifactSummary(sourceArtifact),
    };
  }

  let result: CreateReviewedSkuResolutionArtifactResult;
  try {
    result = await createReviewedSkuResolutionArtifact({
      tenantId,
      projectId,
      skuResolutionArtifactId,
      actions: toLowerActions(actions, decidedBy),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const translated = translateReviewError(message);
    if (translated) return translated;
    throw error;
  }

  return {
    status: "ok",
    artifact: toArtifactSummary(result.artifact),
    payloadSummary: toPayloadSummary(result.payload),
    reviewSummary: toReviewSummary(result.reviewResult),
  };
}
