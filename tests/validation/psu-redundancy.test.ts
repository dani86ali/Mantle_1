import { describe, it, expect } from "vitest";
import type { ValidationContext } from "@/types/validation";
import type { BomLine } from "@/types/bom";
import { psuRedundancyRule } from "@/lib/validation/rules/psu-redundancy";

function makeLine(overrides: Partial<BomLine> = {}): BomLine {
  return {
    id: `line-${Math.random().toString(36).slice(2, 8)}`,
    lineNumber: 1,
    sku: "C9300L-24UXG-4X-A",
    description: "Catalyst 9300L",
    quantity: 1,
    unitListPrice: 0,
    unitNetPrice: 0,
    discountPercent: 0,
    extendedNetPrice: 0,
    category: "hardware",
    smartAccountMandatory: false,
    validationFlags: [],
    decision: "pending",
    catalogVerified: true,
    ...overrides,
  };
}

function makeContext(lines: BomLine[]): ValidationContext {
  return {
    lines,
    requirements: {},
    region: "EMEAR",
    country: "SA",
    tenantStandards: {
      requireRedundantPsu: true,
      preferredLicenseTier: "advantage",
      preferredDnaTier: "advantage",
      defaultSupportLevel: "8x5xNBD",
      approvedProductFamilies: [],
      regionRestrictions: [],
    },
    catalogData: new Map(),
  };
}

// Shahid's real data: 2× C9300L-24UXG-4X-A
// PWR-C1-1100WAC-P × 2 (primary) + PWR-C1-1100WAC-P/2 × 2 (secondary)
describe("Rule: PSU Redundancy (SKU Check)", () => {
  it("Shahid scenario: primary + secondary SKUs pass", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const priPsu = makeLine({
      id: "psu-pri",
      sku: "PWR-C1-1100WAC-P",
      quantity: 2,
      category: "accessory",
    });
    const secPsu = makeLine({
      id: "psu-sec",
      sku: "PWR-C1-1100WAC-P/2",
      quantity: 2,
      category: "accessory",
    });
    const ctx = makeContext([sw, priPsu, secPsu]);

    const results = psuRedundancyRule.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it("errors when 2× primary PSU ordered instead of primary + secondary", () => {
    // 2× switches, but 4× primary PSU and 0 secondary
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const priPsu = makeLine({
      id: "psu-pri",
      sku: "PWR-C1-1100WAC-P",
      quantity: 4,
      category: "accessory",
    });
    const ctx = makeContext([sw, priPsu]);

    const results = psuRedundancyRule.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("PWR-C1-1100WAC-P");
    expect(results[0].message).toContain("PWR-C1-1100WAC-P/2");
  });

  it("does not error when primary qty = chassis qty (no redundancy ordered)", () => {
    // 2× switches + only 2× primary (single PSU per chassis, no redundancy)
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const priPsu = makeLine({
      id: "psu-pri",
      sku: "PWR-C1-1100WAC-P",
      quantity: 2,
      category: "accessory",
    });
    const ctx = makeContext([sw, priPsu]);

    const results = psuRedundancyRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("skips when no switches with psu_redundant spec in BoM", () => {
    // C9300L-24P-4X-A has no psu_redundant in Device Specs
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24P-4X-A", quantity: 2 });
    const psu = makeLine({
      id: "psu-1",
      sku: "PWR-C1-715WAC",
      quantity: 4,
      category: "accessory",
    });
    const ctx = makeContext([sw, psu]);

    const results = psuRedundancyRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not applicable");
  });

  it("error message names both the wrong SKU and the correct secondary SKU", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 1 });
    const priPsu = makeLine({
      id: "psu-pri",
      sku: "PWR-C1-1100WAC-P",
      quantity: 2,
      category: "accessory",
    });
    const ctx = makeContext([sw, priPsu]);

    const results = psuRedundancyRule.run(ctx);
    expect(results[0].message).toContain("PWR-C1-1100WAC-P");
    expect(results[0].message).toContain("PWR-C1-1100WAC-P/2");
  });

  it("passes when secondary-only line is present alongside primary", () => {
    // Unusual but valid: 1 primary + 1 secondary for 1 chassis
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 1 });
    const priPsu = makeLine({
      id: "psu-pri",
      sku: "PWR-C1-1100WAC-P",
      quantity: 1,
      category: "accessory",
    });
    const secPsu = makeLine({
      id: "psu-sec",
      sku: "PWR-C1-1100WAC-P/2",
      quantity: 1,
      category: "accessory",
    });
    const ctx = makeContext([sw, priPsu, secPsu]);

    const results = psuRedundancyRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });
});
