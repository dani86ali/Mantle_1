/**
 * Quick BoM pricing service (thin lane wrapper).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Pins the shared BoQ pricing core to the Quick BoM lane: expectedMode "quick_bom".
 * Every gate (project not_found, mode gate, pricing_config_missing), the deterministic
 * price+persist delegation to createPricedBoqArtifact, the committed Honeywell MVP demo
 * fixture/authority wiring, the known-error translation, and the lean serializable
 * summaries (no priced lines, amounts, originalCells, evidence, or per-SKU price map)
 * all live in the core. This wrapper adds no behavior of its own and re-exports the
 * existing Quick BoM input/result/summary type names for route compatibility. It
 * surfaces no pricing authority of its own: the committed demo fixture is the only
 * unit-price source and carries TEMPORARY demo authority only - never production,
 * runtime AI, catalog, or replacement authority - and authorizes no silent SKU
 * substitution. configurationAuthority stays separate provenance only.
 */
import {
  createProjectBoqPricedBoq,
  type CreateProjectBoqPricedBoqRequest,
  type CreateProjectBoqPricedBoqCoreResult,
  type ProjectBoqPricingProjectSummary,
  type ProjectBoqPricingArtifactSummary,
  type ProjectBoqPricingSummary,
  type ProjectBoqPricingSourceSummary,
  type ProjectBoqPricingPayloadSummary,
} from "@/lib/projects/project-boq-pricing-core";

/** Input for {@link createProjectQuickBomPricedBoq}; expectedMode is pinned by this wrapper. */
export type CreateProjectQuickBomPricedBoqInput = CreateProjectBoqPricedBoqRequest;

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export type QuickBomPricingProjectSummary = ProjectBoqPricingProjectSummary;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export type QuickBomPricingArtifactSummary = ProjectBoqPricingArtifactSummary;

/** Deterministic priced-BoQ roll-up counts/totals (no per-line detail). */
export type QuickBomPricingSummary = ProjectBoqPricingSummary;

/** The pricing-source boundary block carried on the payload summary. */
export type QuickBomPricingSourceSummary = ProjectBoqPricingSourceSummary;

/**
 * Serializable priced-payload summary: provenance ids/versions, copied source file ids,
 * copied pricingConfig, the pricing-source boundary, the line count, and the pricing
 * summary. The full priced lines, amounts, and per-SKU price map are never surfaced.
 */
export type QuickBomPricingPayloadSummary = ProjectBoqPricingPayloadSummary;

/** Discriminated result of {@link createProjectQuickBomPricedBoq}. */
export type CreateProjectQuickBomPricedBoqResult = CreateProjectBoqPricedBoqCoreResult;

/**
 * Price one already-approved, reviewed Quick BoM `configuration_expansion` artifact
 * into a new `needs_review` `priced_boq` artifact. Thin wrapper: delegates every gate,
 * the deterministic price+persist, the demo fixture/authority wiring, and the lean
 * summaries to the shared BoQ pricing core, pinning expectedMode "quick_bom". Tenant
 * scoping, the pricing-authority separation, and the discriminated result are
 * unchanged from the core.
 */
export function createProjectQuickBomPricedBoq(
  input: CreateProjectQuickBomPricedBoqInput
): Promise<CreateProjectQuickBomPricedBoqResult> {
  return createProjectBoqPricedBoq({ ...input, expectedMode: "quick_bom" });
}
