import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import * as fixtureLoader from "@/lib/projects/honeywell-demo-pricing-fixture";
import {
  getHoneywellDemoPricingFixture,
  getHoneywellDemoUnitListPriceSarBySku,
  getHoneywellDemoMantleCategoryByAcceptedSku,
  getHoneywellDemoMantleRowOrderSkuSequence,
  type HoneywellDemoMantleCategory,
} from "@/lib/projects/honeywell-demo-pricing-fixture";
import { getHoneywellMvpConfigExpansionRulePack } from "@/lib/projects/honeywell-config-expansion-rule-pack";
import { buildPricedExpandedBoqDraft } from "@/lib/projects/priced-boq";
import { buildMantlePriceEstimateModel } from "@/lib/projects/mantle-price-estimate-model";
import { createProjectPricingConfig } from "@/lib/projects/pricing";
import type { PricedBoqArtifactPayload } from "@/lib/projects/priced-boq-artifact";
import type { ConfigurationExpansionDraftLine } from "@/lib/projects/config-expansion-types";

/**
 * Regression tests for the temporary Honeywell MVP demo price/category fixture. The
 * fixture supplies, for exactly the 50 Honeywell MVP target SKUs, a per-SKU SAR list
 * price (effective unit price = Extended ListPrice / Quantity from the configured CCW
 * estimate) and a Mantle total-bucket category. It is demo fixture authority only:
 * not production Cisco pricing, not runtime AI/catalog pricing, not replacement
 * authority, and no silent SKU substitution. These tests never read the external
 * benchmark workbook; they derive the SKU universe from the live rule pack and verify
 * the term derivation from the fixture's own stored evidence.
 */

const LOADER_PATH = join(process.cwd(), "src/lib/projects/honeywell-demo-pricing-fixture.ts");
const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-demo-pricing-fixture.test.ts");
const FIXTURE_JSON_PATH = join(process.cwd(), "data/quick-bom/honeywell-demo-pricing-fixture.json");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_DEMO_PRICING_FIXTURE.md");

const STANDALONE_OPTICS = ["SFP-10G-LR-S=", "SFP-10/25G-LR-S="];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** The 50 expected SKU keys, derived at runtime: rule-pack parents+children + optics. */
function expectedTargetSkusSorted(): string[] {
  const pack = getHoneywellMvpConfigExpansionRulePack();
  const skus = new Set<string>();
  for (const parent of pack.parentRules) {
    skus.add(parent.parentSku);
    for (const child of parent.childLines) skus.add(child.sku);
  }
  for (const optic of STANDALONE_OPTICS) skus.add(optic);
  return Array.from(skus).sort();
}

/** Extract `from "..."` specifiers (with type-only flag) from module source. */
function importSpecifiers(source: string): Array<{ typeOnly: boolean; from: string }> {
  const importRegex = /import\s+(type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;
  const found: Array<{ typeOnly: boolean; from: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) found.push({ typeOnly: Boolean(m[1]), from: m[2] });
  return found;
}

// Representative [sku, unitListPriceSar, category] assertions from the task spec.
const REPRESENTATIVE: Array<[string, number, HoneywellDemoMantleCategory]> = [
  ["CW9178I-CFG", 15192.64, "product"],
  ["C9300X-48HX-A", 90681.4, "product"],
  ["C9300L-24P-4X-A", 38301.9, "product"],
  ["LIC-CW-A", 2811.96, "subscription"],
  ["CON-L1NCD-C9300XY4", 27246.39, "service"],
  ["C9300-DNA-A-48-3Y", 17388.63, "subscription"],
  ["C9300L-DNA-A-24-3Y", 9270.86, "subscription"],
  ["FAN-T2", 0, "product"],
  ["C9300L-STACK-A", 0, "product"],
  ["SFP-10G-LR-S=", 9538.39, "product"],
  ["SFP-10/25G-LR-S=", 10492.22, "product"],
];

// --- Metadata / authority boundary ------------------------------------------

describe("honeywell demo pricing fixture - authority boundary", () => {
  it("declares the demo-only authority boundary metadata exactly", () => {
    const f = getHoneywellDemoPricingFixture();
    expect(f.fixtureId).toBe("honeywell-mvp-demo-pricing-fixture");
    expect(f.scope).toBe("honeywell_mvp_demo_only");
    expect(f.status).toBe("approved_demo_fixture");
    expect(f.demoFixtureAuthority).toBe(true);
    expect(f.productionPricingAuthority).toBe(false);
    expect(f.runtimeAiPricing).toBe(false);
    expect(f.runtimeCatalogLookup).toBe(false);
    expect(f.replacementAuthority).toBe(false);
    expect(f.silentSkuSubstitution).toBe(false);
    expect(f.currency).toBe("SAR");
  });

  it("names the CCW estimate workbook and sheet as the source evidence", () => {
    const f = getHoneywellDemoPricingFixture();
    expect(f.sourceEvidence.primarySourceType).toBe("ccw_estimate");
    expect(f.sourceEvidence.workbookPath).toContain("Estimate_NB167337237YA.xlsx");
    expect(f.sourceEvidence.sheetName).toBe("EstimateDetails_NB167337237YA");
    expect(f.sourceEvidence.derivationNote).toBe("extended_list_price_divided_by_quantity");
  });

  it("logs known limitations covering the demo/scope/term/production/no-substitution boundary", () => {
    const f = getHoneywellDemoPricingFixture();
    const text = f.knownLimitations.join("\n").toLowerCase();
    expect(f.knownLimitations.length).toBeGreaterThan(0);
    expect(text).toContain("temporary");
    expect(text).toContain("extended");
    expect(text).toContain("production");
    expect(text).toContain("replacement");
  });
});

// --- SKU universe -----------------------------------------------------------

describe("honeywell demo pricing fixture - SKU universe", () => {
  it("covers exactly the same 50 SKU keys in the price, evidence, and category maps", () => {
    const expected = expectedTargetSkusSorted();
    expect(expected).toHaveLength(50);

    const f = getHoneywellDemoPricingFixture();
    const priceKeys = Object.keys(f.unitListPriceSarBySku).sort();
    const evidenceKeys = Object.keys(f.priceSourceEvidenceBySku).sort();
    const categoryKeys = Object.keys(f.categoryByAcceptedSku).sort();

    expect(priceKeys).toEqual(expected);
    expect(categoryKeys).toEqual(expected);
    expect(evidenceKeys).toEqual(expected);
    expect(priceKeys).toEqual(categoryKeys);
    expect(f.skuCount).toBe(50);
  });

  it("equals the rule-pack parent/child SKUs plus the two standalone optics", () => {
    const f = getHoneywellDemoPricingFixture();
    const keys = new Set(Object.keys(f.unitListPriceSarBySku));
    for (const optic of STANDALONE_OPTICS) expect(keys.has(optic)).toBe(true);
    expect([...f.standaloneOptics].sort()).toEqual([...STANDALONE_OPTICS].sort());

    const pack = getHoneywellMvpConfigExpansionRulePack();
    for (const parent of pack.parentRules) {
      expect(keys.has(parent.parentSku), parent.parentSku).toBe(true);
      for (const child of parent.childLines) expect(keys.has(child.sku), child.sku).toBe(true);
    }
  });
});

// --- Price entries ----------------------------------------------------------

describe("honeywell demo pricing fixture - price entries", () => {
  it("prices every SKU in SAR with a finite nonnegative unit price", () => {
    const f = getHoneywellDemoPricingFixture();
    for (const [sku, entry] of Object.entries(f.unitListPriceSarBySku)) {
      expect(entry.currency, sku).toBe("SAR");
      expect(Number.isFinite(entry.unitListPriceSar), sku).toBe(true);
      expect(entry.unitListPriceSar, sku).toBeGreaterThanOrEqual(0);
    }
  });

  it("derives each unit price as round2(rawExtendedListPrice / sourceQuantity) from its own evidence", () => {
    const f = getHoneywellDemoPricingFixture();
    for (const sku of Object.keys(f.unitListPriceSarBySku)) {
      const ev = f.priceSourceEvidenceBySku[sku];
      expect(round2(ev.rawExtendedListPrice / ev.sourceQuantity), sku).toBe(
        f.unitListPriceSarBySku[sku].unitListPriceSar
      );
    }
  });

  it("matches the representative unit-price and category assertions", () => {
    const f = getHoneywellDemoPricingFixture();
    for (const [sku, price, category] of REPRESENTATIVE) {
      expect(f.unitListPriceSarBySku[sku]?.unitListPriceSar, sku).toBe(price);
      expect(f.categoryByAcceptedSku[sku], sku).toBe(category);
    }
    // LIC-CW-A specifically derives from worksheet row 9 / CCW line 2.1 (term pricing).
    const lic = f.priceSourceEvidenceBySku["LIC-CW-A"];
    expect(lic.worksheetRowNumber).toBe(9);
    expect(lic.ccwLineNumber).toBe("2.1");
    expect(lic.sourceQuantity).toBe(12);
    expect(lic.rawListPrice).toBe(78.11);
    expect(lic.rawExtendedListPrice).toBe(33743.52);
  });
});

// --- Source evidence --------------------------------------------------------

describe("honeywell demo pricing fixture - source evidence", () => {
  // The committed fixture stores one occurrence per SKU. When a SKU repeats in the
  // estimate (e.g. cross-section lines like TE-EMBEDDED-T or CAB-C15-CBN), the
  // generator requires the derived unit prices to be identical before collapsing to
  // this single entry and throws otherwise - so an inconsistent duplicate can never
  // be collapsed silently. That guard runs at generation time because the evidence
  // schema is single-occurrence by design and these tests never read the external
  // benchmark workbook.
  it("backs every price with complete CCW estimate evidence and never GPL pricing", () => {
    const f = getHoneywellDemoPricingFixture();
    for (const sku of Object.keys(f.unitListPriceSarBySku)) {
      const ev = f.priceSourceEvidenceBySku[sku];
      expect(ev, sku).toBeDefined();
      // CCW estimate is the present pricing evidence, so no entry may fall back to GPL.
      expect(ev.sourceType, sku).toBe("ccw_estimate");
      expect(ev.sourceType, sku).not.toBe("gpl");
      expect(ev.workbookPath, sku).toContain("Estimate_NB167337237YA.xlsx");
      expect(ev.sheetName, sku).toBe("EstimateDetails_NB167337237YA");
      expect(Number.isInteger(ev.worksheetRowNumber) && ev.worksheetRowNumber > 0, sku).toBe(true);
      expect(typeof ev.ccwLineNumber === "string" && ev.ccwLineNumber.length > 0, sku).toBe(true);
      expect(Number.isFinite(ev.sourceQuantity) && ev.sourceQuantity > 0, sku).toBe(true);
      expect(Number.isFinite(ev.rawListPrice), sku).toBe(true);
      expect(Number.isFinite(ev.rawExtendedListPrice), sku).toBe(true);
      expect(Number.isFinite(ev.rawSellingPrice), sku).toBe(true);
      expect(ev.derivationNote, sku).toBe("extended_list_price_divided_by_quantity");
    }
  });
});

// --- Categories -------------------------------------------------------------

describe("honeywell demo pricing fixture - categories", () => {
  it("assigns every category as exactly product, service, or subscription", () => {
    const f = getHoneywellDemoPricingFixture();
    for (const [sku, category] of Object.entries(f.categoryByAcceptedSku)) {
      expect(["product", "service", "subscription"], sku).toContain(category);
    }
  });
});

// --- Mantle export presentation row order -----------------------------------

describe("honeywell demo pricing fixture - Mantle export row order", () => {
  // The CCW benchmark (Estimate_NB167337237YA.xlsx) has 60 item rows; the sequence is
  // one entry per row, in order, including duplicate SKU occurrences.
  const EXPECTED_ITEM_ROWS = 60;
  // Known duplicate SKU occurrence counts in the CCW item-row order: every cross-
  // section expansion child that appears under both the C9300X and C9300L switch
  // sections shows up exactly twice in the 60-row sequence.
  const EXPECTED_DUPLICATE_OCCURRENCES: Array<[string, number]> = [
    ["TE-EMBEDDED-T", 2],
    ["TE-EMBEDDED-T-3Y", 2],
    ["D-DNAS-EXT-S-T", 2],
    ["D-DNAS-EXT-S-3Y", 2],
    ["TE-C9K-SW", 2],
    ["C9K-ACC-RBFT", 2],
    ["C9K-ACC-SCR-4", 2],
    ["CAB-GUIDE-1RU", 2],
    ["CAB-C15-CBN", 2],
    ["NETWORK-PNP-LIC", 2],
  ];

  function occurrences(sequence: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const sku of sequence) counts.set(sku, (counts.get(sku) ?? 0) + 1);
    return counts;
  }

  it("is a 60-entry SKU occurrence sequence bounded by the first and last CCW item rows", () => {
    const sequence = getHoneywellDemoMantleRowOrderSkuSequence();
    expect(sequence).toHaveLength(EXPECTED_ITEM_ROWS);
    expect(sequence[0]).toBe("CW9178I-CFG");
    expect(sequence[sequence.length - 1]).toBe("CON-L1NBD-P7PK94P1");
    for (const sku of sequence) expect(typeof sku).toBe("string");
  });

  it("repeats known cross-section SKUs by occurrence and covers exactly the 50 SKU universe", () => {
    const sequence = getHoneywellDemoMantleRowOrderSkuSequence();
    const counts = occurrences(sequence);
    for (const [sku, expectedCount] of EXPECTED_DUPLICATE_OCCURRENCES) {
      expect(counts.get(sku), sku).toBe(expectedCount);
    }
    // The 50 unique SKUs of the sequence are exactly the priced fixture's SKU universe.
    expect(Array.from(counts.keys()).sort()).toEqual(expectedTargetSkusSorted());
  });

  it("returns a fresh copy each call; mutation cannot leak", () => {
    const first = getHoneywellDemoMantleRowOrderSkuSequence();
    first[0] = "MUTATED";
    first.push("INJECTED");
    const second = getHoneywellDemoMantleRowOrderSkuSequence();
    expect(second[0]).toBe("CW9178I-CFG");
    expect(second).toHaveLength(EXPECTED_ITEM_ROWS);
    expect(second).not.toContain("INJECTED");
  });

  it("creates no replacement/substitution authority: it is presentation/order evidence only", () => {
    const f = getHoneywellDemoPricingFixture();
    // The sequence is a flat string[] - it carries no replacement/substitution fields,
    // and the fixture's authority flags stay false alongside it.
    expect(Array.isArray(f.mantleRowOrderSkuSequence)).toBe(true);
    expect(f.mantleRowOrderSkuSequence.every((sku) => typeof sku === "string")).toBe(true);
    expect(f.replacementAuthority).toBe(false);
    expect(f.silentSkuSubstitution).toBe(false);
    // Every SKU in the order sequence is already a known target SKU (no new/substitute SKU).
    const known = new Set(Object.keys(f.unitListPriceSarBySku));
    for (const sku of f.mantleRowOrderSkuSequence) expect(known.has(sku), sku).toBe(true);
  });
});

// --- Loader getters return fresh deep copies --------------------------------

describe("honeywell demo pricing fixture - fresh deep copies", () => {
  it("exposes exactly the four documented getters at runtime", () => {
    expect(Object.keys(fixtureLoader).sort()).toEqual([
      "getHoneywellDemoMantleCategoryByAcceptedSku",
      "getHoneywellDemoMantleRowOrderSkuSequence",
      "getHoneywellDemoPricingFixture",
      "getHoneywellDemoUnitListPriceSarBySku",
    ]);
  });

  it("returns a fresh price map each call; nested or top-level mutation cannot leak", () => {
    const first = getHoneywellDemoUnitListPriceSarBySku();
    expect(first["LIC-CW-A"].unitListPriceSar).toBe(2811.96);
    first["LIC-CW-A"].unitListPriceSar = 999999; // nested object mutation
    first["INJECTED-SKU"] = { currency: "SAR", unitListPriceSar: 1 }; // top-level add
    delete first["FAN-T2"]; // top-level delete

    const second = getHoneywellDemoUnitListPriceSarBySku();
    expect(second["LIC-CW-A"].unitListPriceSar).toBe(2811.96);
    expect("INJECTED-SKU" in second).toBe(false);
    expect("FAN-T2" in second).toBe(true);
  });

  it("returns a fresh category map each call; mutation cannot leak", () => {
    const first = getHoneywellDemoMantleCategoryByAcceptedSku();
    expect(first["LIC-CW-A"]).toBe("subscription");
    first["LIC-CW-A"] = "product";
    const second = getHoneywellDemoMantleCategoryByAcceptedSku();
    expect(second["LIC-CW-A"]).toBe("subscription");
  });

  it("returns a fresh full fixture each call; deep mutation cannot leak", () => {
    const first = getHoneywellDemoPricingFixture();
    first.skuCount = 0;
    first.unitListPriceSarBySku["LIC-CW-A"].unitListPriceSar = 1;
    first.standaloneOptics.push("MUTATED");

    const second = getHoneywellDemoPricingFixture();
    expect(second.skuCount).toBe(50);
    expect(second.unitListPriceSarBySku["LIC-CW-A"].unitListPriceSar).toBe(2811.96);
    expect(second.standaloneOptics).toEqual(STANDALONE_OPTICS);
  });
});

// --- Compatibility with the priced-BoQ and Mantle builders ------------------

describe("honeywell demo pricing fixture - builder compatibility", () => {
  it("prices an accepted expanded BoM and buckets Mantle categories through both builders", () => {
    const pricingConfig = createProjectPricingConfig({ mode: "markup", ratePercent: 20 });
    const unitListPriceSarBySku = getHoneywellDemoUnitListPriceSarBySku();
    const categoryByAcceptedSku = getHoneywellDemoMantleCategoryByAcceptedSku();

    const acceptedLines: ConfigurationExpansionDraftLine[] = [
      {
        lineId: "L1",
        origin: "customer",
        sku: "C9300X-48HX-A",
        description: "Catalyst 9300X switch",
        quantity: 2,
        sourceFileId: "file-1",
        sourceRowNumber: 1,
        originalLineNumber: "1",
        originalSku: "C9300X-48HX-A",
        acceptedSku: "C9300X-48HX-A",
      },
      {
        lineId: "L2",
        origin: "expansion",
        sku: "CON-L1NCD-C9300XY4",
        description: "CX support",
        quantity: 2,
        parentLineId: "L1",
        parentLineNumber: "1",
        sourceRuleId: "rule-1",
      },
      {
        lineId: "L3",
        origin: "expansion",
        sku: "C9300-DNA-A-48-3Y",
        description: "DNA Advantage 3Y",
        quantity: 2,
        parentLineId: "L1",
        parentLineNumber: "1",
        sourceRuleId: "rule-1",
      },
    ];

    // The fixture price map drops straight into buildPricedExpandedBoqDraft.
    const draft = buildPricedExpandedBoqDraft({ acceptedLines, pricingConfig, unitListPriceSarBySku });
    expect(draft.lines.map((l) => l.status)).toEqual(["priced", "priced", "priced"]);
    const listBySku = new Map(draft.lines.map((l) => [l.acceptedSku, l.amounts?.unitListPriceSar]));
    expect(listBySku.get("C9300X-48HX-A")).toBe(90681.4);
    expect(listBySku.get("CON-L1NCD-C9300XY4")).toBe(27246.39);
    expect(listBySku.get("C9300-DNA-A-48-3Y")).toBe(17388.63);

    // The fixture category map drops straight into buildMantlePriceEstimateModel.
    const payload: PricedBoqArtifactPayload = {
      sourceConfigurationExpansionArtifactId: "ce-1",
      sourceConfigurationExpansionArtifactVersion: 1,
      sourceNormalizedBoqArtifactId: "nb-1",
      sourceNormalizedBoqArtifactVersion: 1,
      sourceSkuResolutionArtifactId: "sk-1",
      sourceSkuResolutionArtifactVersion: 1,
      sourceFileIds: ["file-1"],
      pricingConfig,
      unitListPriceSarBySku,
      lineCount: draft.lines.length,
      lines: draft.lines,
      summary: draft.summary,
    };
    const model = buildMantlePriceEstimateModel({ payload, categoryByAcceptedSku });
    const categoryBySku = new Map(model.rows.map((r) => [r.partNumber, r.category]));
    expect(categoryBySku.get("C9300X-48HX-A")).toBe("product");
    expect(categoryBySku.get("CON-L1NCD-C9300XY4")).toBe("service");
    expect(categoryBySku.get("C9300-DNA-A-48-3Y")).toBe("subscription");
    // Every smoke SKU had an explicit category, so Mantle emits no missing-category warning.
    expect(model.warnings).toEqual([]);
  });
});

// --- Documentation ----------------------------------------------------------

describe("honeywell demo pricing fixture - documentation", () => {
  it("documents the temporary authority, term derivation, production source, optics, and no-substitution", () => {
    const doc = readFileSync(DOC_PATH, "utf8").toLowerCase();
    expect(doc).toContain("temporary");
    expect(doc).toContain("demo fixture authority");
    expect(doc).toContain("extended listprice / quantity");
    expect(doc).toContain("term");
    expect(doc).toContain("effective");
    expect(doc).toContain("production");
    expect(doc).toContain("cisco api");
    expect(doc).toContain("standalone");
    expect(doc).toContain("optic");
    expect(doc).toContain("silent");
    expect(doc).toContain("substitution");
    expect(doc).toContain("replacement");
  });
});

// --- Source hygiene & loader isolation --------------------------------------

describe("honeywell demo pricing fixture - source hygiene", () => {
  it("imports only the committed JSON fixture (no pricing/catalog/DB/API/UI/export/AI/package module)", () => {
    // Exact-match, NOT a substring scan: the fixture filename itself contains the
    // string "pricing", so scanning specifiers for "pric" would false-positive on the
    // loader's own JSON import. Asserting the full specifier list proves the loader
    // imports nothing but the committed fixture.
    const specs = importSpecifiers(readFileSync(LOADER_PATH, "utf8")).map((i) => i.from);
    expect(specs).toEqual(["../../../data/quick-bom/honeywell-demo-pricing-fixture.json"]);
  });

  it("keeps the data JSON, loader, doc, and test sources ASCII-only", () => {
    for (const path of [FIXTURE_JSON_PATH, LOADER_PATH, DOC_PATH, TEST_PATH]) {
      const text = readFileSync(path, "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text), path).toBe(false);
    }
  });
});
