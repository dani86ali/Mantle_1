import { describe, it, expect } from "vitest";
import { convertCurrency, applyVendorDiscount, applyInhouseMargin, calculateOverhead, calculateCostWithOverhead, calculateSellingPrice, calculateExtendedSell } from "@/engines/e2/pricing-engine";

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

const ZERO_RATES = { shipmentPct: 0, customPct: 0, insurancePct: 0, whtaxPct: 0, zakatPct: 0, financePct: 0, riskPct: 0 };

describe("calculateOverhead (CS-004)", () => {
  // ── individual components ──────────────────────────────────────────────────

  it("shipment only: 10000 × 0.03 = 300", () => {
    // 10000 * 0.03 = 300
    const r = calculateOverhead({ unitAfterDiscount: 10000, ...ZERO_RATES, shipmentPct: 0.03 });
    expect(r.shipment).toBeCloseTo(300, 6);
    expect(r.custom).toBe(0);
    expect(r.insurance).toBe(0);
    expect(r.whtax).toBe(0);
    expect(r.zakat).toBe(0);
    expect(r.finance).toBe(0);
    expect(r.risk).toBe(0);
    expect(r.total).toBeCloseTo(300, 6);
  });

  it("custom only: 10000 × 0.02 = 200", () => {
    // 10000 * 0.02 = 200
    const r = calculateOverhead({ unitAfterDiscount: 10000, ...ZERO_RATES, customPct: 0.02 });
    expect(r.custom).toBeCloseTo(200, 6);
    expect(r.total).toBeCloseTo(200, 6);
  });

  it("insurance only: 10000 × 0.01 = 100", () => {
    // 10000 * 0.01 = 100
    const r = calculateOverhead({ unitAfterDiscount: 10000, ...ZERO_RATES, insurancePct: 0.01 });
    expect(r.insurance).toBeCloseTo(100, 6);
    expect(r.total).toBeCloseTo(100, 6);
  });

  it("whtax only: 10000 × 0.07 = 700", () => {
    // 10000 * 0.07 = 700 (IEEE 754: ~700.0000000000001)
    const r = calculateOverhead({ unitAfterDiscount: 10000, ...ZERO_RATES, whtaxPct: 0.07 });
    expect(r.whtax).toBeCloseTo(700, 6);
    expect(r.total).toBeCloseTo(700, 6);
  });

  it("zakat only: 10000 × 0.025 = 250 (V34+ default rate)", () => {
    // 10000 * 0.025 = 250; pre-V34 callers pass zakatPct: 0
    const r = calculateOverhead({ unitAfterDiscount: 10000, ...ZERO_RATES, zakatPct: 0.025 });
    expect(r.zakat).toBeCloseTo(250, 6);
    expect(r.total).toBeCloseTo(250, 6);
  });

  it("finance only: 10000 × 0.05 = 500", () => {
    // 10000 * 0.05 = 500
    const r = calculateOverhead({ unitAfterDiscount: 10000, ...ZERO_RATES, financePct: 0.05 });
    expect(r.finance).toBeCloseTo(500, 6);
    expect(r.total).toBeCloseTo(500, 6);
  });

  it("risk only: 10000 × 0.05 = 500", () => {
    // 10000 * 0.05 = 500
    const r = calculateOverhead({ unitAfterDiscount: 10000, ...ZERO_RATES, riskPct: 0.05 });
    expect(r.risk).toBeCloseTo(500, 6);
    expect(r.total).toBeCloseTo(500, 6);
  });

  // ── combined ───────────────────────────────────────────────────────────────

  it("combined: 10000 × (0.03+0.02+0+0.07+0.025+0+0.05) = 1950", () => {
    // shipment=300, custom=200, insurance=0, whtax=700, zakat=250, finance=0, risk=500 → total=1950
    const r = calculateOverhead({
      unitAfterDiscount: 10000,
      shipmentPct: 0.03, customPct: 0.02, insurancePct: 0,
      whtaxPct: 0.07, zakatPct: 0.025, financePct: 0, riskPct: 0.05,
    });
    expect(r.shipment).toBeCloseTo(300, 6);
    expect(r.custom).toBeCloseTo(200, 6);
    expect(r.insurance).toBe(0);
    expect(r.whtax).toBeCloseTo(700, 6);
    expect(r.zakat).toBeCloseTo(250, 6);
    expect(r.finance).toBe(0);
    expect(r.risk).toBeCloseTo(500, 6);
    expect(r.total).toBeCloseTo(1950, 6);
  });

  // ── boundary ───────────────────────────────────────────────────────────────

  it("zero unitAfterDiscount → all amounts are zero", () => {
    const r = calculateOverhead({
      unitAfterDiscount: 0,
      shipmentPct: 0.03, customPct: 0.02, insurancePct: 0.01,
      whtaxPct: 0.07, zakatPct: 0.025, financePct: 0.05, riskPct: 0.05,
    });
    expect(r.shipment).toBe(0);
    expect(r.custom).toBe(0);
    expect(r.insurance).toBe(0);
    expect(r.whtax).toBe(0);
    expect(r.zakat).toBe(0);
    expect(r.finance).toBe(0);
    expect(r.risk).toBe(0);
    expect(r.total).toBe(0);
  });

  it("all rates zero → total overhead is zero", () => {
    const r = calculateOverhead({ unitAfterDiscount: 50000, ...ZERO_RATES });
    expect(r.total).toBe(0);
  });

  // ── validation ─────────────────────────────────────────────────────────────

  it("throws on negative unitAfterDiscount", () => {
    expect(() =>
      calculateOverhead({ unitAfterDiscount: -1, ...ZERO_RATES })
    ).toThrow();
  });

  it("throws when a rate exceeds 1 (100%)", () => {
    expect(() =>
      calculateOverhead({ unitAfterDiscount: 10000, ...ZERO_RATES, shipmentPct: 1.1 })
    ).toThrow();
  });
});

describe("calculateCostWithOverhead (CS-005)", () => {
  it("typical: 9000 (after discount) + 1350 (overhead) + 100 (fixed) = 10450", () => {
    // 9000 + 1350 + 100 = 10450
    expect(calculateCostWithOverhead({ unitAfterInhouseMargin: 9000, overheadTotal: 1350, fixedValue: 100 })).toBe(10450);
  });

  it("no fixed value: 9000 + 1350 + 0 = 10350", () => {
    // 9000 + 1350 + 0 = 10350
    expect(calculateCostWithOverhead({ unitAfterInhouseMargin: 9000, overheadTotal: 1350, fixedValue: 0 })).toBe(10350);
  });

  it("zero overhead and fixed: returns unitAfterInhouseMargin unchanged", () => {
    expect(calculateCostWithOverhead({ unitAfterInhouseMargin: 9000, overheadTotal: 0, fixedValue: 0 })).toBe(9000);
  });

  it("all zeros: returns 0", () => {
    expect(calculateCostWithOverhead({ unitAfterInhouseMargin: 0, overheadTotal: 0, fixedValue: 0 })).toBe(0);
  });

  it("throws on negative unitAfterInhouseMargin", () => {
    expect(() =>
      calculateCostWithOverhead({ unitAfterInhouseMargin: -1, overheadTotal: 100, fixedValue: 0 })
    ).toThrow();
  });

  it("throws on negative overheadTotal", () => {
    expect(() =>
      calculateCostWithOverhead({ unitAfterInhouseMargin: 9000, overheadTotal: -1, fixedValue: 0 })
    ).toThrow();
  });

  it("throws on negative fixedValue", () => {
    expect(() =>
      calculateCostWithOverhead({ unitAfterInhouseMargin: 9000, overheadTotal: 100, fixedValue: -1 })
    ).toThrow();
  });
});

describe("calculateSellingPrice (CS-006)", () => {
  // ── margin mode ──────────────────────────────────────────────────────────────

  it("margin: 10000 cost, 25% profit → 10000/0.75 ≈ 13333.33", () => {
    // 10000 / (1 - 0.25) = 10000 / 0.75 = 13333.333...
    expect(calculateSellingPrice({ mode: "margin", costWithOverhead: 10000, profitPct: 0.25 }))
      .toBeCloseTo(13333.33, 2);
  });

  it("margin: zero cost → 0", () => {
    expect(calculateSellingPrice({ mode: "margin", costWithOverhead: 0, profitPct: 0.25 })).toBe(0);
  });

  it("margin: zero profitPct → returns costWithOverhead unchanged", () => {
    // 10000 / (1 - 0) = 10000 / 1 = 10000
    expect(calculateSellingPrice({ mode: "margin", costWithOverhead: 10000, profitPct: 0 })).toBe(10000);
  });

  // ── markup mode ──────────────────────────────────────────────────────────────

  it("markup: 10000 cost, 25% profit → 10000 × 1.25 = 12500", () => {
    // 10000 * (1 + 0.25) = 12500
    expect(calculateSellingPrice({ mode: "markup", costWithOverhead: 10000, profitPct: 0.25 })).toBe(12500);
  });

  it("markup: zero cost → 0", () => {
    expect(calculateSellingPrice({ mode: "markup", costWithOverhead: 0, profitPct: 0.25 })).toBe(0);
  });

  it("markup: zero profitPct → returns costWithOverhead unchanged", () => {
    // 10000 * (1 + 0) = 10000
    expect(calculateSellingPrice({ mode: "markup", costWithOverhead: 10000, profitPct: 0 })).toBe(10000);
  });

  it("markup: 100% profitPct is valid — 10000 × 2 = 20000", () => {
    // 10000 * (1 + 1) = 20000
    expect(calculateSellingPrice({ mode: "markup", costWithOverhead: 10000, profitPct: 1 })).toBe(20000);
  });

  // ── margin vs markup inequality ───────────────────────────────────────────────

  it("same inputs: margin yields higher sell price than markup when profitPct > 0", () => {
    // margin: 10000/0.75 ≈ 13333; markup: 10000*1.25 = 12500 → margin > markup
    const margin = calculateSellingPrice({ mode: "margin", costWithOverhead: 10000, profitPct: 0.25 });
    const markup = calculateSellingPrice({ mode: "markup", costWithOverhead: 10000, profitPct: 0.25 });
    expect(margin).toBeGreaterThan(markup);
  });

  // ── validation ────────────────────────────────────────────────────────────────

  it("margin: throws when profitPct = 1 (1 − 1 = 0 denominator)", () => {
    expect(() =>
      calculateSellingPrice({ mode: "margin", costWithOverhead: 10000, profitPct: 1 })
    ).toThrow();
  });

  it("throws on negative costWithOverhead", () => {
    expect(() =>
      calculateSellingPrice({ mode: "margin", costWithOverhead: -1, profitPct: 0.25 })
    ).toThrow();
  });

  it("throws on negative profitPct", () => {
    expect(() =>
      calculateSellingPrice({ mode: "markup", costWithOverhead: 10000, profitPct: -0.1 })
    ).toThrow();
  });
});

describe("calculateExtendedSell (CS-007)", () => {
  // ── no discount ──────────────────────────────────────────────────────────────

  it("no embeds: 1000 × 5 = 5000", () => {
    // 1000 * 5 * (1 - 0 - 0 - 0) = 5000
    expect(calculateExtendedSell({ unitSellPrice: 1000, qty: 5, discountEmbedPct: 0, solutionEmbedPct: 0, inhouseEmbedPct: 0 })).toBe(5000);
  });

  // ── multi-quantity ────────────────────────────────────────────────────────────

  it("qty 10, no embeds: 1000 × 10 = 10000", () => {
    // 1000 * 10 * (1 - 0 - 0 - 0) = 10000
    expect(calculateExtendedSell({ unitSellPrice: 1000, qty: 10, discountEmbedPct: 0, solutionEmbedPct: 0, inhouseEmbedPct: 0 })).toBe(10000);
  });

  // ── discount tiers ────────────────────────────────────────────────────────────

  it("discount embed only: 2000 × 3 × (1 − 0.10) = 5400", () => {
    // 2000 * 3 * 0.90 = 5400
    expect(calculateExtendedSell({ unitSellPrice: 2000, qty: 3, discountEmbedPct: 0.10, solutionEmbedPct: 0, inhouseEmbedPct: 0 })).toBe(5400);
  });

  it("all 3 embeds: 100000 × 10 × (1 − 0.05 − 0.03 − 0.02) = 900000", () => {
    // 100000 * 10 * 0.90 = 900000
    expect(calculateExtendedSell({ unitSellPrice: 100000, qty: 10, discountEmbedPct: 0.05, solutionEmbedPct: 0.03, inhouseEmbedPct: 0.02 })).toBeCloseTo(900000, 2);
  });

  // ── boundary ──────────────────────────────────────────────────────────────────

  it("zero unit price → 0", () => {
    expect(calculateExtendedSell({ unitSellPrice: 0, qty: 5, discountEmbedPct: 0.05, solutionEmbedPct: 0, inhouseEmbedPct: 0 })).toBe(0);
  });

  it("zero qty → 0", () => {
    expect(calculateExtendedSell({ unitSellPrice: 1000, qty: 0, discountEmbedPct: 0.05, solutionEmbedPct: 0, inhouseEmbedPct: 0 })).toBe(0);
  });

  // ── validation ────────────────────────────────────────────────────────────────

  it("throws when sum of embeds >= 1", () => {
    // 0.5 + 0.3 + 0.2 = 1.0 — not < 1
    expect(() =>
      calculateExtendedSell({ unitSellPrice: 1000, qty: 5, discountEmbedPct: 0.5, solutionEmbedPct: 0.3, inhouseEmbedPct: 0.2 })
    ).toThrow();
  });

  it("throws on negative unitSellPrice", () => {
    expect(() =>
      calculateExtendedSell({ unitSellPrice: -1, qty: 5, discountEmbedPct: 0, solutionEmbedPct: 0, inhouseEmbedPct: 0 })
    ).toThrow();
  });
});
