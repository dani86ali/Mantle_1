/**
 * Pure DISPLAY-ONLY guidance for deferred/non-priced customer SKUs that have a known
 * related configured item. This module exists ONLY to make the SKU review screen
 * honest: it tells the engineer that an excluded customer BoQ row is NOT silently
 * replaced, and that a related configured item may legitimately appear later - but
 * only as an approved configuration-expansion child under an accepted parent.
 *
 * This is NOT a replacement map and carries NO authority. It never decides anything,
 * never prices, never substitutes, and never feeds configuration expansion. The
 * original customer row stays deferred/excluded before pricing (see
 * sku-deferred-review-set). The related configured item is governed exclusively by the
 * existing configuration-expansion review/approval stage; nothing here can add, price,
 * or accept it. The values are demo authority-pack fixture data.
 *
 * The module imports nothing (no DB, catalog, pricing, configuration expansion, export,
 * runner, adapters, engines, coordinator, AI, or network) and is ASCII-only.
 */

/**
 * One display-only relationship: a deferred customer SKU's related configured item and
 * the parent SKU under which that item may appear, IF the configuration-expansion stage
 * approves it. Carries no price, no action/decision, and no authority flag.
 */
export interface RelatedConfiguredItemDisplay {
  parentSku: string;
  relatedConfiguredSku: string;
}

/**
 * Original deferred customer SKU -> its known related configured item(s). Display-only.
 * The key is the customer's original SKU (deferred/excluded before pricing); the value
 * names the related configured item that may later appear as an approved configuration
 * child under the given parent. This is guidance, not substitution authority.
 */
const RELATED_CONFIGURED_DISPLAY: Readonly<
  Record<string, readonly RelatedConfiguredItemDisplay[]>
> = {
  // Deferred historical rows under parent C9300X-48HX-A.
  "CON-L1NBX-C9300XY4": [
    { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "CON-L1NCD-C9300XY4" },
  ],
  "C9300-DNX-A-48-3Y": [
    { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "C9300-DNA-A-48-3Y" },
  ],
  "SC9300UK9-1712": [
    { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "SC9300UK9-1715" },
  ],
  "CON-L1SWX-93XA48MY": [
    { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "CON-L1SWT-C93A48" },
  ],
  // Deferred historical rows under parent C9300L-24P-4X-A.
  "C9300L-DNX-A-24-3Y": [
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "C9300L-DNA-A-24-3Y" },
  ],
  "S9300LUK9-1712": [
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "S9300LUK9-1718" },
  ],
  "CON-L1NBX-C93024PX": [
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "CON-L1NCD-C93024PX" },
  ],
  "CON-L1SWX-3LXA24MY": [
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "CON-L1SWT-C93LA24" },
  ],
  // Deferred historical row under parent CP-7841-K9=.
  "CON-SNT-P7PK94P1": [
    { parentSku: "CP-7841-K9=", relatedConfiguredSku: "CON-L1NBD-P7PK94P1" },
  ],
  // Deferred stack blank: three related configured items under parent C9300L-24P-4X-A.
  "C9300L-STACK-BLANK": [
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "C9300L-STACK-KIT2" },
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "C9300L-STACK-A" },
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "STACK-T3A-50CM" },
  ],
  // Deferred DNA Spaces row: two related configured items, each under both parents.
  "SPACES-EXT-S": [
    { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "D-DNAS-EXT-S-T" },
    { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "D-DNAS-EXT-S-3Y" },
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "D-DNAS-EXT-S-T" },
    { parentSku: "C9300L-24P-4X-A", relatedConfiguredSku: "D-DNAS-EXT-S-3Y" },
  ],
};

/** Normalize an original SKU for case/whitespace-insensitive lookup. */
function normalizeSku(originalSku: string): string {
  return originalSku.trim().toUpperCase();
}

/**
 * The display-only related configured item(s) for an original customer SKU, or an empty
 * array when none are known. Each entry is a fresh copy carrying only parentSku and
 * relatedConfiguredSku - never a price, action, decision, or authority flag. This is
 * guidance for the review screen, NOT a substitution: the original row stays deferred.
 */
export function getRelatedConfiguredItemsDisplay(
  originalSku: string
): RelatedConfiguredItemDisplay[] {
  const entries = RELATED_CONFIGURED_DISPLAY[normalizeSku(originalSku)];
  if (entries === undefined) return [];
  return entries.map((entry) => ({
    parentSku: entry.parentSku,
    relatedConfiguredSku: entry.relatedConfiguredSku,
  }));
}
