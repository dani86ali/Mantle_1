/**
 * Evidence: the Cisco collaboration / Room Kit EQX approved SKU scope is a pure,
 * import-free, same-SKU recognition helper. It exports exactly the 33 approved
 * collaboration SKUs as zero-price placeholder rows (NOT pricing authority), with
 * no replacement/substitution/config/child fields, returning fresh copies each
 * call.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as scopeModule from "@/lib/projects/quick-bom-cisco-collaboration-sku-scope";
import {
  CISCO_COLLABORATION_APPROVED_SKU_SCOPE_PRICE_LIST_ID,
  getCiscoCollaborationApprovedSkuScopeItems,
} from "@/lib/projects/quick-bom-cisco-collaboration-sku-scope";

const SOURCE_PATH = join(
  process.cwd(),
  "src/lib/projects/quick-bom-cisco-collaboration-sku-scope.ts"
);
const TEST_PATH = join(
  process.cwd(),
  "tests/lib/projects/quick-bom-cisco-collaboration-sku-scope.test.ts"
);

const APPROVED_SKUS = [
  "CS-KIT-EQX-C-K9",
  "CON-SNT-CSKITEK9",
  "CS-MIC-TABLE-J",
  "CON-SNT-CS5HEJMI",
  "PWR-CORD-GBR-F",
  "CAB-HDMI-MUL4K-9M",
  "CAB-EQX-SCREENS",
  "CS-CODEC-EQ-K9-",
  "CS-RQUADCAM-",
  "CS-PANO-DNAM4-",
  "CS-EQX-SPK-",
  "CS-EQX-BASS-",
  "CS-EQX-FAN-",
  "CS-EQX-CENTER-MOD-",
  "CS-EQX-SIDE-MOD-",
  "CS-EQX-FRAME-C-",
  "CS-EQX-VESA-",
  "PSU-12VDC-120W-",
  "PSU-24VDC-270W-",
  "CS-EQX-ANT-",
  "CS-PWR-STRIP4-",
  "PWR-CAB-INT-3.0M-",
  "PWR-CAB-INT-0.22M-",
  "CAB-ETH-5M-GR-",
  "CAB-2HDMI-1.5M-GR-",
  "CAB-ETH-1.5M-GR-",
  "CAB-EQX-SPKR-",
  "PWR-CAB-INT-1.45M-",
  "CAB-CAT5E-12M-",
  "CS-T10-TS-LX-",
  "CS-EQX-FSK-ST-C-",
  "CS-EQX-FSK-RC-C-",
  "CS-KIT-EQX-FSK-C",
];

describe("getCiscoCollaborationApprovedSkuScopeItems", () => {
  it("exports exactly the 33 approved Cisco collaboration SKUs", () => {
    expect(APPROVED_SKUS).toHaveLength(33);
    const items = getCiscoCollaborationApprovedSkuScopeItems();
    expect(Object.keys(items).sort()).toEqual([...APPROVED_SKUS].sort());
  });

  it("recognizes every row as Cisco, same-SKU, with the scope provenance", () => {
    const items = getCiscoCollaborationApprovedSkuScopeItems();
    for (const sku of APPROVED_SKUS) {
      const item = items[sku];
      expect(item.sku, sku).toBe(sku); // same-SKU: keyed by and equal to itself
      expect(item.vendor, sku).toBe("Cisco");
      expect(item.priceListId, sku).toBe(
        CISCO_COLLABORATION_APPROVED_SKU_SCOPE_PRICE_LIST_ID
      );
      expect(item.description.length, sku).toBeGreaterThan(0);
    }
  });

  it("uses zero-price SAR placeholders (not pricing authority)", () => {
    const items = getCiscoCollaborationApprovedSkuScopeItems();
    for (const sku of APPROVED_SKUS) {
      expect(items[sku].listPrice, sku).toBe(0);
      expect(items[sku].currency, sku).toBe("SAR");
    }
  });

  it("attaches no replacement/substitution/config/child/pricing-extra fields", () => {
    const items = getCiscoCollaborationApprovedSkuScopeItems();
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
    const a = getCiscoCollaborationApprovedSkuScopeItems();
    const b = getCiscoCollaborationApprovedSkuScopeItems();
    expect(a).not.toBe(b);
    for (const sku of APPROVED_SKUS) {
      expect(a[sku]).not.toBe(b[sku]);
      expect(a[sku]).toEqual(b[sku]);
    }
    a["CS-MIC-TABLE-J"].description = "MUTATED";
    expect(getCiscoCollaborationApprovedSkuScopeItems()["CS-MIC-TABLE-J"].description).not.toBe(
      "MUTATED"
    );
  });
});

describe("module hygiene", () => {
  it("exposes only the documented runtime surface", () => {
    expect(Object.keys(scopeModule).sort()).toEqual([
      "CISCO_COLLABORATION_APPROVED_SKU_SCOPE_PRICE_LIST_ID",
      "getCiscoCollaborationApprovedSkuScopeItems",
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
