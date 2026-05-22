import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { stat } from "fs/promises";
import { join } from "path";
import {
  inspectMantleWorkbook,
  type MantleWorkbookSnapshot,
} from "@/lib/projects/mantle-workbook-inspector";
import {
  locateMantlePriceEstimateLayout,
  MANTLE_PRICE_ESTIMATE_SHEET_NAME,
  MANTLE_PRICE_ESTIMATE_HEADERS,
  MANTLE_PRICE_ESTIMATE_FOOTER_LABELS,
  MANTLE_SUMMARY_FIELDS,
  type MantlePriceEstimateLayout,
} from "@/lib/projects/mantle-layout-locator";

/**
 * Asset test for the committed sanitized Mantle/STC output template. The template
 * is derived from C:\Pre-Sales\Benchmarck_Files\Mantle_Priced_BoQBoM.xlsx by
 * stripping benchmark customer/project/line data while preserving the structure
 * the later writer fills. These tests use the committed template only - they do
 * not read the external benchmark path - so they are CI-safe.
 *
 * Sanitization note: the template intentionally keeps its own product/SI branding
 * (the "Mantle" / "Bomatic Priced BoQ/BoM" identity), the column headers, the
 * summary/footer labels, the legal disclaimer, and the formula scaffolding. It
 * removes the benchmark project ID, the benchmark price list value, and every
 * line-item business value (SKUs, descriptions, quantities, prices, discounts),
 * and resets cached formula results so no benchmark total is embedded as data.
 */
const TEMPLATE_PATH = join(
  process.cwd(),
  "src/templates/mantle/Mantle_Priced_BoQBoM.template.xlsx"
);

// The 11 explicit column widths carried by the benchmark, preserved verbatim.
const EXPECTED_COLUMN_WIDTHS = [
  { index: 1, width: 20 },
  { index: 2, width: 16 },
  { index: 3, width: 48 },
  { index: 4, width: 15 },
  { index: 5, width: 15 },
  { index: 6, width: 16 },
  { index: 7, width: 11 },
  { index: 8, width: 8 },
  { index: 9, width: 16 },
  { index: 10, width: 10 },
  { index: 11, width: 18 },
];

// A representative set of merged ranges that must survive sanitization.
const EXPECTED_MERGES = [
  "A2:K2",
  "A3:C3",
  "A8:K9",
  "A10:B10",
  "I14:K14",
  "A19:K19",
  "A87:K87",
];

// Summary/footer formula cells whose presence proves the totals scaffolding is intact.
const EXPECTED_FORMULA_CELLS = ["C11", "E11", "F11", "K79", "K80", "K81", "K82"];

// Benchmark-specific values that must be absent from the sanitized template.
const FORBIDDEN_VALUES = [
  "ZP164681679XP",
  "Global Price List US Availability (USD)",
  "C9300X-48HX-A",
];

// Static labels that must remain present in the template.
const REQUIRED_LABELS = [
  "Price Estimate",
  "Project ID:",
  "Deal ID:",
  "Price List:",
  "Product Total",
  "Service Total :",
  "Subscription Total",
  "Total Price:",
];

let snapshot: MantleWorkbookSnapshot;
let layout: MantlePriceEstimateLayout;
let allCellText: string;

/** Trimmed cell text; merge slaves and unreadable cells read as "". */
function safeText(cell: ExcelJS.Cell): string {
  try {
    if (cell.type === ExcelJS.ValueType.Merge) return "";
    return String(cell.text ?? "").trim();
  } catch {
    return "";
  }
}

beforeAll(async () => {
  snapshot = await inspectMantleWorkbook(TEMPLATE_PATH);
  layout = await locateMantlePriceEstimateLayout(TEMPLATE_PATH);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const texts: string[] = [];
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const text = safeText(cell);
        if (text !== "") texts.push(text);
      });
    });
  }
  allCellText = texts.join("\n");
});

describe("Mantle template asset", () => {
  it("exists and is non-empty", async () => {
    const stats = await stat(TEMPLATE_PATH);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  it("has the Price Estimate sheet", () => {
    expect(snapshot.sheetNames).toContain(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
    expect(layout.sheetName).toBe(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  });

  it("locates the Mantle headers in the expected order", () => {
    expect(layout.columns).toEqual(
      MANTLE_PRICE_ESTIMATE_HEADERS.map((header, i) => ({
        header,
        columnNumber: layout.columns[0].columnNumber + i,
      }))
    );
    expect(layout.columns.map((c) => c.header)).toEqual([
      ...MANTLE_PRICE_ESTIMATE_HEADERS,
    ]);
  });

  it("locates the footer total labels", () => {
    expect(layout.footerRows.map((f) => f.label)).toEqual([
      ...MANTLE_PRICE_ESTIMATE_FOOTER_LABELS,
    ]);
  });

  it("locates every summary label/value cell", () => {
    for (const field of MANTLE_SUMMARY_FIELDS) {
      const cell = layout.summaryCells[field.key];
      expect(cell, `summary field ${field.key}`).toBeDefined();
      expect(typeof cell?.labelAddress).toBe("string");
      expect(typeof cell?.valueAddress).toBe("string");
    }
  });

  it("preserves merged cells", () => {
    const merges = snapshot.sheets[0].mergedRanges;
    expect(merges.length).toBe(20);
    for (const range of EXPECTED_MERGES) {
      expect(merges).toContain(range);
    }
  });

  it("preserves explicit column widths", () => {
    expect(snapshot.sheets[0].columnWidths).toEqual(EXPECTED_COLUMN_WIDTHS);
  });

  it("keeps formula cells, including the summary and footer totals", () => {
    const formulaAddresses = snapshot.sheets[0].formulaCells.map((f) => f.address);
    expect(formulaAddresses.length).toBeGreaterThan(0);
    for (const address of EXPECTED_FORMULA_CELLS) {
      expect(formulaAddresses).toContain(address);
    }
  });

  it("does not embed benchmark-specific values", () => {
    for (const value of FORBIDDEN_VALUES) {
      expect(allCellText).not.toContain(value);
    }
  });

  it("retains the static labels", () => {
    for (const label of REQUIRED_LABELS) {
      expect(allCellText).toContain(label);
    }
  });

  it("keeps this test source ASCII-only", () => {
    const source = readFileSync(
      join(process.cwd(), "tests/lib/projects/mantle-template-asset.test.ts"),
      "utf8"
    );
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
