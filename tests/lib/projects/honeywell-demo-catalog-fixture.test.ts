import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as catalogFixtureModule from "@/lib/projects/honeywell-demo-catalog-fixture";
import {
  HONEYWELL_DEMO_CATALOG_FIXTURE_BOUNDARY,
  getHoneywellDemoCatalogFixture,
  getHoneywellDemoCatalogItem,
  getHoneywellDemoCatalogItems,
} from "@/lib/projects/honeywell-demo-catalog-fixture";
import { getHoneywellMvpConfigExpansionRulePack } from "@/lib/projects/honeywell-config-expansion-rule-pack";
import { getHoneywellDemoPricingFixture } from "@/lib/projects/honeywell-demo-pricing-fixture";

const SOURCE_PATH = join(process.cwd(), "src/lib/projects/honeywell-demo-catalog-fixture.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-demo-catalog-fixture.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_DEMO_CATALOG_FIXTURE.md");

const CUSTOMER_SKUS = [
  "CW9178I-CFG",
  "CISCO-NETWORK-SUB",
  "C9300X-48HX-A",
  "C9300L-24P-4X-A",
  "SFP-10G-LR-S=",
  "SFP-10/25G-LR-S=",
  "CP-7841-K9=",
] as const;

const STANDALONE_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="] as const;
const CATEGORIES = ["product", "service", "subscription"] as const;

function expectedRulePackSkusPlusOptics(): string[] {
  const skus = new Set<string>();
  const pack = getHoneywellMvpConfigExpansionRulePack();
  for (const parent of pack.parentRules) {
    skus.add(parent.parentSku);
    for (const child of parent.childLines) skus.add(child.sku);
  }
  for (const optic of STANDALONE_OPTICS) skus.add(optic);
  return Array.from(skus).sort();
}

function importSpecifiers(source: string): string[] {
  const importRegex = /import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) found.push(match[1]);
  return found;
}

describe("honeywell demo catalog fixture - authority boundary", () => {
  it("declares a demo-only flat catalog supplement boundary", () => {
    expect(HONEYWELL_DEMO_CATALOG_FIXTURE_BOUNDARY).toEqual({
      scope: "honeywell_mvp_demo_only",
      demoCatalogSupplement: true,
      productionCiscoCatalogAuthority: false,
      broadCiscoGeneralSkuAuthority: false,
      configurationAuthority: false,
      childRelationshipAuthority: false,
      replacementAuthority: false,
      skuSubstitutionAuthority: false,
      productionPricingAuthority: false,
      runtimeAi: false,
      attachesOpticsUnderSwitches: false,
      wiredIntoRuntimeSkuResolution: false,
    });
  });

  it("carries the same boundary on the full fixture", () => {
    const fixture = getHoneywellDemoCatalogFixture();
    expect(fixture.fixtureId).toBe("honeywell-mvp-demo-catalog-fixture");
    expect(fixture.scope).toBe("honeywell_mvp_demo_only");
    expect(fixture.boundary).toEqual(HONEYWELL_DEMO_CATALOG_FIXTURE_BOUNDARY);
    expect(fixture.knownLimitations.join("\n").toLowerCase()).toContain("not production");
    expect(fixture.knownLimitations.join("\n").toLowerCase()).toContain("not configuration authority");
  });
});

describe("honeywell demo catalog fixture - SKU universe", () => {
  it("covers exactly the existing Honeywell demo pricing fixture SKU keys", () => {
    const pricingFixture = getHoneywellDemoPricingFixture();
    const items = getHoneywellDemoCatalogItems();
    expect(Object.keys(items).sort()).toEqual(Object.keys(pricingFixture.unitListPriceSarBySku).sort());
    expect(Object.keys(items)).toHaveLength(50);
  });

  it("covers approved rule-pack parents and children plus the two standalone optics", () => {
    const items = getHoneywellDemoCatalogItems();
    expect(Object.keys(items).sort()).toEqual(expectedRulePackSkusPlusOptics());
  });

  it("includes all seven Honeywell customer BoQ SKUs", () => {
    const items = getHoneywellDemoCatalogItems();
    for (const sku of CUSTOMER_SKUS) expect(items[sku], sku).toBeDefined();
  });

  it("records the two optics as standalone customer BoQ metadata only", () => {
    const items = getHoneywellDemoCatalogItems();
    for (const sku of STANDALONE_OPTICS) {
      const item = items[sku];
      expect(item).toBeDefined();
      expect(item.source.descriptionSource).toBe("standalone_customer_boq_optic");
      expect(item.description.toLowerCase()).toContain("standalone");
      for (const forbidden of ["parentSku", "parentLineId", "children", "childLines", "attachment", "attachedTo"]) {
        expect(forbidden in item, `${sku}:${forbidden}`).toBe(false);
      }
    }
  });
});

describe("honeywell demo catalog fixture - item fields", () => {
  it("projects price, currency, and category from the existing demo pricing fixture", () => {
    const pricingFixture = getHoneywellDemoPricingFixture();
    const items = getHoneywellDemoCatalogItems();
    for (const [sku, item] of Object.entries(items)) {
      expect(item.sku).toBe(sku);
      expect(item.description.trim().length, sku).toBeGreaterThan(0);
      expect(item.currency, sku).toBe("SAR");
      expect(Number.isFinite(item.listPrice), sku).toBe(true);
      expect(item.listPrice, sku).toBeGreaterThanOrEqual(0);
      expect(item.listPrice, sku).toBe(pricingFixture.unitListPriceSarBySku[sku].unitListPriceSar);
      expect(item.category, sku).toBe(pricingFixture.categoryByAcceptedSku[sku]);
      expect(CATEGORIES).toContain(item.category);
      expect(item.source.priceSource).toBe("honeywell_mvp_demo_pricing_fixture");
      expect(item.source.categorySource).toBe("honeywell_mvp_demo_pricing_fixture");
      expect(item.source.productionCatalogAuthority).toBe(false);
    }
  });

  it("exposes no relationship, replacement, accepted-SKU, review, or pricing-decision fields", () => {
    const items = getHoneywellDemoCatalogItems();
    for (const [sku, item] of Object.entries(items)) {
      for (const forbidden of [
        "parentSku",
        "parentLineId",
        "parentLineNumber",
        "children",
        "childLines",
        "replacementSku",
        "currentSkus",
        "acceptedSku",
        "decidedBy",
        "decision",
        "approval",
        "margin",
        "markup",
        "vat",
        "sellPrice",
      ]) {
        expect(forbidden in item, `${sku}:${forbidden}`).toBe(false);
      }
    }
  });
});

describe("honeywell demo catalog fixture - copies", () => {
  it("returns fresh item maps and full fixtures", () => {
    const firstItems = getHoneywellDemoCatalogItems();
    firstItems["CW9178I-CFG"].description = "mutated";
    (firstItems["CW9178I-CFG"].source as { productionCatalogAuthority: boolean }).productionCatalogAuthority = true;
    delete firstItems["CP-7841-K9="];

    const secondItems = getHoneywellDemoCatalogItems();
    expect(secondItems["CW9178I-CFG"].description).not.toBe("mutated");
    expect(secondItems["CW9178I-CFG"].source.productionCatalogAuthority).toBe(false);
    expect(secondItems["CP-7841-K9="]).toBeDefined();

    const firstFixture = getHoneywellDemoCatalogFixture();
    (firstFixture.boundary as { productionCiscoCatalogAuthority: boolean }).productionCiscoCatalogAuthority = true;
    firstFixture.standaloneOptics.push("MUTATED");
    firstFixture.items["CW9178I-CFG"].listPrice = 1;

    const secondFixture = getHoneywellDemoCatalogFixture();
    expect(secondFixture.boundary.productionCiscoCatalogAuthority).toBe(false);
    expect(secondFixture.standaloneOptics).toEqual([...STANDALONE_OPTICS]);
    expect(secondFixture.items["CW9178I-CFG"].listPrice).toBe(
      getHoneywellDemoPricingFixture().unitListPriceSarBySku["CW9178I-CFG"].unitListPriceSar
    );
  });

  it("returns a fresh single item and undefined for out-of-scope SKUs", () => {
    const first = getHoneywellDemoCatalogItem("C9300X-48HX-A");
    expect(first).toBeDefined();
    first!.description = "mutated";
    const second = getHoneywellDemoCatalogItem("C9300X-48HX-A");
    expect(second!.description).not.toBe("mutated");
    expect(getHoneywellDemoCatalogItem("NOT-IN-HONEYWELL")).toBeUndefined();
  });
});

describe("honeywell demo catalog fixture - module hygiene", () => {
  it("exposes only the documented runtime surface", () => {
    expect(Object.keys(catalogFixtureModule).sort()).toEqual([
      "HONEYWELL_DEMO_CATALOG_FIXTURE_BOUNDARY",
      "getHoneywellDemoCatalogFixture",
      "getHoneywellDemoCatalogItem",
      "getHoneywellDemoCatalogItems",
    ]);
  });

  it("imports only the approved rule pack selector and demo pricing fixture", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(importSpecifiers(source).sort()).toEqual([
      "@/lib/projects/honeywell-config-expansion-rule-pack",
      "@/lib/projects/honeywell-demo-pricing-fixture",
    ]);
  });

  it("does not import DB, API/UI, engines, coordinator, adapters, AI, workbook/export, artifact stores, routes, or fs", () => {
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
      "project-artifact-store",
      "route",
      "node:fs",
      "fs",
    ]) {
      expect(imports, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps the source, test, and doc ASCII-only", () => {
    for (const file of [SOURCE_PATH, TEST_PATH, DOC_PATH]) {
      const text = readFileSync(file, "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text), file).toBe(false);
    }
  });

  it("documents the scope and authority boundary", () => {
    const doc = readFileSync(DOC_PATH, "utf8").toLowerCase();
    expect(doc).toContain("flat honeywell mvp demo catalog supplement");
    expect(doc).toContain("local historical/mock catalog misses");
    expect(doc).toContain("exactly the 50");
    expect(doc).toContain("not production cisco catalog authority");
    expect(doc).toContain("not broad cisco-general");
    expect(doc).toContain("not configuration authority");
    expect(doc).toContain("approved structured configuration");
    expect(doc).toContain("not pricing authority");
    expect(doc).toContain("silent");
    expect(doc).toContain("substitution");
    expect(doc).toContain("standalone");
    expect(doc).toContain("not switch children");
    expect(doc).toContain("not wire");
  });
});
