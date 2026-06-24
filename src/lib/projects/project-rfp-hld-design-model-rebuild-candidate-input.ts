/**
 * Pure, deterministic RFP HLD design-model REBUILD candidate-input CONTRACT
 * (Stage 6E-C-002).
 *
 * Builds the optional, tightly-whitelisted REBUILD drafting context that extends
 * the base {@link RfpHldDesignModelCandidateInputBundle} when a candidate
 * `hld_design_model` is redrafted after its advisory `hld_design_model_review`
 * and a bounded `hld_design_model_rebuild_request`. It is contract-only: NO
 * DB/file/network/AI/provider call, NO persistence, NO route/UI work.
 *
 * The supplied model/review/request artifacts are each validated against their
 * own contract and cross-checked to refer to the SAME source model, review, and
 * approved source bundle as the base candidate input; only then is a sanitized
 * context produced. The context carries summaries only - coarse prior-model
 * COUNTS (never the raw model body), bounded advisory finding summaries, the
 * bounded engineer reason/instructions, and explicit redraft limitations. It
 * carries no raw documents, file/storage paths, sourceFileIds, provider
 * prompt/response, pricing/catalog/configuration authority, full prior model
 * body, or final deliverable content. It introduces no runtime AI authority: a
 * redraft is ONE bounded correction pass, candidate-only, subordinate to
 * deterministic validation and human engineer approval.
 */
import type { ProjectArtifact } from "@/types/project";
import {
  RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
  type RfpHldDesignModelCandidateInputBundle,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import {
  validateRfpHldDesignModelPayload,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  validateRfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewFinding,
  type RfpHldDesignModelReviewPayload,
  type RfpHldDesignModelReviewRecommendation,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  validateRfpHldDesignModelRebuildRequestPayload,
  type RfpHldDesignModelRebuildRequestPayload,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-request";

/** Defensive string bounds for summaries carried into the rebuild context. */
const REASON_MAX = 600;
const INSTRUCTIONS_MAX = 1200;
const FINDING_MESSAGE_MAX = 280;
const FINDING_ACTION_MAX = 240;

/**
 * The explicit limitations every redraft must honour. A rebuild is ONE bounded
 * correction pass from the SAME approved source bundle and adds no new authority.
 */
export const RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_LIMITATIONS: readonly string[] = [
  "Redraft from exactly the same approved hld_source_bundle as the prior model; add or change no source artifacts.",
  "This is one bounded correction pass only; address the advisory review without widening scope.",
  "Add no new scope, domains, requirements, or topology facts beyond the approved source bundle.",
  "Select, substitute, or invent no SKUs; make no pricing, catalog, or configuration decisions.",
  "Size no hardware and invent no quantities; those authorities live in approved upstream artifacts.",
  "Emit no final HLD document, HTML, diagram, Mermaid, draw.io/XML, SVG, TP/proposal, export, or customer deliverable.",
  "Assert no Cisco-certified, CVD-certified, BOMATIC-certified, or AI-certified authority.",
  "Output stays a candidate subordinate to deterministic validation and human engineer approval.",
];

/** Coarse, sanitized structural summary of the prior candidate model. */
export interface RfpHldDesignModelRebuildPriorModelSummary {
  coveredDomains: RfpHldDesignModelPayload["coveredDomains"];
  excludedDomains: RfpHldDesignModelPayload["excludedDomains"];
  designSectionCount: number;
  topologyNodeCount: number;
  topologyLinkCount: number;
  topologyZoneCount: number;
  diagramIntentCount: number;
  sourceReferenceCount: number;
  validationFindingCount: number;
}

/** A bounded advisory finding summary; carries no raw model/source body. */
export interface RfpHldDesignModelRebuildReviewFindingSummary {
  id: string;
  severity: RfpHldDesignModelReviewFinding["severity"];
  category: RfpHldDesignModelReviewFinding["category"];
  message: string;
  recommendedAction?: string;
}

/** The optional, tightly-whitelisted rebuild context carried on the bundle. */
export interface RfpHldDesignModelRebuildDraftingContext {
  /** Anchors the redraft to the SAME approved source bundle as the base input. */
  sourceHldSourceBundleArtifactId: string;
  rebuildRequestArtifactId: string;
  sourceModelArtifactId: string;
  sourceReviewArtifactId: string;
  priorModelSummary: RfpHldDesignModelRebuildPriorModelSummary;
  reviewRecommendation: RfpHldDesignModelReviewRecommendation;
  reviewFindingSummaries: RfpHldDesignModelRebuildReviewFindingSummary[];
  engineerReason: string;
  engineerInstructions: string;
  limitations: string[];
}

/** Why a rebuild context could not be built from otherwise-valid artifacts. */
export type RfpHldDesignModelRebuildCandidateInputBlockedReason =
  | "request_model_mismatch"
  | "request_review_mismatch"
  | "review_model_mismatch"
  | "source_bundle_mismatch"
  | "review_does_not_justify_rebuild";

/** Input for {@link buildRfpHldDesignModelRebuildCandidateInput}. */
export interface BuildRfpHldDesignModelRebuildCandidateInputInput {
  /** Base candidate input already built from the current approved source bundle. */
  baseCandidateInput: RfpHldDesignModelCandidateInputBundle;
  /** The candidate `hld_design_model` artifact being redrafted. */
  sourceModelArtifact: ProjectArtifact;
  /** Its advisory `hld_design_model_review` artifact. */
  sourceReviewArtifact: ProjectArtifact;
  /** The bounded `hld_design_model_rebuild_request` artifact. */
  rebuildRequestArtifact: ProjectArtifact;
}

/** Discriminated result; on `ok` the base bundle carries the rebuild context. */
export type BuildRfpHldDesignModelRebuildCandidateInputResult =
  | { status: "ok"; bundle: RfpHldDesignModelCandidateInputBundle }
  | { status: "invalid_model_payload"; errors: string[] }
  | { status: "invalid_review_payload"; errors: string[] }
  | { status: "invalid_request_payload"; errors: string[] }
  | { status: "blocked"; reason: RfpHldDesignModelRebuildCandidateInputBlockedReason };

/** Deep, fresh, JSON-safe copy; never aliases the input. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Trim to a defensive max; deterministic, no marker. */
function bound(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * True for any non-null object (defends against programmer misuse). Returns a
 * plain boolean, NOT a type predicate, so it never narrows a ProjectArtifact down
 * to an index-signature type and erases its typed `id`/`payload` fields.
 */
function isObject(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

/** Coarse counts + declared domains only; never the prior model body. */
function summarizePriorModel(
  model: RfpHldDesignModelPayload
): RfpHldDesignModelRebuildPriorModelSummary {
  return {
    coveredDomains: model.coveredDomains.slice(),
    excludedDomains: model.excludedDomains.slice(),
    designSectionCount: model.designSections.length,
    topologyNodeCount: model.topology.nodes.length,
    topologyLinkCount: model.topology.links.length,
    topologyZoneCount: model.topology.zones.length,
    diagramIntentCount: model.diagramIntents.length,
    sourceReferenceCount: model.sourceReferences.length,
    validationFindingCount: model.validationFindings.length,
  };
}

/** Bounded id/severity/category/message (+ action) only; no raw refs/body. */
function summarizeFinding(
  finding: RfpHldDesignModelReviewFinding
): RfpHldDesignModelRebuildReviewFindingSummary {
  return {
    id: finding.id,
    severity: finding.severity,
    category: finding.category,
    message: bound(finding.message, FINDING_MESSAGE_MAX),
    ...(typeof finding.recommendedAction === "string" &&
    finding.recommendedAction.trim() !== ""
      ? { recommendedAction: bound(finding.recommendedAction, FINDING_ACTION_MAX) }
      : {}),
  };
}

/**
 * Build the bounded rebuild drafting context and attach it to a fresh copy of
 * the base candidate input. Pure: validates each artifact payload against its
 * contract, fail-closes on any source model/review/bundle mismatch or on a
 * review that does not justify a rebuild, and carries only sanitized summaries.
 * Returns stable blocked/invalid statuses; throws ONLY on programmer misuse
 * (wrong base payloadKind or a missing artifact object). No DB/file/network/AI
 * work; persists nothing.
 */
export function buildRfpHldDesignModelRebuildCandidateInput(
  input: BuildRfpHldDesignModelRebuildCandidateInputInput
): BuildRfpHldDesignModelRebuildCandidateInputResult {
  const base = input.baseCandidateInput;
  if (
    !isObject(base) ||
    base.payloadKind !== RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND
  ) {
    throw new Error(
      "baseCandidateInput must be an rfp_hld_design_model_candidate_input bundle."
    );
  }
  const modelArtifact = input.sourceModelArtifact;
  const reviewArtifact = input.sourceReviewArtifact;
  const requestArtifact = input.rebuildRequestArtifact;
  if (!isObject(modelArtifact)) throw new Error("sourceModelArtifact is required.");
  if (!isObject(reviewArtifact)) throw new Error("sourceReviewArtifact is required.");
  if (!isObject(requestArtifact)) throw new Error("rebuildRequestArtifact is required.");

  // Each artifact payload must satisfy its own fail-closed contract validator.
  const modelValidation = validateRfpHldDesignModelPayload(modelArtifact.payload);
  if (!modelValidation.valid) {
    return { status: "invalid_model_payload", errors: modelValidation.errors.slice() };
  }
  const reviewValidation = validateRfpHldDesignModelReviewPayload(reviewArtifact.payload);
  if (!reviewValidation.valid) {
    return { status: "invalid_review_payload", errors: reviewValidation.errors.slice() };
  }
  const requestValidation = validateRfpHldDesignModelRebuildRequestPayload(
    requestArtifact.payload
  );
  if (!requestValidation.valid) {
    return { status: "invalid_request_payload", errors: requestValidation.errors.slice() };
  }

  const model = modelArtifact.payload as unknown as RfpHldDesignModelPayload;
  const review = reviewArtifact.payload as unknown as RfpHldDesignModelReviewPayload;
  const request = requestArtifact.payload as unknown as RfpHldDesignModelRebuildRequestPayload;

  // The request must point at exactly these provided model + review artifacts.
  if (request.sourceHldDesignModelArtifactId !== modelArtifact.id) {
    return { status: "blocked", reason: "request_model_mismatch" };
  }
  if (request.sourceReviewArtifactId !== reviewArtifact.id) {
    return { status: "blocked", reason: "request_review_mismatch" };
  }
  // The review must be about this same model.
  if (review.sourceHldDesignModelArtifactId !== modelArtifact.id) {
    return { status: "blocked", reason: "review_model_mismatch" };
  }
  // Model and review must build on the SAME approved source bundle as the base.
  const baseBundleId = base.sourceHldSourceBundleArtifactId;
  if (model.sourceHldSourceBundleArtifactId !== baseBundleId) {
    return { status: "blocked", reason: "source_bundle_mismatch" };
  }
  if (review.sourceHldSourceBundleArtifactId !== baseBundleId) {
    return { status: "blocked", reason: "source_bundle_mismatch" };
  }
  // The advisory review must actually justify a redraft.
  const hasBlocking = review.findings.some((f) => f.severity === "blocking");
  const recommends =
    review.recommendation === "rebuild_recommended" ||
    review.recommendation === "reject_required";
  if (!hasBlocking && !recommends) {
    return { status: "blocked", reason: "review_does_not_justify_rebuild" };
  }

  const rebuildContext: RfpHldDesignModelRebuildDraftingContext = {
    sourceHldSourceBundleArtifactId: baseBundleId,
    rebuildRequestArtifactId: requestArtifact.id,
    sourceModelArtifactId: modelArtifact.id,
    sourceReviewArtifactId: reviewArtifact.id,
    priorModelSummary: summarizePriorModel(model),
    reviewRecommendation: review.recommendation,
    reviewFindingSummaries: review.findings.map(summarizeFinding),
    engineerReason: bound(request.reason, REASON_MAX),
    engineerInstructions: bound(request.instructions, INSTRUCTIONS_MAX),
    limitations: RFP_HLD_DESIGN_MODEL_REBUILD_DRAFTING_LIMITATIONS.slice(),
  };

  return { status: "ok", bundle: { ...cloneJson(base), rebuildContext } };
}
