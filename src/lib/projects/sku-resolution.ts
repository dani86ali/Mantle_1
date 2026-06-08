/**
 * Pure Project-domain SKU resolution DRAFT helpers for SKU resolution steps 1
 * and 2 (exact catalog lookup, then normalized deterministic lookup).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (section 8).
 *
 * This module turns CanonicalBoqLine[] into human-reviewable
 * SkuResolutionDecision[]. Exact and normalized matches are SUGGESTIONS only:
 * every matched/ambiguous line is `needs_review`, never auto-accepted. It never
 * sets acceptedSku/decidedBy/decidedAt, creates no sku_resolution artifact, does
 * no pricing/fuzzy/AI matching, and touches no DB, artifact store, approvals,
 * staleness, engines, or API/UI. It composes only the deterministic catalog
 * lookup and never mutates its input lines or catalog index.
 */
import {
  lookupCatalogSku,
  getLocalMockCatalogLookupIndex,
  type CatalogLookupIndex,
  type CatalogLookupMatch,
  type CatalogLookupResult,
  type CatalogLookupSource,
} from "@/lib/projects/catalog-lookup";
import type {
  CanonicalBoqLine,
  SkuResolutionDecision,
  SkuResolutionSuggestion,
} from "@/types/project";

/** Every match is a suggestion: a human must approve it before pricing. */
const MATCH_RATIONALE_PREFIX = "catalog match. Human approval is required before this SKU is used for pricing.";

/** Deterministic per-line summary. acceptedCount/rejectedCount are always 0
 * because a draft only proposes; it never decides. */
export interface SkuResolutionDraftSummary {
  totalLines: number;
  needsReviewCount: number;
  unresolvedCount: number;
  /** Always 0 for a draft helper - no auto-accept. */
  acceptedCount: number;
  /** Always 0 for a draft helper - no auto-reject. */
  rejectedCount: number;
  /** Suggestions whose source is `exact`. */
  exactSuggestionCount: number;
  /** Suggestions whose source is `normalized` (includes ambiguous candidates). */
  normalizedSuggestionCount: number;
  /** Lines whose normalized lookup collided on multiple distinct SKUs. */
  ambiguousCount: number;
  /** Matched lines whose catalog entry has a zero/negative list price. */
  zeroPriceSuggestionCount: number;
  catalogSource: CatalogLookupSource;
}

/** The draft outcome: one decision per input line plus deterministic counts. */
export interface SkuResolutionDraft {
  decisions: SkuResolutionDecision[];
  summary: SkuResolutionDraftSummary;
}

/** Input for {@link buildSkuResolutionDraft}. */
export interface BuildSkuResolutionDraftInput {
  /** Customer BoQ lines; order and duplicates are preserved exactly. */
  lines: readonly CanonicalBoqLine[];
  /** Defaults to the committed local mock catalog when omitted. */
  catalogIndex?: CatalogLookupIndex;
}

/** A single suggestion from a confirmed catalog match, carrying its description. */
function matchedSuggestion(match: CatalogLookupMatch): SkuResolutionSuggestion {
  return {
    suggestedSku: match.catalogSku,
    description: match.description,
    source: match.source,
    rationale: `${match.source === "exact" ? "Exact" : "Normalized"} ${MATCH_RATIONALE_PREFIX}`,
  };
}

/**
 * One normalized suggestion per ambiguous candidate, in `candidateSkus` order.
 * No candidate is chosen; descriptions are unavailable for ambiguous results.
 */
function ambiguousSuggestions(candidateSkus: readonly string[]): SkuResolutionSuggestion[] {
  const rationale = `One of ${candidateSkus.length} normalized catalog candidates. Human selection is required; no candidate is auto-accepted.`;
  return candidateSkus.map((suggestedSku) => ({
    suggestedSku,
    source: "normalized" as const,
    rationale,
  }));
}

/**
 * Build a human-reviewable decision for one line from a precomputed lookup
 * result. Matched and ambiguous lines are `needs_review`; not_found is
 * `unresolved`. Never sets acceptedSku/decidedBy/decidedAt; source metadata is
 * copied from the line. Pure: returns a fresh object and fresh suggestion array.
 */
export function buildSkuResolutionDecisionForLine(
  line: CanonicalBoqLine,
  lookupResult: CatalogLookupResult
): SkuResolutionDecision {
  const base = {
    sourceFileId: line.sourceFileId,
    sourceRowNumber: line.sourceRowNumber,
    originalLineNumber: line.originalLineNumber,
    originalSku: line.sku,
  };

  if (lookupResult.status === "matched") {
    return {
      ...base,
      status: "needs_review",
      suggestions: [matchedSuggestion(lookupResult.match)],
    };
  }

  if (lookupResult.status === "ambiguous") {
    return {
      ...base,
      status: "needs_review",
      suggestions: ambiguousSuggestions(lookupResult.candidateSkus),
    };
  }

  return { ...base, status: "unresolved", suggestions: [] };
}

/**
 * Convert canonical BoQ lines into draft SKU resolution decisions plus a
 * deterministic summary. Looks each line up (exact, then normalized) against the
 * provided or local mock catalog, preserving input order and duplicates. Creates
 * no artifact, accepts no SKU, prices nothing, and does not mutate its input.
 */
export function buildSkuResolutionDraft(
  input: BuildSkuResolutionDraftInput
): SkuResolutionDraft {
  const decisions: SkuResolutionDecision[] = [];
  let needsReviewCount = 0;
  let unresolvedCount = 0;
  let exactSuggestionCount = 0;
  let normalizedSuggestionCount = 0;
  let ambiguousCount = 0;
  let zeroPriceSuggestionCount = 0;

  const index: CatalogLookupIndex =
    input.catalogIndex ?? getLocalMockCatalogLookupIndex();

  for (const line of input.lines) {
    const result = lookupCatalogSku(line.sku, index);
    const decision = buildSkuResolutionDecisionForLine(line, result);
    decisions.push(decision);

    if (decision.status === "needs_review") needsReviewCount++;
    else if (decision.status === "unresolved") unresolvedCount++;

    for (const suggestion of decision.suggestions) {
      if (suggestion.source === "exact") exactSuggestionCount++;
      else if (suggestion.source === "normalized") normalizedSuggestionCount++;
    }

    if (result.status === "ambiguous") ambiguousCount++;
    if (result.status === "matched" && !result.match.hasPositiveListPrice) {
      zeroPriceSuggestionCount++;
    }
  }

  const summary: SkuResolutionDraftSummary = {
    totalLines: decisions.length,
    needsReviewCount,
    unresolvedCount,
    acceptedCount: 0,
    rejectedCount: 0,
    exactSuggestionCount,
    normalizedSuggestionCount,
    ambiguousCount,
    zeroPriceSuggestionCount,
    catalogSource: index.catalogSource,
  };

  return { decisions, summary };
}
