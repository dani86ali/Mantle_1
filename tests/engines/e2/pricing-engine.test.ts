import { describe, it, expect } from "vitest";
import { convertCurrency, applyVendorDiscount, applyInhouseMargin } from "@/engines/e2/pricing-engine";

describe("convertCurrency (CS-001)", () => {
  it("converts 100 USD at 3.75 to 375 SAR", () => {
    expect(convertCurrency(100, 3.75)).toBe(375);
  });

  it("returns 0 when amount is 0", () => {
    expect(convertCurrency(0, 3.75)).toBe(0);
  });
});

describe("applyVendorDiscount (CS-002)", () => {
  it("applies 35% partner then 8% deal-reg sequentially: 100000 -> 59800", () => {
    // 100000 * 0.65 * 0.92 = 59800
    expect(applyVendorDiscount(100000, 0.35, 0.08)).toBe(59800);
  });
});

describe("applyInhouseMargin (CS-003)", () => {
  it("V34: 10% margin — 10000 × 0.90 = 9000", () => {
    // 10000 * (1 - 0.10) = 9000
    expect(applyInhouseMargin({ netCost: 10000, inhouseMarginPct: 0.10, taVersion: "V34" })).toBe(9000);
  });

  it("V35: 5% margin — 20000 × 0.95 = 19000", () => {
    // 20000 * (1 - 0.05) = 19000
    expect(applyInhouseMargin({ netCost: 20000, inhouseMarginPct: 0.05, taVersion: "V35" })).toBe(19000);
  });

  it("V31: passthrough — pre-V34 has no inhouse margin column", () => {
    expect(applyInhouseMargin({ netCost: 10000, inhouseMarginPct: 0.10, taVersion: "V31" })).toBe(10000);
  });

  it("PLv13: passthrough — pre-V34 has no inhouse margin column", () => {
    expect(applyInhouseMargin({ netCost: 10000, inhouseMarginPct: 0.10, taVersion: "PLv13" })).toBe(10000);
  });

  it("V32: passthrough — pre-V34 has no inhouse margin column", () => {
    expect(applyInhouseMargin({ netCost: 10000, inhouseMarginPct: 0.10, taVersion: "V32" })).toBe(10000);
  });

  it("zero margin on V34: returns netCost unchanged", () => {
    expect(applyInhouseMargin({ netCost: 10000, inhouseMarginPct: 0, taVersion: "V34" })).toBe(10000);
  });

  it("zero cost on V34: returns 0", () => {
    expect(applyInhouseMargin({ netCost: 0, inhouseMarginPct: 0.10, taVersion: "V34" })).toBe(0);
  });

  it("throws on unknown taVersion", () => {
    expect(() =>
      applyInhouseMargin({ netCost: 10000, inhouseMarginPct: 0.10, taVersion: "V99" as never })
    ).toThrow();
  });

  it("throws on negative netCost", () => {
    expect(() =>
      applyInhouseMargin({ netCost: -1, inhouseMarginPct: 0.10, taVersion: "V34" })
    ).toThrow();
  });

  it("throws on margin > 1", () => {
    expect(() =>
      applyInhouseMargin({ netCost: 10000, inhouseMarginPct: 1.5, taVersion: "V34" })
    ).toThrow();
  });
});
