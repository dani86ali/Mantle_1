import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as mod from "@/lib/projects/mantle-price-estimate-model";
import {
  buildMantlePriceEstimateModel,
  type MantleLineCategory,
} from "@/lib/projects/mantle-price-estimate-model";
import type { PricedBoqDraftLine, PricedBoqDraftSummary } from "@/lib/projects/priced-boq";
import type { PricedBoqArtifactPayload } from "@/lib/projects/priced-boq-artifact";

/** A priced draft line with sane defaults (unitList 100, unitNet 80 -> 20% disc). */
function pricedLine(overrides: Partial<PricedBoqDraftLine> = {}): PricedBoqDraftLine {
  return {
    sourceFormat: "format_1_line_item",
    sourceFileId: "file-1",
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "ORIG-1",
    description: "Item one",
    quantity: 2,
    originalCells: { A: "1", B: "Item one" },
    status: "priced",
    acceptedSku: "ACC-1",
    decisionStatus: "accepted",
    amounts: {
      currency: "SAR",
      quantity: 2,
      unitListPriceSar: 100,
      extendedListPriceSar: 200,
      unitSellPriceSar: 80,
      extendedSellPriceSar: 160,
      pricingMode: "markup",
      ratePercent: 20,
      vatRatePercent: 15,
      vatAmountSar: 24,
      totalIncVatSar: 184,
    },
    ...overrides,
  };
}

/** A retained unpriced draft line of the given status. */
function unpricedLine(overrides: Partial<PricedBoqDraftLine> = {}): PricedBoqDraftLine {
  return {
    sourceFormat: "format_1_line_item",
    sourceFileId: "file-1",
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "ORIG-1",
    description: "Item one",
    quantity: 2,
    originalCells: { A: "1" },
    status: "missing_decision",
    warning: "No SKU resolution decision exists for this BoQ line.",
    ...overrides,
  };
}

/** Derive a summary from lines, with explicit totals so VAT copy-through is testable. */
function summaryFor(
  lines: PricedBoqDraftLine[],
  totalsOverrides: Partial<PricedBoqDraftSummary["totals"]> = {}
): PricedBoqDraftSummary {
  const pricedLineCount = lines.filter((l) => l.status === "priced").length;
  const missingDecisionCount = lines.filter((l) => l.status === "missing_decision").length;
  const notAcceptedCount = lines.filter((l) => l.status === "not_accepted").length;
  const missingPriceCount = lines.filter((l) => l.status === "missing_price").length;
  return {
    inputLineCount: lines.length,
    pricedLineCount,
    unpricedLineCount: missingDecisionCount + notAcceptedCount + missingPriceCount,
    missingDecisionCount,
    notAcceptedCount,
    missingPriceCount,
    totals: {
      currency: "SAR",
      lineCount: pricedLineCount,
      subtotalListPriceSar: 0,
      subtotalSellPriceSar: 0,
      vatAmountSar: 0,
      totalIncVatSar: 0,
      ...totalsOverrides,
    },
  };
}

function payload(
  lines: PricedBoqDraftLine[],
  totalsOverrides: Partial<PricedBoqDraftSummary["totals"]> = {}
): PricedBoqArtifactPayload {
  return {
    sourceNormalizedBoqArtifactId: "nb-1",
    sourceNormalizedBoqArtifactVersion: 1,
    sourceSkuResolutionArtifactId: "sk-1",
    sourceSkuResolutionArtifactVersion: 1,
    sourceFileIds: ["file-1"],
    pricingConfig: {
      currency: "SAR",
      mode: "markup",
      ratePercent: 20,
      vatRatePercent: 15,
      roundingDecimals: 2,
    },
    unitListPriceSarBySku: {},
    lineCount: lines.length,
    lines,
    summary: summaryFor(lines, totalsOverrides),
  };
}

describe("buildMantlePriceEstimateModel - rows", () => {
  it("preserves payload line order", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({ sourceRowNumber: 1, acceptedSku: "A" }),
        unpricedLine({ sourceRowNumber: 2, originalSku: "B" }),
        pricedLine({ sourceRowNumber: 3, acceptedSku: "C" }),
      ]),
    });
    expect(model.rows.map((r) => r.sourceRowNumber)).toEqual([1, 2, 3]);
    expect(model.rows.map((r) => r.status)).toEqual([
      "priced",
      "missing_decision",
      "priced",
    ]);
  });

  it("emits exactly one row per payload line", () => {
    const lines = [pricedLine({ sourceRowNumber: 1 }), unpricedLine({ sourceRowNumber: 2 })];
    const model = buildMantlePriceEstimateModel({ payload: payload(lines) });
    expect(model.rows).toHaveLength(2);
  });

  it("maps a priced row to the expected Mantle cell fields", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([pricedLine()]),
    });
    expect(model.rows[0]).toMatchObject({
      partNumber: "ACC-1",
      description: "Item one",
      quantity: 2,
      unitListPriceSar: 100,
      unitNetPriceSar: 80,
      extendedNetPriceSar: 160,
      discountPercent: 20,
      status: "priced",
    });
  });

  it("maps a missing_decision row with null prices and preserves the warning", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        unpricedLine({ status: "missing_decision", originalSku: "ORIG-X" }),
      ]),
    });
    const row = model.rows[0];
    expect(row.status).toBe("missing_decision");
    expect(row.partNumber).toBe("ORIG-X");
    expect(row.unitListPriceSar).toBeNull();
    expect(row.unitNetPriceSar).toBeNull();
    expect(row.extendedNetPriceSar).toBeNull();
    expect(row.discountPercent).toBeNull();
    expect(row.warning).toBe("No SKU resolution decision exists for this BoQ line.");
  });

  it("maps a not_accepted row with null prices and preserves the warning", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        unpricedLine({
          status: "not_accepted",
          acceptedSku: undefined,
          decisionStatus: "rejected",
          originalSku: "ORIG-NA",
          warning: "SKU is not accepted for pricing.",
        }),
      ]),
    });
    const row = model.rows[0];
    expect(row.status).toBe("not_accepted");
    expect(row.partNumber).toBe("ORIG-NA");
    expect(row.unitListPriceSar).toBeNull();
    expect(row.discountPercent).toBeNull();
    expect(row.warning).toBe("SKU is not accepted for pricing.");
  });

  it("maps a missing_price row using acceptedSku as partNumber with null prices", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        unpricedLine({
          status: "missing_price",
          acceptedSku: "NO-PRICE",
          decisionStatus: "accepted",
          originalSku: "ORIG-MP",
          warning: "Accepted SKU has no SAR unit price.",
        }),
      ]),
    });
    const row = model.rows[0];
    expect(row.status).toBe("missing_price");
    expect(row.partNumber).toBe("NO-PRICE");
    expect(row.acceptedSku).toBe("NO-PRICE");
    expect(row.unitListPriceSar).toBeNull();
    expect(row.extendedNetPriceSar).toBeNull();
    expect(row.discountPercent).toBeNull();
  });

  it("calculates discountPercent to 2 decimals, including negative discount", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({
          sourceRowNumber: 1,
          amounts: {
            currency: "SAR",
            quantity: 1,
            unitListPriceSar: 30,
            extendedListPriceSar: 30,
            unitSellPriceSar: 20,
            extendedSellPriceSar: 20,
            pricingMode: "markup",
            ratePercent: 0,
            vatRatePercent: 15,
            vatAmountSar: 3,
            totalIncVatSar: 23,
          },
        }),
        pricedLine({
          sourceRowNumber: 2,
          amounts: {
            currency: "SAR",
            quantity: 1,
            unitListPriceSar: 100,
            extendedListPriceSar: 100,
            unitSellPriceSar: 125,
            extendedSellPriceSar: 125,
            pricingMode: "markup",
            ratePercent: 25,
            vatRatePercent: 15,
            vatAmountSar: 18.75,
            totalIncVatSar: 143.75,
          },
        }),
      ]),
    });
    expect(model.rows[0].discountPercent).toBe(33.33);
    expect(model.rows[1].discountPercent).toBe(-25);
  });

  it("uses discountPercent 0 when unitListPriceSar is 0", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({
          amounts: {
            currency: "SAR",
            quantity: 1,
            unitListPriceSar: 0,
            extendedListPriceSar: 0,
            unitSellPriceSar: 0,
            extendedSellPriceSar: 0,
            pricingMode: "margin",
            ratePercent: 30,
            vatRatePercent: 15,
            vatAmountSar: 0,
            totalIncVatSar: 0,
          },
        }),
      ]),
    });
    expect(model.rows[0].discountPercent).toBe(0);
  });
});

describe("buildMantlePriceEstimateModel - totals", () => {
  it("sums extendedNetPriceSar over priced rows only", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({ sourceRowNumber: 1, acceptedSku: "A" }), // extended 160
        pricedLine({
          sourceRowNumber: 2,
          acceptedSku: "B",
          amounts: {
            currency: "SAR",
            quantity: 1,
            unitListPriceSar: 50,
            extendedListPriceSar: 50,
            unitSellPriceSar: 40,
            extendedSellPriceSar: 40,
            pricingMode: "markup",
            ratePercent: 20,
            vatRatePercent: 15,
            vatAmountSar: 6,
            totalIncVatSar: 46,
          },
        }),
        unpricedLine({ sourceRowNumber: 3, status: "missing_decision" }),
      ]),
    });
    expect(model.totals.totalPriceSar).toBe(200);
  });

  it("splits product/service/subscription totals by explicit category map", () => {
    const lines = [
      pricedLine({ sourceRowNumber: 1, acceptedSku: "HW" }), // 160 product
      pricedLine({ sourceRowNumber: 2, acceptedSku: "SVC" }), // 160 service
      pricedLine({ sourceRowNumber: 3, acceptedSku: "SUB" }), // 160 subscription
    ];
    const categoryByAcceptedSku: Record<string, MantleLineCategory> = {
      HW: "product",
      SVC: "service",
      SUB: "subscription",
    };
    const model = buildMantlePriceEstimateModel({
      payload: payload(lines),
      categoryByAcceptedSku,
    });
    expect(model.totals.productTotalSar).toBe(160);
    expect(model.totals.serviceTotalSar).toBe(160);
    expect(model.totals.subscriptionTotalSar).toBe(160);
    expect(model.totals.totalPriceSar).toBe(480);
    expect(model.warnings).toEqual([]);
  });

  it("defaults missing-category priced rows to product and warns exactly once", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({ sourceRowNumber: 1, acceptedSku: "A" }),
        pricedLine({ sourceRowNumber: 2, acceptedSku: "B" }),
      ]),
      categoryByAcceptedSku: {},
    });
    expect(model.totals.productTotalSar).toBe(320);
    expect(model.totals.serviceTotalSar).toBe(0);
    expect(model.totals.subscriptionTotalSar).toBe(0);
    expect(model.warnings).toHaveLength(1);
    expect(model.warnings[0]).toBe(
      "Mantle line category metadata was not supplied for one or more priced rows; defaulted those rows to product totals."
    );
  });

  it("copies vatAmountSar and totalIncVatSar from the payload summary, not recalculated", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([pricedLine()], { vatAmountSar: 99, totalIncVatSar: 999 }),
    });
    expect(model.totals.vatAmountSar).toBe(99);
    expect(model.totals.totalIncVatSar).toBe(999);
  });

  it("copies line counts from the payload summary", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({ sourceRowNumber: 1, acceptedSku: "A" }),
        unpricedLine({ sourceRowNumber: 2, status: "missing_decision" }),
        unpricedLine({ sourceRowNumber: 3, status: "not_accepted", acceptedSku: undefined }),
        unpricedLine({ sourceRowNumber: 4, status: "missing_price", acceptedSku: "MP" }),
      ]),
    });
    expect(model.totals).toMatchObject({
      pricedLineCount: 1,
      unpricedLineCount: 3,
      missingDecisionCount: 1,
      notAcceptedCount: 1,
      missingPriceCount: 1,
    });
  });
});

describe("buildMantlePriceEstimateModel - category metadata", () => {
  it("exposes explicit service/subscription/product categories on priced rows", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({ sourceRowNumber: 1, acceptedSku: "HW" }),
        pricedLine({ sourceRowNumber: 2, acceptedSku: "SVC" }),
        pricedLine({ sourceRowNumber: 3, acceptedSku: "SUB" }),
      ]),
      categoryByAcceptedSku: { HW: "product", SVC: "service", SUB: "subscription" },
    });
    expect(model.rows.map((r) => r.category)).toEqual(["product", "service", "subscription"]);
    expect(model.rows.map((r) => r.categoryWasDefaulted)).toEqual([false, false, false]);
    expect(model.warnings).toEqual([]);
  });

  it("defaults a missing-category priced row to product and flags categoryWasDefaulted", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([pricedLine({ acceptedSku: "A" })]),
      categoryByAcceptedSku: {},
    });
    expect(model.rows[0].category).toBe("product");
    expect(model.rows[0].categoryWasDefaulted).toBe(true);
  });

  it("emits the missing-category warning exactly once for multiple defaulted priced rows", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({ sourceRowNumber: 1, acceptedSku: "A" }),
        pricedLine({ sourceRowNumber: 2, acceptedSku: "B" }),
        pricedLine({ sourceRowNumber: 3, acceptedSku: "C" }),
      ]),
      categoryByAcceptedSku: {},
    });
    expect(model.rows.every((r) => r.category === "product" && r.categoryWasDefaulted)).toBe(true);
    expect(
      model.warnings.filter(
        (w) =>
          w ===
          "Mantle line category metadata was not supplied for one or more priced rows; defaulted those rows to product totals."
      )
    ).toHaveLength(1);
  });

  it("sets category null and categoryWasDefaulted false on unpriced rows", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        unpricedLine({ sourceRowNumber: 1, status: "missing_decision" }),
        unpricedLine({ sourceRowNumber: 2, status: "not_accepted", acceptedSku: undefined }),
        unpricedLine({ sourceRowNumber: 3, status: "missing_price", acceptedSku: "MP" }),
      ]),
    });
    expect(model.rows.map((r) => r.category)).toEqual([null, null, null]);
    expect(model.rows.map((r) => r.categoryWasDefaulted)).toEqual([false, false, false]);
  });

  it("does not emit the missing-category warning for unpriced rows alone", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        unpricedLine({ sourceRowNumber: 1, status: "missing_decision" }),
        unpricedLine({ sourceRowNumber: 2, status: "missing_price", acceptedSku: "MP" }),
      ]),
    });
    expect(model.warnings).toEqual([]);
  });

  it("keeps category totals consistent with resolved row categories", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({ sourceRowNumber: 1, acceptedSku: "HW" }), // 160 product
        pricedLine({ sourceRowNumber: 2, acceptedSku: "SVC" }), // 160 service
        pricedLine({ sourceRowNumber: 3, acceptedSku: "SUB" }), // 160 subscription
        unpricedLine({ sourceRowNumber: 4, status: "missing_decision" }),
      ]),
      categoryByAcceptedSku: { HW: "product", SVC: "service", SUB: "subscription" },
    });
    const sumBy = (category: MantleLineCategory) =>
      model.rows
        .filter((r) => r.category === category)
        .reduce((acc, r) => acc + (r.extendedNetPriceSar ?? 0), 0);
    expect(model.totals.productTotalSar).toBe(sumBy("product"));
    expect(model.totals.serviceTotalSar).toBe(sumBy("service"));
    expect(model.totals.subscriptionTotalSar).toBe(sumBy("subscription"));
  });
});

describe("buildMantlePriceEstimateModel - metadata, defaults & purity", () => {
  it("preserves source metadata on each row", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([
        pricedLine({
          sourceFileId: "file-7",
          sourceSheetName: "Sheet1",
          sourceRowNumber: 12,
          originalLineNumber: "1.1",
          originalSku: "ORIG-7",
          acceptedSku: "ACC-7",
        }),
      ]),
    });
    expect(model.rows[0]).toMatchObject({
      sourceFileId: "file-7",
      sourceSheetName: "Sheet1",
      sourceRowNumber: 12,
      originalLineNumber: "1.1",
      originalSku: "ORIG-7",
      acceptedSku: "ACC-7",
    });
  });

  it("omits sourceSheetName when the line has none", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([pricedLine({ sourceSheetName: undefined })]),
    });
    expect("sourceSheetName" in model.rows[0]).toBe(false);
  });

  it("applies the documented defaults", () => {
    const model = buildMantlePriceEstimateModel({
      payload: payload([pricedLine()]),
    });
    expect(model.rows[0].smartAccountMandatory).toBe("-");
    expect(model.rows[0].serviceDurationMonths).toBe("---");
    expect(model.rows[0].estimatedLeadTimeDays).toBe("N/A");
    expect(model.rows[0].pricingTerm).toBe("");
  });

  it("does not mutate the payload, lines, originalCells, amounts, or category map", () => {
    const lines = [pricedLine({ acceptedSku: "A" })];
    const pay = payload(lines);
    const categoryByAcceptedSku: Record<string, MantleLineCategory> = { A: "service" };
    const paySnapshot = structuredClone(pay);
    const mapSnapshot = structuredClone(categoryByAcceptedSku);
    buildMantlePriceEstimateModel({ payload: pay, categoryByAcceptedSku });
    expect(pay).toEqual(paySnapshot);
    expect(categoryByAcceptedSku).toEqual(mapSnapshot);
  });
});

describe("buildMantlePriceEstimateModel - surface & isolation", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/mantle-price-estimate-model.ts"),
    "utf8"
  );

  it("exposes only buildMantlePriceEstimateModel at runtime", () => {
    expect(Object.keys(mod)).toEqual(["buildMantlePriceEstimateModel"]);
  });

  it("imports nothing but type-only priced-boq references", () => {
    const importLines = source.split("\n").filter((l) => /^\s*import\b/.test(l));
    for (const line of importLines) {
      for (const token of [
        "exceljs",
        "@/lib/db",
        "drizzle",
        "catalog",
        "@/lib/projects/sku",
        "approval",
        "staleness",
        "@/engines",
        "@/coordinator",
        "@/lib/agent",
        "@/lib/adapters",
        "@/app",
        "@/components",
        "anthropic",
        "openai",
      ]) {
        expect(line).not.toContain(token);
      }
    }
    // Both priced-boq references must stay type-only so they carry no runtime dep.
    for (const line of importLines) {
      if (line.includes("priced-boq")) {
        expect(line).toContain("import type");
      }
    }
  });

  it("keeps both source files ASCII-only", () => {
    const files = [
      "src/lib/projects/mantle-price-estimate-model.ts",
      "tests/lib/projects/mantle-price-estimate-model.test.ts",
    ];
    for (const file of files) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text)).toBe(false);
    }
  });
});
