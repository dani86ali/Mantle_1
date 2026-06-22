import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as fixtureLoader from "@/lib/projects/scoped-cisco-pricing-fixture";
import {
  getScopedCiscoPricingFixture,
  getScopedCiscoUnitListPriceSarBySku,
  getScopedCiscoMantleCategoryBySku,
  getScopedCiscoMantleRowOrderSkuSequence,
} from "@/lib/projects/scoped-cisco-pricing-fixture";

/**
 * Regression tests for the committed scoped Cisco Quick BoM pricing source. The fixture
 * supplies, for exactly the approved Cisco collaboration and industrial switching scope,
 * a per-SKU SAR list price (the approved workbook ListPrice column), a Mantle total-
 * bucket category, and a 44-entry export presentation row-order sequence (duplicate
 * STK-RACK-DINRAIL= preserved). It is scoped pricing-source authority only: not
 * production Cisco pricing, not broad Cisco-general pricing, not runtime AI/catalog
 * pricing, not configuration/replacement authority, and no silent SKU substitution or
 * omission. These tests never read the external benchmark workbook at runtime.
 */

const LOADER_PATH = join(process.cwd(), "src/lib/projects/scoped-cisco-pricing-fixture.ts");
const AUTHORITY_PATH = join(process.cwd(), "src/lib/projects/scoped-cisco-pricing-authority.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/scoped-cisco-pricing-fixture.test.ts");

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// The four CON-SNT-* support/service SKUs in the approved scope.
const SUPPORT_SERVICE_SKUS = [
  "CON-SNT-CSKITEK9",
  "CON-SNT-CS5HEJMI",
  "CON-SNT-IEM35B2S",
  "CON-SNT-I1002SLM",
];

const EXPECTED_UNIQUE_SKU_COUNT = 43;
const EXPECTED_ROW_ORDER_COUNT = 44;
const EXPECTED_SCOPED_EXTENDED_TOTAL_SAR = 1005238.42;
const DUPLICATE_SKU = "STK-RACK-DINRAIL=";
const EXPECTED_WORKBOOK_PATH =
  "C:/Pre-Sales/Benchmarck_Files/MARAFIQObsolete_Network_Hardware_Replacement.xlsx";

/** Extract `from "..."` specifiers from module source. */
function importSpecifiers(source: string): string[] {
  const importRegex = /import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) found.push(m[1]);
  return found;
}

// --- Metadata / authority boundary ------------------------------------------

describe("scoped cisco pricing fixture - authority boundary", () => {
  it("declares the scoped pricing-source authority boundary metadata exactly", () => {
    const f = getScopedCiscoPricingFixture();
    expect(f.fixtureId).toBe("scoped-cisco-quick-bom-pricing-fixture");
    expect(f.scope).toBe("scoped_cisco_quick_bom_pricing_source");
    expect(f.status).toBe("approved_scoped_pricing_source");
    expect(f.currency).toBe("SAR");
    expect(f.boundary).toEqual({
      deterministicPricingAuthority: true,
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

  it("names the approved workbook and sheet as the source evidence provenance", () => {
    const f = getScopedCiscoPricingFixture();
    expect(f.sourceEvidence.primarySourceType).toBe("approved_scoped_workbook");
    expect(f.sourceEvidence.workbookPath).toBe(EXPECTED_WORKBOOK_PATH);
    expect(f.sourceEvidence.sheetName).toBe("EstimateDetails_JL164850184VT");
    expect(f.sourceEvidence.derivationNote).toBe(
      "unit_sar_list_price_is_workbook_listprice_column"
    );
  });
});

// --- SKU universe -----------------------------------------------------------

describe("scoped cisco pricing fixture - SKU universe", () => {
  it("covers exactly the same unique SKU keys in the price, evidence, and category maps", () => {
    const f = getScopedCiscoPricingFixture();
    const priceKeys = Object.keys(f.unitListPriceSarBySku).sort();
    const evidenceKeys = Object.keys(f.priceSourceEvidenceBySku).sort();
    const categoryKeys = Object.keys(f.categoryBySku).sort();

    expect(priceKeys).toHaveLength(EXPECTED_UNIQUE_SKU_COUNT);
    expect(priceKeys).toEqual(categoryKeys);
    expect(priceKeys).toEqual(evidenceKeys);
    expect(f.skuCount).toBe(EXPECTED_UNIQUE_SKU_COUNT);
  });

  it("includes every support SKU and the duplicate stacking SKU exactly once in the maps", () => {
    const f = getScopedCiscoPricingFixture();
    const keys = new Set(Object.keys(f.unitListPriceSarBySku));
    for (const sku of SUPPORT_SERVICE_SKUS) expect(keys.has(sku), sku).toBe(true);
    expect(keys.has(DUPLICATE_SKU)).toBe(true);
    // One price entry for the duplicate SKU, even though it spans two source lines.
    expect(f.priceSourceEvidenceBySku[DUPLICATE_SKU].sourceLines).toHaveLength(2);
  });
});

// --- Price entries ----------------------------------------------------------

describe("scoped cisco pricing fixture - price entries", () => {
  it("prices every SKU in SAR with a finite nonnegative unit price", () => {
    const f = getScopedCiscoPricingFixture();
    for (const [sku, entry] of Object.entries(f.unitListPriceSarBySku)) {
      expect(entry.currency, sku).toBe("SAR");
      expect(Number.isFinite(entry.unitListPriceSar), sku).toBe(true);
      expect(entry.unitListPriceSar, sku).toBeGreaterThanOrEqual(0);
    }
  });

  it("matches each unit price to its own stored workbook ListPrice evidence", () => {
    const f = getScopedCiscoPricingFixture();
    for (const sku of Object.keys(f.unitListPriceSarBySku)) {
      const ev = f.priceSourceEvidenceBySku[sku];
      expect(ev.sourceType, sku).toBe("approved_scoped_workbook");
      expect(ev.workbookPath, sku).toBe(EXPECTED_WORKBOOK_PATH);
      for (const line of ev.sourceLines) {
        expect(line.rawListPrice, sku).toBe(f.unitListPriceSarBySku[sku].unitListPriceSar);
        expect(round2(line.rawListPrice * line.sourceQuantity), sku).toBe(line.rawExtendedListPrice);
      }
    }
  });
});

// --- Categories -------------------------------------------------------------

describe("scoped cisco pricing fixture - categories", () => {
  it("assigns the four CON-SNT support SKUs category service and the rest product", () => {
    const f = getScopedCiscoPricingFixture();
    for (const [sku, category] of Object.entries(f.categoryBySku)) {
      expect(["product", "service"], sku).toContain(category);
      const expected = SUPPORT_SERVICE_SKUS.includes(sku) ? "service" : "product";
      expect(category, sku).toBe(expected);
    }
    const serviceSkus = Object.keys(f.categoryBySku).filter((s) => f.categoryBySku[s] === "service");
    expect(serviceSkus.sort()).toEqual([...SUPPORT_SERVICE_SKUS].sort());
  });
});

// --- Mantle export presentation row order -----------------------------------

describe("scoped cisco pricing fixture - Mantle export row order", () => {
  it("is a 44-entry sequence preserving the duplicate STK-RACK-DINRAIL= occurrence", () => {
    const sequence = getScopedCiscoMantleRowOrderSkuSequence();
    expect(sequence).toHaveLength(EXPECTED_ROW_ORDER_COUNT);
    expect(f_occurrences(sequence).get(DUPLICATE_SKU)).toBe(2);
    for (const sku of sequence) expect(typeof sku).toBe("string");
    // Every unique SKU in the sequence is a known priced SKU (no new/substitute SKU).
    const f = getScopedCiscoPricingFixture();
    const known = new Set(Object.keys(f.unitListPriceSarBySku));
    for (const sku of sequence) expect(known.has(sku), sku).toBe(true);
    expect(new Set(sequence).size).toBe(EXPECTED_UNIQUE_SKU_COUNT);
  });

  it("sums row-order extended list prices to the scoped Cisco workbook total", () => {
    const f = getScopedCiscoPricingFixture();
    const sequence = f.mantleRowOrderSkuSequence;
    const quantities = f.mantleRowOrderQuantities;
    expect(quantities).toHaveLength(EXPECTED_ROW_ORDER_COUNT);

    let total = 0;
    for (let i = 0; i < sequence.length; i++) {
      total += f.unitListPriceSarBySku[sequence[i]].unitListPriceSar * quantities[i];
    }
    expect(round2(total)).toBe(EXPECTED_SCOPED_EXTENDED_TOTAL_SAR);
    expect(f.scopedExtendedListPriceTotalSar).toBe(EXPECTED_SCOPED_EXTENDED_TOTAL_SAR);
  });

  it("returns a fresh copy each call; mutation cannot leak", () => {
    const first = getScopedCiscoMantleRowOrderSkuSequence();
    first[0] = "MUTATED";
    first.push("INJECTED");
    const second = getScopedCiscoMantleRowOrderSkuSequence();
    expect(second).toHaveLength(EXPECTED_ROW_ORDER_COUNT);
    expect(second).not.toContain("INJECTED");
    expect(second[0]).toBe("CS-KIT-EQX-C-K9");
  });
});

function f_occurrences(sequence: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sku of sequence) counts.set(sku, (counts.get(sku) ?? 0) + 1);
  return counts;
}

// --- Loader getters return fresh deep copies --------------------------------

describe("scoped cisco pricing fixture - fresh deep copies", () => {
  it("exposes exactly the four documented getters at runtime", () => {
    expect(Object.keys(fixtureLoader).sort()).toEqual([
      "getScopedCiscoMantleCategoryBySku",
      "getScopedCiscoMantleRowOrderSkuSequence",
      "getScopedCiscoPricingFixture",
      "getScopedCiscoUnitListPriceSarBySku",
    ]);
  });

  it("returns a fresh price map each call; nested or top-level mutation cannot leak", () => {
    const first = getScopedCiscoUnitListPriceSarBySku();
    const baseline = first["CS-KIT-EQX-C-K9"].unitListPriceSar;
    first["CS-KIT-EQX-C-K9"].unitListPriceSar = 999999;
    first["INJECTED-SKU"] = { currency: "SAR", unitListPriceSar: 1 };
    delete first["CAB-TA-UK="];

    const second = getScopedCiscoUnitListPriceSarBySku();
    expect(second["CS-KIT-EQX-C-K9"].unitListPriceSar).toBe(baseline);
    expect("INJECTED-SKU" in second).toBe(false);
    expect("CAB-TA-UK=" in second).toBe(true);
  });

  it("returns a fresh category map each call; mutation cannot leak", () => {
    const first = getScopedCiscoMantleCategoryBySku();
    first["CON-SNT-CSKITEK9"] = "product";
    const second = getScopedCiscoMantleCategoryBySku();
    expect(second["CON-SNT-CSKITEK9"]).toBe("service");
  });

  it("returns a fresh full fixture each call; deep mutation cannot leak", () => {
    const first = getScopedCiscoPricingFixture();
    first.skuCount = 0;
    first.unitListPriceSarBySku["CS-KIT-EQX-C-K9"].unitListPriceSar = 1;
    first.mantleRowOrderSkuSequence.push("MUTATED");

    const second = getScopedCiscoPricingFixture();
    expect(second.skuCount).toBe(EXPECTED_UNIQUE_SKU_COUNT);
    expect(second.unitListPriceSarBySku["CS-KIT-EQX-C-K9"].unitListPriceSar).toBe(222859.31);
    expect(second.mantleRowOrderSkuSequence).toHaveLength(EXPECTED_ROW_ORDER_COUNT);
  });
});

// --- Source hygiene & loader isolation --------------------------------------

describe("scoped cisco pricing fixture - source hygiene", () => {
  it("loader imports only the committed JSON fixture (no pricing/catalog/DB/API/UI/export/AI/package module)", () => {
    const specs = importSpecifiers(readFileSync(LOADER_PATH, "utf8"));
    expect(specs).toEqual(["../../../data/quick-bom/scoped-cisco-pricing-fixture.json"]);
  });

  it("authority module imports only the scoped Cisco fixture loader", () => {
    const specs = importSpecifiers(readFileSync(AUTHORITY_PATH, "utf8"));
    expect(specs).toEqual(["@/lib/projects/scoped-cisco-pricing-fixture"]);
  });

  it("keeps the loader, authority, and test sources ASCII-only", () => {
    for (const path of [LOADER_PATH, AUTHORITY_PATH, TEST_PATH]) {
      const text = readFileSync(path, "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text), path).toBe(false);
    }
  });
});
