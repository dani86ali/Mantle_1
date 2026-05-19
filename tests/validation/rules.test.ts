import { describe, it, expect } from "vitest";
import type { ValidationContext, CatalogItemForValidation } from "@/types/validation";
import type { BomLine } from "@/types/bom";
import { runValidation } from "@/lib/validation/engine";
import { antennaCountRule } from "@/lib/validation/rules/antenna-count";
import { fanCountRule } from "@/lib/validation/rules/fan-count";
import { checkDnaOptout } from "@/lib/validation/rules/dna-optout";
import { checkApOnly } from "@/lib/validation/rules/ap-only";
import { skuExistsRule } from "@/lib/validation/rules/sku-exists";
import { eoxRule } from "@/lib/validation/rules/eox";
import { regionRule } from "@/lib/validation/rules/region";
import { poeRule } from "@/lib/validation/rules/poe";
import { opticsRule } from "@/lib/validation/rules/optics";
import { psuRule } from "@/lib/validation/rules/psu";
import { licenseRule } from "@/lib/validation/rules/license";
import { stackingRule } from "@/lib/validation/rules/stacking";
import { supportRule } from "@/lib/validation/rules/support";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<BomLine> = {}): BomLine {
  return {
    id: `line-${Math.random().toString(36).slice(2, 8)}`,
    lineNumber: 1,
    sku: "C9300L-24UXG-4X-A",
    description: "Catalyst 9300L",
    quantity: 1,
    unitListPrice: 13960,
    unitNetPrice: 13960,
    discountPercent: 0,
    extendedNetPrice: 13960,
    category: "hardware",
    smartAccountMandatory: true,
    validationFlags: [],
    decision: "pending",
    catalogVerified: true,
    ...overrides,
  };
}

function makeCatalogItem(
  overrides: Partial<CatalogItemForValidation> = {}
): CatalogItemForValidation {
  return {
    sku: "C9300L-24UXG-4X-A",
    exists: true,
    eoxStatus: { isEox: false },
    regionAvailability: ["EMEAR", "APJC", "AMER", "MEA"],
    category: "hardware",
    productFamily: "Catalyst 9300L Series",
    poeData: { poeBudgetWatts: 880, poePortCount: 24, poeClass: "class4" },
    opticsData: { sfpSlots: 4, qsfpSlots: 0, totalTransceiverSlots: 4 },
    psuData: { psuSlots: 2, psuWatts: 1100, isPrimary: true, isRedundant: false },
    stackingData: { stackable: true, maxStackSize: 8, requiresStackKit: true, modulesPerSwitch: 2 },
    ...overrides,
  };
}

function makeContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    lines: [],
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
    ...overrides,
  };
}

// ─── SKU Exists ───────────────────────────────────────────────────────────

describe("Rule: SKU Existence", () => {
  it("passes when all SKUs exist in catalog", () => {
    const line = makeLine({ sku: "C9300L-24UXG-4X-A" });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [line], catalogData: catalog });

    const results = skuExistsRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("fails when SKU not found in catalog", () => {
    const line = makeLine({ sku: "FAKE-SKU-999" });
    // Populated catalog (with a different SKU) — distinguishes "no catalog data"
    // from "catalog consulted but SKU missing".
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [line], catalogData: catalog });

    const results = skuExistsRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("FAKE-SKU-999");
  });

  it("returns 'unverified' warning when catalog data is empty", () => {
    const line = makeLine({ sku: "ANY-SKU" });
    const catalog = new Map<string, CatalogItemForValidation>();
    const ctx = makeContext({ lines: [line], catalogData: catalog });

    const results = skuExistsRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("warning");
    expect(results[0].message).toMatch(/not verified/i);
  });

  it("fails when SKU exists but marked as not found", () => {
    const line = makeLine({ sku: "BAD-SKU" });
    const catalog = new Map([["BAD-SKU", makeCatalogItem({ sku: "BAD-SKU", exists: false })]]);
    const ctx = makeContext({ lines: [line], catalogData: catalog });

    const results = skuExistsRule.run(ctx);
    expect(results[0].passed).toBe(false);
  });
});

// ─── EoX ──────────────────────────────────────────────────────────────────

// EoX detection is now CSV-backed (data/cisco-eox.csv via loadEoxLookup).
// WS-C3650-24TS-S → C9300-24T-A is a known migration row in the CSV; the
// active SKU C9300L-24UXG-4X-A is not in the CSV and therefore non-EoX.
describe("Rule: EoX Status", () => {
  it("passes when no EoX SKUs (line not in CSV)", () => {
    const line = makeLine({ sku: "C9300L-24UXG-4X-A" });
    const ctx = makeContext({ lines: [line] });

    const results = eoxRule.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].severity).toBe("info");
  });

  it("flags an EoX SKU from the CSV with its migration suggestion", () => {
    const line = makeLine({ sku: "WS-C3650-24TS-S" });
    const ctx = makeContext({ lines: [line] });

    const results = eoxRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("WS-C3650-24TS-S");
    expect(results[0].message).toContain("C9300-24T-A");
  });

  it("flags only the EoX line in a mixed BoM", () => {
    const eolLine = makeLine({ id: "eol-1", sku: "WS-C3650-24TS-S" });
    const activeLine = makeLine({ id: "act-1", sku: "C9300-48P-A" });
    const ctx = makeContext({ lines: [eolLine, activeLine] });

    const results = eoxRule.run(ctx);
    const failures = results.filter((r) => !r.passed);
    expect(failures).toHaveLength(1);
    expect(failures[0].affectedLineIds).toEqual(["eol-1"]);
  });

  it("returns the info pass-through on an empty BoM", () => {
    const ctx = makeContext({ lines: [] });

    const results = eoxRule.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].severity).toBe("info");
  });
});

// ─── Region ───────────────────────────────────────────────────────────────

describe("Rule: Region Availability", () => {
  it("passes when SKU available in target region", () => {
    const line = makeLine();
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [line], catalogData: catalog, country: "SA" });

    const results = regionRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("fails when SKU not available in target region", () => {
    const line = makeLine({ sku: "AMER-ONLY" });
    const catalog = new Map([
      [
        "AMER-ONLY",
        makeCatalogItem({
          sku: "AMER-ONLY",
          regionAvailability: ["AMER"],
        }),
      ],
    ]);
    const ctx = makeContext({ lines: [line], catalogData: catalog, country: "SA" });

    const results = regionRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain("not available");
  });
});

// ─── PoE ──────────────────────────────────────────────────────────────────

describe("Rule: PoE Budget", () => {
  it("passes when PoE budget is sufficient", () => {
    const line = makeLine();
    const catalog = new Map([
      [
        "C9300L-24UXG-4X-A",
        makeCatalogItem({
          poeData: { poeBudgetWatts: 880, poePortCount: 24 },
        }),
      ],
    ]);
    const ctx = makeContext({
      lines: [line],
      catalogData: catalog,
      requirements: { poeClass: "class3" }, // 15.4W per port
    });

    const results = poeRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("warns when PoE budget insufficient at max class", () => {
    const line = makeLine();
    const catalog = new Map([
      [
        "C9300L-24UXG-4X-A",
        makeCatalogItem({
          poeData: { poeBudgetWatts: 400, poePortCount: 24 },
        }),
      ],
    ]);
    const ctx = makeContext({
      lines: [line],
      catalogData: catalog,
      requirements: { poeClass: "class4" }, // 30W per port = 720W needed
    });

    const results = poeRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("warning");
  });

  it("skips when no PoE switches in BoM", () => {
    const line = makeLine({ sku: "C9120AXE-E" });
    const catalog = new Map([
      ["C9120AXE-E", makeCatalogItem({ sku: "C9120AXE-E", poeData: undefined })],
    ]);
    const ctx = makeContext({ lines: [line], catalogData: catalog });

    const results = poeRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not applicable");
  });
});

// ─── Optics ───────────────────────────────────────────────────────────────

describe("Rule: Optics Count", () => {
  it("passes when optics within slot count", () => {
    const hwLine = makeLine({ sku: "C9300L-24UXG-4X-A" });
    const sfpLine = makeLine({
      id: "sfp-1",
      sku: "SFP-10G-SR",
      description: "10G SFP+ Transceiver",
      quantity: 2,
      category: "accessory",
    });
    const catalog = new Map([
      ["C9300L-24UXG-4X-A", makeCatalogItem()],
    ]);
    const ctx = makeContext({
      lines: [hwLine, sfpLine],
      catalogData: catalog,
    });

    const results = opticsRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("fails when optics exceed slot count", () => {
    const hwLine = makeLine({ sku: "C9300L-24UXG-4X-A", quantity: 1 });
    const sfpLine = makeLine({
      id: "sfp-1",
      sku: "SFP-10G-SR",
      description: "10G SFP+ Transceiver",
      quantity: 6, // Only 4 slots available
      category: "accessory",
    });
    const catalog = new Map([
      ["C9300L-24UXG-4X-A", makeCatalogItem()],
    ]);
    const ctx = makeContext({
      lines: [hwLine, sfpLine],
      catalogData: catalog,
    });

    const results = opticsRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("error");
  });
});

// ─── PSU ──────────────────────────────────────────────────────────────────

describe("Rule: PSU Redundancy", () => {
  it("passes with both primary and secondary PSU", () => {
    const chassis = makeLine({ id: "ch-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const psuPri = makeLine({ id: "psu-1", sku: "PWR-C1-1100WAC-P", quantity: 2, category: "accessory" });
    const psuSec = makeLine({ id: "psu-2", sku: "PWR-C1-1100WAC-P/2", quantity: 2, category: "accessory" });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [chassis, psuPri, psuSec],
      catalogData: catalog,
      requirements: { redundancyRequired: true },
    });

    const results = psuRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("fails when missing secondary PSU", () => {
    const chassis = makeLine({ id: "ch-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const psuPri = makeLine({ id: "psu-1", sku: "PWR-C1-1100WAC-P", quantity: 2, category: "accessory" });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [chassis, psuPri],
      catalogData: catalog,
      requirements: { redundancyRequired: true },
    });

    const results = psuRule.run(ctx);
    expect(results.some((r) => !r.passed)).toBe(true);
    expect(results.some((r) => r.message.includes("secondary"))).toBe(true);
  });

  it("skips when redundancy not required", () => {
    const chassis = makeLine();
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [chassis],
      catalogData: catalog,
      requirements: { redundancyRequired: false },
      tenantStandards: {
        requireRedundantPsu: false,
        preferredLicenseTier: "advantage",
        preferredDnaTier: "advantage",
        defaultSupportLevel: "8x5xNBD",
        approvedProductFamilies: [],
        regionRestrictions: [],
      },
    });

    const results = psuRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not required");
  });
});

// ─── License ──────────────────────────────────────────────────────────────

describe("Rule: License Attachment", () => {
  it("passes when hardware has license attached", () => {
    const hw = makeLine({ id: "hw-1", sku: "C9300L-24UXG-4X-A" });
    const lic = makeLine({
      id: "lic-1",
      sku: "C9300L-DNA-A-24-3Y",
      category: "subscription",
    });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [hw, lic],
      catalogData: catalog,
    });

    const results = licenseRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("warns when hardware has no license", () => {
    const hw = makeLine({ id: "hw-1", sku: "C9300L-24UXG-4X-A" });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [hw], catalogData: catalog });

    const results = licenseRule.run(ctx);
    expect(results.some((r) => !r.passed)).toBe(true);
  });

  it("accepts DNA opt-out for APs (not a missing license)", () => {
    const ap = makeLine({
      id: "ap-1",
      sku: "C9120AXE-E",
    });
    const optOut = makeLine({
      id: "optout-1",
      sku: "C9120AX-DNA-OPTOUT",
      description: "C9120AX DNA Subscription Opt Out",
      category: "license",
    });
    const catalog = new Map([
      [
        "C9120AXE-E",
        makeCatalogItem({
          sku: "C9120AXE-E",
          productFamily: "Catalyst 9120AX Series",
        }),
      ],
    ]);
    const ctx = makeContext({
      lines: [ap, optOut],
      catalogData: catalog,
    });

    const results = licenseRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });
});

// ─── Stacking ─────────────────────────────────────────────────────────────

describe("Rule: Stacking", () => {
  it("passes with complete stacking configuration", () => {
    const sw1 = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const kit = makeLine({ id: "kit-1", sku: "C9300L-STACK-KIT", quantity: 2, category: "accessory" });
    const mod = makeLine({ id: "mod-1", sku: "C9300L-STACK", quantity: 4, category: "accessory" });
    const cable = makeLine({ id: "cable-1", sku: "STACK-T3-50CM", quantity: 2, category: "accessory" });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [sw1, kit, mod, cable],
      catalogData: catalog,
      requirements: { stackingRequired: true },
    });

    const results = stackingRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("fails when stacking kit missing", () => {
    const sw1 = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const mod = makeLine({ id: "mod-1", sku: "C9300L-STACK", quantity: 4, category: "accessory" });
    const cable = makeLine({ id: "cable-1", sku: "STACK-T3-50CM", quantity: 2, category: "accessory" });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [sw1, mod, cable],
      catalogData: catalog,
      requirements: { stackingRequired: true },
    });

    const results = stackingRule.run(ctx);
    expect(results.some((r) => r.message.includes("kit"))).toBe(true);
  });

  it("skips when only a single switch is present (no stacking needed)", () => {
    const sw1 = makeLine();
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [sw1],
      catalogData: catalog,
      requirements: { stackingRequired: false },
    });

    const results = stackingRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not applicable");
  });
});

// ─── Support ──────────────────────────────────────────────────────────────

describe("Rule: Support Attachment", () => {
  it("passes when SmartNet attached to switches", () => {
    const hw = makeLine({ id: "hw-1", sku: "C9300L-24UXG-4X-A" });
    const svc = makeLine({
      id: "svc-1",
      sku: "CON-SNT-C93024GA",
      category: "service",
    });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [hw, svc],
      catalogData: catalog,
    });

    const results = supportRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("warns when switch has no SmartNet", () => {
    const hw = makeLine({ id: "hw-1", sku: "C9300L-24UXG-4X-A" });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [hw], catalogData: catalog });

    const results = supportRule.run(ctx);
    expect(results.some((r) => !r.passed)).toBe(true);
    expect(results.some((r) => r.severity === "warning")).toBe(true);
  });

  it("does NOT flag APs without SmartNet (valid choice)", () => {
    const ap = makeLine({
      id: "ap-1",
      sku: "C9120AXE-E",
    });
    const catalog = new Map([
      [
        "C9120AXE-E",
        makeCatalogItem({
          sku: "C9120AXE-E",
          productFamily: "Catalyst 9120AX Series",
        }),
      ],
    ]);
    const ctx = makeContext({ lines: [ap], catalogData: catalog });

    const results = supportRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });
});

// ─── DNA Opt-out ──────────────────────────────────────────────────────────

describe("Rule: DNA Opt-out", () => {
  it("returns valid+info when a DNA-OPTOUT SKU is present", () => {
    const result = checkDnaOptout([
      { sku: "C9120AXE-E" },
      { sku: "C9120AX-DNA-OPTOUT" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.message).toBe("DNA subscription opted out — intentional");
  });

  it("returns valid+info (no opt-out) when no DNA-OPTOUT SKU present", () => {
    const result = checkDnaOptout([{ sku: "C9300L-24UXG-4X-A" }]);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.message).not.toContain("opted out");
  });

  it("matches any prefix before -DNA-OPTOUT", () => {
    const result = checkDnaOptout([{ sku: "SOME-PRODUCT-DNA-OPTOUT" }]);
    expect(result.valid).toBe(true);
    expect(result.message).toBe("DNA subscription opted out — intentional");
  });

  it("does not match partial suffix (no false positives)", () => {
    const result = checkDnaOptout([{ sku: "C9120AX-DNA-OPTOUT-EXTRA" }]);
    expect(result.valid).toBe(true);
    expect(result.message).not.toContain("opted out");
  });

  it("throws on invalid input (non-array)", () => {
    expect(() => checkDnaOptout("not-an-array")).toThrow();
  });

  it("throws when sku field is missing", () => {
    expect(() => checkDnaOptout([{ partNumber: "C9120AX-DNA-OPTOUT" }])).toThrow();
  });
});

// ─── AP-only ──────────────────────────────────────────────────────────────

describe("Rule: AP-only", () => {
  it("returns valid+info AP-only message when APs present but no controller", () => {
    const result = checkApOnly([
      { sku: "C9120AXE-E" },
      { sku: "C9120AX-DNA-OPTOUT" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.message).toBe("AP-only estimate — controller assumed separate");
  });

  it("returns not-applicable when no AP SKUs present", () => {
    const result = checkApOnly([{ sku: "C9300L-24UXG-4X-A" }]);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.message).toContain("not applicable");
  });

  it("returns not-applicable when controller is present alongside APs", () => {
    const result = checkApOnly([
      { sku: "C9120AXE-E" },
      { sku: "C9800-L-F-K9" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.message).toContain("controller present");
  });

  it("detects C9130 AP family", () => {
    const result = checkApOnly([{ sku: "C9130AXI-E" }]);
    expect(result.message).toBe("AP-only estimate — controller assumed separate");
  });

  it("detects C9800-CL cloud controller", () => {
    const result = checkApOnly([
      { sku: "C9120AXE-E" },
      { sku: "C9800-CL-K9" },
    ]);
    expect(result.message).toContain("controller present");
  });

  it("throws on invalid input (non-array)", () => {
    expect(() => checkApOnly(null)).toThrow();
  });

  it("throws when sku field is missing", () => {
    expect(() => checkApOnly([{ model: "C9120AXE-E" }])).toThrow();
  });
});

// ─── Full Engine ──────────────────────────────────────────────────────────

// ─── Antenna Count ────────────────────────────────────────────────────────

describe("Rule: Antenna Count", () => {
  it("passes when C9120AXE × 8 has 32 antennas (4 per AP)", () => {
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 8, category: "hardware" });
    const ant = makeLine({
      id: "ant-1",
      sku: "AIR-ANT2524DW-RS",
      quantity: 32,
      category: "accessory",
    });
    const catalog = new Map([["C9120AXE-E", makeCatalogItem({ sku: "C9120AXE-E" })]]);
    const ctx = makeContext({ lines: [ap, ant], catalogData: catalog });

    const results = antennaCountRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("errors when C9120AXE × 8 has only 24 antennas (should be 32)", () => {
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 8, category: "hardware" });
    const ant = makeLine({
      id: "ant-1",
      sku: "AIR-ANT2524DW-RS",
      quantity: 24,
      category: "accessory",
    });
    const catalog = new Map([["C9120AXE-E", makeCatalogItem({ sku: "C9120AXE-E" })]]);
    const ctx = makeContext({ lines: [ap, ant], catalogData: catalog });

    const results = antennaCountRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("32");
    expect(results[0].message).toContain("24");
  });

  it("errors when antenna line is absent entirely", () => {
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 4, category: "hardware" });
    const catalog = new Map([["C9120AXE-E", makeCatalogItem({ sku: "C9120AXE-E" })]]);
    const ctx = makeContext({ lines: [ap], catalogData: catalog });

    const results = antennaCountRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("16"); // 4 APs × 4 antennas
  });

  it("skips for C9120AXI (internal antenna, antennas_needed = 0)", () => {
    const ap = makeLine({ id: "ap-1", sku: "C9120AXI-E", quantity: 4, category: "hardware" });
    const catalog = new Map([["C9120AXI-E", makeCatalogItem({ sku: "C9120AXI-E" })]]);
    const ctx = makeContext({ lines: [ap], catalogData: catalog });

    const results = antennaCountRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not applicable");
  });

  it("skips when no AP hardware lines in BoM", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [sw], catalogData: catalog });

    const results = antennaCountRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not applicable");
  });
});

// ─── Fan Count ────────────────────────────────────────────────────────────

describe("Rule: Fan Count", () => {
  it("passes when C9300L × 2 has 6 fans (3 per switch)", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2, category: "hardware" });
    const fan = makeLine({
      id: "fan-1",
      sku: "C9300L-FAN-1RU",
      quantity: 6,
      category: "accessory",
    });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [sw, fan], catalogData: catalog });

    const results = fanCountRule.run(ctx);
    expect(results[0].passed).toBe(true);
  });

  it("warns when C9300L × 2 has only 4 fans (should be 6)", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 2, category: "hardware" });
    const fan = makeLine({
      id: "fan-1",
      sku: "C9300L-FAN-1RU",
      quantity: 4,
      category: "accessory",
    });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [sw, fan], catalogData: catalog });

    const results = fanCountRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("warning");
    expect(results[0].message).toContain("6");
    expect(results[0].message).toContain("4");
  });

  it("warns when fan line is absent entirely", () => {
    const sw = makeLine({ id: "sw-1", sku: "C9300L-24UXG-4X-A", quantity: 1, category: "hardware" });
    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({ lines: [sw], catalogData: catalog });

    const results = fanCountRule.run(ctx);
    expect(results[0].passed).toBe(false);
    expect(results[0].severity).toBe("warning");
    expect(results[0].message).toContain("3"); // 1 switch × 3 fans
  });

  it("skips when no switch hardware lines in BoM", () => {
    const ap = makeLine({ id: "ap-1", sku: "C9120AXE-E", quantity: 4, category: "hardware" });
    const catalog = new Map([["C9120AXE-E", makeCatalogItem({ sku: "C9120AXE-E" })]]);
    const ctx = makeContext({ lines: [ap], catalogData: catalog });

    const results = fanCountRule.run(ctx);
    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("not applicable");
  });
});

// ─── Full Engine ──────────────────────────────────────────────────────────

describe("Validation Engine: Full Run", () => {
  it("runs all 16 rules and returns combined results", () => {
    const hw = makeLine({ id: "hw-1", sku: "C9300L-24UXG-4X-A", quantity: 2 });
    const lic = makeLine({ id: "lic-1", sku: "C9300L-DNA-A-24-3Y", category: "subscription" });
    const svc = makeLine({ id: "svc-1", sku: "CON-SNT-C93024GA", category: "service" });
    const psu1 = makeLine({ id: "psu-1", sku: "PWR-C1-1100WAC-P", quantity: 2, category: "accessory" });
    const psu2 = makeLine({ id: "psu-2", sku: "PWR-C1-1100WAC-P/2", quantity: 2, category: "accessory" });

    const catalog = new Map([["C9300L-24UXG-4X-A", makeCatalogItem()]]);
    const ctx = makeContext({
      lines: [hw, lic, svc, psu1, psu2],
      catalogData: catalog,
      requirements: { redundancyRequired: true, stackingRequired: false },
    });

    const results = runValidation(ctx);
    // Should have results from all 16 rules (13 declarative + 3 adapted)
    const ruleIds = new Set(results.map((r) => r.ruleId));
    expect(ruleIds.size).toBe(16);
  });
});
