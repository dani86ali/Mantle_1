/**
 * End-to-end validation for the Honeywell Quick BoM demo (Prompt 71). It builds a
 * Honeywell-shaped normalized BoQ and human-accepted SKU decisions inline, builds
 * the configuration-expansion draft, generates EXPLICIT accept decisions for every
 * expansion line (review stays explicit - nothing is auto-approved), runs
 * runHoneywellQuickBomDemoMantleExportModel with a caller-supplied SAR markup-0
 * pricing config and caller-supplied provenance, writes the resulting Mantle model
 * to a temporary workbook with writeMantlePriceEstimateWorkbook, and re-opens that
 * workbook through the existing Mantle layout locator to validate rows and totals.
 *
 * The runner numbers are the spec: line counts (60/50), per-SKU list prices,
 * categories, and model totals are asserted against fixed expected values, while the
 * written workbook is validated against the model it was written from. Pure and
 * in-memory: it uses no AI, catalog lookup, fuzzy matching, SKU substitution, or
 * replacement logic, and imports no AI/catalog/API/UI/DB/coordinator module.
 * Configuration authority (approved rule pack + explicit review) stays separate from
 * pricing authority (committed demo fixture). The source/customer workbook is never
 * mutated - only the committed Mantle template is read and a fresh temp file written.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm, stat, readFile } from "fs/promises";
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
  MANTLE_PRICE_ESTIMATE_HEADERS,
} from "@/lib/projects/mantle-layout-locator";
import {
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID,
  HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION,
} from "@/lib/projects/honeywell-config-expansion-rule-pack";
import type { CanonicalBoqLine, ProjectPricingConfig, SkuResolutionDecision } from "@/types/project";

const TEST_PATH = join(process.cwd(), "tests/lib/projects/honeywell-quick-bom-demo-e2e.test.ts");

// --- Customer-provided Honeywell SKUs (demo fixture) ------------------------

const CW9178 = "CW9178I-CFG";
const SUB = "CISCO-NETWORK-SUB";
const C9300X = "C9300X-48HX-A";
const C9300L = "C9300L-24P-4X-A";
const OPTIC_A = "SFP-10G-LR-S=";
const OPTIC_B = "SFP-10/25G-LR-S=";
const PHONE = "CP-7841-K9=";
const PHONE_CHILD = "CON-L1NBD-P7PK94P1";

// Customer BoQ in customer order: wireless AP, subscription parent, two switches,
// two standalone optics, then the phone. Quantities are the demo-specified values.
const FIXTURE_ROWS: ReadonlyArray<readonly [number, string, number]> = [
  [1, CW9178, 12],
  [2, SUB, 1],
  [3, C9300X, 7],
  [4, C9300L, 6],
  [5, OPTIC_A, 12],
  [6, OPTIC_B, 14],
  [7, PHONE, 59],
];

// Caller-supplied pricing config: SAR, markup, rate 0, VAT 15, rounding 2. With
// markup 0 the unit net equals the unit list, so extended net is list * quantity.
const PRICING_CONFIG: ProjectPricingConfig = {
  currency: "SAR",
  mode: "markup",
  ratePercent: 0,
  vatRatePercent: 15,
  roundingDecimals: 2,
};

// Caller-supplied priced-BoQ provenance ids/versions (the runner reads no store).
const PROVENANCE = {
  sourceConfigurationExpansionArtifactId: "ce-demo-e2e",
  sourceConfigurationExpansionArtifactVersion: 1,
  sourceNormalizedBoqArtifactId: "nb-demo-e2e",
  sourceNormalizedBoqArtifactVersion: 1,
  sourceSkuResolutionArtifactId: "sku-demo-e2e",
  sourceSkuResolutionArtifactVersion: 1,
};

// Caller-supplied workbook metadata, written into the Mantle summary cells.
const META = { projectId: "HW-DEMO-PRJ", dealId: "HW-DEMO-DEAL", priceList: "STC SAR Price List" };

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

// Human-accepted SKU decision: each customer SKU is accepted as itself. No AI, fuzzy
// matching, catalog lookup, or replacement is involved (acceptedSku === originalSku).
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

// Explicit engineer accept decision for every expansion draft line. Built from the
// draft itself - the runner never generates these and never auto-approves.
function buildAcceptAllReviewDecisions(input: {
  lines: CanonicalBoqLine[];
  skuDecisions: SkuResolutionDecision[];
}): Array<{ lineId: string; action: "accept" }> {
  const { draft } = buildHoneywellQuickBomConfigurationExpansionDraft(input);
  return draft.lines
    .filter((l) => l.origin === "expansion")
    .map((l) => ({ lineId: l.lineId, action: "accept" as const }));
}

// --- Shared run + written workbook ------------------------------------------

let tmpDir: string;
let outputPath: string;
let run: ReturnType<typeof runHoneywellQuickBomDemoMantleExportModel>;
let reviewDecisions: Array<{ lineId: string; action: "accept" }>;
let ws: ExcelJS.Worksheet;
let layout: Awaited<ReturnType<typeof locateMantlePriceEstimateLayout>>;
let wbPartNumbers: ExcelJS.CellValue[];

function colNum(header: string): number {
  return layout.columns.find((c) => c.header === header)!.columnNumber;
}

beforeAll(async () => {
  const input = buildInput();
  reviewDecisions = buildAcceptAllReviewDecisions(input);
  run = runHoneywellQuickBomDemoMantleExportModel({
    ...input,
    reviewDecisions,
    pricingConfig: PRICING_CONFIG,
    ...PROVENANCE,
  });

  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-hw-quick-bom-e2e-"));
  outputPath = join(tmpDir, "honeywell-quick-bom-demo.xlsx");
  await writeMantlePriceEstimateWorkbook({
    model: run.mantleModel,
    outputPath,
    projectId: META.projectId,
    dealId: META.dealId,
    priceList: META.priceList,
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outputPath);
  const sheet = wb.getWorksheet(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  if (!sheet) throw new Error("written workbook is missing the Price Estimate sheet");
  ws = sheet;
  layout = await locateMantlePriceEstimateLayout(outputPath);
  wbPartNumbers = run.mantleModel.rows.map(
    (_, i) => ws.getRow(layout.dataStartRowNumber + i).getCell(colNum("Part Number")).value
  );
});

afterAll(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// --- Authority: active rule pack + demo-only pricing fixture -----------------

describe("Honeywell Quick BoM demo e2e - authority", () => {
  it("uses the active approved Honeywell Batch 1+2+3 rule pack", () => {
    expect(run.rulePack.rulePackId).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_ID);
    expect(run.rulePack.version).toBe(HONEYWELL_MVP_CONFIG_EXPANSION_RULE_PACK_VERSION);
    expect(run.rulePack.status).toBe("approved");
  });

  it("reports the demo-only pricing-fixture authority boundaries", () => {
    expect(run.pricingFixture.demoFixtureAuthority).toBe(true);
    expect(run.pricingFixture.productionPricingAuthority).toBe(false);
    expect(run.pricingFixture.runtimeAiPricing).toBe(false);
    expect(run.pricingFixture.runtimeCatalogLookup).toBe(false);
    expect(run.pricingFixture.replacementAuthority).toBe(false);
    expect(run.pricingFixture.silentSkuSubstitution).toBe(false);
  });
});

// --- Explicit expansion review (nothing auto-approved) ----------------------

describe("Honeywell Quick BoM demo e2e - explicit expansion review", () => {
  it("requires an explicit decision for every expansion line (no auto-approve)", () => {
    expect(() =>
      runHoneywellQuickBomDemoMantleExportModel({
        ...buildInput(),
        reviewDecisions: [],
        pricingConfig: PRICING_CONFIG,
        ...PROVENANCE,
      })
    ).toThrow(/decision for every expansion line/);
  });

  it("accepts every expansion line via explicit decisions generated from the draft", () => {
    expect(reviewDecisions.length).toBe(run.draft.lines.filter((l) => l.origin === "expansion").length);
    expect(reviewDecisions).toHaveLength(53);
    expect(reviewDecisions.every((d) => d.action === "accept")).toBe(true);

    const acceptedExpansion = run.review.acceptedLines.filter((l) => l.origin === "expansion");
    expect(acceptedExpansion).toHaveLength(53);
    expect(acceptedExpansion.every((l) => l.approved === true && l.approvalRequired === false)).toBe(true);

    expect(run.review.summary.customerLineCount).toBe(7);
    expect(run.review.summary.acceptedExpansionLineCount).toBe(53);
    expect(run.review.summary.rejectedExpansionLineCount).toBe(0);
  });
});

// --- Expansion / review / pricing / Mantle counts ---------------------------

describe("Honeywell Quick BoM demo e2e - counts", () => {
  it("carries 60 lines through the draft, review, pricing, and Mantle model", () => {
    expect(run.draft.lines).toHaveLength(60);
    expect(run.review.acceptedLines).toHaveLength(60);
    expect(run.pricedBoq.lines).toHaveLength(60);
    expect(run.mantleModel.rows).toHaveLength(60);
  });

  it("prices all 60 lines across 50 unique SKUs with no gaps", () => {
    const priced = run.pricedBoq.lines.filter((l) => l.status === "priced");
    expect(priced).toHaveLength(60);
    const unique = new Set(priced.map((l) => l.acceptedSku));
    expect(unique.size).toBe(50);

    const t = run.mantleModel.totals;
    expect(t.pricedLineCount).toBe(60);
    expect(t.unpricedLineCount).toBe(0);
    expect(t.missingDecisionCount).toBe(0);
    expect(t.notAcceptedCount).toBe(0);
    expect(t.missingPriceCount).toBe(0);
  });
});

// --- Standalone optics stay customer-origin priced lines --------------------

describe("Honeywell Quick BoM demo e2e - standalone optics", () => {
  it("keeps both optics as customer lines, never expansion lines", () => {
    const opticAccepted = run.review.acceptedLines.filter((l) => l.sku === OPTIC_A || l.sku === OPTIC_B);
    expect(opticAccepted).toHaveLength(2);
    expect(opticAccepted.every((l) => l.origin === "customer")).toBe(true);
    expect(
      run.review.acceptedLines.some((l) => l.origin === "expansion" && (l.sku === OPTIC_A || l.sku === OPTIC_B))
    ).toBe(false);
  });

  it("preserves the optic quantities and unit list prices", () => {
    expect(run.review.acceptedLines.find((l) => l.sku === OPTIC_A)?.quantity).toBe(12);
    expect(run.review.acceptedLines.find((l) => l.sku === OPTIC_B)?.quantity).toBe(14);
    expect(run.pricedBoq.lines.find((l) => l.acceptedSku === OPTIC_A)?.amounts?.unitListPriceSar).toBe(9538.39);
    expect(run.pricedBoq.lines.find((l) => l.acceptedSku === OPTIC_B)?.amounts?.unitListPriceSar).toBe(10492.22);
  });
});

// --- Mantle model: quantities, prices, categories, totals -------------------

describe("Honeywell Quick BoM demo e2e - Mantle model", () => {
  const rowBySku = (sku: string) => run.mantleModel.rows.find((r) => r.partNumber === sku);
  const acceptedBySku = (sku: string) => run.review.acceptedLines.find((l) => l.sku === sku);

  it("applies the representative Batch 3 expansion quantities", () => {
    expect(acceptedBySku("FAN-T2")?.quantity).toBe(18);
    expect(acceptedBySku("C9300L-STACK-A")?.quantity).toBe(12);
    expect(acceptedBySku("STACK-T3A-50CM")?.quantity).toBe(6);
  });

  it("preserves representative unit list prices", () => {
    expect(rowBySku(CW9178)?.unitListPriceSar).toBe(15192.64);
    expect(rowBySku(C9300X)?.unitListPriceSar).toBe(90681.40);
    expect(rowBySku(C9300L)?.unitListPriceSar).toBe(38301.90);
    expect(rowBySku("LIC-CW-A")?.unitListPriceSar).toBe(2811.96);
    expect(rowBySku("CON-L1NCD-C9300XY4")?.unitListPriceSar).toBe(27246.39);
    expect(rowBySku(OPTIC_A)?.unitListPriceSar).toBe(9538.39);
    expect(rowBySku(OPTIC_B)?.unitListPriceSar).toBe(10492.22);
  });

  it("resolves categories from the committed map with no defaults or warnings", () => {
    expect(run.mantleModel.warnings).toEqual([]);
    expect(run.mantleModel.rows.some((r) => r.categoryWasDefaulted)).toBe(false);
    expect(rowBySku(CW9178)?.category).toBe("product");
    expect(rowBySku("CON-L1NCD-C9300XY4")?.category).toBe("service");
    expect(rowBySku("LIC-CW-A")?.category).toBe("subscription");
    expect(rowBySku(OPTIC_A)?.category).toBe("product");
    expect(rowBySku(OPTIC_B)?.category).toBe("product");
  });

  it("totals the model exactly at markup 0 and VAT 15", () => {
    const t = run.mantleModel.totals;
    expect(t.totalPriceSar).toBe(2185708.76);
    expect(t.productTotalSar).toBe(1669647.61);
    expect(t.serviceTotalSar).toBe(304972.06);
    expect(t.subscriptionTotalSar).toBe(211089.09);
    expect(t.vatAmountSar).toBe(327856.31);
    expect(t.totalIncVatSar).toBe(2513565.07);
  });
});

// --- Written Mantle workbook ------------------------------------------------

describe("Honeywell Quick BoM demo e2e - written workbook", () => {
  it("writes a non-empty, locatable Price Estimate workbook with the Mantle headers", async () => {
    const stats = await stat(outputPath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
    expect(layout.sheetName).toBe(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
    expect(layout.columns.map((c) => c.header)).toEqual([...MANTLE_PRICE_ESTIMATE_HEADERS]);
  });

  it("writes exactly the 60 model rows in order, then blanks the rows before the footer", () => {
    expect(run.mantleModel.rows).toHaveLength(60);
    expect(wbPartNumbers).toEqual(run.mantleModel.rows.map((r) => r.partNumber));

    const start = layout.dataStartRowNumber;
    const footerStart = layout.footerRows.reduce((m, f) => Math.min(m, f.rowNumber), Number.POSITIVE_INFINITY);
    const columnCount = layout.columns.reduce((m, c) => Math.max(m, c.columnNumber), 0);
    expect(footerStart).toBeGreaterThan(start + 59);
    for (let r = start + run.mantleModel.rows.length; r < footerStart; r += 1) {
      for (let c = 1; c <= columnCount; c += 1) {
        const v = ws.getRow(r).getCell(c).value;
        expect(v === null || v === undefined || v === "", `row ${r} col ${c} should be blank`).toBe(true);
      }
    }
  });

  it("places CW9178I-CFG first and the optics / phone / phone-child last in order", () => {
    expect(wbPartNumbers[0]).toBe(CW9178);
    expect(wbPartNumbers.slice(-4)).toEqual([OPTIC_A, OPTIC_B, PHONE, PHONE_CHILD]);
  });

  it("writes representative rows with the model's price, quantity, and extended net result", () => {
    const reps = [CW9178, C9300X, C9300L, "LIC-CW-A", "CON-L1NCD-C9300XY4", OPTIC_A, OPTIC_B];
    for (const sku of reps) {
      const i = run.mantleModel.rows.findIndex((r) => r.partNumber === sku);
      expect(i, `model row for ${sku}`).toBeGreaterThanOrEqual(0);
      const modelRow = run.mantleModel.rows[i];
      const wbRow = ws.getRow(layout.dataStartRowNumber + i);
      expect(wbRow.getCell(colNum("Part Number")).value).toBe(sku);
      expect(wbRow.getCell(colNum("Unit List Price")).value).toBe(modelRow.unitListPriceSar);
      expect(wbRow.getCell(colNum("Qty")).value).toBe(modelRow.quantity);
      expect(wbRow.getCell(colNum("Extended Net Price")).result).toBe(modelRow.extendedNetPriceSar);
    }
  });

  it("writes footer category/total cached results matching the Mantle model totals", () => {
    const totalCol = colNum("Extended Net Price");
    const footerResult = (label: string) =>
      ws.getRow(layout.footerRows.find((f) => f.label === label)!.rowNumber).getCell(totalCol).result;
    expect(footerResult("Product Total")).toBe(run.mantleModel.totals.productTotalSar);
    expect(footerResult("Service Total :")).toBe(run.mantleModel.totals.serviceTotalSar);
    expect(footerResult("Subscription Total")).toBe(run.mantleModel.totals.subscriptionTotalSar);
    expect(footerResult("Total Price:")).toBe(run.mantleModel.totals.totalPriceSar);
  });

  it("writes the supplied workbook metadata cells", () => {
    expect(ws.getCell(layout.summaryCells.projectId!.valueAddress).value).toBe(META.projectId);
    expect(ws.getCell(layout.summaryCells.dealId!.valueAddress).value).toBe(META.dealId);
    expect(ws.getCell(layout.summaryCells.priceList!.valueAddress).value).toBe(META.priceList);
  });
});

// --- Source hygiene ---------------------------------------------------------

// Tokens this test must never reference in an import specifier: AI/LLM, catalog,
// API/UI, DB/artifact, coordinator, adapter, engine. Scanned over the extracted
// `from "..."` specifiers ONLY (never raw source), so this list cannot self-match.
const FORBIDDEN_IMPORT_TOKENS = [
  "anthropic", "open" + "ai", "gemini", "claude", "generative-ai", "llm", "/ai", "agent",
  "catalog", "/api", "route", ".tsx", "/ui", "component",
  "drizzle", "schema", "/db", "db/", "artifact", "coordinator", "adapter", "engine",
];

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

describe("Honeywell Quick BoM demo e2e - source hygiene", () => {
  it("keeps the test source ASCII-only", async () => {
    const source = await readFile(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });

  it("imports no AI, catalog, API/UI, DB/artifact, coordinator, adapter, or engine module", async () => {
    const specs = importSpecifiers(await readFile(TEST_PATH, "utf8"));
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      const lower = s.toLowerCase();
      for (const token of FORBIDDEN_IMPORT_TOKENS) {
        expect(lower.includes(token), `import "${s}" matches forbidden "${token}"`).toBe(false);
      }
    }
    // Positive: the e2e test is allowed to (and does) import these.
    expect(specs).toContain("exceljs");
    expect(specs).toContain("@/lib/projects/quick-bom-runner");
    expect(specs).toContain("@/lib/projects/mantle-workbook-writer");
    expect(specs).toContain("@/lib/projects/mantle-layout-locator");
  });
});
