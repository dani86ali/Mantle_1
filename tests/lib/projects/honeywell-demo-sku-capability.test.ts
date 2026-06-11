/**
 * Tests for the Honeywell MVP demo SKU capability profile (read-only evidence).
 * Proves: profile counts, parent child counts, standalone optic treatment,
 * child-only SKU kind, unknown SKU behavior, coverage, forbidden fields,
 * copy safety, and module hygiene.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import * as capabilityModule from "@/lib/projects/honeywell-demo-sku-capability";
import {
  getHoneywellDemoSkuCapability,
  getHoneywellDemoSkuCapabilityProfile,
} from "@/lib/projects/honeywell-demo-sku-capability";

const SOURCE_PATH = join(process.cwd(), "src/lib/projects/honeywell-demo-sku-capability.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-demo-sku-capability.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_DEMO_CATALOG_FIXTURE.md");

const KNOWN_PARENTS: Array<{ sku: string; childCount: number }> = [
  { sku: "C9300X-48HX-A", childCount: 22 },
  { sku: "C9300L-24P-4X-A", childCount: 23 },
  { sku: "CW9178I-CFG", childCount: 4 },
  { sku: "CISCO-NETWORK-SUB", childCount: 3 },
  { sku: "CP-7841-K9=", childCount: 1 },
];

const STANDALONE_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

function importSpecifiers(source: string): string[] {
  const importRegex = /import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) found.push(match[1]);
  return found;
}

describe("getHoneywellDemoSkuCapabilityProfile", () => {
  it("has correct total known SKU count of 50", () => {
    const profile = getHoneywellDemoSkuCapabilityProfile();
    expect(profile.totalKnownSkuCount).toBe(50);
  });

  it("has expandable parent count of 5", () => {
    const profile = getHoneywellDemoSkuCapabilityProfile();
    expect(profile.expandableParentCount).toBe(5);
  });

  it("has standalone customer BoQ line count of 2", () => {
    const profile = getHoneywellDemoSkuCapabilityProfile();
    expect(profile.standaloneCustomerBoqLineCount).toBe(2);
  });

  it("category counts sum to total known SKU count", () => {
    const profile = getHoneywellDemoSkuCapabilityProfile();
    const sum =
      profile.expandableParentCount +
      profile.rulePackChildOnlyCount +
      profile.standaloneCustomerBoqLineCount +
      profile.unknownDeferredCount;
    expect(sum).toBe(profile.totalKnownSkuCount);
  });

  it("unknown deferred count is 0 inside the known profile", () => {
    const profile = getHoneywellDemoSkuCapabilityProfile();
    expect(profile.unknownDeferredCount).toBe(0);
  });

  it("carries correct source ids", () => {
    const profile = getHoneywellDemoSkuCapabilityProfile();
    expect(profile.catalogFixtureId).toBe("honeywell-mvp-demo-catalog-fixture");
    expect(profile.rulePackId).toBe("honeywell-mvp-composed-batch1-batch2-batch3");
    expect(profile.pricingFixtureId).toBe("honeywell-mvp-demo-pricing-fixture");
  });
});

describe("expandable parent SKUs", () => {
  for (const { sku, childCount } of KNOWN_PARENTS) {
    it(`${sku} has kind "expandable_parent" and childCount ${childCount}`, () => {
      const cap = getHoneywellDemoSkuCapability(sku);
      expect(cap.kind).toBe("expandable_parent");
      expect(cap.childCount).toBe(childCount);
      expect(cap.childSkus).toHaveLength(childCount);
      expect(cap.expansionParentCovered).toBe(true);
    });
  }
});

describe("standalone customer BoQ optics", () => {
  for (const sku of STANDALONE_OPTICS) {
    it(`${sku} has correct standalone optic properties`, () => {
      const cap = getHoneywellDemoSkuCapability(sku);
      expect(cap.kind).toBe("standalone_customer_boq_line");
      expect(cap.childCount).toBe(0);
      expect(cap.childSkus).toEqual([]);
      expect(cap.standaloneCustomerBoqLine).toBe(true);
      expect(cap.expansionParentCovered).toBe(false);
    });
  }
});

describe("rule_pack_child SKU", () => {
  it("a known child-only SKU has kind rule_pack_child and at least one parent", () => {
    // CON-L1NCD-C9300XY4 is a child of C9300X-48HX-A only, not a parent itself.
    const cap = getHoneywellDemoSkuCapability("CON-L1NCD-C9300XY4");
    expect(cap.kind).toBe("rule_pack_child");
    expect(cap.parentSkus.length).toBeGreaterThanOrEqual(1);
    expect(cap.expansionChildCovered).toBe(true);
  });
});

describe("unknown SKU", () => {
  it("returns unknown_deferred with no coverage and deferred: true", () => {
    const cap = getHoneywellDemoSkuCapability("TOTALLY-UNKNOWN-SKU-XYZ");
    expect(cap.kind).toBe("unknown_deferred");
    expect(cap.catalogCovered).toBe(false);
    expect(cap.pricingCovered).toBe(false);
    expect(cap.deferred).toBe(true);
  });

  it("does not throw for unknown SKUs", () => {
    expect(() => getHoneywellDemoSkuCapability("DOES-NOT-EXIST")).not.toThrow();
  });

  it("has no replacement, substitution, or accepted-SKU fields", () => {
    const cap = getHoneywellDemoSkuCapability("TOTALLY-UNKNOWN-SKU-XYZ") as unknown as Record<string, unknown>;
    expect(cap["replacement"]).toBeUndefined();
    expect(cap["substitution"]).toBeUndefined();
    expect(cap["acceptedSku"]).toBeUndefined();
    expect(cap["currentSku"]).toBeUndefined();
  });
});

describe("coverage for all known SKUs", () => {
  it("every known capability has catalog coverage and pricing coverage", () => {
    const profile = getHoneywellDemoSkuCapabilityProfile();
    for (const [sku, cap] of Object.entries(profile.capabilities)) {
      expect(cap.catalogCovered).toBe(true);
      expect(cap.pricingCovered).toBe(true);
    }
  });
});

describe("forbidden fields", () => {
  it("no capability row exposes pricing math or forbidden decision fields", () => {
    const profile = getHoneywellDemoSkuCapabilityProfile();
    const FORBIDDEN_KEYS = [
      "sellPrice", "margin", "markup", "vat", "replacement",
      "substitution", "acceptedSku", "reviewDecision", "approval",
      "decidedBy", "decidedAt",
    ];
    for (const cap of Object.values(profile.capabilities)) {
      const capRecord = cap as unknown as Record<string, unknown>;
      for (const key of FORBIDDEN_KEYS) {
        expect(capRecord[key]).toBeUndefined();
      }
    }
  });
});

describe("copy safety", () => {
  it("mutating a returned capability does not affect future calls", () => {
    const cap1 = getHoneywellDemoSkuCapability("C9300X-48HX-A");
    cap1.childSkus.push("MUTATED");
    const cap2 = getHoneywellDemoSkuCapability("C9300X-48HX-A");
    expect(cap2.childSkus).not.toContain("MUTATED");
  });

  it("mutating profile capabilities does not affect future calls", () => {
    const profile1 = getHoneywellDemoSkuCapabilityProfile();
    profile1.capabilities["C9300X-48HX-A"].childSkus.push("MUTATED");
    const profile2 = getHoneywellDemoSkuCapabilityProfile();
    expect(profile2.capabilities["C9300X-48HX-A"].childSkus).not.toContain("MUTATED");
  });
});

describe("module hygiene", () => {
  it("exports only the documented runtime surface", () => {
    expect(Object.keys(capabilityModule).sort()).toEqual([
      "getHoneywellDemoSkuCapability",
      "getHoneywellDemoSkuCapabilityProfile",
    ]);
  });

  it("imports only the approved Honeywell catalog, rule-pack, and pricing sources", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(importSpecifiers(source).sort()).toEqual([
      "@/lib/projects/honeywell-config-expansion-rule-pack",
      "@/lib/projects/honeywell-demo-catalog-fixture",
      "@/lib/projects/honeywell-demo-pricing-fixture",
    ]);
  });

  it("does not import DB, API/UI, routes, fs, engines, coordinator, adapters, AI, export, stores, or packages", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const imports = importSpecifiers(source).join("\n");
    for (const forbidden of [
      "@/lib/db",
      "@/app",
      "@/components",
      "@/engines",
      "@/coordinator",
      "@/lib/adapters",
      "@/lib/ai",
      "@/lib/llm",
      "anthropic",
      "exceljs",
      "mantle",
      "artifact-store",
      "approval-store",
      "project-artifact-store",
      "project-approval-store",
      "route",
      "node:fs",
      "node:path",
      "fs",
      "path",
    ]) {
      expect(imports, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps source, test, and doc ASCII-only", () => {
    for (const file of [SOURCE_PATH, TEST_PATH, DOC_PATH]) {
      const text = readFileSync(file, "utf8");
      expect(/[^\x00-\x7F]/.test(text), file).toBe(false);
    }
  });

  it("profile and capability return plain serializable objects", () => {
    const cap = getHoneywellDemoSkuCapability("C9300X-48HX-A");
    expect(() => JSON.stringify(cap)).not.toThrow();

    const profile = getHoneywellDemoSkuCapabilityProfile();
    expect(() => JSON.stringify(profile)).not.toThrow();
  });
});
