/**
 * Evidence: the canonical default Quick BoM catalog composes the local STC mock
 * catalog with the approved Honeywell demo SKU metadata into one default lookup
 * index, resolves the known Honeywell SKUs the local mock misses, and stays pure
 * (SKU recognition only - no pricing/config/replacement authority).
 *
 * Pure helper imports only - no DB, API/UI, engines, coordinators, adapters,
 * artifact stores, approval stores, pricing services, export, runner, or AI/LLM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as defaultCatalogModule from "@/lib/projects/default-quick-bom-catalog";
import {
  DEFAULT_QUICK_BOM_CATALOG_SOURCE,
  getDefaultQuickBomCatalogLookupIndex,
} from "@/lib/projects/default-quick-bom-catalog";
import { lookupCatalogSku } from "@/lib/projects/catalog-lookup";

const SOURCE_PATH = join(process.cwd(), "src/lib/projects/default-quick-bom-catalog.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/default-quick-bom-catalog.test.ts");

// SKUs the local STC/mock catalog misses; supplied by the approved Honeywell metadata.
const HONEYWELL_ONLY_SKUS = ["C9300X-48HX-A", "C9300L-24P-4X-A", "CW9178I-CFG"] as const;
// A SKU that lives in the local mock catalog and must keep resolving from it.
const LOCAL_SKU = "C9300-48P-E";
const STANDALONE_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="] as const;

function importSpecifiers(source: string): string[] {
  const importRegex = /import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) found.push(match[1]);
  return found;
}

describe("DEFAULT_QUICK_BOM_CATALOG_SOURCE", () => {
  it("is the canonical default source constant", () => {
    expect(DEFAULT_QUICK_BOM_CATALOG_SOURCE).toBe("default_quick_bom_approved_catalog");
  });
});

describe("getDefaultQuickBomCatalogLookupIndex", () => {
  it("tags the index with the default Quick BoM catalog source", () => {
    expect(getDefaultQuickBomCatalogLookupIndex().catalogSource).toBe(
      DEFAULT_QUICK_BOM_CATALOG_SOURCE
    );
  });

  it("resolves the known Honeywell SKUs the local mock catalog misses as exact matches", () => {
    const index = getDefaultQuickBomCatalogLookupIndex();
    for (const sku of HONEYWELL_ONLY_SKUS) {
      const result = lookupCatalogSku(sku, index);
      expect(result.status, sku).toBe("matched");
      if (result.status === "matched") {
        expect(result.match.source).toBe("exact");
        expect(result.match.catalogSku).toBe(sku);
        expect(result.match.catalogSource).toBe(DEFAULT_QUICK_BOM_CATALOG_SOURCE);
      }
    }
  });

  it("still resolves a local STC/mock catalog SKU", () => {
    const result = lookupCatalogSku(LOCAL_SKU, getDefaultQuickBomCatalogLookupIndex());
    expect(result.status).toBe("matched");
  });

  it("resolves the standalone optics as flat same-SKU matches", () => {
    const index = getDefaultQuickBomCatalogLookupIndex();
    for (const optic of STANDALONE_OPTICS) {
      const result = lookupCatalogSku(optic, index);
      expect(result.status, optic).toBe("matched");
      if (result.status === "matched") {
        expect(result.match.catalogSku).toBe(optic);
      }
    }
  });
});

describe("module hygiene", () => {
  it("exposes only the documented runtime surface", () => {
    expect(Object.keys(defaultCatalogModule).sort()).toEqual([
      "DEFAULT_QUICK_BOM_CATALOG_SOURCE",
      "getDefaultQuickBomCatalogLookupIndex",
    ]);
  });

  it("imports only catalog-lookup, the Honeywell demo catalog fixture, and known SKU catalog", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const allowed = new Set([
      "@/lib/projects/catalog-lookup",
      "@/lib/projects/honeywell-demo-catalog-fixture",
      "@/lib/projects/honeywell-known-sku-catalog",
    ]);
    const specifiers = importSpecifiers(source);
    for (const spec of specifiers) {
      expect(allowed.has(spec), `Unexpected import: ${spec}`).toBe(true);
    }
    expect(specifiers.length).toBeGreaterThanOrEqual(2);
  });

  it("does not import DB, API/UI, engines, coordinator, adapters, AI, pricing, export, or routes", () => {
    const imports = importSpecifiers(readFileSync(SOURCE_PATH, "utf8")).join("\n");
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
      "pricing",
      "export",
      "runner",
      "route",
    ]) {
      expect(imports, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps source and test ASCII-only", () => {
    for (const file of [SOURCE_PATH, TEST_PATH]) {
      const text = readFileSync(file, "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text), file).toBe(false);
    }
  });
});
