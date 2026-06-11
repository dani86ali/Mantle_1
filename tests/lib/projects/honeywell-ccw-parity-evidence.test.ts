/**
 * Honeywell CCW parity evidence (Prompt 74; exact row-sequence proof tightened in
 * Prompt 76 after the Prompt 75 CCW-like switch child ordering). Read-only
 * regression/evidence proving the generated Honeywell Mantle demo workbook is at
 * parity with the primary configured/priced CCW reference estimate for the Honeywell
 * MVP demo scope.
 *
 * It generates a FRESH temporary Mantle workbook through the verified in-memory path
 * (runHoneywellQuickBomDemoMantleExportModel + writeMantlePriceEstimateWorkbook - the
 * same deterministic Prompt 73 path), never by reading a committed output workbook,
 * then re-opens it through the existing Mantle layout locator. It reads the live CCW
 * reference workbook (Estimate_NB167337237YA.xlsx, sheet
 * EstimateDetails_NB167337237YA) and asserts row/SKU/quantity/extended-amount parity,
 * including exact row-sequence parity across all 60 item rows.
 *
 * Pricing representation: CCW raw ListPrice for term lines (e.g. LIC-CW-A 78.11) can
 * be a monthly/term-rate basis while Extended ListPrice captures the full term. Parity
 * compares EXTENDED totals and EFFECTIVE unit pricing (Extended ListPrice / Quantity),
 * never raw ListPrice as the full per-unit price.
 *
 * CCW item-row rule: an item row has Line Number + Item Name/SKU + Quantity + ListPrice
 * (numeric, 0 allowed). Blank separator/group/header/footer rows are excluded.
 * Zero-priced included items carry a blank Extended ListPrice cell, read as 0, and stay
 * item rows - this is what yields 60 rows / 50 unique SKUs / 2185708.76 SAR on the CCW
 * side, matching the generated workbook.
 *
 * Boundaries: this is evidence only. It creates no runtime/pricing/configuration
 * authority and no app/API/UI/DB/export-package behavior; the CCW estimate is
 * regression evidence for Honeywell MVP parity only, not permanent Cisco authority.
 * Pure and in-memory aside from reading the committed template and the live CCW
 * reference; it does no AI, catalog lookup, SKU substitution, or replacement, and
 * imports no AI/catalog/API/UI/DB/coordinator/adapter/engine/replacement module.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildHoneywellQuickBomConfigurationExpansionDraft,
  runHoneywellQuickBomDemoMantleExportModel,
} from "@/lib/projects/quick-bom-runner";
import { writeMantlePriceEstimateWorkbook } from "@/lib/projects/mantle-workbook-writer";
import {
  locateMantlePriceEstimateLayout,
  MANTLE_PRICE_ESTIMATE_SHEET_NAME,
} from "@/lib/projects/mantle-layout-locator";
import type { CanonicalBoqLine, ProjectPricingConfig, SkuResolutionDecision } from "@/types/project";

const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-ccw-parity-evidence.test.ts");
const DOC_PATH = join(process.cwd(), "docs/quick-bom/HONEYWELL_CCW_PARITY_EVIDENCE.md");

// Primary configured/priced CCW reference (regression/evidence only, not authority).
const CCW_PATH = "C:\\Pre-Sales\\Benchmarck_Files\\Estimate_NB167337237YA.xlsx";
const CCW_SHEET = "EstimateDetails_NB167337237YA";
// CCW column layout (1-based) confirmed from the reference sheet header row.
const CCW_COL = { lineNumber: 1, itemName: 2, quantity: 9, listPrice: 11, extendedListPrice: 12 };

// --- Demo fixture (mirrors the Prompt 71 e2e and the Prompt 73 command) ------

const CW9178 = "CW9178I-CFG";
const SUB = "CISCO-NETWORK-SUB";
const C9300X = "C9300X-48HX-A";
const C9300L = "C9300L-24P-4X-A";
const OPTIC_A = "SFP-10G-LR-S=";
const OPTIC_B = "SFP-10/25G-LR-S=";
const PHONE = "CP-7841-K9=";
const LIC = "LIC-CW-A";

const FIXTURE_ROWS: ReadonlyArray<readonly [number, string, number]> = [
  [1, CW9178, 12],
  [2, SUB, 1],
  [3, C9300X, 7],
  [4, C9300L, 6],
  [5, OPTIC_A, 12],
  [6, OPTIC_B, 14],
  [7, PHONE, 59],
];

const PRICING_CONFIG: ProjectPricingConfig = {
  currency: "SAR",
  mode: "markup",
  ratePercent: 0,
  vatRatePercent: 15,
  roundingDecimals: 2,
};

const PROVENANCE = {
  sourceConfigurationExpansionArtifactId: "ce-parity-evidence",
  sourceConfigurationExpansionArtifactVersion: 1,
  sourceNormalizedBoqArtifactId: "nb-parity-evidence",
  sourceNormalizedBoqArtifactVersion: 1,
  sourceSkuResolutionArtifactId: "sku-parity-evidence",
  sourceSkuResolutionArtifactVersion: 1,
};

const META = { projectId: "HW-DEMO-PRJ", dealId: "HW-DEMO-DEAL", priceList: "STC SAR Price List" };

// Customer parents in customer order. After Prompt 75 the two switch parents emit
// their children in the exact CCW print order, so every section now matches CCW in
// sequence; SWITCH_PARENTS drives the focused exact-child-order assertion below.
const CUSTOMER_PARENTS = [CW9178, SUB, C9300X, C9300L, OPTIC_A, OPTIC_B, PHONE];
const SWITCH_PARENTS = [C9300X, C9300L];

// Expected parity baseline.
const EXPECTED_ITEM_ROWS = 60;
const EXPECTED_UNIQUE_SKUS = 50;
const EXPECTED_TOTAL_EXTENDED_SAR = 2185708.76;
const MONEY_TOLERANCE = 0.01;
const LIC_CCW_LIST_PRICE = 78.11;
const LIC_CCW_EXTENDED = 33743.52;
const LIC_QUANTITY = 12;
const LIC_EFFECTIVE_UNIT = 2811.96;

// --- Inline fixture builders ------------------------------------------------

function boqLine(row: number, sku: string, quantity: number): CanonicalBoqLine {
  return {
    sourceFormat: "format_2_number_part_qty",
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    sku,
    description: sku,
    quantity,
    originalCells: { "#": String(row), "Part Number": sku },
  };
}

function acceptDecision(row: number, sku: string): SkuResolutionDecision {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: row,
    originalLineNumber: String(row),
    originalSku: sku,
    status: "accepted",
    suggestions: [],
    acceptedSku: sku,
  };
}

function buildInput(): { lines: CanonicalBoqLine[]; skuDecisions: SkuResolutionDecision[] } {
  return {
    lines: FIXTURE_ROWS.map(([r, s, q]) => boqLine(r, s, q)),
    skuDecisions: FIXTURE_ROWS.map(([r, s]) => acceptDecision(r, s)),
  };
}

function buildAcceptAllReviewDecisions(input: {
  lines: CanonicalBoqLine[];
  skuDecisions: SkuResolutionDecision[];
}): Array<{ lineId: string; action: "accept" }> {
  const { draft } = buildHoneywellQuickBomConfigurationExpansionDraft(input);
  return draft.lines
    .filter((l) => l.origin === "expansion")
    .map((l) => ({ lineId: l.lineId, action: "accept" as const }));
}

// --- Cell readers + aggregation ---------------------------------------------

interface ParsedRow {
  sku: string;
  quantity: number;
  extended: number;
  listPrice: number;
}

interface Aggregate {
  qtyBySku: Record<string, number>;
  extBySku: Record<string, number>;
  skus: string[];
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.type === ExcelJS.ValueType.Merge) return "";
  const value = cell.value;
  if (value === null || value === undefined) return "";
  return String(cell.text).trim();
}

/** Numeric value of a cell (number, formula cached result, or numeric text); null if blank/non-numeric. */
function numericCell(cell: ExcelJS.Cell): number | null {
  const value = cell.value;
  if (typeof value === "number") return value;
  if (value !== null && typeof value === "object" && "result" in value) {
    const result = (value as { result?: unknown }).result;
    if (typeof result === "number") return result;
  }
  const text = cellText(cell);
  if (text === "") return null;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Plain string value of a cell; "" when not a string. */
function stringValue(cell: ExcelJS.Cell): string {
  const value = cell.value;
  return typeof value === "string" ? value : "";
}

/**
 * Extended amount of a generated Mantle row: the writer stores a formula with a
 * BOMATIC-cached result, so read cell.result. A zero-priced row's cached result is 0
 * (ExcelJS may drop the 0 from cell.value, but cell.result still resolves it). The
 * total-sum assertion guards against any dropped non-zero result.
 */
function generatedExtended(cell: ExcelJS.Cell): number {
  const result = cell.result;
  if (typeof result === "number") return result;
  const value = cell.value;
  if (typeof value === "number") return value;
  return 0;
}

function aggregate(rows: ParsedRow[]): Aggregate {
  const qtyBySku: Record<string, number> = {};
  const extBySku: Record<string, number> = {};
  for (const row of rows) {
    qtyBySku[row.sku] = (qtyBySku[row.sku] ?? 0) + row.quantity;
    extBySku[row.sku] = round2((extBySku[row.sku] ?? 0) + row.extended);
  }
  return { qtyBySku, extBySku, skus: Object.keys(qtyBySku) };
}

/**
 * Parse the CCW reference item rows. An item row needs a Line Number, an Item
 * Name/SKU, a positive Quantity, and a numeric ListPrice (0 allowed). Extended
 * ListPrice is read; a blank cell (zero-priced included item) is read as 0.
 */
function parseCcwItemRows(worksheet: ExcelJS.Worksheet): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (let r = 1; r <= worksheet.rowCount; r += 1) {
    const wsRow = worksheet.getRow(r);
    const lineNumber = cellText(wsRow.getCell(CCW_COL.lineNumber));
    const sku = cellText(wsRow.getCell(CCW_COL.itemName));
    const quantity = numericCell(wsRow.getCell(CCW_COL.quantity));
    const listPrice = numericCell(wsRow.getCell(CCW_COL.listPrice));
    if (lineNumber === "" || sku === "" || quantity === null || quantity <= 0 || listPrice === null) {
      continue;
    }
    const extended = numericCell(wsRow.getCell(CCW_COL.extendedListPrice)) ?? 0;
    rows.push({ sku, quantity, extended, listPrice });
  }
  return rows;
}

/** Parse the written Mantle data rows (non-blank Part Number) above the footer, in order. */
function parseGeneratedRows(
  worksheet: ExcelJS.Worksheet,
  layout: Awaited<ReturnType<typeof locateMantlePriceEstimateLayout>>
): ParsedRow[] {
  const col = (header: string): number => layout.columns.find((c) => c.header === header)!.columnNumber;
  const partCol = col("Part Number");
  const qtyCol = col("Qty");
  const listCol = col("Unit List Price");
  const extCol = col("Extended Net Price");
  const footerStart = layout.footerRows.reduce(
    (min, f) => Math.min(min, f.rowNumber),
    Number.POSITIVE_INFINITY
  );
  const rows: ParsedRow[] = [];
  for (let r = layout.dataStartRowNumber; r < footerStart; r += 1) {
    const wsRow = worksheet.getRow(r);
    const sku = stringValue(wsRow.getCell(partCol));
    if (sku === "") continue;
    rows.push({
      sku,
      quantity: numericCell(wsRow.getCell(qtyCol)) ?? 0,
      extended: generatedExtended(wsRow.getCell(extCol)),
      listPrice: numericCell(wsRow.getCell(listCol)) ?? 0,
    });
  }
  return rows;
}

/** Index of each parent SKU within an ordered SKU list. */
function parentIndexes(skus: string[], parents: readonly string[]): number[] {
  return parents.map((p) => skus.indexOf(p));
}

/** [start, end) range of the section led by parents[sectionIndex]. */
function sectionRange(parentIdx: number[], sectionIndex: number, total: number): { start: number; end: number } {
  const start = parentIdx[sectionIndex];
  const end = sectionIndex + 1 < parentIdx.length ? parentIdx[sectionIndex + 1] : total;
  return { start, end };
}

// --- Shared run + parsed sides ----------------------------------------------

let tmpDir: string;
let run: ReturnType<typeof runHoneywellQuickBomDemoMantleExportModel>;
let ccwRows: ParsedRow[];
let genRows: ParsedRow[];
let ccwAgg: Aggregate;
let genAgg: Aggregate;
let ccwSkus: string[];
let genSkus: string[];
let ccwParentIdx: number[];
let genParentIdx: number[];

beforeAll(async () => {
  const input = buildInput();
  const reviewDecisions = buildAcceptAllReviewDecisions(input);
  run = runHoneywellQuickBomDemoMantleExportModel({
    ...input,
    reviewDecisions,
    pricingConfig: PRICING_CONFIG,
    ...PROVENANCE,
  });

  // Generate a fresh temporary Mantle workbook through the verified writer path.
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-hw-ccw-parity-"));
  const outputPath = join(tmpDir, "honeywell-quick-bom-demo.xlsx");
  await writeMantlePriceEstimateWorkbook({
    model: run.mantleModel,
    outputPath,
    projectId: META.projectId,
    dealId: META.dealId,
    priceList: META.priceList,
  });

  const genWb = new ExcelJS.Workbook();
  await genWb.xlsx.readFile(outputPath);
  const genSheet = genWb.getWorksheet(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  if (!genSheet) throw new Error("generated workbook is missing the Price Estimate sheet");
  const layout = await locateMantlePriceEstimateLayout(outputPath);
  genRows = parseGeneratedRows(genSheet, layout);

  // Read the live CCW reference workbook.
  const ccwWb = new ExcelJS.Workbook();
  await ccwWb.xlsx.readFile(CCW_PATH);
  const ccwSheet = ccwWb.getWorksheet(CCW_SHEET);
  if (!ccwSheet) throw new Error(`CCW reference is missing sheet ${CCW_SHEET}`);
  ccwRows = parseCcwItemRows(ccwSheet);

  ccwAgg = aggregate(ccwRows);
  genAgg = aggregate(genRows);
  ccwSkus = ccwRows.map((r) => r.sku);
  genSkus = genRows.map((r) => r.sku);
  ccwParentIdx = parentIndexes(ccwSkus, CUSTOMER_PARENTS);
  genParentIdx = parentIndexes(genSkus, CUSTOMER_PARENTS);
});

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// --- Row + SKU parity -------------------------------------------------------

describe("Honeywell CCW parity - rows and SKUs", () => {
  it("parses 60 item rows on both sides", () => {
    expect(ccwRows).toHaveLength(EXPECTED_ITEM_ROWS);
    expect(genRows).toHaveLength(EXPECTED_ITEM_ROWS);
  });

  it("has the same 50 unique SKUs with no missing or extra SKUs", () => {
    expect(ccwAgg.skus).toHaveLength(EXPECTED_UNIQUE_SKUS);
    expect(genAgg.skus).toHaveLength(EXPECTED_UNIQUE_SKUS);
    const missing = ccwAgg.skus.filter((s) => genAgg.skus.indexOf(s) < 0);
    const extra = genAgg.skus.filter((s) => ccwAgg.skus.indexOf(s) < 0);
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });
});

// --- Quantity + extended-amount parity (aggregated per SKU) ------------------

describe("Honeywell CCW parity - quantities and extended amounts", () => {
  it("matches aggregate quantity per SKU", () => {
    for (const sku of ccwAgg.skus) {
      expect(genAgg.qtyBySku[sku], `quantity for ${sku}`).toBe(ccwAgg.qtyBySku[sku]);
    }
  });

  it("matches aggregate extended amount per SKU within 0.01 SAR", () => {
    for (const sku of ccwAgg.skus) {
      const genExt = genAgg.extBySku[sku];
      expect(genExt, `extended present for ${sku}`).not.toBeUndefined();
      expect(Math.abs(genExt - ccwAgg.extBySku[sku]), `extended for ${sku}`).toBeLessThan(MONEY_TOLERANCE);
    }
  });

  it("totals the extended amount to 2185708.76 SAR on both sides", () => {
    const ccwTotal = round2(ccwRows.reduce((sum, r) => sum + r.extended, 0));
    const genTotal = round2(genRows.reduce((sum, r) => sum + r.extended, 0));
    expect(Math.abs(ccwTotal - EXPECTED_TOTAL_EXTENDED_SAR)).toBeLessThan(MONEY_TOLERANCE);
    expect(Math.abs(genTotal - EXPECTED_TOTAL_EXTENDED_SAR)).toBeLessThan(MONEY_TOLERANCE);
    expect(Math.abs(ccwTotal - genTotal)).toBeLessThan(MONEY_TOLERANCE);
    // The generated workbook total ties back to the in-memory model total.
    expect(run.mantleModel.totals.totalPriceSar).toBe(EXPECTED_TOTAL_EXTENDED_SAR);
  });
});

// --- Term-basis vs effective unit (LIC-CW-A) --------------------------------

describe("Honeywell CCW parity - LIC-CW-A term vs effective unit", () => {
  it("treats CCW raw ListPrice as a term basis, not the full per-unit demo price", () => {
    const ccwLic = ccwRows.find((r) => r.sku === LIC);
    expect(ccwLic, "CCW LIC-CW-A row").not.toBeUndefined();
    expect(ccwLic!.listPrice).toBe(LIC_CCW_LIST_PRICE);
    expect(ccwLic!.extended).toBe(LIC_CCW_EXTENDED);
    expect(ccwLic!.quantity).toBe(LIC_QUANTITY);

    const genLicModel = run.mantleModel.rows.find((r) => r.partNumber === LIC);
    expect(genLicModel, "generated LIC-CW-A model row").not.toBeUndefined();
    expect(genLicModel!.unitListPriceSar).toBe(LIC_EFFECTIVE_UNIT);
    expect(genLicModel!.quantity).toBe(LIC_QUANTITY);
    expect(genLicModel!.extendedNetPriceSar).toBe(LIC_CCW_EXTENDED);

    const genLicRow = genRows.find((r) => r.sku === LIC);
    expect(genLicRow, "generated LIC-CW-A workbook row").not.toBeUndefined();
    expect(genLicRow!.listPrice).toBe(LIC_EFFECTIVE_UNIT);
    expect(genLicRow!.extended).toBe(LIC_CCW_EXTENDED);

    // Effective unit derives from Extended ListPrice / Quantity, and differs from raw list.
    expect(Math.abs(ccwLic!.extended / ccwLic!.quantity - LIC_EFFECTIVE_UNIT)).toBeLessThan(MONEY_TOLERANCE);
    expect(genLicModel!.unitListPriceSar).not.toBe(ccwLic!.listPrice);
  });
});

// --- Standalone optics ------------------------------------------------------

describe("Honeywell CCW parity - standalone optics", () => {
  it("keeps both optics as customer-origin, never expansion-origin, in the generated model", () => {
    const opticLines = run.review.acceptedLines.filter((l) => l.sku === OPTIC_A || l.sku === OPTIC_B);
    expect(opticLines).toHaveLength(2);
    expect(opticLines.every((l) => l.origin === "customer")).toBe(true);
    expect(
      run.review.acceptedLines.some((l) => l.origin === "expansion" && (l.sku === OPTIC_A || l.sku === OPTIC_B))
    ).toBe(false);
    expect(genRows.some((r) => r.sku === OPTIC_A)).toBe(true);
    expect(genRows.some((r) => r.sku === OPTIC_B)).toBe(true);
  });

  it("confirms each optic is a standalone CCW line, not a switch expansion child", () => {
    for (const optic of [OPTIC_A, OPTIC_B]) {
      const sectionIndex = CUSTOMER_PARENTS.indexOf(optic);
      const { start, end } = sectionRange(ccwParentIdx, sectionIndex, ccwSkus.length);
      expect(ccwSkus[start]).toBe(optic);
      // A standalone optic section is exactly one row (the optic itself).
      expect(end - start).toBe(1);
    }
  });
});

// --- Row sequence: exact CCW parity (after Prompt 75 switch child ordering) ---

describe("Honeywell CCW parity - row sequence (exact)", () => {
  it("matches the full CCW SKU sequence across all 60 item rows", () => {
    expect(genSkus).toHaveLength(EXPECTED_ITEM_ROWS);
    expect(ccwSkus).toHaveLength(EXPECTED_ITEM_ROWS);
    // Strongest, least-foolable check: the entire ordered row sequence is identical.
    expect(genSkus).toEqual(ccwSkus);
  });

  it("aligns the customer parents at identical positions on both sides", () => {
    expect(ccwParentIdx.every((i) => i >= 0)).toBe(true);
    expect(genParentIdx.every((i) => i >= 0)).toBe(true);
    expect(genParentIdx).toEqual(ccwParentIdx);
  });

  it("matches the exact ordered sequence of every customer section, including both switches", () => {
    for (let s = 0; s < CUSTOMER_PARENTS.length; s += 1) {
      const { start, end } = sectionRange(ccwParentIdx, s, ccwSkus.length);
      expect(genSkus.slice(start, end), `order in section ${CUSTOMER_PARENTS[s]}`).toEqual(
        ccwSkus.slice(start, end)
      );
    }
  });

  it("matches the CCW child order exactly under each switch, not merely set-equal", () => {
    for (const parent of SWITCH_PARENTS) {
      const { start, end } = sectionRange(ccwParentIdx, CUSTOMER_PARENTS.indexOf(parent), ccwSkus.length);
      const ccwSection = ccwSkus.slice(start, end);
      const genSection = genSkus.slice(start, end);
      // Each switch leads its own section, with children following it, on both sides.
      expect(ccwSection[0], `${parent} parent position`).toBe(parent);
      expect(genSection[0], `${parent} parent position`).toBe(parent);
      expect(genSection.length, `${parent} child count`).toBeGreaterThan(1);
      // Set-equal diagnostic: separates a wrong order from wrong membership on failure.
      expect(genSection.slice().sort(), `${parent} child set`).toEqual(ccwSection.slice().sort());
      // The actual proof: identical ORDERED child sequence, not just the same set.
      expect(genSection, `${parent} child order`).toEqual(ccwSection);
    }
  });

  it("documents no row-sequence parity exceptions", () => {
    const mismatches: number[] = [];
    for (let i = 0; i < ccwSkus.length; i += 1) {
      if (ccwSkus[i] !== genSkus[i]) mismatches.push(i);
    }
    expect(mismatches).toEqual([]);
  });
});

// --- Source hygiene ---------------------------------------------------------

// Tokens neither the doc nor the test may reference in an import specifier: AI/LLM,
// catalog, API/UI, DB/artifact, coordinator, adapter, engine, replacement. Scanned
// over extracted `from "..."` specifiers ONLY, so this list cannot self-match.
const FORBIDDEN_IMPORT_TOKENS = [
  "anthropic", "open" + "ai", "gemini", "claude", "generative-ai", "llm", "/ai", "agent",
  "catalog", "/api", "route", ".tsx", "/ui", "component",
  "drizzle", "schema", "/db", "db/", "artifact", "coordinator", "adapter", "engine",
  "replacement",
];

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

describe("Honeywell CCW parity - source hygiene", () => {
  it("keeps the parity evidence doc ASCII-only", async () => {
    const source = await readFile(DOC_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("keeps the test source ASCII-only", async () => {
    const source = await readFile(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("imports no AI, catalog, API/UI, DB/artifact, coordinator, adapter, engine, or replacement module", async () => {
    const specs = importSpecifiers(await readFile(TEST_PATH, "utf8"));
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      const lower = s.toLowerCase();
      for (const token of FORBIDDEN_IMPORT_TOKENS) {
        expect(lower.includes(token), `import "${s}" matches forbidden "${token}"`).toBe(false);
      }
    }
    // Positive: this parity test is allowed to (and does) import these.
    expect(specs).toContain("exceljs");
    expect(specs).toContain("@/lib/projects/quick-bom-runner");
    expect(specs).toContain("@/lib/projects/mantle-workbook-writer");
    expect(specs).toContain("@/lib/projects/mantle-layout-locator");
  });
});
