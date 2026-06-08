import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as lookupModule from "@/lib/projects/honeywell-demo-catalog-lookup";
import {
  HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY,
  getHoneywellDemoCatalogLookupItems,
  getHoneywellDemoCatalogLookupIndex,
  lookupHoneywellDemoCatalogSku,
  lookupHoneywellDemoCatalogSkus,
} from "@/lib/projects/honeywell-demo-catalog-lookup";
import { getHoneywellDemoCatalogFixture } from "@/lib/projects/honeywell-demo-catalog-fixture";
import { lookupCatalogSku } from "@/lib/projects/catalog-lookup";

const SOURCE_PATH = join(process.cwd(), "src/lib/projects/honeywell-demo-catalog-lookup.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-demo-catalog-lookup.test.ts");
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

// SKUs that are absent from the local STC/mock catalog
const MISSING_FROM_LOCAL_MOCK = ["CW9178I-CFG", "C9300X-48HX-A", "C9300L-24P-4X-A"] as const;

function importSpecifiers(source: string): string[] {
  const importRegex = /import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) found.push(match[1]);
  return found;
}

describe("HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY", () => {
  it("grants no production catalog or broad Cisco authority", () => {
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.productionCiscoCatalogAuthority).toBe(false);
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.broadCiscoGeneralSkuAuthority).toBe(false);
  });

  it("grants no configuration, replacement/substitution, or parent/child authority", () => {
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.configurationAuthority).toBe(false);
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.replacementAuthority).toBe(false);
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.skuSubstitutionAuthority).toBe(false);
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.parentChildRelationshipAuthority).toBe(false);
  });

  it("grants no production pricing authority and does not price artifacts", () => {
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.productionPricingAuthority).toBe(false);
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.pricesArtifacts).toBe(false);
  });

  it("is not runtime AI", () => {
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.runtimeAi).toBe(false);
  });

  it("does not change default runtime catalog lookup or wire into default SKU resolution", () => {
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.changesDefaultRuntimeCatalogLookup).toBe(false);
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.wiredIntoDefaultRuntimeSkuResolution).toBe(false);
  });

  it("does not attach optics under switches", () => {
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.attachesOpticsUnderSwitches).toBe(false);
  });

  it("is Honeywell MVP demo scope only and explicit opt-in", () => {
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.scope).toBe("honeywell_mvp_demo_only");
    expect(HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY.explicitOptInOverlay).toBe(true);
  });
});

describe("getHoneywellDemoCatalogLookupItems", () => {
  it("returns exactly 50 items matching the supplement SKU set", () => {
    const items = getHoneywellDemoCatalogLookupItems();
    expect(Object.keys(items)).toHaveLength(50);
  });

  it("item SKU set matches the fixture SKU set exactly", () => {
    const items = getHoneywellDemoCatalogLookupItems();
    const fixture = getHoneywellDemoCatalogFixture();
    expect(Object.keys(items).sort()).toEqual(Object.keys(fixture.items).sort());
  });

  it("each item has required CatalogLookupItem fields", () => {
    const items = getHoneywellDemoCatalogLookupItems();
    for (const [, item] of Object.entries(items)) {
      expect(typeof item.sku).toBe("string");
      expect(typeof item.description).toBe("string");
      expect(typeof item.listPrice).toBe("number");
      expect(typeof item.currency).toBe("string");
      expect(item.vendor).toBe("Cisco");
      expect(item.priceListId).toBe("honeywell_mvp_demo_catalog_supplement");
    }
  });

  it("returns a fresh copy each call (no shared state mutation)", () => {
    const a = getHoneywellDemoCatalogLookupItems();
    const b = getHoneywellDemoCatalogLookupItems();
    expect(a).not.toBe(b);
    const firstKey = Object.keys(a)[0];
    (a[firstKey] as { description: string }).description = "mutated";
    expect(b[firstKey].description).not.toBe("mutated");
  });

  it("does not expose parent/child, replacement, acceptance, or review decision fields", () => {
    const items = getHoneywellDemoCatalogLookupItems();
    for (const item of Object.values(items)) {
      expect(item).not.toHaveProperty("parentSku");
      expect(item).not.toHaveProperty("childLines");
      expect(item).not.toHaveProperty("replacementFor");
      expect(item).not.toHaveProperty("acceptedSku");
      expect(item).not.toHaveProperty("reviewDecision");
    }
  });
});

describe("getHoneywellDemoCatalogLookupIndex", () => {
  it("returns a fresh CatalogLookupIndex each call", () => {
    const a = getHoneywellDemoCatalogLookupIndex();
    const b = getHoneywellDemoCatalogLookupIndex();
    expect(a).not.toBe(b);
  });

  it("index resolves all seven Honeywell customer BoQ SKUs deterministically", () => {
    const index = getHoneywellDemoCatalogLookupIndex();
    for (const sku of CUSTOMER_SKUS) {
      const result = lookupCatalogSku(sku, index);
      expect(result.status).toBe("matched");
    }
  });
});

describe("lookupHoneywellDemoCatalogSku", () => {
  it("resolves all seven customer BoQ SKUs", () => {
    for (const sku of CUSTOMER_SKUS) {
      const result = lookupHoneywellDemoCatalogSku(sku);
      expect(result.status).toBe("matched");
    }
  });

  it("resolves all 50 Honeywell demo universe SKUs", () => {
    const items = getHoneywellDemoCatalogLookupItems();
    for (const sku of Object.keys(items)) {
      const result = lookupHoneywellDemoCatalogSku(sku);
      expect(result.status).toBe("matched");
    }
  });

  it("matched result has correct catalogSource", () => {
    const result = lookupHoneywellDemoCatalogSku("CW9178I-CFG");
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.catalogSource).toBe("local_stc_historical_mock");
    }
  });

  it("returns not_found for an out-of-scope SKU", () => {
    const result = lookupHoneywellDemoCatalogSku("UNKNOWN-SKU-XYZ");
    expect(result.status).toBe("not_found");
  });

  it("exact lookup uses trimmed SKU key", () => {
    const result = lookupHoneywellDemoCatalogSku("  CW9178I-CFG  ");
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.source).toBe("exact");
      expect(result.match.catalogSku).toBe("CW9178I-CFG");
    }
  });

  it("normalized lookup behavior is inherited from catalog-lookup", () => {
    const result = lookupHoneywellDemoCatalogSku("CW9178I CFG");
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.requestedSku).toBe("CW9178I CFG");
      expect(result.match.source).toBe("normalized");
      expect(result.match.catalogSku).toBe("CW9178I-CFG");
    }
  });
});

describe("lookupHoneywellDemoCatalogSkus", () => {
  it("resolves all customer BoQ SKUs in one call", () => {
    const results = lookupHoneywellDemoCatalogSkus(CUSTOMER_SKUS);
    expect(results).toHaveLength(CUSTOMER_SKUS.length);
    for (const result of results) {
      expect(result.status).toBe("matched");
    }
  });

  it("preserves original order and duplicates", () => {
    const skus = ["CW9178I-CFG", "CP-7841-K9=", "CW9178I-CFG"] as const;
    const results = lookupHoneywellDemoCatalogSkus(skus);
    expect(results).toHaveLength(3);
    expect(results[0].requestedSku).toBe("CW9178I-CFG");
    expect(results[2].requestedSku).toBe("CW9178I-CFG");
  });
});

describe("default lookupCatalogSku isolation (unchanged behavior)", () => {
  it("does not find known missing Honeywell parent SKUs in the local STC/mock catalog", () => {
    for (const sku of MISSING_FROM_LOCAL_MOCK) {
      const result = lookupCatalogSku(sku);
      expect(result.status).toBe("not_found");
    }
  });
});

describe("optics remain standalone flat items only", () => {
  it("optics are present in the lookup items without parent/child fields", () => {
    const items = getHoneywellDemoCatalogLookupItems();
    for (const optic of STANDALONE_OPTICS) {
      expect(items[optic]).toBeDefined();
      expect(items[optic]).not.toHaveProperty("parentSku");
      expect(items[optic]).not.toHaveProperty("childLines");
    }
  });

  it("optics resolve via overlay lookup", () => {
    for (const optic of STANDALONE_OPTICS) {
      const result = lookupHoneywellDemoCatalogSku(optic);
      expect(result.status).toBe("matched");
    }
  });
});

describe("module export surface", () => {
  it("exposes only the expected exports (no extra behavior)", () => {
    const keys = Object.keys(lookupModule).sort();
    expect(keys).toEqual([
      "HONEYWELL_DEMO_CATALOG_LOOKUP_BOUNDARY",
      "getHoneywellDemoCatalogLookupIndex",
      "getHoneywellDemoCatalogLookupItems",
      "lookupHoneywellDemoCatalogSku",
      "lookupHoneywellDemoCatalogSkus",
    ]);
  });
});

describe("import isolation", () => {
  it("source imports only the two allowed modules", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const specifiers = importSpecifiers(source);
    const allowed = new Set([
      "@/lib/projects/catalog-lookup",
      "@/lib/projects/honeywell-demo-catalog-fixture",
    ]);
    for (const spec of specifiers) {
      expect(allowed.has(spec), `Unexpected import: ${spec}`).toBe(true);
    }
    expect(specifiers.length).toBeGreaterThanOrEqual(2);
  });
});

describe("ASCII-only content", () => {
  it("source file is ASCII-only", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("test file is ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });

  it("doc file is ASCII-only", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(doc)).toBe(false);
  });
});
