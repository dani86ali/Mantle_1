/**
 * Tier-1 catalog extraction coverage tests.
 *
 * Source-of-truth assertions over the merged catalog JSON produced by
 * scripts/extract-catalog-tier1.ts. Five criteria from the spec:
 *
 *   1. ≥3000 SKUs total
 *   2. Five named Nesma SKUs resolve to expected canonical prices
 *      with non-null vendor and ≥1 priceObservation each
 *   3. Per-file coverage: each sampled TA file either contributes an
 *      observation OR is logged as failed (no silent drops)
 *   4. ≥3 distinct vendors
 *   5. workbooksProcessed === workbooksSucceeded + workbooksFailed.length
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

interface PriceObservation {
  opportunityId: string;
  listPrice: number;
  observedAt: string;
  source: string;
}

interface CatalogItem {
  sku: string;
  vendor?: string;
  listPrice: number;
  priceObservations?: PriceObservation[];
}

interface CatalogFile {
  _metadata?: {
    workbooksProcessed?: number;
    workbooksSucceeded?: number;
    workbooksFailed?: Array<{ path: string; reason: string }>;
  };
  items: Record<string, CatalogItem>;
  errors?: unknown;
}

const CATALOG_PATH = join(
  __dirname,
  "_mock-data",
  "catalog-responses.json"
);
const INVENTORY_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "bomatic_planning",
  "parser_strategies",
  "INVENTORY.md"
);

const catalog: CatalogFile = JSON.parse(
  readFileSync(CATALOG_PATH, "utf-8")
);

describe("Tier-1 catalog extraction", () => {
  describe("criterion 1: minimum aggregate SKU count", () => {
    it("has at least 3000 SKUs", () => {
      expect(Object.keys(catalog.items).length).toBeGreaterThanOrEqual(3000);
    });
  });

  describe("criterion 2: Nesma V35 named-SKU prices", () => {
    const targets: Array<[string, number]> = [
      ["CON-SNT-C9410R", 29773.5],
      ["C9400-DNA-A-5Y", 25271.85],
      ["C9400-PWR-2100AC", 2406.84],
      ["C9400X-SUP-2XL", 28944.3],
      ["C9400-LC-48XS", 46110.4],
    ];

    for (const [sku, expectedPrice] of targets) {
      it(`${sku} → ${expectedPrice} with vendor + observations`, () => {
        const item = catalog.items[sku];
        expect(item, `${sku} missing from catalog`).toBeDefined();
        expect(Math.abs(item.listPrice - expectedPrice)).toBeLessThan(0.01);
        expect(item.vendor, `${sku} has no vendor`).toBeTruthy();
        expect(item.priceObservations).toBeDefined();
        expect(item.priceObservations!.length).toBeGreaterThanOrEqual(1);
      });
    }
  });

  describe("criterion 3: per-file coverage (no silent drops)", () => {
    function loadTAPaths(): string[] {
      const raw = readFileSync(INVENTORY_PATH, "utf-8");
      const paths: string[] = [];
      for (const line of raw.split("\n")) {
        if (!line.startsWith("|")) continue;
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length < 7) continue;
        const path = parts[1].replace(/^`|`$/g, "");
        const family = parts[5];
        if (family === "tender_analyzer" && path) paths.push(path);
      }
      return paths;
    }

    const allTAPaths = loadTAPaths();
    expect(allTAPaths.length).toBeGreaterThan(100); // sanity check inventory parsed

    const failedSet = new Set(
      (catalog._metadata?.workbooksFailed ?? []).map((f) => f.path)
    );
    // Succeeded ≡ TA path NOT in failed list (extractor invariant: succeeded ⇒ ≥1 entry)
    const succeededTAPaths = allTAPaths.filter((p) => !failedSet.has(p));
    expect(succeededTAPaths.length).toBeGreaterThan(50);

    // Deterministic sample of 5 succeeded files
    const step = Math.max(1, Math.floor(succeededTAPaths.length / 5));
    const samples = [0, 1, 2, 3, 4].map((i) => succeededTAPaths[i * step]);

    // Precompute basenames present in any item's priceObservations
    const basenameInObservations = new Set<string>();
    for (const item of Object.values(catalog.items)) {
      for (const obs of item.priceObservations ?? []) {
        const match = obs.source.match(/^(?:TA|CCW)\s+(.+)$/);
        if (match) basenameInObservations.add(match[1]);
      }
    }

    for (const path of samples) {
      const basename = path.split(/[\\/]/).pop()!;
      it(`${basename} contributes ≥1 catalog entry (literal spec)`, () => {
        expect(
          basenameInObservations.has(basename),
          `succeeded TA file "${path}" produced no priceObservations`
        ).toBe(true);
      });
    }
  });

  describe("criterion 4: vendor diversity", () => {
    it("at least 3 distinct vendors across catalog items", () => {
      const vendors = new Set<string>();
      for (const item of Object.values(catalog.items)) {
        if (item.vendor) vendors.add(item.vendor);
      }
      expect(vendors.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe("criterion 5: coverage report invariant", () => {
    it("workbooksProcessed === workbooksSucceeded + workbooksFailed.length", () => {
      const meta = catalog._metadata;
      expect(meta).toBeDefined();
      const processed = meta!.workbooksProcessed ?? -1;
      const succeeded = meta!.workbooksSucceeded ?? -1;
      const failed = (meta!.workbooksFailed ?? []).length;
      expect(processed).toBeGreaterThan(0);
      expect(succeeded + failed).toBe(processed);
    });
  });
});
