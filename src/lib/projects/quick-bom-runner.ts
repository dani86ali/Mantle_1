/**
 * Quick BoM configuration-expansion runner skeleton (Honeywell MVP). Pure and
 * in-memory: it composes existing approved-pack helpers only and adds no behavior
 * of its own. It selects the active Honeywell Batch 1 + Batch 2 + Batch 3 composed
 * rule pack, builds the deterministic configuration-expansion draft from
 * already-normalized BoQ lines plus human-accepted SKU resolution decisions, and
 * applies EXPLICIT engineer accept/reject expansion-review decisions.
 *
 * It never generates or accepts SKU resolution decisions on its own, never
 * auto-accepts an expansion line (every expansion line still needs an explicit
 * caller decision, enforced by applyConfigurationExpansionReview), and carries no
 * pricing authority. It prices nothing, exports nothing, looks nothing up, calls no
 * AI, substitutes no SKU, persists no artifact, creates no approval, and marks
 * nothing approved at Project stage level. Batch 4 is not runtime expansion
 * authority and is intentionally never referenced here. Returns fresh objects from
 * the composed helpers and never mutates its inputs.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (section 11A.1).
 */
import { getHoneywellMvpConfigExpansionRulePack } from "@/lib/projects/honeywell-config-expansion-rule-pack";
import { buildConfigurationExpansionDraft, type ConfigurationExpansionDraft } from "@/lib/projects/config-expansion";
import {
  applyConfigurationExpansionReview,
  type ConfigurationExpansionReviewDecision,
  type ConfigurationExpansionReviewResult,
} from "@/lib/projects/config-expansion-review";
import type { ConfigExpansionRulePack, ConfigExpansionRulePackStatus } from "@/lib/projects/config-expansion-types";
import type { CanonicalBoqLine, SkuResolutionDecision } from "@/types/project";

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
