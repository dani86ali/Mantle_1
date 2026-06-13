import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as mod from "@/lib/projects/sku-resolution";
import {
  buildSkuResolutionDecisionForLine,
  buildSkuResolutionDraft,
} from "@/lib/projects/sku-resolution";
import {
  buildCatalogLookupIndex,
  type CatalogLookupItem,
  type CatalogLookupMatch,
  type CatalogLookupResult,
} from "@/lib/projects/catalog-lookup";
import { DEFAULT_QUICK_BOM_CATALOG_SOURCE } from "@/lib/projects/default-quick-bom-catalog";
import {
  CISCO_COLLABORATION_APPROVED_SKU_SCOPE_PRICE_LIST_ID,
  getCiscoCollaborationApprovedSkuScopeItems,
} from "@/lib/projects/quick-bom-cisco-collaboration-sku-scope";
import {
  CISCO_INDUSTRIAL_SWITCHING_APPROVED_SKU_SCOPE_PRICE_LIST_ID,
  getCiscoIndustrialSwitchingApprovedSkuScopeItems,
} from "@/lib/projects/quick-bom-cisco-industrial-sku-scope";
import type { CanonicalBoqLine } from "@/types/project";

function makeLine(overrides: Partial<CanonicalBoqLine> = {}): CanonicalBoqLine {
  return {
    sourceFormat: "format_1_line_item",
    sourceFileId: "file-1",
    sourceRowNumber: 2,
    originalLineNumber: "1",
    sku: "C9300-48P-E",
    description: "Catalyst 9300 switch",
    quantity: 1,
    originalCells: {},
    ...overrides,
  };
}

function catItem(overrides: Partial<CatalogLookupItem> = {}): CatalogLookupItem {
  return {
    sku: "C9300-48P-E",
    description: "Catalyst 9300 switch",
    listPrice: 100,
    currency: "USD",
    vendor: "Cisco",
    ...overrides,
  };
}

function catalogOf(...items: CatalogLookupItem[]): Record<string, CatalogLookupItem> {
  const rec: Record<string, CatalogLookupItem> = {};
  for (const it of items) rec[it.sku] = it;
  return rec;
}

function matchedResult(
  source: "exact" | "normalized",
  matchOverrides: Partial<CatalogLookupMatch> = {}
): CatalogLookupResult {
  return {
    status: "matched",
    requestedSku: "REQ",
    normalizedSku: "REQ",
    match: {
      requestedSku: "REQ",
      catalogSku: "CAT-1",
      description: "Catalog description",
      listPrice: 100,
      currency: "USD",
      source,
      catalogSource: "local_stc_historical_mock",
      hasPositiveListPrice: true,
      ...matchOverrides,
    },
  };
}

describe("buildSkuResolutionDecisionForLine - matched", () => {
  it("exact match creates needs_review with one exact suggestion", () => {
    const decision = buildSkuResolutionDecisionForLine(
      makeLine(),
      matchedResult("exact", { catalogSku: "C9300-48P-E" })
    );
    expect(decision.status).toBe("needs_review");
    expect(decision.suggestions).toHaveLength(1);
    expect(decision.suggestions[0].source).toBe("exact");
    expect(decision.suggestions[0].suggestedSku).toBe("C9300-48P-E");
    expect(decision.suggestions[0].description).toBe("Catalog description");
    expect(decision.suggestions[0].rationale).toMatch(/human approval/i);
  });

  it("normalized match creates needs_review with one normalized suggestion", () => {
    const decision = buildSkuResolutionDecisionForLine(
      makeLine(),
      matchedResult("normalized", { catalogSku: "C9300-48P-E" })
    );
    expect(decision.status).toBe("needs_review");
    expect(decision.suggestions).toHaveLength(1);
    expect(decision.suggestions[0].source).toBe("normalized");
    expect(decision.suggestions[0].suggestedSku).toBe("C9300-48P-E");
  });

  it("matched decisions never set acceptedSku, decidedBy, or decidedAt", () => {
    for (const source of ["exact", "normalized"] as const) {
      const decision = buildSkuResolutionDecisionForLine(makeLine(), matchedResult(source));
      expect(decision.acceptedSku).toBeUndefined();
      expect("acceptedSku" in decision).toBe(false);
      expect(decision.decidedBy).toBeUndefined();
      expect("decidedBy" in decision).toBe(false);
      expect(decision.decidedAt).toBeUndefined();
      expect("decidedAt" in decision).toBe(false);
    }
  });
});

describe("buildSkuResolutionDecisionForLine - unresolved", () => {
  it("not_found creates an unresolved decision with no suggestions", () => {
    const result: CatalogLookupResult = {
      status: "not_found",
      requestedSku: "NOPE",
      normalizedSku: "NOPE",
    };
    const decision = buildSkuResolutionDecisionForLine(makeLine({ sku: "NOPE" }), result);
    expect(decision.status).toBe("unresolved");
    expect(decision.suggestions).toEqual([]);
    expect(decision.acceptedSku).toBeUndefined();
  });
});

describe("buildSkuResolutionDecisionForLine - ambiguous", () => {
  it("creates needs_review with one normalized suggestion per candidate, no acceptedSku", () => {
    const result: CatalogLookupResult = {
      status: "ambiguous",
      requestedSku: "xa",
      normalizedSku: "XA",
      candidateSkus: ["X-A", "X.A", "X_A"],
    };
    const decision = buildSkuResolutionDecisionForLine(makeLine({ sku: "xa" }), result);
    expect(decision.status).toBe("needs_review");
    expect(decision.suggestions).toHaveLength(3);
    expect(decision.suggestions.every((s) => s.source === "normalized")).toBe(true);
    expect(decision.acceptedSku).toBeUndefined();
    expect("acceptedSku" in decision).toBe(false);
    // Ambiguous suggestions carry no description (none is available).
    expect("description" in decision.suggestions[0]).toBe(false);
    expect(decision.suggestions[0].rationale).toMatch(/human selection/i);
  });

  it("preserves ambiguous candidate order deterministically", () => {
    const result: CatalogLookupResult = {
      status: "ambiguous",
      requestedSku: "xa",
      normalizedSku: "XA",
      candidateSkus: ["X-A", "X.A", "X_A"],
    };
    const decision = buildSkuResolutionDecisionForLine(makeLine(), result);
    expect(decision.suggestions.map((s) => s.suggestedSku)).toEqual(["X-A", "X.A", "X_A"]);
  });
});

describe("buildSkuResolutionDecisionForLine - source metadata", () => {
  it("copies sourceFileId, sourceRowNumber, originalLineNumber, and originalSku from the line", () => {
    const line = makeLine({
      sourceFileId: "file-77",
      sourceRowNumber: 42,
      originalLineNumber: "9.3",
      sku: "WS-C2960X",
    });
    const decision = buildSkuResolutionDecisionForLine(line, {
      status: "not_found",
      requestedSku: "WS-C2960X",
      normalizedSku: "WSC2960X",
    });
    expect(decision.sourceFileId).toBe("file-77");
    expect(decision.sourceRowNumber).toBe(42);
    expect(decision.originalLineNumber).toBe("9.3");
    expect(decision.originalSku).toBe("WS-C2960X");
  });
});

describe("buildSkuResolutionDraft", () => {
  const index = buildCatalogLookupIndex(
    catalogOf(
      catItem({ sku: "C9300-48P-E", listPrice: 100 }),
      catItem({ sku: "FREE-1", listPrice: 0 }),
      catItem({ sku: "X-A" }),
      catItem({ sku: "X_A" })
    )
  );

  it("treats a blank SKU as unresolved with no suggestions", () => {
    const { decisions } = buildSkuResolutionDraft({
      lines: [makeLine({ sku: "   " })],
      catalogIndex: index,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].status).toBe("unresolved");
    expect(decisions[0].suggestions).toEqual([]);
  });

  it("preserves customer line order regardless of source row numbers", () => {
    const lines = [
      makeLine({ sku: "FREE-1", sourceRowNumber: 9, originalLineNumber: "3" }),
      makeLine({ sku: "C9300-48P-E", sourceRowNumber: 2, originalLineNumber: "1" }),
      makeLine({ sku: "NOPE", sourceRowNumber: 5, originalLineNumber: "2" }),
    ];
    const { decisions } = buildSkuResolutionDraft({ lines, catalogIndex: index });
    expect(decisions.map((d) => d.originalSku)).toEqual(["FREE-1", "C9300-48P-E", "NOPE"]);
    expect(decisions.map((d) => d.sourceRowNumber)).toEqual([9, 2, 5]);
  });

  it("produces a duplicate decision for each duplicate BoQ row", () => {
    const lines = [
      makeLine({ sku: "C9300-48P-E" }),
      makeLine({ sku: "C9300-48P-E" }),
    ];
    const { decisions, summary } = buildSkuResolutionDraft({ lines, catalogIndex: index });
    expect(decisions).toHaveLength(2);
    expect(decisions[0].status).toBe("needs_review");
    expect(decisions[1].status).toBe("needs_review");
    expect(summary.exactSuggestionCount).toBe(2);
  });

  it("keeps a zero-price matched SKU as needs_review and counts it as zero-price", () => {
    const { decisions, summary } = buildSkuResolutionDraft({
      lines: [makeLine({ sku: "FREE-1" })],
      catalogIndex: index,
    });
    expect(decisions[0].status).toBe("needs_review");
    expect(summary.zeroPriceSuggestionCount).toBe(1);
  });

  it("computes correct deterministic summary counts across every branch", () => {
    const lines = [
      makeLine({ sku: "C9300-48P-E" }), // exact, priced
      makeLine({ sku: "c9300 48p e" }), // normalized
      makeLine({ sku: "FREE-1" }), // exact, zero price
      makeLine({ sku: "xa" }), // ambiguous: X-A, X_A
      makeLine({ sku: "UNKNOWN-1" }), // not_found
      makeLine({ sku: "" }), // blank -> not_found
    ];
    const { summary } = buildSkuResolutionDraft({ lines, catalogIndex: index });
    expect(summary).toEqual({
      totalLines: 6,
      needsReviewCount: 4,
      unresolvedCount: 2,
      acceptedCount: 0,
      rejectedCount: 0,
      exactSuggestionCount: 2,
      normalizedSuggestionCount: 3,
      ambiguousCount: 1,
      zeroPriceSuggestionCount: 1,
      catalogSource: "local_stc_historical_mock",
    });
  });

  it("always reports acceptedCount and rejectedCount as 0", () => {
    const { summary } = buildSkuResolutionDraft({
      lines: [makeLine({ sku: "C9300-48P-E" }), makeLine({ sku: "NOPE" })],
      catalogIndex: index,
    });
    expect(summary.acceptedCount).toBe(0);
    expect(summary.rejectedCount).toBe(0);
  });

  it("does not mutate the input lines", () => {
    const lines = [makeLine({ sku: "C9300-48P-E" }), makeLine({ sku: "xa" })];
    const snapshot = structuredClone(lines);
    buildSkuResolutionDraft({ lines, catalogIndex: index });
    expect(lines).toEqual(snapshot);
  });

  it("summary reports the explicit index catalogSource when one is provided", () => {
    const explicitIndex = buildCatalogLookupIndex(
      catalogOf(catItem({ sku: "C9300-48P-E" })),
      "explicit_test_source"
    );
    const { summary } = buildSkuResolutionDraft({
      lines: [makeLine({ sku: "C9300-48P-E" })],
      catalogIndex: explicitIndex,
    });
    expect(summary.catalogSource).toBe("explicit_test_source");
  });

  it("summary reports the default Quick BoM catalog source when no catalogIndex is provided", () => {
    const { summary } = buildSkuResolutionDraft({
      lines: [makeLine({ sku: "C9300-48P-E" })],
    });
    expect(summary.catalogSource).toBe(DEFAULT_QUICK_BOM_CATALOG_SOURCE);
    expect(summary.catalogSource).toBe("default_quick_bom_approved_catalog");
  });

  it("default draft resolves known Honeywell SKUs missing from the local mock catalog", () => {
    const honeywellSkus = ["C9300X-48HX-A", "C9300L-24P-4X-A", "CW9178I-CFG"] as const;
    const lines = honeywellSkus.map((sku, index): CanonicalBoqLine => ({
      sourceFormat: "format_1_line_item",
      sourceFileId: "default-honeywell-subset",
      sourceRowNumber: index + 2,
      originalLineNumber: String(index + 1),
      sku,
      description: sku,
      quantity: 1,
      originalCells: {},
    }));
    const { decisions } = buildSkuResolutionDraft({ lines });
    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      expect(decision.status).toBe("needs_review");
      expect(decision.suggestions).toHaveLength(1);
      expect(decision.suggestions[0].source).toBe("exact");
      expect(decision.suggestions[0].suggestedSku).toBe(honeywellSkus[i]);
      // SKU recognition only - never a pricing/config/replacement field.
      expect(decision).not.toHaveProperty("listPrice");
      expect(decision).not.toHaveProperty("unitPrice");
      expect(decision).not.toHaveProperty("parentSku");
      expect(decision).not.toHaveProperty("children");
      expect(decision).not.toHaveProperty("replacementFor");
      expect(decision).not.toHaveProperty("substitutedSku");
    }
  });
});

describe("buildSkuResolutionDraft - Cisco collaboration scope", () => {
  // All five approved collaboration SKUs; CS-MIC-TABLE-J and CON-SNT-CS5HEJMI are
  // already carried by the local mock catalog at a positive price, so the default
  // catalog keeps those local rows and the zero-price scope only fills the other
  // three. Assert that exact partition so precedence is explicit.
  const CISCO_COLLABORATION_SKUS = [
    "CS-KIT-EQX-C-K9",
    "CS-KIT-EQX-FSK-C",
    "CS-MIC-TABLE-J",
    "CON-SNT-CSKITEK9",
    "CON-SNT-CS5HEJMI",
  ] as const;
  const LOCAL_PRICED_COLLABORATION_SKUS = ["CS-MIC-TABLE-J", "CON-SNT-CS5HEJMI"] as const;

  function collaborationLines(): CanonicalBoqLine[] {
    return CISCO_COLLABORATION_SKUS.map((sku, i) => ({
      sourceFormat: "format_1_line_item",
      sourceFileId: "cisco-collaboration-subset",
      sourceRowNumber: i + 2,
      originalLineNumber: String(i + 1),
      sku,
      description: sku,
      quantity: 1,
      originalCells: {},
    }));
  }

  it("default draft resolves the five collaboration SKUs to needs_review exact same-SKU suggestions", () => {
    const { decisions, summary } = buildSkuResolutionDraft({ lines: collaborationLines() });
    expect(summary.catalogSource).toBe(DEFAULT_QUICK_BOM_CATALOG_SOURCE);
    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      const sku = CISCO_COLLABORATION_SKUS[i];
      expect(decision.status, sku).toBe("needs_review");
      expect(decision.suggestions, sku).toHaveLength(1);
      expect(decision.suggestions[0].source, sku).toBe("exact");
      expect(decision.suggestions[0].suggestedSku, sku).toBe(sku);
      // SKU recognition only - never accepts, prices, configures, or replaces.
      expect(decision.acceptedSku, sku).toBeUndefined();
      for (const forbidden of [
        "acceptedSku",
        "listPrice",
        "unitPrice",
        "parentSku",
        "children",
        "includedItems",
        "replacementFor",
        "substitutedSku",
      ]) {
        expect(decision, `${sku}:${forbidden}`).not.toHaveProperty(forbidden);
      }
    }
  });

  it("scope-only catalog reports a zero-price suggestion count of five", () => {
    const scopeIndex = buildCatalogLookupIndex(
      getCiscoCollaborationApprovedSkuScopeItems(),
      CISCO_COLLABORATION_APPROVED_SKU_SCOPE_PRICE_LIST_ID
    );
    const { summary } = buildSkuResolutionDraft({
      lines: collaborationLines(),
      catalogIndex: scopeIndex,
    });
    expect(summary.needsReviewCount).toBe(5);
    expect(summary.exactSuggestionCount).toBe(5);
    expect(summary.zeroPriceSuggestionCount).toBe(5);
  });

  it("default catalog zero-price count respects local precedence (only the three local mock misses)", () => {
    const { summary } = buildSkuResolutionDraft({ lines: collaborationLines() });
    const expectedZeroPrice =
      CISCO_COLLABORATION_SKUS.length - LOCAL_PRICED_COLLABORATION_SKUS.length;
    expect(expectedZeroPrice).toBe(3);
    expect(summary.zeroPriceSuggestionCount).toBe(expectedZeroPrice);
    expect(summary.exactSuggestionCount).toBe(5);
  });
});

describe("buildSkuResolutionDraft - Cisco industrial switching scope", () => {
  // All ten approved industrial SKUs; STK-RACK-DINRAIL= is already carried by the
  // local mock catalog at a positive price (listPrice 125), so the default catalog
  // keeps that local row and the zero-price scope only fills the other nine.
  const CISCO_INDUSTRIAL_SKUS = [
    "IEM-3500-14T2S=",
    "CON-SNT-IEM35B2S",
    "PWR-IE480W-PCAC-L=",
    "IE-1000-4P2S-LM",
    "CON-SNT-I1002SLM",
    "IOT-UTILITIES",
    "IOT-UTIL-OTHER",
    "PWR-IE170W-PC-AC=",
    "CAB-TA-UK=",
    "STK-RACK-DINRAIL=",
  ] as const;
  // STK-RACK-DINRAIL= is the only one with a positive local price.
  const LOCAL_PRICED_INDUSTRIAL_SKUS = ["STK-RACK-DINRAIL="] as const;

  function industrialLines(): CanonicalBoqLine[] {
    return CISCO_INDUSTRIAL_SKUS.map((sku, i) => ({
      sourceFormat: "format_1_line_item",
      sourceFileId: "cisco-industrial-subset",
      sourceRowNumber: i + 2,
      originalLineNumber: String(i + 1),
      sku,
      description: sku,
      quantity: 1,
      originalCells: {},
    }));
  }

  it("default draft resolves the ten industrial SKUs to needs_review exact same-SKU suggestions", () => {
    const { decisions, summary } = buildSkuResolutionDraft({ lines: industrialLines() });
    expect(summary.catalogSource).toBe(DEFAULT_QUICK_BOM_CATALOG_SOURCE);
    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      const sku = CISCO_INDUSTRIAL_SKUS[i];
      expect(decision.status, sku).toBe("needs_review");
      expect(decision.suggestions, sku).toHaveLength(1);
      expect(decision.suggestions[0].source, sku).toBe("exact");
      expect(decision.suggestions[0].suggestedSku, sku).toBe(sku);
      // SKU recognition only - never accepts, prices, configures, or replaces.
      expect(decision.acceptedSku, sku).toBeUndefined();
      for (const forbidden of [
        "acceptedSku",
        "listPrice",
        "unitPrice",
        "parentSku",
        "children",
        "includedItems",
        "replacementFor",
        "substitutedSku",
      ]) {
        expect(decision, `${sku}:${forbidden}`).not.toHaveProperty(forbidden);
      }
    }
  });

  it("scope-only catalog reports a zero-price suggestion count of ten", () => {
    const scopeIndex = buildCatalogLookupIndex(
      getCiscoIndustrialSwitchingApprovedSkuScopeItems(),
      CISCO_INDUSTRIAL_SWITCHING_APPROVED_SKU_SCOPE_PRICE_LIST_ID
    );
    const { summary } = buildSkuResolutionDraft({
      lines: industrialLines(),
      catalogIndex: scopeIndex,
    });
    expect(summary.needsReviewCount).toBe(10);
    expect(summary.exactSuggestionCount).toBe(10);
    expect(summary.zeroPriceSuggestionCount).toBe(10);
  });

  it("default catalog zero-price count respects local precedence (STK-RACK-DINRAIL= stays local-priced)", () => {
    const { summary } = buildSkuResolutionDraft({ lines: industrialLines() });
    const expectedZeroPrice =
      CISCO_INDUSTRIAL_SKUS.length - LOCAL_PRICED_INDUSTRIAL_SKUS.length;
    expect(expectedZeroPrice).toBe(9);
    expect(summary.zeroPriceSuggestionCount).toBe(expectedZeroPrice);
    expect(summary.exactSuggestionCount).toBe(10);
  });

  it("does not collapse two duplicate STK-RACK-DINRAIL= lines (separate decisions in source order)", () => {
    const lines: CanonicalBoqLine[] = [
      {
        sourceFormat: "format_1_line_item",
        sourceFileId: "cisco-industrial-dup",
        sourceRowNumber: 11,
        originalLineNumber: "4",
        sku: "STK-RACK-DINRAIL=",
        description: "STK-RACK-DINRAIL=",
        quantity: 1,
        originalCells: {},
      },
      {
        sourceFormat: "format_1_line_item",
        sourceFileId: "cisco-industrial-dup",
        sourceRowNumber: 27,
        originalLineNumber: "9",
        sku: "STK-RACK-DINRAIL=",
        description: "STK-RACK-DINRAIL=",
        quantity: 1,
        originalCells: {},
      },
    ];
    const { decisions } = buildSkuResolutionDraft({ lines });
    expect(decisions).toHaveLength(2);
    expect(decisions.map((d) => d.sourceRowNumber)).toEqual([11, 27]);
    expect(decisions.map((d) => d.originalLineNumber)).toEqual(["4", "9"]);
    for (const decision of decisions) {
      expect(decision.status).toBe("needs_review");
      expect(decision.suggestions[0].suggestedSku).toBe("STK-RACK-DINRAIL=");
    }
  });
});

describe("local mock catalog smoke test", () => {
  it("C9300-48P-E produces an exact suggestion from the local mock catalog", () => {
    const { decisions } = buildSkuResolutionDraft({
      lines: [makeLine({ sku: "C9300-48P-E" })],
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].status).toBe("needs_review");
    expect(decisions[0].suggestions[0].source).toBe("exact");
    expect(decisions[0].suggestions[0].suggestedSku).toBe("C9300-48P-E");
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/sku-resolution.ts"),
    "utf8"
  );

  it("does not import DB, artifact store, approvals, staleness, engines, AI, pricing, API, UI, or the Cisco adapter", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    for (const forbidden of [
      "@/lib/db",
      "/db/",
      "artifact-store",
      "approval",
      "staleness",
      "@/engines",
      "@/coordinator",
      "pricing",
      "adapter", // Cisco adapter (catalog-lookup is allowed)
      "anthropic",
      "@/app",
      "@/components",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(mod).sort()).toEqual(
      ["buildSkuResolutionDecisionForLine", "buildSkuResolutionDraft"].sort()
    );
  });
});
