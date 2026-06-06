/**
 * Quick BoM runner (Honeywell MVP). Pure and in-memory: it composes existing
 * approved-pack and pricing helpers only and adds no behavior of its own. It selects
 * the active Honeywell Batch 1 + Batch 2 + Batch 3 composed rule pack, builds the
 * deterministic configuration-expansion draft from already-normalized BoQ lines plus
 * human-accepted SKU resolution decisions, applies EXPLICIT engineer accept/reject
 * expansion-review decisions, and (in one narrow function) prices the accepted
 * expanded BoM from the committed Honeywell demo pricing fixture using a
 * caller-supplied pricing config.
 *
 * Authority stays split (section 11A.1): configuration authority comes ONLY from the
 * approved rule pack plus explicit engineer review; pricing authority comes ONLY from
 * the committed demo fixture, with the pricing config supplied by the caller (never
 * invented here). The demo fixture is demo authority only - not production Cisco
 * pricing, not broad Cisco-general pricing, not runtime AI pricing, not runtime
 * catalog lookup, not replacement authority, and it authorizes no silent SKU
 * substitution.
 *
 * Nothing is auto-accepted (each expansion line needs an explicit caller decision,
 * enforced by applyConfigurationExpansionReview before any pricing); it generates no
 * SKU decisions, looks nothing up, calls no AI, substitutes no SKU, reads no
 * GPL/CSV/workbook at runtime, and exports/persists/approves nothing. Batch 4 is not
 * runtime expansion authority and is never referenced here. Returns fresh objects and
 * never mutates inputs. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 11A.1).
 */
import { getHoneywellMvpConfigExpansionRulePack } from "@/lib/projects/honeywell-config-expansion-rule-pack";
import { buildConfigurationExpansionDraft, type ConfigurationExpansionDraft } from "@/lib/projects/config-expansion";
import {
  applyConfigurationExpansionReview,
  type ConfigurationExpansionReviewDecision,
  type ConfigurationExpansionReviewResult,
} from "@/lib/projects/config-expansion-review";
import type { ConfigExpansionRulePack, ConfigExpansionRulePackStatus } from "@/lib/projects/config-expansion-types";
import { buildPricedExpandedBoqDraft, type PricedBoqDraft } from "@/lib/projects/priced-boq";
import {
  getHoneywellDemoPricingFixture,
  getHoneywellDemoUnitListPriceSarBySku,
  type HoneywellDemoPricingFixture,
} from "@/lib/projects/honeywell-demo-pricing-fixture";
import type { CanonicalBoqLine, ProjectPricingConfig, SkuResolutionDecision } from "@/types/project";

/**
 * Scalar metadata of the rule pack the runner used: identity and approval state
 * only, never the rules themselves and never any pricing field. Echoed so a caller
 * can record which approved pack drove the expansion without re-deriving it.
 */
export interface HoneywellQuickBomConfigExpansionRulePackMeta {
  rulePackId: string;
  name: string;
  version: string;
  status: ConfigExpansionRulePackStatus;
  sourceScope: string;
}

/** Input for {@link buildHoneywellQuickBomConfigurationExpansionDraft}. Read-only. */
export interface HoneywellQuickBomConfigurationExpansionDraftInput {
  /** Already-normalized customer BoQ lines, in customer order. */
  lines: readonly CanonicalBoqLine[];
  /** Human-reviewed/accepted SKU resolution decisions; the runner never creates these. */
  skuDecisions: readonly SkuResolutionDecision[];
  /** Optional approved rule-pack override for tests/internals; defaults to the active Honeywell selector. */
  rulePack?: ConfigExpansionRulePack;
}

/** Draft-only runner result: the rule-pack metadata plus the configuration-expansion draft. */
export interface HoneywellQuickBomConfigurationExpansionDraftResult {
  rulePack: HoneywellQuickBomConfigExpansionRulePackMeta;
  draft: ConfigurationExpansionDraft;
}

/** Input for {@link runHoneywellQuickBomConfigurationExpansionReview}. Read-only. */
export interface HoneywellQuickBomConfigurationExpansionReviewInput
  extends HoneywellQuickBomConfigurationExpansionDraftInput {
  /** Explicit engineer accept/reject decisions over the draft's expansion lines. */
  reviewDecisions: readonly ConfigurationExpansionReviewDecision[];
  /** Optional reviewer identity, echoed only when supplied. */
  reviewedBy?: string;
  /** Optional review timestamp; supplied by the caller (never generated here). */
  reviewedAt?: string;
}

/** Reviewed-run result: rule-pack metadata, the draft, and the applied review result. */
export interface HoneywellQuickBomConfigurationExpansionReviewResult {
  rulePack: HoneywellQuickBomConfigExpansionRulePackMeta;
  draft: ConfigurationExpansionDraft;
  review: ConfigurationExpansionReviewResult;
}

/** Extract the rule pack's scalar metadata into a fresh object (no rules, no pricing). */
function toRulePackMeta(pack: ConfigExpansionRulePack): HoneywellQuickBomConfigExpansionRulePackMeta {
  return {
    rulePackId: pack.rulePackId,
    name: pack.name,
    version: pack.version,
    status: pack.status,
    sourceScope: pack.sourceScope,
  };
}

/**
 * Build the Honeywell Quick BoM configuration-expansion draft from normalized BoQ
 * lines and accepted SKU resolution decisions, using the active composed Honeywell
 * Batch 1 + Batch 2 + Batch 3 approved pack by default. Pure pass-through to
 * buildConfigurationExpansionDraft; adds no SKU decisions and auto-accepts nothing.
 */
export function buildHoneywellQuickBomConfigurationExpansionDraft(
  input: HoneywellQuickBomConfigurationExpansionDraftInput
): HoneywellQuickBomConfigurationExpansionDraftResult {
  const rulePack = input.rulePack ?? getHoneywellMvpConfigExpansionRulePack();
  const draft = buildConfigurationExpansionDraft({
    lines: input.lines,
    decisions: input.skuDecisions,
    rulePack,
  });
  return { rulePack: toRulePackMeta(rulePack), draft };
}

/**
 * Build the Honeywell Quick BoM configuration-expansion draft, then apply the
 * caller's EXPLICIT expansion-review decisions to it. The explicit-decision
 * requirement (nothing auto-accepted) is enforced by applyConfigurationExpansion
 * Review, not re-implemented here. Reviewer metadata is preserved only when supplied.
 */
export function runHoneywellQuickBomConfigurationExpansionReview(
  input: HoneywellQuickBomConfigurationExpansionReviewInput
): HoneywellQuickBomConfigurationExpansionReviewResult {
  const { rulePack, draft } = buildHoneywellQuickBomConfigurationExpansionDraft({
    lines: input.lines,
    skuDecisions: input.skuDecisions,
    rulePack: input.rulePack,
  });
  const review = applyConfigurationExpansionReview({
    lines: draft.lines,
    decisions: input.reviewDecisions,
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt,
  });
  return { rulePack, draft, review };
}

/** Input for {@link runHoneywellQuickBomDemoPricing}. Read-only; the reviewed-run input plus a pricing config. */
export interface HoneywellQuickBomDemoPricingInput
  extends HoneywellQuickBomConfigurationExpansionReviewInput {
  /** Caller-supplied pricing config. The runner never invents or sources pricing config. */
  pricingConfig: ProjectPricingConfig;
}

/**
 * Small, copyable view of the committed Honeywell demo pricing fixture: identity,
 * scope/status, currency, SKU count, source evidence, standalone optics, and the
 * authority-boundary booleans. Omits the per-SKU price map, price-evidence map,
 * category map, and limitations notes - it records which demo fixture priced the BoM,
 * never the prices themselves.
 */
export type HoneywellQuickBomDemoPricingFixtureMeta = Omit<
  HoneywellDemoPricingFixture,
  "unitListPriceSarBySku" | "priceSourceEvidenceBySku" | "categoryByAcceptedSku" | "knownLimitations"
>;

/** Priced-run result: rule-pack metadata, the draft, the review result, the priced BoM, and demo-fixture metadata. */
export interface HoneywellQuickBomDemoPricingResult {
  rulePack: HoneywellQuickBomConfigExpansionRulePackMeta;
  draft: ConfigurationExpansionDraft;
  review: ConfigurationExpansionReviewResult;
  pricedBoq: PricedBoqDraft;
  pricingFixture: HoneywellQuickBomDemoPricingFixtureMeta;
}

/**
 * Run the configuration-expansion review, then price the accepted expanded BoM from the
 * committed Honeywell demo fixture. Review runs first, so its explicit-decision guard
 * still gates pricing. Pricing consumes review.acceptedLines, the caller's pricingConfig,
 * and the fixture's per-SKU SAR list prices only - no catalog lookup, AI, substitution,
 * replacement, persistence, or export. Returns rule-pack metadata, draft, review, the
 * priced BoM, and small demo-fixture metadata (the price/evidence/category maps are
 * dropped). Pure; never mutates inputs.
 */
export function runHoneywellQuickBomDemoPricing(
  input: HoneywellQuickBomDemoPricingInput
): HoneywellQuickBomDemoPricingResult {
  const { rulePack, draft, review } = runHoneywellQuickBomConfigurationExpansionReview(input);
  const pricedBoq = buildPricedExpandedBoqDraft({
    acceptedLines: review.acceptedLines,
    pricingConfig: input.pricingConfig,
    unitListPriceSarBySku: getHoneywellDemoUnitListPriceSarBySku(),
  });
  // Keep small metadata only; drop the large per-SKU price/evidence/category maps and notes.
  const {
    unitListPriceSarBySku: _prices,
    priceSourceEvidenceBySku: _priceEvidence,
    categoryByAcceptedSku: _categories,
    knownLimitations: _limitations,
    ...pricingFixture
  } = getHoneywellDemoPricingFixture();
  return { rulePack, draft, review, pricedBoq, pricingFixture };
}
