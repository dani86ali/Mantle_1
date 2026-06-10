/**
 * Evidence: the pure DISPLAY-ONLY related-configured helper maps the known deferred
 * Honeywell historical SKUs to their related configured item + parent, exposes ONLY
 * {parentSku, relatedConfiguredSku}, returns an empty array for eligible/unknown SKUs,
 * and never carries a price, action, decision, or authority flag. Pure helper: zero
 * imports, ASCII-only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getRelatedConfiguredItemsDisplay } from "@/lib/projects/sku-related-configured-display";

const SRC_PATH = join(process.cwd(), "src/lib/projects/sku-related-configured-display.ts");
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/sku-related-configured-display.test.ts"
);

// Original deferred SKU -> its full ordered list of {parentSku, relatedConfiguredSku}.
// Single- and multi-item cases (multiple related SKUs and/or multiple parents).
const KNOWN: Array<[string, Array<[string, string]>]> = [
  ["CON-L1NBX-C9300XY4", [["C9300X-48HX-A", "CON-L1NCD-C9300XY4"]]],
  ["C9300-DNX-A-48-3Y", [["C9300X-48HX-A", "C9300-DNA-A-48-3Y"]]],
  ["SC9300UK9-1712", [["C9300X-48HX-A", "SC9300UK9-1715"]]],
  ["CON-L1SWX-93XA48MY", [["C9300X-48HX-A", "CON-L1SWT-C93A48"]]],
  ["C9300L-DNX-A-24-3Y", [["C9300L-24P-4X-A", "C9300L-DNA-A-24-3Y"]]],
  ["S9300LUK9-1712", [["C9300L-24P-4X-A", "S9300LUK9-1718"]]],
  ["CON-L1NBX-C93024PX", [["C9300L-24P-4X-A", "CON-L1NCD-C93024PX"]]],
  ["CON-L1SWX-3LXA24MY", [["C9300L-24P-4X-A", "CON-L1SWT-C93LA24"]]],
  ["CON-SNT-P7PK94P1", [["CP-7841-K9=", "CON-L1NBD-P7PK94P1"]]],
  [
    "C9300L-STACK-BLANK",
    [
      ["C9300L-24P-4X-A", "C9300L-STACK-KIT2"],
      ["C9300L-24P-4X-A", "C9300L-STACK-A"],
      ["C9300L-24P-4X-A", "STACK-T3A-50CM"],
    ],
  ],
  [
    "SPACES-EXT-S",
    [
      ["C9300X-48HX-A", "D-DNAS-EXT-S-T"],
      ["C9300X-48HX-A", "D-DNAS-EXT-S-3Y"],
      ["C9300L-24P-4X-A", "D-DNAS-EXT-S-T"],
      ["C9300L-24P-4X-A", "D-DNAS-EXT-S-3Y"],
    ],
  ],
];

function expected(rels: Array<[string, string]>) {
  return rels.map(([parentSku, relatedConfiguredSku]) => ({
    parentSku,
    relatedConfiguredSku,
  }));
}

// SKUs that must yield NO related configured guidance: eligible parents/accessories and
// deferred rows with no known related configured item (per task: keep these empty).
const NONE = [
  "C9300X-48HX-A",
  "C9300L-24P-4X-A",
  "PWR-C1-1100WAC-P",
  "CW9178I-CFG",
  "SVS-DNXS-CATSUBEM",
  "SVS-DNXD-CATHWEM",
  "WS-C3650-48FD-E",
];

describe("sku-related-configured-display - known relationships", () => {
  it("maps each known deferred SKU to its related configured item(s) and parent(s)", () => {
    for (const [sku, rels] of KNOWN) {
      expect(getRelatedConfiguredItemsDisplay(sku), sku).toEqual(expected(rels));
    }
  });

  it("matches case- and whitespace-insensitively", () => {
    for (const [sku, rels] of KNOWN) {
      expect(
        getRelatedConfiguredItemsDisplay(`  ${sku.toLowerCase()}  `),
        sku
      ).toEqual(expected(rels));
    }
  });

  it("returns a fresh copy each call (mutating the result does not affect the map)", () => {
    const first = getRelatedConfiguredItemsDisplay("SC9300UK9-1712");
    first.push({ parentSku: "X", relatedConfiguredSku: "Y" });
    first[0].parentSku = "MUTATED";
    expect(getRelatedConfiguredItemsDisplay("SC9300UK9-1712")).toEqual([
      { parentSku: "C9300X-48HX-A", relatedConfiguredSku: "SC9300UK9-1715" },
    ]);
  });

  it("exposes ONLY parentSku/relatedConfiguredSku - no price/action/decision/authority key", () => {
    for (const [sku] of KNOWN) {
      for (const item of getRelatedConfiguredItemsDisplay(sku)) {
        expect(Object.keys(item).sort()).toEqual(["parentSku", "relatedConfiguredSku"].sort());
        for (const forbidden of [
          "price",
          "unitPrice",
          "action",
          "decision",
          "acceptedSku",
          "authority",
          "replacement",
          "replacementSku",
          "substitute",
          "substitutionSku",
        ]) {
          expect(forbidden in item, forbidden).toBe(false);
        }
      }
    }
  });

  it("returns an empty array for eligible/unknown SKUs", () => {
    for (const sku of NONE) {
      expect(getRelatedConfiguredItemsDisplay(sku), sku).toEqual([]);
    }
  });
});

describe("sku-related-configured-display - source purity", () => {
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports nothing (zero import/from statements)", () => {
    expect(/\bfrom\s+["']/.test(source)).toBe(false);
    expect(/^\s*import\b/m.test(source)).toBe(false);
  });

  it("exports no replacement/substitution authority name (display guidance only)", () => {
    // Forbid the dangerous EXPORT/identifier names the prompt calls out, not negation
    // prose: the module doc legitimately says it "never substitutes".
    for (const forbidden of [
      "replaced by",
      "replacementMap",
      "export const replacement",
      "export function substitute",
      "export const substitute",
      "SubstitutionMap",
    ]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(readFileSync(TEST_PATH, "utf8"))).toBe(false);
  });
});
