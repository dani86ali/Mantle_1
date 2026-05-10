import { describe, it, expect } from "vitest";
import { convertCurrency, applyVendorDiscount } from "@/engines/e2/pricing-engine";

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
