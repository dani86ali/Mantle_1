/**
 * RFP BoQ configuration-expansion REVIEW service: the RFP lane wrapper over the
 * shared, mode-gated review core. It applies EXPLICIT per-line human accept/reject
 * decisions to one already-persisted `configuration_expansion` DRAFT artifact and
 * persists the reviewed/accepted expansion as a new, non-draft
 * `configuration_expansion` artifact. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 11, 11A).
 *
 * All deterministic work - project/draft verification, the exact draft artifact gates,
 * draft-payload parsing, delegation to the existing reviewed-expansion service, known
 * error translation, and the lean serializable summaries - lives in
 * project-boq-config-expansion-review-core. This wrapper only pins the lane's
 * `expectedMode` to "rfp" and re-exports the lane's compatible input/result/summary
 * type names (and the decision contract) so callers (the RFP route) keep a stable
 * surface. A non-rfp project therefore returns the same lean `wrong_mode` summary and
 * writes nothing. It imports the shared core only and adds no stores, the
 * config-expansion artifact writer, config review helper, pricing, export, runner, AI/
 * LLM, catalog, engine, coordinator, adapter, or package dependency of its own.
 */
import {
  reviewProjectBoqConfigurationExpansionDraftCore,
  type ReviewProjectBoqConfigurationExpansionDraftInput,
  type ReviewProjectBoqConfigurationExpansionDraftResult,
  type ProjectBoqConfigExpansionReviewProjectSummary,
  type ProjectBoqConfigExpansionReviewArtifactSummary,
  type ProjectBoqConfigExpansionReviewPayloadSummary,
  type ProjectBoqConfigExpansionReviewSummary,
} from "@/lib/projects/project-boq-config-expansion-review-core";

// The decision contract is re-exported from the core so the POST route can stay
// import-pure (Next.js primitives + requireAuth + this wrapper only) while still typing a body.
export type { ConfigurationExpansionReviewDecision } from "@/lib/projects/project-boq-config-expansion-review-core";

/**
 * Input for {@link reviewProjectRfpConfigurationExpansionDraft}: the core input minus
 * the lane mode, which this wrapper supplies as "rfp".
 */
export type ReviewProjectRfpConfigurationExpansionDraftInput = Omit<
  ReviewProjectBoqConfigurationExpansionDraftInput,
  "expectedMode"
>;

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export type RfpConfigExpansionReviewProjectSummary =
  ProjectBoqConfigExpansionReviewProjectSummary;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export type RfpConfigExpansionReviewArtifactSummary =
  ProjectBoqConfigExpansionReviewArtifactSummary;

/** Serializable reviewed-payload summary: provenance ids/versions, rule-pack metadata, counts; never the lines. */
export type RfpConfigExpansionReviewPayloadSummary =
  ProjectBoqConfigExpansionReviewPayloadSummary;

/** Deterministic review roll-up counts surfaced to the caller. */
export type RfpConfigExpansionReviewSummary =
  ProjectBoqConfigExpansionReviewSummary;

/** Discriminated result of {@link reviewProjectRfpConfigurationExpansionDraft}. */
export type ReviewProjectRfpConfigurationExpansionDraftResult =
  ReviewProjectBoqConfigurationExpansionDraftResult;

/**
 * Review one persisted RFP configuration_expansion DRAFT artifact by delegating to the
 * shared review core with the RFP `expectedMode`. Behavior, status order, delegation
 * args, lean summaries, and immutability are exactly the core's; only non-rfp projects
 * diverge, returning the lean `wrong_mode` summary without any write.
 */
export async function reviewProjectRfpConfigurationExpansionDraft(
  input: ReviewProjectRfpConfigurationExpansionDraftInput
): Promise<ReviewProjectRfpConfigurationExpansionDraftResult> {
  return reviewProjectBoqConfigurationExpansionDraftCore({
    ...input,
    expectedMode: "rfp",
  });
}
