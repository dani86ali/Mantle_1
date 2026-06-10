import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  getQuickBomCatalogAuthoritySurface,
  type QuickBomCatalogAuthoritySurface,
} from "@/lib/projects/quick-bom-catalog-authority-surface";

function surface(): QuickBomCatalogAuthoritySurface {
  return getQuickBomCatalogAuthoritySurface();
}

describe("getQuickBomCatalogAuthoritySurface", () => {
  it("returns generic active/default Quick BoM authority-pack labels and sources", () => {
    const catalog = surface();

    expect(catalog.label).toBe("Default Quick BoM authority pack");
    expect(catalog.catalog.source).toBe("default_quick_bom_approved_catalog");
    expect(catalog.pricing.source).toBe("active_approved_pricing_authority");
    expect(catalog.configurationRules.source).toBe(
      "active_approved_configuration_rules"
    );
    expect(catalog.configurationRules.status).toBe("approved");
    expect(catalog.catalog.entryCount).toBe(catalog.entries.length);
    expect(catalog.entries.length).toBeGreaterThan(0);
  });

  it("exposes authority boundaries that keep runtime processing deterministic", () => {
    const catalog = surface();

    expect(catalog.boundaries).toEqual({
      runtimeAiDecisions: false,
      liveCatalogLookup: false,
      broadProductionCatalogAuthority: false,
      broadProductionPricingAuthority: false,
      replacementAuthority: false,
      silentSkuSubstitution: false,
      configurationAuthoritySeparateFromPricing: true,
      missingDataDeferred: true,
    });
  });

  it("returns sorted recognized entries with pricing and configuration coverage flags", () => {
    const catalog = surface();
    const skus = catalog.entries.map((entry) => entry.sku);

    expect(skus).toEqual([...skus].sort((a, b) => a.localeCompare(b)));
    expect(
      catalog.entries.every(
        (entry) => entry.recognitionCoverage === "recognized_by_default_catalog"
      )
    ).toBe(true);
    expect(
      catalog.entries.some(
        (entry) => entry.pricingCoverage === "priced_by_active_authority"
      )
    ).toBe(true);
    expect(
      catalog.entries.some(
        (entry) => entry.configRuleCoverage === "parent_rule_available"
      )
    ).toBe(true);
  });

  it("does not leak customer-specific authority-pack wording into the UI model", () => {
    expect(JSON.stringify(surface())).not.toMatch(/Honeywell/i);
  });
});

describe("quick-bom-catalog-authority-surface static source checks", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/quick-bom-catalog-authority-surface.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/quick-bom-catalog-authority-surface.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("does not perform runtime lookup, pricing, configuration expansion, export, or AI calls", () => {
    for (const forbidden of [
      "lookupCatalogSku(",
      "lookupCatalogSkus(",
      "resolveSku",
      "createSkuResolution",
      "priceBoq",
      "createPricedBoq",
      "buildConfigurationExpansionDraft",
      "writeMantle",
      "createExport",
      "@anthropic-ai",
      "openai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
