import { describe, it, expect } from "vitest";
import type { ValidationContext } from "@/types/validation";
import type { BomLine } from "@/types/bom";
import { poeBudgetRule } from "@/lib/validation/rules/poe-budget";

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

// Shahid's real data: 2× C9300L-24UXG-4X-A (720W each = 1440W total)
// + 8× C9120AXE-E (25.5W each = 204W total) → 14% utilization
describe("Rule: PoE Budget (Device Draw)", () => {
  it("Shahid scenario: 8 APs on 2 switches passes (204W of 1440W, 14%)", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 8 });
    const ctx = makeContext([sw, ap]);

    const results = poeBudgetRule.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].severity).toBe("info");
    expect(results[0].message).toContain("14%");
  });

  it("errors when total AP draw exceeds total switch budget", () => {
    // 1× C9300-24P = 445W budget; 20× C9120AXE-E = 20 × 25.5 = 510W draw
    const sw = makeLine({ id: "sw-1", sku: "C9300-24P", quantity: 1 });
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 20 });
    const ctx = makeContext([sw, ap]);

    const results = poeBudgetRule.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("510");
    expect(results[0].message).toContain("445");
  });

  it("warns when utilization exceeds 80% but stays under 100%", () => {
    // 1× C9300-24P = 445W budget; 16× C9120AXE-E = 408W draw → 91.7%
    const sw = makeLine({ id: "sw-1", sku: "C9300-24P", quantity: 1 });
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 16 });
    const ctx = makeContext([sw, ap]);

    const results = poeBudgetRule.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("warning");
    expect(results[0].message).toContain("92%");
  });

  it("error takes precedence over warning when draw > 100%", () => {
    // Exceeds budget → must be error, not warning
    const sw = makeLine({ id: "sw-1", sku: "C9300-24P", quantity: 1 });
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 20 });
    const ctx = makeContext([sw, ap]);

    const results = poeBudgetRule.run(ctx);
    expect(results[0].severity).toBe("error");
  });

  it("skips when no PoE switches in BoM", () => {
    // AP only, no switch chassis
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 4 });
    const ctx = makeContext([ap]);

    const results = poeBudgetRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not applicable");
  });

  it("passes with zero draw when no PoE devices in BoM", () => {
    // Switch present but no APs
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const ctx = makeContext([sw]);

    const results = poeBudgetRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("no PoE devices");
  });

  it("ignores non-hardware lines (accessories, licenses) when computing AP draw", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300-24P", quantity: 1 });
    // AP line marked as accessory — should not count as PoE device
    const apAccessory = makeLine({
      id: "ap-1",
      sku: "C9120AXE-E",
      quantity: 20,
      category: "accessory",
    });
    const ctx = makeContext([sw, apAccessory]);

    // No hardware APs → no draw
    const results = poeBudgetRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("scales budget correctly with multiple switches", () => {
    // 2× C9300L-24UXG-4X-A = 1440W; 2× C9120AXE-E = 51W → well under
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 2 });
    const ctx = makeContext([sw, ap]);

    const results = poeBudgetRule.run(ctx);
    expect(results[0].passed).toBe(true);
    const det = results[0].details as { totalBudgetW: number; totalDrawW: number };
    expect(det.totalBudgetW).toBe(1440);
    expect(det.totalDrawW).toBe(51);
  });
});
