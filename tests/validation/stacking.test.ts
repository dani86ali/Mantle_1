import { describe, it, expect } from "vitest";
import type { ValidationContext } from "@/types/validation";
import type { BomLine } from "@/types/bom";
import { stackingRule } from "@/lib/validation/rules/stacking";

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

// Shahid's real data (§3): 2× C9300L-24UXG-4X-A + C9300L-STACK-KIT × 2
// + C9300L-STACK × 4 (2 per switch) + STACK-T3-50CM × 2 (ring topology)
describe("Rule: Stacking (Device Specs JSON)", () => {
  it("Shahid scenario: 2 switches with kit + 4 modules + 2 cables passes", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const kit = makeLine({ id: "kit-1", sku: "C9300L-STACK-KIT", quantity: 2, category: "accessory" });
    const mod = makeLine({ id: "mod-1", sku: "C9300L-STACK", quantity: 4, category: "accessory" });
    const cable = makeLine({ id: "cab-1", sku: "STACK-T3-50CM", quantity: 2, category: "accessory" });

    const results = stackingRule.run(makeContext([sw, kit, mod, cable]));
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].ruleId).toBe("stacking");
  });

  it("errors when stacking kit is missing", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const mod = makeLine({ id: "mod-1", sku: "C9300L-STACK", quantity: 4, category: "accessory" });
    const cable = makeLine({ id: "cab-1", sku: "STACK-T3-50CM", quantity: 2, category: "accessory" });

    const results = stackingRule.run(makeContext([sw, mod, cable]));
    const kitError = results.find((r) => r.message.includes("kit") || r.message.includes("KIT"));
    expect(kitError).toBeDefined();
    expect(kitError?.severity).toBe("error");
    expect(kitError?.passed).toBe(false);
  });

  it("errors when stack adapter modules are insufficient (need 4, have 2)", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const kit = makeLine({ id: "kit-1", sku: "C9300L-STACK-KIT", quantity: 2, category: "accessory" });
    const mod = makeLine({ id: "mod-1", sku: "C9300L-STACK", quantity: 2, category: "accessory" }); // short
    const cable = makeLine({ id: "cab-1", sku: "STACK-T3-50CM", quantity: 2, category: "accessory" });

    const results = stackingRule.run(makeContext([sw, kit, mod, cable]));
    const modError = results.find((r) => r.message.includes("adapter") || r.message.includes("C9300L-STACK"));
    expect(modError).toBeDefined();
    expect(modError?.severity).toBe("error");
    expect(modError?.message).toContain("4");
    expect(modError?.message).toContain("2");
  });

  it("errors when stacking cables are absent", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const kit = makeLine({ id: "kit-1", sku: "C9300L-STACK-KIT", quantity: 2, category: "accessory" });
    const mod = makeLine({ id: "mod-1", sku: "C9300L-STACK", quantity: 4, category: "accessory" });

    const results = stackingRule.run(makeContext([sw, kit, mod]));
    const cableError = results.find((r) => r.message.toLowerCase().includes("cable"));
    expect(cableError).toBeDefined();
    expect(cableError?.severity).toBe("error");
  });

  it("warns when cable count is below ring topology (1 cable for 2 switches = chain)", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const kit = makeLine({ id: "kit-1", sku: "C9300L-STACK-KIT", quantity: 2, category: "accessory" });
    const mod = makeLine({ id: "mod-1", sku: "C9300L-STACK", quantity: 4, category: "accessory" });
    const cable = makeLine({ id: "cab-1", sku: "STACK-T3-50CM", quantity: 1, category: "accessory" }); // chain

    const results = stackingRule.run(makeContext([sw, kit, mod, cable]));
    const cableWarn = results.find((r) => r.message.toLowerCase().includes("cable") || r.message.toLowerCase().includes("ring"));
    expect(cableWarn).toBeDefined();
    expect(cableWarn?.severity).toBe("warning");
    expect(cableWarn?.passed).toBe(false);
  });

  it("does not trigger when only a single switch is present", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 1 });
    const results = stackingRule.run(makeContext([sw]));

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not applicable");
  });

  it("does not check stacking kit for C9300 models (stack_kit_needed = false)", () => {
    // C9300-24P: stack_kit_needed = false, so no kit check — only cables
    const sw = makeLine({ id: "sw-1", sku: "C9300-24P-A", quantity: 2 });
    const cable = makeLine({ id: "cab-1", sku: "STACK-T1-50CM", quantity: 2, category: "accessory" });

    const results = stackingRule.run(makeContext([sw, cable]));
    // No kit error — passes
    const kitError = results.find((r) => r.message.toLowerCase().includes("kit"));
    expect(kitError).toBeUndefined();
    expect(results[0].passed).toBe(true);
  });

  it("passes ring topology for 3-switch stack with 3 cables", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 3 });
    const kit = makeLine({ id: "kit-1", sku: "C9300L-STACK-KIT", quantity: 3, category: "accessory" });
    const mod = makeLine({ id: "mod-1", sku: "C9300L-STACK", quantity: 6, category: "accessory" });
    const cable = makeLine({ id: "cab-1", sku: "STACK-T3-50CM", quantity: 3, category: "accessory" });

    const results = stackingRule.run(makeContext([sw, kit, mod, cable]));
    expect(results[0].passed).toBe(true);
  });
});
