import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getQuickBomApprovedCategorySourceSummary,
  getQuickBomApprovedMantleCategoryByAcceptedSku,
  getQuickBomApprovedMantleRowOrderSkuSequence,
  getQuickBomApprovedPricingAuthorityProfile,
  getQuickBomApprovedPricingSourceSummary,
  getQuickBomApprovedUnitListPriceSarBySku,
} from "@/lib/projects/quick-bom-approved-pricing-sources";
import { getHoneywellDemoUnitListPriceSarBySku } from "@/lib/projects/honeywell-demo-pricing-fixture";
import { getScopedCiscoUnitListPriceSarBySku } from "@/lib/projects/scoped-cisco-pricing-fixture";

const SOURCE_PATH = resolve(
  __dirname,
  "../../../src/lib/projects/quick-bom-approved-pricing-sources.ts"
);
const TEST_PATH = resolve(
  __dirname,
  "quick-bom-approved-pricing-sources.test.ts"
);

const HONEYWELL_SKU = "CW9178I-CFG";
const CISCO_SKU = "CS-KIT-EQX-C-K9";

describe("quick-bom-approved-pricing-sources combined price map", () => {
  it("includes known Honeywell and Cisco SKUs", () => {
    const prices = getQuickBomApprovedUnitListPriceSarBySku();
    expect(prices[HONEYWELL_SKU]).toBeDefined();
    expect(prices[CISCO_SKU]).toBeDefined();
    expect(prices[HONEYWELL_SKU].currency).toBe("SAR");
    expect(prices[CISCO_SKU].currency).toBe("SAR");
  });

  it("has 93 unique priced SKUs and 93 categories", () => {
    expect(Object.keys(getQuickBomApprovedUnitListPriceSarBySku())).toHaveLength(
      93
    );
    expect(
      Object.keys(getQuickBomApprovedMantleCategoryByAcceptedSku())
    ).toHaveLength(93);
  });

  it("keeps source price maps disjoint", () => {
    const honeywell = getHoneywellDemoUnitListPriceSarBySku();
    const cisco = getScopedCiscoUnitListPriceSarBySku();
    const overlap = Object.keys(honeywell).filter((sku) =>
      Object.prototype.hasOwnProperty.call(cisco, sku)
    );
    expect(overlap).toEqual([]);
  });

  it("returns fresh copies on every call", () => {
    const a = getQuickBomApprovedUnitListPriceSarBySku();
    const b = getQuickBomApprovedUnitListPriceSarBySku();
    expect(a).not.toBe(b);
    a[HONEYWELL_SKU].unitListPriceSar = -1;
    expect(getQuickBomApprovedUnitListPriceSarBySku()[HONEYWELL_SKU].unitListPriceSar).not.toBe(-1);

    const cat = getQuickBomApprovedMantleCategoryByAcceptedSku();
    expect(cat).not.toBe(getQuickBomApprovedMantleCategoryByAcceptedSku());

    const seq = getQuickBomApprovedMantleRowOrderSkuSequence();
    expect(seq).not.toBe(getQuickBomApprovedMantleRowOrderSkuSequence());

    const profile = getQuickBomApprovedPricingAuthorityProfile();
    expect(profile).not.toBe(getQuickBomApprovedPricingAuthorityProfile());
    expect(profile.sources).not.toBe(
      getQuickBomApprovedPricingAuthorityProfile().sources
    );
  });
});

describe("quick-bom-approved-pricing-sources row order", () => {
  it("concatenates to 104 occurrences with duplicates preserved", () => {
    const seq = getQuickBomApprovedMantleRowOrderSkuSequence();
    expect(seq).toHaveLength(104);
    expect(seq.filter((sku) => sku === "STK-RACK-DINRAIL=")).toHaveLength(2);
  });
});

describe("quick-bom-approved-pricing-sources profile", () => {
  it("has two sources with correct identity, counts, and currency", () => {
    const profile = getQuickBomApprovedPricingAuthorityProfile();
    expect(profile.profileId).toBe("quick-bom-approved-pricing-sources-profile");
    expect(profile.scope).toBe("quick_bom_approved_pricing_sources");
    expect(profile.currency).toBe("SAR");
    expect(profile.pricedSkuCount).toBe(93);
    expect(profile.missingPriceSkuCount).toBe(0);

    expect(profile.sources).toHaveLength(2);
    const [honeywell, cisco] = profile.sources;
    expect(honeywell.pricedSkuCount).toBe(50);
    expect(cisco.pricedSkuCount).toBe(43);
    for (const entry of profile.sources) {
      expect(entry.currency).toBe("SAR");
      expect(entry.profileId).toBeTruthy();
      expect(entry.scope).toBeTruthy();
      expect(entry.approvalRecordId).toBeTruthy();
      expect(entry.activeSource).toBeTruthy();
      expect(entry.activeSourceFixtureId).toBeTruthy();
      expect(entry.activeSourceStatus).toBeTruthy();
    }
  });

  it("has no workbook path, sheet name, or .xlsx reference anywhere", () => {
    const serialized = JSON.stringify(
      getQuickBomApprovedPricingAuthorityProfile()
    );
    expect(serialized.toLowerCase()).not.toContain(".xlsx");
    expect(serialized).not.toMatch(/workbookpath/i);
    expect(serialized).not.toMatch(/sheetname/i);
  });
});

describe("quick-bom-approved-pricing-sources boundary and summaries", () => {
  it("pricing source summary matches the exact safe values", () => {
    expect(getQuickBomApprovedPricingSourceSummary()).toEqual({
      source: "quick_bom_approved_pricing_sources",
      currency: "SAR",
      honeywellDemoFixtureIncluded: true,
      scopedCiscoFixtureIncluded: true,
      deterministicPricingAuthority: true,
      demoFixtureAuthority: true,
      scopedCiscoPricingAuthority: true,
      productionCiscoPricingAuthority: false,
      broadCiscoGeneralPricingAuthority: false,
      runtimeAiPricing: false,
      runtimeCatalogLookup: false,
      configurationAuthority: false,
      replacementAuthority: false,
      skuSubstitutionAuthority: false,
      silentSkuSubstitution: false,
      missingPricesReported: true,
    });
  });

  it("combined profile boundary matches the exact safe flags", () => {
    expect(getQuickBomApprovedPricingAuthorityProfile().boundary).toEqual({
      deterministicPricingAuthority: true,
      demoFixtureAuthority: true,
      scopedCiscoPricingAuthority: true,
      productionCiscoPricingAuthority: false,
      broadCiscoGeneralPricingAuthority: false,
      runtimeAiPricing: false,
      runtimeCatalogLookup: false,
      configurationAuthority: false,
      replacementAuthority: false,
      skuSubstitutionAuthority: false,
      silentSkuSubstitution: false,
      missingPricesReported: true,
    });
  });

  it("category source summary matches the exact safe values", () => {
    expect(getQuickBomApprovedCategorySourceSummary()).toEqual({
      source: "quick_bom_approved_mantle_category_sources",
      honeywellDemoFixtureIncluded: true,
      scopedCiscoFixtureIncluded: true,
      demoFixtureAuthority: true,
      scopedCiscoCategoryAuthority: true,
      productionPricingAuthority: false,
      configurationAuthority: false,
      runtimeAi: false,
      runtimeCatalogLookup: false,
      replacementAuthority: false,
      silentSkuSubstitution: false,
    });
  });
});

describe("quick-bom-approved-pricing-sources purity and encoding", () => {
  it("imports only the four allowed source modules", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const imports = Array.from(
      source.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    ).sort();
    expect(imports).toEqual(
      [
        "@/lib/projects/honeywell-demo-pricing-authority",
        "@/lib/projects/honeywell-demo-pricing-fixture",
        "@/lib/projects/scoped-cisco-pricing-authority",
        "@/lib/projects/scoped-cisco-pricing-fixture",
      ].sort()
    );
  });

  it("does not import DB/catalog/AI/engine/export/pricing-math/priced-BoQ/config-expansion", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const importPaths = Array.from(
      source.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    const forbidden = [
      "db",
      "drizzle",
      "catalog",
      "adapter",
      "anthropic",
      "openai",
      "llm",
      "engine",
      "coordinator",
      "export",
      "workbook",
      "xlsx",
      "priced-boq",
      "config-expansion",
      "rule-pack",
      "runner",
    ];
    for (const importPath of importPaths) {
      for (const token of forbidden) {
        expect(importPath.toLowerCase()).not.toContain(token);
      }
    }
  });

  it("source and test files are ASCII-only", () => {
    for (const path of [SOURCE_PATH, TEST_PATH]) {
      const content = readFileSync(path, "utf8");
      expect(/^[\x00-\x7F]*$/.test(content)).toBe(true);
    }
  });
});
