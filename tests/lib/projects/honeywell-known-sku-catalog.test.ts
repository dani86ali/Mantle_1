/**
 * Evidence: the Honeywell known same-SKU catalog module exposes fresh-copy
 * same-SKU recognition rows for the 11 Batch 4 historical/deferred replacement-
 * candidate SKUs - recognizing each as ITSELF, never mapping it to a current
 * replacement SKU, and carrying no pricing/config/replacement authority.
 *
 * Pure helper imports only - no DB, API/UI, engines, coordinators, adapters,
 * pricing services, export, runner, or AI/LLM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as knownSkuModule from "@/lib/projects/honeywell-known-sku-catalog";
import {
  HONEYWELL_KNOWN_SKU_PRICE_LIST_ID,
  getHoneywellKnownSameSkuCatalogItems,
} from "@/lib/projects/honeywell-known-sku-catalog";

const SOURCE_PATH = join(process.cwd(), "src/lib/projects/honeywell-known-sku-catalog.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-known-sku-catalog.test.ts");

const EXPECTED_SKUS = [
  "C9300-DNX-A-48-3Y",
  "C9300L-DNX-A-24-3Y",
  "SC9300UK9-1712",
  "S9300LUK9-1712",
  "SPACES-EXT-S",
  "CON-L1NBX-C9300XY4",
  "CON-L1SWX-93XA48MY",
  "CON-L1NBX-C93024PX",
  "CON-L1SWX-3LXA24MY",
  "CON-SNT-P7PK94P1",
  "C9300L-STACK-BLANK",
] as const;

// Current replacement SKUs that must NEVER appear as a suggested SKU (Batch 4: deferred).
const FORBIDDEN_CURRENT_SKUS = ["DNAC", "C9300X-DNA-A-48-3Y", "C9300L-DNA-A-24-3Y"] as const;

function importSpecifiers(source: string): string[] {
  const importRegex = /import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) found.push(match[1]);
  return found;
}

describe("getHoneywellKnownSameSkuCatalogItems", () => {
  it("exposes exactly the 11 Batch 4 historical/deferred SKUs", () => {
    const items = getHoneywellKnownSameSkuCatalogItems();
    expect(Object.keys(items).sort()).toEqual([...EXPECTED_SKUS].sort());
  });

  it("recognizes each SKU as ITSELF (same-SKU), never a current replacement", () => {
    const items = getHoneywellKnownSameSkuCatalogItems();
    const forbidden = new Set<string>(FORBIDDEN_CURRENT_SKUS);
    for (const [key, item] of Object.entries(items)) {
      expect(item.sku).toBe(key);
      expect(forbidden.has(item.sku)).toBe(false);
    }
  });

  it("carries no pricing authority: listPrice 0, currency SAR, supplement price list id", () => {
    for (const item of Object.values(getHoneywellKnownSameSkuCatalogItems())) {
      expect(item.listPrice).toBe(0);
      expect(item.currency).toBe("SAR");
      expect(item.priceListId).toBe(HONEYWELL_KNOWN_SKU_PRICE_LIST_ID);
    }
  });

  it("uses a description that makes the deferred status clear", () => {
    for (const [sku, item] of Object.entries(getHoneywellKnownSameSkuCatalogItems())) {
      expect(item.description).toContain("deferred replacement candidate");
      expect(item.description).toContain(sku);
    }
  });

  it("carries no replacement/config/decision fields", () => {
    const allowedKeys = new Set([
      "sku",
      "description",
      "listPrice",
      "currency",
      "vendor",
      "productCategory",
      "priceListId",
    ]);
    for (const item of Object.values(getHoneywellKnownSameSkuCatalogItems())) {
      for (const key of Object.keys(item)) {
        expect(allowedKeys.has(key), `Unexpected field: ${key}`).toBe(true);
      }
    }
  });

  it("returns fresh copies each call", () => {
    const a = getHoneywellKnownSameSkuCatalogItems();
    const b = getHoneywellKnownSameSkuCatalogItems();
    expect(a).not.toBe(b);
    a["C9300-DNX-A-48-3Y"].description = "MUTATED";
    expect(b["C9300-DNX-A-48-3Y"].description).not.toBe("MUTATED");
  });
});

describe("module hygiene", () => {
  it("exposes only the documented runtime surface", () => {
    expect(Object.keys(knownSkuModule).sort()).toEqual([
      "HONEYWELL_KNOWN_SKU_PRICE_LIST_ID",
      "getHoneywellKnownSameSkuCatalogItems",
    ]);
  });

  it("imports no DB, API/UI, engines, coordinator, adapters, AI, pricing, export, runner, or routes", () => {
    const imports = importSpecifiers(readFileSync(SOURCE_PATH, "utf8"));
    for (const spec of imports) {
      expect(spec).toBe("@/lib/projects/catalog-lookup");
    }
    const joined = imports.join("\n");
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
      expect(joined, forbidden).not.toContain(forbidden);
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
