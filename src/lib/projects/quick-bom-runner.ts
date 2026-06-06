/**
 * Quick BoM runner (Honeywell MVP). Pure and in-memory: it composes existing
 * approved-pack and pricing helpers only and adds no behavior of its own. It selects
 * the active Honeywell Batch 1 + Batch 2 + Batch 3 composed rule pack, builds the
 * deterministic configuration-expansion draft from already-normalized BoQ lines plus
 * human-accepted SKU resolution decisions, applies EXPLICIT engineer accept/reject
 * expansion-review decisions, and (in two narrow functions) prices the accepted
 * expanded BoM from the committed Honeywell demo pricing fixture using a
 * caller-supplied pricing config, then composes that priced draft into an in-memory
 * priced-BoQ payload and Mantle price-estimate export MODEL - writing no workbook and
 * creating no artifact, approval, or stage transition.
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
  getHoneywellDemoMantleCategoryByAcceptedSku,
  getHoneywellDemoPricingFixture,
  getHoneywellDemoUnitListPriceSarBySku,
  type HoneywellDemoPricingFixture,
} from "@/lib/projects/honeywell-demo-pricing-fixture";
import type { CanonicalBoqLine, ProjectPricingConfig, SkuResolutionDecision } from "@/types/project";
// Prompt 70 (Mantle export MODEL composition): the Mantle row-model builder maps an
// in-memory priced-BoQ payload to Mantle rows. The payload type is imported type-only, so
// no DB/artifact-store runtime dependency is pulled in. The Mantle workbook writer and the
// Mantle export-artifact service are deliberately NOT imported here.
import { buildMantlePriceEstimateModel, type MantlePriceEstimateModel } from "@/lib/projects/mantle-price-estimate-model";
import type { PricedBoqArtifactPayload } from "@/lib/projects/priced-boq-artifact";

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

/**
 * Input for {@link runHoneywellQuickBomDemoMantleExportModel}: everything
 * runHoneywellQuickBomDemoPricing needs, plus the priced-BoQ provenance the in-memory
 * payload records. The caller supplies these artifact ids/versions explicitly; the runner
 * reads no artifact store, DB, or persistence layer to discover them and creates no artifact.
 */
export interface HoneywellQuickBomDemoMantleExportModelInput extends HoneywellQuickBomDemoPricingInput {
  sourceConfigurationExpansionArtifactId: string;
  sourceConfigurationExpansionArtifactVersion: number;
  sourceNormalizedBoqArtifactId: string;
  sourceNormalizedBoqArtifactVersion: number;
  sourceSkuResolutionArtifactId: string;
  sourceSkuResolutionArtifactVersion: number;
}

/**
 * Mantle export-model result: the demo-priced-run result plus the in-memory priced-BoQ
 * payload the Mantle mapper consumed and the resulting Mantle price-estimate model. No
 * workbook, priced_boq/export_package artifact, approval, or stage transition is produced.
 */
export interface HoneywellQuickBomDemoMantleExportModelResult extends HoneywellQuickBomDemoPricingResult {
  pricedBoqPayload: PricedBoqArtifactPayload;
  mantleModel: MantlePriceEstimateModel;
}

/** Stable, de-duplicated source file ids in first-seen order over the normalized input lines. */
function deriveSourceFileIds(lines: readonly CanonicalBoqLine[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const line of lines) {
    if (seen.has(line.sourceFileId)) continue;
    seen.add(line.sourceFileId);
    ordered.push(line.sourceFileId);
  }
  return ordered;
}

/** Only the demo SAR price entries actually applied to priced lines, each freshly copied. */
function usedDemoSarPrices(pricedBoq: PricedBoqDraft): PricedBoqArtifactPayload["unitListPriceSarBySku"] {
  const fixturePrices = getHoneywellDemoUnitListPriceSarBySku();
  const used: PricedBoqArtifactPayload["unitListPriceSarBySku"] = {};
  for (const line of pricedBoq.lines) {
    if (line.status !== "priced" || line.acceptedSku === undefined) continue;
    if (used[line.acceptedSku] === undefined) used[line.acceptedSku] = { ...fixturePrices[line.acceptedSku] };
  }
  return used;
}

/**
 * Build the in-memory PricedBoqArtifactPayload the Mantle mapper consumes, WITHOUT
 * persisting or reading any artifact: caller-supplied provenance, first-seen source file
 * ids, the used demo SAR prices, and fresh copies of the priced draft's lines and summary
 * (so the returned priced draft is never mutated). Mirrors the persisted payload shape.
 */
function buildHoneywellQuickBomDemoPricedBoqPayload(
  input: HoneywellQuickBomDemoMantleExportModelInput,
  pricedBoq: PricedBoqDraft
): PricedBoqArtifactPayload {
  return {
    sourceConfigurationExpansionArtifactId: input.sourceConfigurationExpansionArtifactId,
    sourceConfigurationExpansionArtifactVersion: input.sourceConfigurationExpansionArtifactVersion,
    sourceNormalizedBoqArtifactId: input.sourceNormalizedBoqArtifactId,
    sourceNormalizedBoqArtifactVersion: input.sourceNormalizedBoqArtifactVersion,
    sourceSkuResolutionArtifactId: input.sourceSkuResolutionArtifactId,
    sourceSkuResolutionArtifactVersion: input.sourceSkuResolutionArtifactVersion,
    sourceFileIds: deriveSourceFileIds(input.lines),
    pricingConfig: { ...input.pricingConfig },
    unitListPriceSarBySku: usedDemoSarPrices(pricedBoq),
    lineCount: pricedBoq.lines.length,
    lines: pricedBoq.lines.map((line) => ({
      ...line,
      originalCells: { ...line.originalCells },
      ...(line.amounts !== undefined ? { amounts: { ...line.amounts } } : {}),
    })),
    summary: { ...pricedBoq.summary, totals: { ...pricedBoq.summary.totals } },
  };
}

/**
 * Compose the Mantle price-estimate export MODEL for the Honeywell Quick BoM demo. Prices
 * first via runHoneywellQuickBomDemoPricing, so its explicit expansion-review guard and
 * deterministic pricing still gate everything before any model exists. Then builds an
 * in-memory priced-BoQ payload (caller-supplied provenance; no artifact created, persisted,
 * or read) and maps it to the Mantle model with the committed demo category map.
 *
 * In-memory only: writes NO workbook; creates NO priced_boq or export_package artifact, NO
 * approval, and NO stage transition; does NO DB/artifact-store, catalog lookup, AI,
 * replacement, or SKU substitution. Export-artifact creation stays gated by Pricing Review
 * approval elsewhere. Returns fresh objects and never mutates inputs or the priced draft.
 */
export function runHoneywellQuickBomDemoMantleExportModel(
  input: HoneywellQuickBomDemoMantleExportModelInput
): HoneywellQuickBomDemoMantleExportModelResult {
  const priced = runHoneywellQuickBomDemoPricing(input);
  const pricedBoqPayload = buildHoneywellQuickBomDemoPricedBoqPayload(input, priced.pricedBoq);
  const mantleModel = buildMantlePriceEstimateModel({
    payload: pricedBoqPayload,
    categoryByAcceptedSku: getHoneywellDemoMantleCategoryByAcceptedSku(),
  });
  return { ...priced, pricedBoqPayload, mantleModel };
}
