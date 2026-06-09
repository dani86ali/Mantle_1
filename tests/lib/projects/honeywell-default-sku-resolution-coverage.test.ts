/**
 * Evidence: the canonical default Quick BoM catalog recognizes every SKU in the
 * real 52-line Honeywell BoQ upload shape as a same-SKU needs_review suggestion -
 * zero unresolved - while approving no replacement, substitution, pricing, or
 * configuration. SKU order matches Honeywell_BoQ.xlsx rows 6-57.
 *
 * Pure helper imports only - no DB, API/UI, engines, coordinators, adapters,
 * pricing, configuration expansion, export, runner, or AI/LLM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSkuResolutionDraft } from "@/lib/projects/sku-resolution";
import { DEFAULT_QUICK_BOM_CATALOG_SOURCE } from "@/lib/projects/default-quick-bom-catalog";
import type { CanonicalBoqLine } from "@/types/project";

const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/honeywell-default-sku-resolution-coverage.test.ts"
);

// Exact SKU order of the real Honeywell BoQ, rows 6-57 (duplicates preserved).
const HONEYWELL_BOQ_SKUS = [
  "C9300X-48HX-A",
  "CON-L1NBX-C9300XY4",
  "C9300-DNX-A-48-3Y",
  "CON-L1SWX-93XA48MY",
  "C9300-NW-A-48",
  "SC9300UK9-1712",
  "PWR-C1-1100WAC-P",
  "PWR-C1-1100WAC-P/2",
  "CAB-C15-CBN",
  "C9300-SSD-NONE",
  "STACK-T1-50CM",
  "CAB-SPWR-30CM",
  "C9K-ACC-RBFT",
  "C9K-ACC-SCR-4",
  "CAB-GUIDE-1RU",
  "C9300X-NM-8Y",
  "NETWORK-PNP-LIC",
  "SVS-DNXS-CATSUBEM",
  "SVS-DNXD-CATHWEM",
  "SPACES-EXT-S",
  "C9300L-24P-4X-A",
  "CON-L1NBX-C93024PX",
  "C9300L-DNX-A-24-3Y",
  "CON-L1SWX-3LXA24MY",
  "S9300LUK9-1712",
  "C9300L-NW-A-24",
  "C9300L-STACK-BLANK",
  "FAN-T2",
  "PWR-C1-715WAC-P",
  "PWR-C1-715WAC-P/2",
  "CAB-C15-CBN",
  "C9300L-SSD-NONE",
  "C9K-ACC-RBFT",
  "C9K-ACC-SCR-4",
  "CAB-GUIDE-1RU",
  "NETWORK-PNP-LIC",
  "SVS-DNXS-CATSUBEM",
  "SVS-DNXD-CATHWEM",
  "SPACES-EXT-S",
  "SFP-10G-LR-S=",
  "SFP-10/25G-LR-S=",
  "CW9178I-CFG",
  "CON-ROB-CW9178IC",
  "AIR-AP-BRACKET-2",
  "AIR-AP-T-RAIL-F",
  "CW9178-SINGLE",
  "CISCO-NETWORK-SUB",
  "LIC-CW-A",
  "LIC-SPACES-ADV",
  "SVS-L0SPT-CN",
  "CP-7841-K9=",
  "CON-SNT-P7PK94P1",
] as const;

// Current replacement SKUs that must NEVER be surfaced as a suggestion (Batch 4 deferral).
const FORBIDDEN_CURRENT_SKUS = ["DNAC", "C9300X-DNA-A-48-3Y", "C9300L-DNA-A-24-3Y"] as const;

function honeywellBoqLines(): CanonicalBoqLine[] {
  return HONEYWELL_BOQ_SKUS.map((sku, index): CanonicalBoqLine => ({
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-52-line-boq",
    sourceRowNumber: index + 6,
    originalLineNumber: String(index + 1),
    sku,
    description: sku,
    quantity: 1,
    originalCells: {},
  }));
}

describe("real 52-line Honeywell BoQ resolves fully against the default Quick BoM catalog", () => {
  it("has exactly 52 SKU lines in the fixture", () => {
    expect(HONEYWELL_BOQ_SKUS).toHaveLength(52);
  });

  it("produces totalLines 52, unresolvedCount 0, needsReviewCount 52", () => {
    const draft = buildSkuResolutionDraft({ lines: honeywellBoqLines() });
    expect(draft.summary.totalLines).toBe(52);
    expect(draft.summary.unresolvedCount).toBe(0);
    expect(draft.summary.needsReviewCount).toBe(52);
  });

  it("reports the canonical default Quick BoM catalog source", () => {
    const draft = buildSkuResolutionDraft({ lines: honeywellBoqLines() });
    expect(draft.summary.catalogSource).toBe(DEFAULT_QUICK_BOM_CATALOG_SOURCE);
    expect(draft.summary.catalogSource).toBe("default_quick_bom_approved_catalog");
  });

  it("yields one same-SKU suggestion per line, preserving order and duplicates", () => {
    const draft = buildSkuResolutionDraft({ lines: honeywellBoqLines() });
    expect(draft.decisions).toHaveLength(52);
    for (let i = 0; i < draft.decisions.length; i++) {
      const decision = draft.decisions[i];
      expect(decision.originalSku, `row ${i}`).toBe(HONEYWELL_BOQ_SKUS[i]);
      expect(decision.status, decision.originalSku).toBe("needs_review");
      expect(decision.suggestions, decision.originalSku).toHaveLength(1);
      // Same-SKU: the suggested SKU IS the customer-provided SKU.
      expect(decision.suggestions[0].suggestedSku).toBe(HONEYWELL_BOQ_SKUS[i]);
    }
  });

  it("never surfaces a current replacement SKU for any historical SKU", () => {
    const draft = buildSkuResolutionDraft({ lines: honeywellBoqLines() });
    const forbidden = new Set<string>(FORBIDDEN_CURRENT_SKUS);
    for (const decision of draft.decisions) {
      for (const suggestion of decision.suggestions) {
        expect(forbidden.has(suggestion.suggestedSku), suggestion.suggestedSku).toBe(false);
      }
    }
  });

  it("carries no pricing, configuration, or replacement/substitution fields on any decision", () => {
    const draft = buildSkuResolutionDraft({ lines: honeywellBoqLines() });
    for (const decision of draft.decisions) {
      for (const forbidden of [
        "unitPrice",
        "extendedPrice",
        "listPrice",
        "discountedPrice",
        "parentSku",
        "parentLineId",
        "children",
        "configExpansion",
        "replacementFor",
        "substitutedSku",
        "acceptedSku",
        "decidedBy",
        "decidedAt",
      ]) {
        expect(decision, forbidden).not.toHaveProperty(forbidden);
      }
    }
  });

  it("never auto-accepts: summary acceptedCount and rejectedCount stay 0", () => {
    const draft = buildSkuResolutionDraft({ lines: honeywellBoqLines() });
    expect(draft.summary.acceptedCount).toBe(0);
    expect(draft.summary.rejectedCount).toBe(0);
  });
});

describe("ASCII-only content", () => {
  it("test file is ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(readFileSync(TEST_PATH, "utf8"))).toBe(false);
  });
});
