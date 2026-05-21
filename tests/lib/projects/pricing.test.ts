import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as mod from "@/lib/projects/pricing";
import {
  PROJECT_PRICING_CURRENCY,
  DEFAULT_PROJECT_VAT_RATE_PERCENT,
  DEFAULT_PROJECT_ROUNDING_DECIMALS,
  createProjectPricingConfig,
  validateProjectPricingConfig,
  roundCurrency,
  calculateUnitSellPriceSar,
  calculatePricedLineAmounts,
  summarizePricedLineAmounts,
  type CreateProjectPricingConfigInput,
  type PricedLineAmounts,
} from "@/lib/projects/pricing";
import type { ProjectPricingConfig } from "@/types/project";

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

describe("constants", () => {
  it("expose the SAR / 15% / 2-decimal defaults", () => {
    expect(PROJECT_PRICING_CURRENCY).toBe("SAR");
    expect(DEFAULT_PROJECT_VAT_RATE_PERCENT).toBe(15);
    expect(DEFAULT_PROJECT_ROUNDING_DECIMALS).toBe(2);
  });
});

describe("createProjectPricingConfig", () => {
  it("defaults currency SAR, VAT 15, rounding 2", () => {
    const result = createProjectPricingConfig({ mode: "markup", ratePercent: 20 });
    expect(result).toEqual({
      currency: "SAR",
      mode: "markup",
      ratePercent: 20,
      vatRatePercent: 15,
      roundingDecimals: 2,
    });
  });

  it("keeps explicit vatRatePercent and roundingDecimals, including 0", () => {
    const result = createProjectPricingConfig({
      mode: "margin",
      ratePercent: 25,
      vatRatePercent: 0,
      roundingDecimals: 0,
    });
    expect(result.vatRatePercent).toBe(0);
    expect(result.roundingDecimals).toBe(0);
  });

  it("does not mutate the input", () => {
    const input: CreateProjectPricingConfigInput = { mode: "markup", ratePercent: 20 };
    const snapshot = structuredClone(input);
    createProjectPricingConfig(input);
    expect(input).toEqual(snapshot);
  });

  it("validates before returning (invalid mode throws)", () => {
    expect(() =>
      createProjectPricingConfig({
        mode: "discount" as unknown as "markup",
        ratePercent: 10,
      })
    ).toThrow("Pricing mode must be margin or markup.");
  });
});

describe("validateProjectPricingConfig - exact errors", () => {
  it("rejects a non-SAR currency", () => {
    expect(() =>
      validateProjectPricingConfig(config({ currency: "USD" as unknown as "SAR" }))
    ).toThrow("Pricing currency must be SAR.");
  });

  it("rejects an invalid mode", () => {
    expect(() =>
      validateProjectPricingConfig(config({ mode: "nope" as unknown as "markup" }))
    ).toThrow("Pricing mode must be margin or markup.");
  });

  it("rejects margin rate of 100 (upper bound is exclusive)", () => {
    expect(() =>
      validateProjectPricingConfig(config({ mode: "margin", ratePercent: 100 }))
    ).toThrow(
      "Margin ratePercent must be a finite number from 0 up to, but not including, 100."
    );
  });

  it("rejects a negative margin rate", () => {
    expect(() =>
      validateProjectPricingConfig(config({ mode: "margin", ratePercent: -1 }))
    ).toThrow(
      "Margin ratePercent must be a finite number from 0 up to, but not including, 100."
    );
  });

  it("rejects a non-finite margin rate", () => {
    expect(() =>
      validateProjectPricingConfig(config({ mode: "margin", ratePercent: Infinity }))
    ).toThrow(
      "Margin ratePercent must be a finite number from 0 up to, but not including, 100."
    );
  });

  it("rejects a markup rate above 100", () => {
    expect(() =>
      validateProjectPricingConfig(config({ mode: "markup", ratePercent: 101 }))
    ).toThrow("Markup ratePercent must be a finite number from 0 to 100.");
  });

  it("accepts a markup rate of exactly 100", () => {
    expect(() =>
      validateProjectPricingConfig(config({ mode: "markup", ratePercent: 100 }))
    ).not.toThrow();
  });

  it("rejects a VAT rate above 100", () => {
    expect(() => validateProjectPricingConfig(config({ vatRatePercent: 101 }))).toThrow(
      "VAT ratePercent must be a finite number from 0 to 100."
    );
  });

  it("rejects a non-finite VAT rate", () => {
    expect(() => validateProjectPricingConfig(config({ vatRatePercent: NaN }))).toThrow(
      "VAT ratePercent must be a finite number from 0 to 100."
    );
  });

  it("rejects non-integer roundingDecimals", () => {
    expect(() => validateProjectPricingConfig(config({ roundingDecimals: 2.5 }))).toThrow(
      "roundingDecimals must be an integer from 0 to 6."
    );
  });

  it("rejects roundingDecimals above 6", () => {
    expect(() => validateProjectPricingConfig(config({ roundingDecimals: 7 }))).toThrow(
      "roundingDecimals must be an integer from 0 to 6."
    );
  });
});

describe("roundCurrency", () => {
  it("rounds to 2 decimals by default", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(2.344)).toBe(2.34);
    expect(roundCurrency(2.345)).toBe(2.35);
  });

  it("honors a custom decimals argument", () => {
    expect(roundCurrency(1.23456, 4)).toBe(1.2346);
    expect(roundCurrency(1.6, 0)).toBe(2);
  });
});

describe("calculateUnitSellPriceSar", () => {
  it("applies the margin formula: list / (1 - rate)", () => {
    // 100 / (1 - 0.20) = 125
    const unit = calculateUnitSellPriceSar({
      config: config({ mode: "margin", ratePercent: 20 }),
      unitListPriceSar: 100,
    });
    expect(unit).toBe(125);
  });

  it("applies the markup formula: list * (1 + rate)", () => {
    // 100 * (1 + 0.20) = 120
    const unit = calculateUnitSellPriceSar({
      config: config({ mode: "markup", ratePercent: 20 }),
      unitListPriceSar: 100,
    });
    expect(unit).toBe(120);
  });

  it("rejects a negative unitListPriceSar with the exact error", () => {
    expect(() =>
      calculateUnitSellPriceSar({ config: config(), unitListPriceSar: -1 })
    ).toThrow("unitListPriceSar must be a finite nonnegative number.");
  });

  it("rejects a non-finite unitListPriceSar with the exact error", () => {
    expect(() =>
      calculateUnitSellPriceSar({ config: config(), unitListPriceSar: Infinity })
    ).toThrow("unitListPriceSar must be a finite nonnegative number.");
  });
});

describe("calculatePricedLineAmounts", () => {
  it("computes a full markup line and applies VAT", () => {
    // unit sell = 100 * 1.2 = 120; ext sell = 120 * 2 = 240;
    // VAT 15% = 36; total = 276; ext list = 200.
    const line = calculatePricedLineAmounts({
      config: config({ mode: "markup", ratePercent: 20 }),
      unitListPriceSar: 100,
      quantity: 2,
    });
    expect(line).toEqual<PricedLineAmounts>({
      currency: "SAR",
      quantity: 2,
      unitListPriceSar: 100,
      extendedListPriceSar: 200,
      unitSellPriceSar: 120,
      extendedSellPriceSar: 240,
      pricingMode: "markup",
      ratePercent: 20,
      vatRatePercent: 15,
      vatAmountSar: 36,
      totalIncVatSar: 276,
    });
  });

  it("rounds the sell side invoice-style: unit first, then extended, then VAT", () => {
    // unitList=100, markup 33.333%, qty=3, 2 decimals.
    // raw unit = 133.333 -> rounded unit = 133.33
    // extended sell = round(133.33 * 3) = 399.99   (cascade)
    //   (an independent round of 133.333*3 = 399.999 would give 400.00)
    // VAT 15% = round(399.99 * 0.15) = round(59.9985) = 60.00
    // total = round(399.99 + 60.00) = 459.99
    const line = calculatePricedLineAmounts({
      config: config({ mode: "markup", ratePercent: 33.333 }),
      unitListPriceSar: 100,
      quantity: 3,
    });
    expect(line.unitSellPriceSar).toBe(133.33);
    expect(line.extendedSellPriceSar).toBe(399.99);
    expect(line.vatAmountSar).toBe(60);
    expect(line.totalIncVatSar).toBe(459.99);
  });

  it("honors custom roundingDecimals", () => {
    // raw unit = 100 * 1.33333 = 133.333 -> 4 decimals = 133.333
    const line = calculatePricedLineAmounts({
      config: config({ mode: "markup", ratePercent: 33.333, roundingDecimals: 4 }),
      unitListPriceSar: 100,
      quantity: 1,
    });
    expect(line.unitSellPriceSar).toBe(133.333);
    expect(line.extendedSellPriceSar).toBe(133.333);
  });

  it("scales extended amounts by quantity", () => {
    const line = calculatePricedLineAmounts({
      config: config({ mode: "markup", ratePercent: 0, vatRatePercent: 0 }),
      unitListPriceSar: 50,
      quantity: 4,
    });
    expect(line.extendedListPriceSar).toBe(200);
    expect(line.extendedSellPriceSar).toBe(200);
  });

  it("prices a zero unitListPriceSar to zero", () => {
    const line = calculatePricedLineAmounts({
      config: config({ mode: "margin", ratePercent: 30 }),
      unitListPriceSar: 0,
      quantity: 10,
    });
    expect(line.unitSellPriceSar).toBe(0);
    expect(line.extendedSellPriceSar).toBe(0);
    expect(line.vatAmountSar).toBe(0);
    expect(line.totalIncVatSar).toBe(0);
  });

  it("rejects a negative quantity with the exact error", () => {
    expect(() =>
      calculatePricedLineAmounts({
        config: config(),
        unitListPriceSar: 100,
        quantity: -2,
      })
    ).toThrow("quantity must be a finite nonnegative number.");
  });

  it("rejects a non-finite quantity with the exact error", () => {
    expect(() =>
      calculatePricedLineAmounts({
        config: config(),
        unitListPriceSar: 100,
        quantity: NaN,
      })
    ).toThrow("quantity must be a finite nonnegative number.");
  });

  it("rejects an omitted quantity with the exact error", () => {
    expect(() =>
      calculatePricedLineAmounts({ config: config(), unitListPriceSar: 100 })
    ).toThrow("quantity must be a finite nonnegative number.");
  });

  it("does not mutate the input config", () => {
    const cfg = config({ mode: "markup", ratePercent: 20 });
    const snapshot = structuredClone(cfg);
    calculatePricedLineAmounts({ config: cfg, unitListPriceSar: 100, quantity: 3 });
    expect(cfg).toEqual(snapshot);
  });
});

describe("summarizePricedLineAmounts", () => {
  it("totals across multiple priced lines", () => {
    const cfg = config({ mode: "markup", ratePercent: 20, vatRatePercent: 15 });
    const lines = [
      calculatePricedLineAmounts({ config: cfg, unitListPriceSar: 100, quantity: 2 }),
      calculatePricedLineAmounts({ config: cfg, unitListPriceSar: 50, quantity: 1 }),
    ];
    // Line 1: extList 200, extSell 240, VAT 36, total 276.
    // Line 2: extList 50, unit sell 60, extSell 60, VAT 9, total 69.
    const summary = summarizePricedLineAmounts(lines);
    expect(summary).toEqual({
      currency: "SAR",
      lineCount: 2,
      subtotalListPriceSar: 250,
      subtotalSellPriceSar: 300,
      vatAmountSar: 45,
      totalIncVatSar: 345,
    });
  });

  it("returns zeroed totals for an empty set", () => {
    expect(summarizePricedLineAmounts([])).toEqual({
      currency: "SAR",
      lineCount: 0,
      subtotalListPriceSar: 0,
      subtotalSellPriceSar: 0,
      vatAmountSar: 0,
      totalIncVatSar: 0,
    });
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/pricing.ts"),
    "utf8"
  );

  it("imports nothing from DB, artifact store, catalog lookup, engines, AI, API, UI, schema, or Drizzle", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    for (const forbidden of [
      "/db/",
      "@/lib/db",
      "drizzle",
      "artifact",
      "catalog-lookup",
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
      [
        "DEFAULT_PROJECT_ROUNDING_DECIMALS",
        "DEFAULT_PROJECT_VAT_RATE_PERCENT",
        "PROJECT_PRICING_CURRENCY",
        "calculatePricedLineAmounts",
        "calculateUnitSellPriceSar",
        "createProjectPricingConfig",
        "roundCurrency",
        "summarizePricedLineAmounts",
        "validateProjectPricingConfig",
      ].sort()
    );
  });
});
