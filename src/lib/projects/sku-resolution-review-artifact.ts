/**
 * Narrow Project-domain service: persist EXPLICIT human SKU review actions as a
 * new version of a `sku_resolution` artifact.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 8, 13, 14, 15).
 *
 * This module only COMPOSES two narrow primitives: the artifact repository (read
 * one source `sku_resolution` artifact, persist one new version) and the pure SKU
 * review helper (apply accept/reject actions to existing decisions). It does NO
 * catalog lookup, pricing, fuzzy/AI matching, auto-acceptance, approvals, staleness
 * propagation, stage-status updates, or evidence creation, and imports no engines,
 * schema, AI, or API/UI code. Review-helper errors bubble unchanged with no
 * artifact created. It never mutates its input actions, the source artifact, its
 * arrays, or the source payload decisions/suggestions: the new payload holds fresh
 * decision and suggestion objects.
 */
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import {
  applySkuResolutionReviewActions,
  type SkuResolutionReviewAction,
  type SkuResolutionReviewResult,
} from "@/lib/projects/sku-resolution-review";
import type { SkuResolutionDraftSummary } from "@/lib/projects/sku-resolution";
import type { ProjectArtifact, SkuResolutionDecision } from "@/types/project";

// Exact guard messages; consumers may assert on these verbatim.
const MISSING_ARTIFACT_MESSAGE = "SKU resolution artifact not found.";
const WRONG_TYPE_MESSAGE = "Artifact is not a sku_resolution artifact.";
const INVALID_PAYLOAD_MESSAGE = "SKU resolution artifact payload is invalid.";

/**
 * JSONB payload stored on the reviewed `sku_resolution` artifact. A type alias
 * (not an interface) so it carries an implicit index signature assignable to the
 * repository's `Record<string, unknown>` payload. Same shape as the unreviewed
 * draft payload, but decisions now carry human accept/reject state and the summary
 * reflects it (catalog/source counts preserved). No pricing fields.
 */
export type ReviewedSkuResolutionArtifactPayload = {
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceFileIds: string[];
  lineCount: number;
  decisions: SkuResolutionDecision[];
  summary: SkuResolutionDraftSummary;
};

/** Input for {@link createReviewedSkuResolutionArtifact}. */
export interface CreateReviewedSkuResolutionArtifactInput {
  tenantId: string;
  projectId: string;
  skuResolutionArtifactId: string;
  /** Explicit human accept/reject choices; nothing is auto-accepted. */
  actions: readonly SkuResolutionReviewAction[];
}

/** The created artifact, the source artifact, the exact payload, and the review result. */
export interface CreateReviewedSkuResolutionArtifactResult {
  artifact: ProjectArtifact;
  sourceArtifact: ProjectArtifact;
  payload: ReviewedSkuResolutionArtifactPayload;
  reviewResult: SkuResolutionReviewResult;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Validate and narrow a source artifact's JSONB payload to a reviewed
 * `sku_resolution` payload shape, requiring `decisions` (array), `summary` (plain
 * object), `sourceNormalizedBoqArtifactId` (string), `...Version` (number), and
 * `sourceFileIds` (string array). Throws the exact invalid-payload message
 * otherwise. Does not copy or mutate; the returned arrays alias the source.
 */
function parseSourcePayload(
  payload: Record<string, unknown>
): ReviewedSkuResolutionArtifactPayload {
  const {
    decisions,
    summary,
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceFileIds,
    lineCount,
  } = payload;
  if (
    !Array.isArray(decisions) ||
    !isPlainObject(summary) ||
    typeof sourceNormalizedBoqArtifactId !== "string" ||
    typeof sourceNormalizedBoqArtifactVersion !== "number" ||
    !isStringArray(sourceFileIds)
  ) {
    throw new Error(INVALID_PAYLOAD_MESSAGE);
  }

  return {
    sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion,
    sourceFileIds,
    lineCount: typeof lineCount === "number" ? lineCount : decisions.length,
    decisions: decisions as SkuResolutionDecision[],
    summary: summary as unknown as SkuResolutionDraftSummary,
  };
}

/**
 * Build the reviewed `sku_resolution` payload from the source payload and review
 * result. Pure: preserves the source artifact id/version, copies `sourceFileIds`
 * into a fresh array, and emits FRESH decision objects with fresh suggestion
 * arrays (so the payload never aliases the source decisions, including untouched
 * rows). The summary preserves the source catalog/source counts and replaces the
 * review-state counts from the review result. Never mutates inputs.
 */
export function buildReviewedSkuResolutionArtifactPayload(
  sourcePayload: ReviewedSkuResolutionArtifactPayload,
  reviewResult: SkuResolutionReviewResult
): ReviewedSkuResolutionArtifactPayload {
  const decisions = reviewResult.decisions.map((decision) => ({
    ...decision,
    suggestions: decision.suggestions.map((suggestion) => ({ ...suggestion })),
  }));
  return {
    sourceNormalizedBoqArtifactId: sourcePayload.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion:
      sourcePayload.sourceNormalizedBoqArtifactVersion,
    sourceFileIds: [...sourcePayload.sourceFileIds],
    lineCount: decisions.length,
    decisions,
    summary: {
      // Review-state counts replaced from the review result; catalog/source
      // counts preserved verbatim from the source summary.
      totalLines: reviewResult.decisions.length,
      needsReviewCount: reviewResult.needsReviewCount,
      acceptedCount: reviewResult.acceptedCount,
      rejectedCount: reviewResult.rejectedCount,
      unresolvedCount: reviewResult.unresolvedCount,
      exactSuggestionCount: sourcePayload.summary.exactSuggestionCount,
      normalizedSuggestionCount: sourcePayload.summary.normalizedSuggestionCount,
      ambiguousCount: sourcePayload.summary.ambiguousCount,
      zeroPriceSuggestionCount: sourcePayload.summary.zeroPriceSuggestionCount,
      catalogSource: sourcePayload.summary.catalogSource,
    },
  };
}

/**
 * Persist explicit human SKU review actions as a new `sku_resolution` artifact
 * version: load the source artifact (throwing the exact missing/wrong-type/
 * invalid-payload messages), apply the accept/reject actions (bubbling review
 * errors unchanged, before any artifact exists), build the reviewed payload, and
 * create exactly one new `sku_resolution` artifact - `needs_review` while any
 * decision still needs review, otherwise `generated`. Returns the created
 * artifact, source artifact, payload, and review result. Does not mutate inputs.
 */
export async function createReviewedSkuResolutionArtifact(
  input: CreateReviewedSkuResolutionArtifactInput
): Promise<CreateReviewedSkuResolutionArtifactResult> {
  const { tenantId, projectId, skuResolutionArtifactId, actions } = input;

  const sourceArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    skuResolutionArtifactId
  );
  if (!sourceArtifact) throw new Error(MISSING_ARTIFACT_MESSAGE);
  if (sourceArtifact.type !== "sku_resolution") throw new Error(WRONG_TYPE_MESSAGE);

  const sourcePayload = parseSourcePayload(sourceArtifact.payload);

  const reviewResult = applySkuResolutionReviewActions(
    sourcePayload.decisions,
    actions
  );
  const payload = buildReviewedSkuResolutionArtifactPayload(
    sourcePayload,
    reviewResult
  );

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: payload.summary.needsReviewCount > 0 ? "needs_review" : "generated",
    payload,
    sourceFileIds: [...sourceArtifact.sourceFileIds],
    sourceArtifactIds: [sourceArtifact.id],
  });

  return { artifact, sourceArtifact, payload, reviewResult };
}
