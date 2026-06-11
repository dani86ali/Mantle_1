/**
 * Evidence: the pure deferred/non-priced SKU review set identifies exactly the 13
 * deferred original customer SKUs, exposes a safe reject/defer recommendation
 * (action/reasonCode/note) for them, exposes NO replacement/current/substitute SKU
 * mapping, and uses GENERIC authority-pack wording (no vendor/product-family/estimate
 * id). Pure helper: zero imports, ASCII-only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFERRED_REVIEW_NOTE,
  DEFERRED_REVIEW_REASON_CODE,
  getDeferredSkuReviewGuidance,
  isDeferredReviewSku,
  listDeferredReviewSkus,
} from "@/lib/projects/sku-deferred-review-set";

const SRC_PATH = join(process.cwd(), "src/lib/projects/sku-deferred-review-set.ts");
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/sku-deferred-review-set.test.ts"
);

// The 13 deferred/non-priced original customer SKUs.
const DEFERRED_SKUS = [
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
] as const;

// Priced authority-pack customer SKUs that must stay eligible (not deferred).
const ELIGIBLE_SKUS = [
  "C9300X-48HX-A",
  "C9300L-24P-4X-A",
  "CW9178I-CFG",
  "CP-7841-K9=",
  "SFP-10G-LR-S=",
  "C9300-NW-A-48",
  "PWR-C1-1100WAC-P",
] as const;

// Current replacement SKUs that must NEVER appear anywhere in this helper: no
// replacement mapping is exposed here.
const FORBIDDEN_CURRENT_SKUS = [
  "C9300-DNA-A-48-3Y",
  "C9300L-DNA-A-24-3Y",
  "SC9300UK9-1715",
  "S9300LUK9-1718",
  "D-DNAS-EXT-S-T",
  "D-DNAS-EXT-S-3Y",
  "CON-L1NCD-C9300XY4",
  "CON-L1SWT-C93A48",
  "CON-L1NCD-C93024PX",
  "CON-L1SWT-C93LA24",
  "CON-L1NBD-P7PK94P1",
  "C9300L-STACK-KIT2",
  "C9300L-STACK-A",
  "STACK-T3A-50CM",
] as const;

describe("sku-deferred-review-set - deferred set membership", () => {
  it("lists exactly the 13 deferred SKUs, in order, with no duplicates", () => {
    const listed = listDeferredReviewSkus();
    expect(listed).toEqual([...DEFERRED_SKUS]);
    expect(listed).toHaveLength(13);
    expect(new Set(listed).size).toBe(13);
  });

  it("returns a fresh copy each call (mutating the result does not affect the set)", () => {
    const first = listDeferredReviewSkus();
    first.push("MUTATION");
    expect(listDeferredReviewSkus()).toEqual([...DEFERRED_SKUS]);
  });

  it("identifies every deferred SKU (case- and whitespace-insensitive)", () => {
    for (const sku of DEFERRED_SKUS) {
      expect(isDeferredReviewSku(sku), sku).toBe(true);
      expect(isDeferredReviewSku(`  ${sku.toLowerCase()}  `), sku).toBe(true);
    }
  });

  it("does not flag priced eligible SKUs", () => {
    for (const sku of ELIGIBLE_SKUS) {
      expect(isDeferredReviewSku(sku), sku).toBe(false);
    }
  });

  it("does not flag any current replacement SKU", () => {
    for (const sku of FORBIDDEN_CURRENT_SKUS) {
      expect(isDeferredReviewSku(sku), sku).toBe(false);
    }
  });
});

describe("sku-deferred-review-set - recommendation shape", () => {
  it("returns a reject/defer recommendation for every deferred SKU", () => {
    for (const sku of DEFERRED_SKUS) {
      const guidance = getDeferredSkuReviewGuidance(sku);
      expect(guidance, sku).not.toBeNull();
      expect(guidance).toEqual({
        action: "reject",
        reasonCode: DEFERRED_REVIEW_REASON_CODE,
        note: DEFERRED_REVIEW_NOTE,
      });
    }
  });

  it("returns null for eligible SKUs", () => {
    for (const sku of ELIGIBLE_SKUS) {
      expect(getDeferredSkuReviewGuidance(sku), sku).toBeNull();
    }
  });

  it("exposes ONLY action/reasonCode/note - no replacement/current/substitute key", () => {
    const guidance = getDeferredSkuReviewGuidance("SC9300UK9-1712");
    expect(guidance).not.toBeNull();
    expect(Object.keys(guidance ?? {}).sort()).toEqual(
      ["action", "note", "reasonCode"].sort()
    );
    for (const forbidden of [
      "replacement",
      "replacementSku",
      "replacementFor",
      "currentSku",
      "substitutedSku",
      "substitution",
      "acceptedSku",
      "price",
      "unitPrice",
    ]) {
      expect(forbidden in (guidance ?? {}), forbidden).toBe(false);
    }
  });

  it("uses a generic reason code and note that name no current/replacement SKU and no price", () => {
    expect(DEFERRED_REVIEW_REASON_CODE).toBe("authority_pack_non_priced_defer");
    const text = `${DEFERRED_REVIEW_REASON_CODE} ${DEFERRED_REVIEW_NOTE}`;
    for (const sku of FORBIDDEN_CURRENT_SKUS) {
      expect(text.includes(sku), sku).toBe(false);
    }
  });
});

describe("sku-deferred-review-set - source purity", () => {
  const source = readFileSync(SRC_PATH, "utf8");

  it("names no current replacement SKU anywhere in the source (no mapping)", () => {
    for (const sku of FORBIDDEN_CURRENT_SKUS) {
      expect(source.includes(sku), sku).toBe(false);
    }
  });

  it("uses generic wording: no vendor/product-family/estimate id in the source", () => {
    for (const forbidden of ["Honeywell", "honeywell", "NB167337", "nb167337"]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
  });

  it("imports nothing (zero import/from statements), so it pulls in no DB/catalog/pricing/AI module", () => {
    expect(/\bfrom\s+["']/.test(source)).toBe(false);
    expect(/^\s*import\b/m.test(source)).toBe(false);
  });

  it("keeps the source and test files ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(readFileSync(TEST_PATH, "utf8"))).toBe(false);
  });
});
