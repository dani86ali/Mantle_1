import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as mod from "@/lib/projects/priced-boq";
import {
  getPricedBoqLineKey,
  buildPricedBoqDraft,
  type BuildPricedBoqDraftInput,
  type ExplicitSarUnitPrice,
} from "@/lib/projects/priced-boq";
import {
  calculatePricedLineAmounts,
  summarizePricedLineAmounts,
} from "@/lib/projects/pricing";
import type {
  CanonicalBoqLine,
  ProjectPricingConfig,
  SkuResolutionDecision,
  SkuResolutionStatus,
} from "@/types/project";

const FILE_ID = "file-1";

function sar(unitListPriceSar: number): ExplicitSarUnitPrice {
  return { currency: "SAR", unitListPriceSar };
}

function config(overrides: Partial<ProjectPricingConfig> = {}): ProjectPricingConfig {
  return {
    currency: "SAR",
    mode: "markup",
    ratePercent: 20,
    vatRatePercent: 15,
    roundingDecimals: 2,
    ...overrides,
  };
}

function line(overrides: Partial<CanonicalBoqLine> = {}): CanonicalBoqLine {
  return {
    sourceFormat: "format_1_line_item",
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    sku: "SKU-1",
    description: "Item one",
    quantity: 2,
    originalCells: { A: "1", B: "Item one" },
    ...overrides,
  };
}

function decision(overrides: Partial<SkuResolutionDecision> = {}): SkuResolutionDecision {
  return {
    sourceFileId: FILE_ID,
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "SKU-1",
    status: "accepted",
    suggestions: [],
    acceptedSku: "SKU-1",
    ...overrides,
  };
}

describe("getPricedBoqLineKey", () => {
  it("keys on sourceFileId + sourceRowNumber", () => {
    expect(getPricedBoqLineKey({ sourceFileId: "f", sourceRowNumber: 7 })).toBe("f::7");
  });
});

describe("buildPricedBoqDraft - line order & coverage", () => {
  it("preserves BoQ line order, one draft line per input line", () => {
    const lines = [
      line({ sourceRowNumber: 1, sku: "A" }),
      line({ sourceRowNumber: 2, sku: "B" }),
      line({ sourceRowNumber: 3, sku: "C" }),
    ];
    const draft = buildPricedBoqDraft({
      lines,
      decisions: [],
      pricingConfig: config(),
      unitListPriceSarBySku: {},
    });
    expect(draft.lines).toHaveLength(3);
    expect(draft.lines.map((l) => l.originalSku)).toEqual(["A", "B", "C"]);
    expect(draft.lines.map((l) => l.sourceRowNumber)).toEqual([1, 2, 3]);
  });

  it("copies source metadata, including optional fields only when present", () => {
    const draft = buildPricedBoqDraft({
      lines: [
        line({
          sourceRowNumber: 5,
          sourceSheetName: "Sheet1",
          parentLineNumber: "1",
          originalLineNumber: "1.1",
          sku: "CHILD",
          description: "child",
          quantity: 3,
          originalCells: { A: "x" },
        }),
        line({ sourceRowNumber: 6, sku: "TOP" }),
      ],
      decisions: [],
      pricingConfig: config(),
      unitListPriceSarBySku: {},
    });
    expect(draft.lines[0]).toMatchObject({
      sourceFormat: "format_1_line_item",
      sourceFileId: FILE_ID,
      sourceSheetName: "Sheet1",
      sourceRowNumber: 5,
      originalLineNumber: "1.1",
      parentLineNumber: "1",
      originalSku: "CHILD",
      description: "child",
      quantity: 3,
      originalCells: { A: "x" },
    });
    expect("sourceSheetName" in draft.lines[1]).toBe(false);
    expect("parentLineNumber" in draft.lines[1]).toBe(false);
  });
});

describe("buildPricedBoqDraft - pricing", () => {
  it("prices only accepted decisions and uses pricing.ts amounts", () => {
    const cfg = config({ mode: "markup", ratePercent: 20 });
    const lines = [line({ sourceRowNumber: 1, sku: "A", quantity: 2 })];
    const draft = buildPricedBoqDraft({
      lines,
      decisions: [decision({ sourceRowNumber: 1, acceptedSku: "ACC-A" })],
      pricingConfig: cfg,
      unitListPriceSarBySku: { "ACC-A": sar(100) },
    });
    const expected = calculatePricedLineAmounts({
      config: cfg,
      unitListPriceSar: 100,
      quantity: 2,
    });
    expect(draft.lines[0].status).toBe("priced");
    expect(draft.lines[0].acceptedSku).toBe("ACC-A");
    expect(draft.lines[0].decisionStatus).toBe("accepted");
    expect(draft.lines[0].amounts).toEqual(expected);
  });

  it("totals match summarizePricedLineAmounts over priced lines only", () => {
    const cfg = config({ mode: "markup", ratePercent: 20 });
    const lines = [
      line({ sourceRowNumber: 1, sku: "A", quantity: 2 }),
      line({ sourceRowNumber: 2, sku: "B", quantity: 1 }),
      line({ sourceRowNumber: 3, sku: "C", quantity: 1 }),
    ];
    const draft = buildPricedBoqDraft({
      lines,
      decisions: [
        decision({ sourceRowNumber: 1, acceptedSku: "A" }),
        decision({ sourceRowNumber: 2, acceptedSku: "B" }),
        // row 3: no decision -> not priced, excluded from totals
      ],
      pricingConfig: cfg,
      unitListPriceSarBySku: { A: sar(100), B: sar(50) },
    });
    const expected = summarizePricedLineAmounts([
      calculatePricedLineAmounts({ config: cfg, unitListPriceSar: 100, quantity: 2 }),
      calculatePricedLineAmounts({ config: cfg, unitListPriceSar: 50, quantity: 1 }),
    ]);
    expect(draft.summary.totals).toEqual(expected);
    expect(draft.summary.totals.lineCount).toBe(2);
  });

  it("allows a zero SAR price and prices it to zero", () => {
    const draft = buildPricedBoqDraft({
      lines: [line({ sku: "Z", quantity: 10 })],
      decisions: [decision({ acceptedSku: "Z" })],
      pricingConfig: config({ mode: "margin", ratePercent: 30 }),
      unitListPriceSarBySku: { Z: sar(0) },
    });
    expect(draft.lines[0].status).toBe("priced");
    expect(draft.lines[0].amounts?.unitSellPriceSar).toBe(0);
    expect(draft.lines[0].amounts?.totalIncVatSar).toBe(0);
  });

  it("trims acceptedSku once and uses it for lookup and the reported field", () => {
    const draft = buildPricedBoqDraft({
      lines: [line({ sku: "A", quantity: 1 })],
      decisions: [decision({ acceptedSku: "  ACC-A  " })],
      pricingConfig: config(),
      unitListPriceSarBySku: { "ACC-A": sar(100) },
    });
    expect(draft.lines[0].status).toBe("priced");
    expect(draft.lines[0].acceptedSku).toBe("ACC-A");
  });
});

describe("buildPricedBoqDraft - retained unpriced rows", () => {
  it("retains a missing-decision row with the exact warning", () => {
    const draft = buildPricedBoqDraft({
      lines: [line({ sourceRowNumber: 1 })],
      decisions: [],
      pricingConfig: config(),
      unitListPriceSarBySku: {},
    });
    expect(draft.lines[0].status).toBe("missing_decision");
    expect(draft.lines[0].warning).toBe(
      "No SKU resolution decision exists for this BoQ line."
    );
    expect(draft.lines[0].amounts).toBeUndefined();
    expect(draft.lines[0].acceptedSku).toBeUndefined();
    expect(draft.lines[0].decisionStatus).toBeUndefined();
  });

  it.each<SkuResolutionStatus>(["needs_review", "rejected", "unresolved"])(
    "retains a %s row as not_accepted with decisionStatus and the exact warning",
    (status) => {
      const draft = buildPricedBoqDraft({
        lines: [line({ sourceRowNumber: 1 })],
        decisions: [decision({ status, acceptedSku: undefined })],
        pricingConfig: config(),
        unitListPriceSarBySku: { "SKU-1": sar(100) },
      });
      expect(draft.lines[0].status).toBe("not_accepted");
      expect(draft.lines[0].decisionStatus).toBe(status);
      expect(draft.lines[0].warning).toBe("SKU is not accepted for pricing.");
      expect(draft.lines[0].amounts).toBeUndefined();
    }
  );

  it("treats an accepted decision with a blank acceptedSku as not_accepted", () => {
    const draft = buildPricedBoqDraft({
      lines: [line()],
      decisions: [decision({ status: "accepted", acceptedSku: "   " })],
      pricingConfig: config(),
      unitListPriceSarBySku: {},
    });
    expect(draft.lines[0].status).toBe("not_accepted");
    expect(draft.lines[0].decisionStatus).toBe("accepted");
    expect(draft.lines[0].acceptedSku).toBeUndefined();
  });

  it("flags an accepted SKU with no SAR price as missing_price", () => {
    const draft = buildPricedBoqDraft({
      lines: [line()],
      decisions: [decision({ acceptedSku: "NO-PRICE" })],
      pricingConfig: config(),
      unitListPriceSarBySku: { OTHER: sar(100) },
    });
    expect(draft.lines[0].status).toBe("missing_price");
    expect(draft.lines[0].acceptedSku).toBe("NO-PRICE");
    expect(draft.lines[0].decisionStatus).toBe("accepted");
    expect(draft.lines[0].warning).toBe("Accepted SKU has no SAR unit price.");
    expect(draft.lines[0].amounts).toBeUndefined();
  });

  it("does not treat inherited prototype keys as a SAR price", () => {
    const draft = buildPricedBoqDraft({
      lines: [line()],
      decisions: [decision({ acceptedSku: "toString" })],
      pricingConfig: config(),
      unitListPriceSarBySku: {},
    });
    expect(draft.lines[0].status).toBe("missing_price");
  });
});

describe("buildPricedBoqDraft - summary counts", () => {
  it("counts each category and computes unpricedLineCount", () => {
    const cfg = config();
    const draft = buildPricedBoqDraft({
      lines: [
        line({ sourceRowNumber: 1, sku: "A" }), // priced
        line({ sourceRowNumber: 2, sku: "B" }), // missing decision
        line({ sourceRowNumber: 3, sku: "C" }), // not accepted
        line({ sourceRowNumber: 4, sku: "D" }), // missing price
      ],
      decisions: [
        decision({ sourceRowNumber: 1, acceptedSku: "A" }),
        decision({ sourceRowNumber: 3, status: "rejected", acceptedSku: undefined }),
        decision({ sourceRowNumber: 4, acceptedSku: "D" }),
      ],
      pricingConfig: cfg,
      unitListPriceSarBySku: { A: sar(100) },
    });
    expect(draft.summary).toMatchObject({
      inputLineCount: 4,
      pricedLineCount: 1,
      unpricedLineCount: 3,
      missingDecisionCount: 1,
      notAcceptedCount: 1,
      missingPriceCount: 1,
    });
  });
});

describe("buildPricedBoqDraft - errors", () => {
  it("throws the exact error on duplicate decision keys, even with no lines", () => {
    expect(() =>
      buildPricedBoqDraft({
        lines: [],
        decisions: [
          decision({ sourceRowNumber: 1 }),
          decision({ sourceRowNumber: 1 }),
        ],
        pricingConfig: config(),
        unitListPriceSarBySku: {},
      })
    ).toThrow("Duplicate SKU resolution decision for BoQ line.");
  });

  it("validates the pricing config up front, even with no priced lines", () => {
    expect(() =>
      buildPricedBoqDraft({
        lines: [],
        decisions: [],
        pricingConfig: config({ currency: "USD" as unknown as "SAR" }),
        unitListPriceSarBySku: {},
      })
    ).toThrow("Pricing currency must be SAR.");
  });

  it("bubbles the pricing.ts unitListPriceSar error for an invalid price", () => {
    expect(() =>
      buildPricedBoqDraft({
        lines: [line({ sku: "A" })],
        decisions: [decision({ acceptedSku: "A" })],
        pricingConfig: config(),
        unitListPriceSarBySku: { A: sar(-5) },
      })
    ).toThrow("unitListPriceSar must be a finite nonnegative number.");
  });

  it("throws the exact error for a non-SAR price entry", () => {
    expect(() =>
      buildPricedBoqDraft({
        lines: [line({ sku: "A", quantity: 1 })],
        decisions: [decision({ acceptedSku: "A" })],
        pricingConfig: config(),
        unitListPriceSarBySku: {
          A: { currency: "USD" as unknown as "SAR", unitListPriceSar: 100 },
        },
      })
    ).toThrow("Accepted SKU price must be in SAR.");
  });
});

describe("buildPricedBoqDraft - purity", () => {
  it("copies originalCells rather than aliasing the input", () => {
    const cells = { A: "1" };
    const input: BuildPricedBoqDraftInput = {
      lines: [line({ originalCells: cells })],
      decisions: [],
      pricingConfig: config(),
      unitListPriceSarBySku: {},
    };
    const draft = buildPricedBoqDraft(input);
    expect(draft.lines[0].originalCells).toEqual(cells);
    expect(draft.lines[0].originalCells).not.toBe(cells);
  });

  it("does not mutate any input", () => {
    const input: BuildPricedBoqDraftInput = {
      lines: [
        line({ sourceRowNumber: 1, sku: "A" }),
        line({ sourceRowNumber: 2, sku: "B" }),
      ],
      decisions: [
        decision({ sourceRowNumber: 1, acceptedSku: "A" }),
        decision({ sourceRowNumber: 2, status: "rejected", acceptedSku: undefined }),
      ],
      pricingConfig: config(),
      unitListPriceSarBySku: { A: sar(100) },
    };
    const snapshot = structuredClone(input);
    buildPricedBoqDraft(input);
    expect(input).toEqual(snapshot);
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/priced-boq.ts"),
    "utf8"
  );

  it("imports nothing from DB, artifact store, catalog lookup, mock catalog, engines, AI, API, UI, schema, or Drizzle", () => {
    const importLines = source
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l))
      .join("\n");
    for (const forbidden of [
      "/db/",
      "@/lib/db",
      "drizzle",
      "artifact",
      "catalog-lookup",
      "catalog-mock",
      "@/engines",
      "@/lib/agent",
      "@/lib/adapters",
      "openai",
      "anthropic",
      "redis",
      "@/app",
      "@/components",
      "schema",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the intended runtime exports", () => {
    expect(Object.keys(mod).sort()).toEqual(
      ["buildPricedBoqDraft", "getPricedBoqLineKey"].sort()
    );
  });
});
