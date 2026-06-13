/**
 * Evidence: the Cisco industrial switching / accessory approved SKU scope is a
 * pure, import-free, same-SKU recognition helper. It exports exactly the ten
 * approved industrial SKUs as zero-price placeholder rows (NOT pricing authority),
 * with no replacement/substitution/config/child fields, returning fresh copies
 * each call.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as scopeModule from "@/lib/projects/quick-bom-cisco-industrial-sku-scope";
import {
  CISCO_INDUSTRIAL_SWITCHING_APPROVED_SKU_SCOPE_PRICE_LIST_ID,
  getCiscoIndustrialSwitchingApprovedSkuScopeItems,
} from "@/lib/projects/quick-bom-cisco-industrial-sku-scope";

const SOURCE_PATH = join(
  process.cwd(),
  "src/lib/projects/quick-bom-cisco-industrial-sku-scope.ts"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/quick-bom-cisco-industrial-sku-scope.test.ts"
);

const APPROVED_SKUS = [
  "IEM-3500-14T2S=",
  "CON-SNT-IEM35B2S",
  "PWR-IE480W-PCAC-L=",
  "IE-1000-4P2S-LM",
  "CON-SNT-I1002SLM",
  "IOT-UTILITIES",
  "IOT-UTIL-OTHER",
  "PWR-IE170W-PC-AC=",
  "CAB-TA-UK=",
  "STK-RACK-DINRAIL=",
];

describe("getCiscoIndustrialSwitchingApprovedSkuScopeItems", () => {
  it("exports exactly the ten approved Cisco industrial SKUs", () => {
    const items = getCiscoIndustrialSwitchingApprovedSkuScopeItems();
    expect(Object.keys(items).sort()).toEqual([...APPROVED_SKUS].sort());
  });

  it("recognizes every row as Cisco, same-SKU, with the scope provenance", () => {
    const items = getCiscoIndustrialSwitchingApprovedSkuScopeItems();
    for (const sku of APPROVED_SKUS) {
      const item = items[sku];
      expect(item.sku, sku).toBe(sku); // same-SKU: keyed by and equal to itself
      expect(item.vendor, sku).toBe("Cisco");
      expect(item.priceListId, sku).toBe(
        CISCO_INDUSTRIAL_SWITCHING_APPROVED_SKU_SCOPE_PRICE_LIST_ID
      );
      expect(item.description.length, sku).toBeGreaterThan(0);
    }
  });

  it("uses zero-price SAR placeholders (not pricing authority)", () => {
    const items = getCiscoIndustrialSwitchingApprovedSkuScopeItems();
    for (const sku of APPROVED_SKUS) {
      expect(items[sku].listPrice, sku).toBe(0);
      expect(items[sku].currency, sku).toBe("SAR");
    }
  });

  it("attaches no replacement/substitution/config/child/pricing-extra fields", () => {
    const items = getCiscoIndustrialSwitchingApprovedSkuScopeItems();
    const allowedKeys = [
      "sku",
      "description",
      "listPrice",
      "currency",
      "vendor",
      "priceListId",
    ].sort();
    for (const sku of APPROVED_SKUS) {
      expect(Object.keys(items[sku]).sort(), sku).toEqual(allowedKeys);
      for (const forbidden of [
        "replacementFor",
        "substitutedSku",
        "currentSku",
        "parentSku",
        "children",
        "includedItems",
        "unitPrice",
      ]) {
        expect(items[sku], `${sku}:${forbidden}`).not.toHaveProperty(forbidden);
      }
    }
  });

  it("returns fresh row objects on every call", () => {
    const a = getCiscoIndustrialSwitchingApprovedSkuScopeItems();
    const b = getCiscoIndustrialSwitchingApprovedSkuScopeItems();
    expect(a).not.toBe(b);
    for (const sku of APPROVED_SKUS) {
      expect(a[sku]).not.toBe(b[sku]);
      expect(a[sku]).toEqual(b[sku]);
    }
    a["IEM-3500-14T2S="].description = "MUTATED";
    expect(
      getCiscoIndustrialSwitchingApprovedSkuScopeItems()["IEM-3500-14T2S="]
        .description
    ).not.toBe("MUTATED");
  });
});

describe("module hygiene", () => {
  it("exposes only the documented runtime surface", () => {
    expect(Object.keys(scopeModule).sort()).toEqual([
      "CISCO_INDUSTRIAL_SWITCHING_APPROVED_SKU_SCOPE_PRICE_LIST_ID",
      "getCiscoIndustrialSwitchingApprovedSkuScopeItems",
    ]);
  });

  it("has no imports at all (not even type-only)", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(/^\s*import\b/m.test(source)).toBe(false);
  });

  it("keeps source and test ASCII-only", () => {
    for (const file of [SOURCE_PATH, TEST_PATH]) {
      const text = readFileSync(file, "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text), file).toBe(false);
    }
  });
});
