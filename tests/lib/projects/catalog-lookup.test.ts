import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as mod from "@/lib/projects/catalog-lookup";
import {
  LOCAL_CATALOG_SOURCE,
  normalizeSkuForLookup,
  buildCatalogLookupIndex,
  getLocalMockCatalogLookupIndex,
  lookupCatalogSku,
  lookupCatalogSkus,
  type CatalogLookupItem,
} from "@/lib/projects/catalog-lookup";

function item(overrides: Partial<CatalogLookupItem> = {}): CatalogLookupItem {
  return {
    sku: "C9300-48P-E",
    description: "Catalyst 9300 switch",
    listPrice: 11303.9,
    currency: "USD",
    vendor: "Cisco",
    productCategory: "hardware",
    priceListId: "GPL",
    ...overrides,
  };
}

function catalog(...items: CatalogLookupItem[]): Record<string, CatalogLookupItem> {
  const rec: Record<string, CatalogLookupItem> = {};
  for (const it of items) rec[it.sku] = it;
  return rec;
}

describe("normalizeSkuForLookup", () => {
  it("trims, uppercases, and removes separators", () => {
    expect(normalizeSkuForLookup("  c9300-48p/e ")).toBe("C930048PE");
    expect(normalizeSkuForLookup("a_b.c d")).toBe("ABCD");
  });

  it("returns '' for blank or separator-only input", () => {
    expect(normalizeSkuForLookup("")).toBe("");
    expect(normalizeSkuForLookup("   ")).toBe("");
    expect(normalizeSkuForLookup("---/.")).toBe("");
  });
});

describe("lookupCatalogSku - exact vs normalized", () => {
  it("exact lookup wins before normalized lookup", () => {
    // Two rows whose normalized keys collide; exact must short-circuit and not
    // see the would-be ambiguity.
    const index = buildCatalogLookupIndex(
      catalog(
        item({ sku: "ABC-123", description: "exact" }),
        item({ sku: "abc123", description: "other" })
      )
    );
    const result = lookupCatalogSku("ABC-123", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.source).toBe("exact");
      expect(result.match.catalogSku).toBe("ABC-123");
    }
  });

  it("normalized lookup resolves case/separator variants deterministically", () => {
    const index = buildCatalogLookupIndex(catalog(item({ sku: "C9300-48P-E" })));
    const result = lookupCatalogSku("  c9300 48p e ", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.source).toBe("normalized");
      expect(result.match.catalogSku).toBe("C9300-48P-E");
      expect(result.normalizedSku).toBe("C930048PE");
    }
  });

  it("returns not_found for an unknown SKU", () => {
    const index = buildCatalogLookupIndex(catalog(item({ sku: "C9300-48P-E" })));
    const result = lookupCatalogSku("NOPE-999", index);
    expect(result.status).toBe("not_found");
    expect(result.requestedSku).toBe("NOPE-999");
  });

  it("returns not_found for a blank SKU", () => {
    const index = buildCatalogLookupIndex(catalog(item({ sku: "C9300-48P-E" })));
    const result = lookupCatalogSku("   ", index);
    expect(result.status).toBe("not_found");
    expect(result.normalizedSku).toBe("");
  });
});

describe("lookupCatalogSku - ambiguity", () => {
  it("normalized collisions return ambiguous and choose no candidate", () => {
    const index = buildCatalogLookupIndex(
      catalog(
        item({ sku: "C-9300", description: "a" }),
        item({ sku: "C9300", description: "b" })
      )
    );
    const result = lookupCatalogSku("c.9300", index);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidateSkus).toEqual(["C-9300", "C9300"]);
      expect(result).not.toHaveProperty("match");
    }
  });

  it("returns deterministically ascending-sorted candidateSkus", () => {
    // All three share the normalized key "XA" but differ in trimmed form; the
    // catalog is inserted out of sort order to prove the result is sorted.
    const index = buildCatalogLookupIndex(
      catalog(
        item({ sku: "X_A" }),
        item({ sku: "X-A" }),
        item({ sku: "X.A" })
      )
    );
    const result = lookupCatalogSku("xa", index);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidateSkus).toEqual(["X-A", "X.A", "X_A"]);
    }
  });

  it("duplicate candidates for one distinct SKU still match (not ambiguous)", () => {
    const index = buildCatalogLookupIndex(
      catalog(item({ sku: "C9300-48P-E" }))
    );
    // Manually inject a duplicate into the normalized bucket to prove distinct
    // collapse: same trimmed catalog SKU twice resolves to a single match.
    index.normalized.get("C930048PE")!.push(item({ sku: "C9300-48P-E" }));
    const result = lookupCatalogSku("c930048pe", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.match.source).toBe("normalized");
  });
});

describe("lookupCatalogSku - price flag", () => {
  it("zero list price is a match with hasPositiveListPrice false", () => {
    const index = buildCatalogLookupIndex(
      catalog(item({ sku: "FREE-1", listPrice: 0 }))
    );
    const result = lookupCatalogSku("FREE-1", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.listPrice).toBe(0);
      expect(result.match.hasPositiveListPrice).toBe(false);
    }
  });

  it("positive list price is a match with hasPositiveListPrice true", () => {
    const index = buildCatalogLookupIndex(catalog(item({ sku: "PAID-1" })));
    const result = lookupCatalogSku("PAID-1", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.hasPositiveListPrice).toBe(true);
    }
  });
});

describe("lookupCatalogSkus", () => {
  it("preserves input order and duplicates", () => {
    const index = buildCatalogLookupIndex(
      catalog(item({ sku: "A-1" }), item({ sku: "B-1" }))
    );
    const results = lookupCatalogSkus(["B-1", "A-1", "B-1", "ZZZ"], index);
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.requestedSku)).toEqual([
      "B-1",
      "A-1",
      "B-1",
      "ZZZ",
    ]);
    expect(results.map((r) => r.status)).toEqual([
      "matched",
      "matched",
      "matched",
      "not_found",
    ]);
  });
});

describe("buildCatalogLookupIndex", () => {
  it("does not mutate the input catalog", () => {
    const input = catalog(item({ sku: "A-1" }), item({ sku: "B-1" }));
    const snapshot = structuredClone(input);
    buildCatalogLookupIndex(input);
    expect(input).toEqual(snapshot);
  });

  it("defaults catalogSource to LOCAL_CATALOG_SOURCE when no source arg given", () => {
    const index = buildCatalogLookupIndex(catalog(item()));
    expect(index.catalogSource).toBe(LOCAL_CATALOG_SOURCE);
  });

  it("carries an explicit source when one is supplied", () => {
    const index = buildCatalogLookupIndex(catalog(item()), "some_explicit_source");
    expect(index.catalogSource).toBe("some_explicit_source");
  });

  it("exact match reports the explicit index source", () => {
    const index = buildCatalogLookupIndex(catalog(item({ sku: "A-1" })), "test_source_a");
    const result = lookupCatalogSku("A-1", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.catalogSource).toBe("test_source_a");
      expect(result.match.source).toBe("exact");
    }
  });

  it("normalized match reports the explicit index source", () => {
    const index = buildCatalogLookupIndex(catalog(item({ sku: "C9300-48P-E" })), "test_source_b");
    const result = lookupCatalogSku("c9300 48p e", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.catalogSource).toBe("test_source_b");
      expect(result.match.source).toBe("normalized");
    }
  });
});

describe("local mock catalog smoke test", () => {
  const index = getLocalMockCatalogLookupIndex();

  it("includes C9300-48P-E with vendor Cisco and a positive price", () => {
    const result = lookupCatalogSku("C9300-48P-E", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.vendor).toBe("Cisco");
      expect(result.match.hasPositiveListPrice).toBe(true);
      expect(result.match.catalogSource).toBe(LOCAL_CATALOG_SOURCE);
    }
  });

  it("includes zero-price A-AUD-EDGEAUD-USER with hasPositiveListPrice false", () => {
    const result = lookupCatalogSku("A-AUD-EDGEAUD-USER", index);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.match.listPrice).toBe(0);
      expect(result.match.hasPositiveListPrice).toBe(false);
    }
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/catalog-lookup.ts"),
    "utf8"
  );

  it("does not import the Cisco adapter, Redis, auth, fetch, env, DB, engines, AI, pricing, API, or UI", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    for (const forbidden of [
      "adapters/catalog", // the live/mock adapter (mock-data helper is allowed)
      "redis",
      "/auth",
      "/env",
      "/db/",
      "@/engines",
      "pricing",
      "approval",
      "@/app",
      "@/components",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(mod).sort()).toEqual(
      [
        "LOCAL_CATALOG_SOURCE",
        "buildCatalogLookupIndex",
        "getLocalMockCatalogLookupIndex",
        "lookupCatalogSku",
        "lookupCatalogSkus",
        "normalizeSkuForLookup",
      ].sort()
    );
  });
});
