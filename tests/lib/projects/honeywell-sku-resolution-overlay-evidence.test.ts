/**
 * Evidence: a subset/reordered Honeywell-shaped BoQ resolves deterministically
 * through the explicit Honeywell demo catalog overlay while still requiring human
 * SKU review. Proves the default local mock catalog misses known Honeywell parent
 * SKUs and the overlay resolves them as needs_review suggestions only.
 *
 * Pure helper imports only - no DB, API/UI, engines, coordinators, adapters,
 * artifact stores, approval stores, pricing, configuration expansion, export,
 * runner, or AI/LLM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSkuResolutionDraft,
} from "@/lib/projects/sku-resolution";
import {
  getHoneywellDemoCatalogLookupIndex,
  HONEYWELL_DEMO_CATALOG_LOOKUP_SOURCE,
} from "@/lib/projects/honeywell-demo-catalog-lookup";
import type { CanonicalBoqLine } from "@/types/project";

const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-sku-resolution-overlay-evidence.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_DEMO_CATALOG_FIXTURE.md");

// A subset/reordered BoQ: different order, omits some original lines,
// includes two known parent SKUs missing from the local mock catalog.
const SUBSET_BOQ: CanonicalBoqLine[] = [
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-subset-evidence",
    sourceRowNumber: 2,
    originalLineNumber: "1",
    sku: "C9300X-48HX-A",
    description: "Catalyst 9300X 48p mGig UPOE+ Network Advantage",
    quantity: 2,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-subset-evidence",
    sourceRowNumber: 3,
    originalLineNumber: "2",
    sku: "CW9178I-CFG",
    description: "Catalyst Center Wi-Fi 6E AP",
    quantity: 10,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-subset-evidence",
    sourceRowNumber: 4,
    originalLineNumber: "3",
    sku: "CP-7841-K9=",
    description: "Cisco IP Phone 7841",
    quantity: 5,
    originalCells: {},
  },
  {
    sourceFormat: "format_1_line_item",
    sourceFileId: "honeywell-subset-evidence",
    sourceRowNumber: 5,
    originalLineNumber: "4",
    sku: "SFP-10G-LR-S=",
    description: "10GBASE-LR SFP Module",
    quantity: 4,
    originalCells: {},
  },
];

const SUBSET_SKUS = SUBSET_BOQ.map((l) => l.sku);
const MISSING_PARENT_SKUS = ["CW9178I-CFG", "C9300X-48HX-A", "C9300L-24P-4X-A"] as const;

describe("default local mock catalog misses known Honeywell parent SKUs", () => {
  it("the default SKU-resolution draft leaves the known missing parent SKUs unresolved", () => {
    const lines = MISSING_PARENT_SKUS.map((sku, index): CanonicalBoqLine => ({
      sourceFormat: "format_1_line_item",
      sourceFileId: "honeywell-default-miss-evidence",
      sourceRowNumber: index + 2,
      originalLineNumber: String(index + 1),
      sku,
      description: sku,
      quantity: 1,
      originalCells: {},
    }));
    const draft = buildSkuResolutionDraft({ lines });
    expect(draft.decisions.map((d) => d.originalSku)).toEqual([...MISSING_PARENT_SKUS]);
    for (const decision of draft.decisions) {
      expect(decision.status).toBe("unresolved");
      expect(decision.suggestions).toEqual([]);
    }
  });
});

describe("Honeywell demo overlay resolves subset BoQ as needs_review draft", () => {
  it("returns one decision per input row", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    expect(draft.decisions).toHaveLength(SUBSET_BOQ.length);
  });

  it("preserves input order", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    for (let i = 0; i < SUBSET_BOQ.length; i++) {
      expect(draft.decisions[i].originalSku).toBe(SUBSET_SKUS[i]);
    }
  });

  it("all subset SKUs resolve as needs_review", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    for (const decision of draft.decisions) {
      expect(decision.status).toBe("needs_review");
    }
  });

  it("each line has exactly one same-SKU suggestion", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    for (let i = 0; i < draft.decisions.length; i++) {
      const decision = draft.decisions[i];
      expect(decision.suggestions).toHaveLength(1);
      expect(decision.suggestions[0].suggestedSku).toBe(SUBSET_SKUS[i]);
    }
  });

  it("summary.catalogSource is HONEYWELL_DEMO_CATALOG_LOOKUP_SOURCE", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    expect(draft.summary.catalogSource).toBe(HONEYWELL_DEMO_CATALOG_LOOKUP_SOURCE);
    expect(draft.summary.catalogSource).toBe("honeywell_mvp_demo_catalog_supplement");
  });

  it("summary.acceptedCount and rejectedCount are always 0", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    expect(draft.summary.acceptedCount).toBe(0);
    expect(draft.summary.rejectedCount).toBe(0);
  });

  it("no decision has acceptedSku, decidedBy, or decidedAt", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    for (const decision of draft.decisions) {
      expect(decision).not.toHaveProperty("acceptedSku");
      expect(decision).not.toHaveProperty("decidedBy");
      expect(decision).not.toHaveProperty("decidedAt");
    }
  });
});

describe("evidence remains lookup/SKU-resolution only", () => {
  it("no pricing fields on any decision", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    for (const decision of draft.decisions) {
      expect(decision).not.toHaveProperty("unitPrice");
      expect(decision).not.toHaveProperty("extendedPrice");
      expect(decision).not.toHaveProperty("listPrice");
      expect(decision).not.toHaveProperty("discountedPrice");
    }
  });

  it("no configuration-expansion or parent/child fields on any decision", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    for (const decision of draft.decisions) {
      expect(decision).not.toHaveProperty("parentSku");
      expect(decision).not.toHaveProperty("parentLineId");
      expect(decision).not.toHaveProperty("children");
      expect(decision).not.toHaveProperty("configExpansion");
    }
  });

  it("no replacement or substitution fields on any decision", () => {
    const draft = buildSkuResolutionDraft({
      lines: SUBSET_BOQ,
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    for (const decision of draft.decisions) {
      expect(decision).not.toHaveProperty("replacementFor");
      expect(decision).not.toHaveProperty("substitutedSku");
    }
  });
});

describe("standalone optic SFP-10G-LR-S= remains a flat input row suggestion", () => {
  it("resolves as needs_review with one same-SKU suggestion and no parent/child fields", () => {
    const opticLine = SUBSET_BOQ.find((l) => l.sku === "SFP-10G-LR-S=")!;
    const draft = buildSkuResolutionDraft({
      lines: [opticLine],
      catalogIndex: getHoneywellDemoCatalogLookupIndex(),
    });
    const decision = draft.decisions[0];
    expect(decision.status).toBe("needs_review");
    expect(decision.suggestions).toHaveLength(1);
    expect(decision.suggestions[0].suggestedSku).toBe("SFP-10G-LR-S=");
    expect(decision).not.toHaveProperty("parentSku");
    expect(decision).not.toHaveProperty("parentLineId");
    expect(decision).not.toHaveProperty("children");
  });
});

describe("default local mock leaves known missing parent SKUs unresolved for subset", () => {
  it("C9300X-48HX-A and CW9178I-CFG are unresolved without the overlay", () => {
    const missingLines = SUBSET_BOQ.filter(
      (l) => l.sku === "C9300X-48HX-A" || l.sku === "CW9178I-CFG"
    );
    const draft = buildSkuResolutionDraft({ lines: missingLines });
    for (const decision of draft.decisions) {
      expect(decision.status).toBe("unresolved");
    }
  });
});

describe("ASCII-only content", () => {
  it("test file is ASCII-only", () => {
    const src = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
  });

  it("doc file is ASCII-only", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(doc)).toBe(false);
  });
});
