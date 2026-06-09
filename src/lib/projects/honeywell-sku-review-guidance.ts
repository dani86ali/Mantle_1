/**
 * Pure Honeywell NB167337 SKU review guidance (Prompt 153): identify the original
 * customer SKUs that must be explicitly rejected/deferred (NOT batch-accepted)
 * before configuration expansion and pricing, for the
 * Estimate_NB167337237YA.xlsx demo scope.
 *
 * This is a deterministic allowlist of ORIGINAL customer SKUs plus a safe review
 * note for explicit reject/defer actions. It exposes NO replacement/current SKU
 * mapping, NO substitution, NO pricing, NO catalog lookup, and NO configuration-
 * expansion authority: it only tells the read model which `needs_review` lines
 * should carry a reject/defer recommendation so the engineer can act explicitly.
 * Nothing here is auto-rejected, priced, or substituted. The module imports nothing
 * (no DB, API/UI, pricing, catalog, config-expansion runtime, export, runner,
 * adapters, engines, coordinator, AI, or network) and is ASCII-only.
 */

/** Reason code stamped on a guided reject/defer recommendation. */
export const HONEYWELL_DEFERRED_REVIEW_REASON_CODE =
  "honeywell_nb167337_non_benchmark_defer";

/** Safe, human-readable note explaining why a line is excluded from batch accept. */
export const HONEYWELL_DEFERRED_REVIEW_NOTE =
  "Defer: not a benchmark-priced Honeywell NB167337 customer row; reject before pricing/export.";

/**
 * Original customer SKUs that must NOT be eligible for the same-SKU batch accept in
 * the Honeywell NB167337 demo. These are deferred/non-benchmark rows the engineer
 * must explicitly reject/defer. This is NOT a replacement map: no current/replacement
 * SKU is named, and nothing here authorizes substitution or pricing.
 */
const HONEYWELL_DEFERRED_REVIEW_SKUS: readonly string[] = [
  "C9300-DNX-A-48-3Y",
  "C9300L-DNX-A-24-3Y",
  "SC9300UK9-1712",
  "S9300LUK9-1712",
  "SPACES-EXT-S",
  "CON-L1NBX-C9300XY4",
  "CON-L1SWX-93XA48MY",
  "CON-L1NBX-C93024PX",
  "CON-L1SWX-3LXA24MY",
  "CON-SNT-P7PK94P1",
  "C9300L-STACK-BLANK",
  "SVS-DNXS-CATSUBEM",
  "SVS-DNXD-CATHWEM",
];

/** Case/whitespace-insensitive membership index over the deferred SKUs. */
const DEFERRED_REVIEW_SKU_SET: ReadonlySet<string> = new Set(
  HONEYWELL_DEFERRED_REVIEW_SKUS.map((sku) => sku.trim().toUpperCase())
);

/**
 * Reject/defer recommendation stamped on a guided review line. Carries only a
 * reject action, a reason code, and a safe note - never a replacement/current/
 * substitute SKU, price, or path.
 */
export interface HoneywellSkuReviewGuidance {
  action: "reject";
  reasonCode: string;
  note: string;
}

/** Normalize an original SKU for case/whitespace-insensitive membership checks. */
function normalizeSku(originalSku: string): string {
  return originalSku.trim().toUpperCase();
}

/** True when an original customer SKU is in the Honeywell deferred/defer set. */
export function isHoneywellDeferredReviewSku(originalSku: string): boolean {
  return DEFERRED_REVIEW_SKU_SET.has(normalizeSku(originalSku));
}

/**
 * The reject/defer recommendation for an original customer SKU, or null when the SKU
 * is not deferred. The returned object is fresh and carries only action/reasonCode/
 * note: it never names a replacement, current, or substitute SKU.
 */
export function getHoneywellSkuReviewGuidance(
  originalSku: string
): HoneywellSkuReviewGuidance | null {
  if (!isHoneywellDeferredReviewSku(originalSku)) return null;
  return {
    action: "reject",
    reasonCode: HONEYWELL_DEFERRED_REVIEW_REASON_CODE,
    note: HONEYWELL_DEFERRED_REVIEW_NOTE,
  };
}

/** A fresh copy of the deferred SKU list for count proofs/tests; never the live set. */
export function listHoneywellDeferredReviewSkus(): string[] {
  return [...HONEYWELL_DEFERRED_REVIEW_SKUS];
}
