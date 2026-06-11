import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as mod from "@/lib/projects/honeywell-catalog-coverage-audit";
import {
  HONEYWELL_CATALOG_COVERAGE_AUDIT_BOUNDARY,
  auditHoneywellCatalogCoverage,
  auditHoneywellCustomerRowCoverage,
  auditHoneywellBroaderSkuCoverage,
  getHoneywellBroaderDemoSkuUniverse,
} from "@/lib/projects/honeywell-catalog-coverage-audit";
import { buildCatalogLookupIndex, type CatalogLookupItem } from "@/lib/projects/catalog-lookup";
import { getHoneywellDemoPricingFixture } from "@/lib/projects/honeywell-demo-pricing-fixture";

/**
 * Read-only Honeywell catalog coverage audit (Prompt 102). These tests pin what the
 * committed local STC historical/mock catalog resolves TODAY for the seven Honeywell
 * customer BoQ rows and the broader 50-SKU demo universe, and prove the audit accepts,
 * substitutes, prices, and silently replaces nothing. They never read the external
 * benchmark workbook and add no Cisco GPL/API/CCW lookup.
 */

const MODULE_PATH = join(process.cwd(), "src/lib/projects/honeywell-catalog-coverage-audit.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-catalog-coverage-audit.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_CATALOG_COVERAGE_AUDIT.md");

const STANDALONE_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

function catItem(overrides: Partial<CatalogLookupItem> = {}): CatalogLookupItem {
  return { sku: "X", description: "x", listPrice: 100, currency: "USD", ...overrides };
}

/** Extract `from "..."` specifiers from module source. */
function importSpecifiers(source: string): string[] {
  const importRegex = /import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) found.push(m[1]);
  return found;
}

// --- Authority boundary -----------------------------------------------------

describe("honeywell catalog coverage audit - authority boundary", () => {
  it("declares the audit-only boundary and grants no authority", () => {
    expect(HONEYWELL_CATALOG_COVERAGE_AUDIT_BOUNDARY).toEqual({
      auditOnly: true,
      pricingAuthority: false,
      configurationAuthority: false,
      productionCiscoCatalogAuthority: false,
      skuSubstitutionApproval: false,
    });
  });

  it("marks the catalog source as the local STC historical/mock source", () => {
    const audit = auditHoneywellCatalogCoverage();
    expect(audit.catalogSource).toBe("local_stc_historical_mock");
    expect(audit.boundary).toEqual(HONEYWELL_CATALOG_COVERAGE_AUDIT_BOUNDARY);
  });

  it("composes both SKU-set audits", () => {
    const audit = auditHoneywellCatalogCoverage();
    expect(audit.customerRows).toEqual(auditHoneywellCustomerRowCoverage());
    expect(audit.broaderSkuUniverse).toEqual(auditHoneywellBroaderSkuCoverage());
  });
});

// --- Customer rows ----------------------------------------------------------

describe("honeywell catalog coverage audit - customer rows", () => {
  it("audits the seven customer rows in customer order with line, sku, qty, and outcome", () => {
    const { rows } = auditHoneywellCustomerRowCoverage();
    expect(rows.map((r) => [r.originalLineNumber, r.sku, r.quantity])).toEqual([
      [1, "CW9178I-CFG", 12],
      [2, "CISCO-NETWORK-SUB", 1],
      [3, "C9300X-48HX-A", 7],
      [4, "C9300L-24P-4X-A", 6],
      [5, "SFP-10G-LR-S=", 12],
      [6, "SFP-10/25G-LR-S=", 14],
      [7, "CP-7841-K9=", 59],
    ]);
    for (const r of rows) {
      expect(["matched", "not_found", "ambiguous"]).toContain(r.outcome);
      expect(typeof r.originalLineNumber).toBe("number");
      expect(typeof r.quantity).toBe("number");
      expect(typeof r.sku).toBe("string");
      expect(typeof r.normalizedSku).toBe("string");
    }
  });

  it("pins the current customer-row coverage counts", () => {
    const { counts } = auditHoneywellCustomerRowCoverage();
    expect(counts).toEqual({
      total: 7,
      matched: 4,
      notFound: 3,
      ambiguous: 0,
      zeroOrNegativePriceMatches: 1,
      exactMatches: 4,
      normalizedMatches: 0,
    });
  });

  it("lists unresolved customer SKUs deterministically in customer order", () => {
    const { notFoundSkus, ambiguousSkus } = auditHoneywellCustomerRowCoverage();
    expect(notFoundSkus).toEqual(["CW9178I-CFG", "C9300X-48HX-A", "C9300L-24P-4X-A"]);
    expect(ambiguousSkus).toEqual([]);
  });
});

// --- Broader demo SKU universe ----------------------------------------------

describe("honeywell catalog coverage audit - broader demo SKU universe", () => {
  it("derives 50 sorted unique SKUs straight from the committed demo pricing fixture", () => {
    const universe = getHoneywellBroaderDemoSkuUniverse();
    expect(universe).toHaveLength(50);
    expect(universe).toEqual(universe.slice().sort());
    expect(new Set(universe).size).toBe(50);
    const fixtureKeys = Object.keys(getHoneywellDemoPricingFixture().unitListPriceSarBySku).sort();
    expect(universe).toEqual(fixtureKeys);
  });

  it("pins the current broader demo SKU universe coverage counts", () => {
    const { counts } = auditHoneywellBroaderSkuCoverage();
    expect(counts).toEqual({
      total: 50,
      matched: 30,
      notFound: 20,
      ambiguous: 0,
      zeroOrNegativePriceMatches: 19,
      exactMatches: 30,
      normalizedMatches: 0,
    });
  });

  it("lists broader unresolved/ambiguous SKUs deterministically in sorted order", () => {
    const { notFoundSkus, ambiguousSkus } = auditHoneywellBroaderSkuCoverage();
    expect(notFoundSkus).toEqual(notFoundSkus.slice().sort());
    expect(ambiguousSkus).toEqual(ambiguousSkus.slice().sort());
    expect(notFoundSkus).toEqual([
      "AIR-AP-T-RAIL-F",
      "C9300L-24P-4X-A",
      "C9300L-DNA-A-24",
      "C9300L-DNA-A-24-3Y",
      "C9300L-NW-A-24",
      "C9300L-STACK-A",
      "C9300L-STACK-KIT2",
      "C9300X-48HX-A",
      "CON-L1NBD-P7PK94P1",
      "CON-L1NCD-C9300XY4",
      "CON-L1NCD-C93024PX",
      "CON-L1SWT-C93A48",
      "CON-L1SWT-C93LA24",
      "CON-ROB-CW9178IC",
      "CW9178-SINGLE",
      "CW9178I-CFG",
      "LIC-SPACES-ADV",
      "S9300LUK9-1718",
      "SC9300UK9-1715",
      "STACK-T3A-50CM",
    ]);
    expect(ambiguousSkus).toEqual([]);
  });

  it("entries and lists stay sorted ascending", () => {
    const { skus } = auditHoneywellBroaderSkuCoverage();
    expect(skus.map((s) => s.sku)).toEqual(skus.map((s) => s.sku).slice().sort());
  });
});

// --- No acceptance / substitution / pricing / replacement -------------------

describe("honeywell catalog coverage audit - accepts/substitutes/prices nothing", () => {
  it("exposes no acceptance, substitution, or price field on any entry", () => {
    const audit = auditHoneywellCatalogCoverage();
    const all = [...audit.customerRows.rows, ...audit.broaderSkuUniverse.skus];
    for (const e of all) {
      for (const forbidden of ["acceptedSku", "accepted", "decidedBy", "price", "listPrice", "unitListPriceSar"]) {
        expect(forbidden in e, `${e.sku}:${forbidden}`).toBe(false);
      }
    }
  });

  it("never substitutes a not_found SKU - no matched catalog SKU, source, or price flag", () => {
    const { rows } = auditHoneywellCustomerRowCoverage();
    const notFound = rows.filter((r) => r.outcome === "not_found");
    expect(notFound.length).toBeGreaterThan(0);
    for (const e of notFound) {
      expect(e.matchedCatalogSku).toBeNull();
      expect(e.matchSource).toBeNull();
      expect(e.hasPositiveListPrice).toBeNull();
      expect(e.candidateSkus).toEqual([]);
    }
  });

  it("on a normalized hit, reports the matched catalog SKU separately and keeps the requested SKU", () => {
    // Synthetic catalog: only a space-separated variant of the C9300X switch, so the
    // requested customer SKU resolves via normalization to a differently-formatted SKU.
    const index = buildCatalogLookupIndex({ a: catItem({ sku: "C9300X 48HX A", listPrice: 100 }) });
    const { rows } = auditHoneywellCustomerRowCoverage(index);
    const entry = rows.find((r) => r.sku === "C9300X-48HX-A");
    expect(entry).toBeDefined();
    expect(entry!.outcome).toBe("matched");
    expect(entry!.matchSource).toBe("normalized");
    expect(entry!.sku).toBe("C9300X-48HX-A"); // requested input preserved, never replaced
    expect(entry!.matchedCatalogSku).toBe("C9300X 48HX A"); // separate report field
    expect("acceptedSku" in entry!).toBe(false);
  });

  it("on a normalized collision, reports sorted candidates and chooses none", () => {
    const index = buildCatalogLookupIndex({
      a: catItem({ sku: "CW9178I_CFG" }),
      b: catItem({ sku: "CW9178I.CFG" }),
    });
    const { rows } = auditHoneywellCustomerRowCoverage(index);
    const entry = rows.find((r) => r.sku === "CW9178I-CFG");
    expect(entry).toBeDefined();
    expect(entry!.outcome).toBe("ambiguous");
    expect(entry!.candidateSkus).toEqual(["CW9178I.CFG", "CW9178I_CFG"]);
    expect(entry!.matchedCatalogSku).toBeNull();
    expect(entry!.matchSource).toBeNull();
  });
});

// --- Optics stay standalone customer rows -----------------------------------

describe("honeywell catalog coverage audit - optics standalone", () => {
  it("keeps both optics as standalone customer rows, never switch children", () => {
    const fixture = getHoneywellDemoPricingFixture();
    expect(fixture.standaloneOptics.slice().sort()).toEqual(STANDALONE_OPTICS.slice().sort());

    const { rows } = auditHoneywellCustomerRowCoverage();
    for (const optic of STANDALONE_OPTICS) {
      const entry = rows.find((r) => r.sku === optic);
      expect(entry, optic).toBeDefined();
    }

    // The audit models no parent/child relationship, so no optic can be a switch child.
    const audit = auditHoneywellCatalogCoverage();
    const all = [...audit.customerRows.rows, ...audit.broaderSkuUniverse.skus];
    for (const e of all) {
      for (const k of ["parentSku", "parentLineId", "parentLineNumber", "children", "childLines", "origin"]) {
        expect(k in e, `${e.sku}:${k}`).toBe(false);
      }
    }
  });

  it("includes both optics in the broader demo SKU universe", () => {
    const universe = getHoneywellBroaderDemoSkuUniverse();
    for (const optic of STANDALONE_OPTICS) expect(universe).toContain(optic);
  });
});

// --- Module isolation, surface, ASCII ---------------------------------------

describe("honeywell catalog coverage audit - module isolation & hygiene", () => {
  it("imports only catalog-lookup and the demo pricing fixture loader", () => {
    const specs = importSpecifiers(readFileSync(MODULE_PATH, "utf8")).sort();
    expect(specs).toEqual([
      "@/lib/projects/catalog-lookup",
      "@/lib/projects/honeywell-demo-pricing-fixture",
    ]);
  });

  it("imports no DB, route/API/UI, pricing engine, export, config-expansion builder, adapter, engine, coordinator, or AI", () => {
    const importLines = readFileSync(MODULE_PATH, "utf8")
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line) || /from\s+["']/.test(line))
      .join("\n");
    for (const forbidden of [
      "@/lib/db",
      "/db/",
      "@/app",
      "@/components",
      "@/engines",
      "@/coordinator",
      "@/lib/adapters",
      "priced-boq",
      "mantle",
      "config-expansion",
      "quick-bom-runner",
      "anthropic",
      "exceljs",
    ]) {
      expect(importLines, forbidden).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(mod).sort()).toEqual(
      [
        "HONEYWELL_CATALOG_COVERAGE_AUDIT_BOUNDARY",
        "auditHoneywellBroaderSkuCoverage",
        "auditHoneywellCatalogCoverage",
        "auditHoneywellCustomerRowCoverage",
        "getHoneywellBroaderDemoSkuUniverse",
      ].sort()
    );
  });

  it("keeps the module, test, and doc ASCII-only", () => {
    for (const path of [MODULE_PATH, TEST_PATH, DOC_PATH]) {
      const text = readFileSync(path, "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text), path).toBe(false);
    }
  });

  it("documents the pinned audit counts and authority boundary", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(doc).not.toContain("PLACEHOLDER");
    expect(doc).toContain("Catalog source: `local_stc_historical_mock`.");
    expect(doc).toContain("It does not create pricing authority.");
    expect(doc).toContain("It does not create configuration authority.");
    expect(doc).toContain("It does not approve SKU substitution or replacement.");
    expect(doc).toContain("- total: 7");
    expect(doc).toContain("- matched: 4");
    expect(doc).toContain("- not_found: 3");
    expect(doc).toContain("- total: 50");
    expect(doc).toContain("- matched: 30");
    expect(doc).toContain("- not_found: 20");
    expect(doc).toContain("- C9300X-48HX-A");
    expect(doc).toContain("SFP-10G-LR-S=");
    expect(doc).toContain("SFP-10/25G-LR-S=");
    expect(doc).toContain("remain standalone customer-requested BoQ");
  });
});
