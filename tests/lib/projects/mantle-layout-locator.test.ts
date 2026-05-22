import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { readFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  locateMantlePriceEstimateLayout,
  MANTLE_PRICE_ESTIMATE_SHEET_NAME,
  MANTLE_PRICE_ESTIMATE_HEADERS,
  MANTLE_PRICE_ESTIMATE_FOOTER_LABELS,
  MANTLE_SUMMARY_FIELDS,
  type MantlePriceEstimateLayout,
} from "@/lib/projects/mantle-layout-locator";

let tmpDir: string;
let validPath: string;
let noSheetPath: string;
let badHeaderPath: string;
let noFooterPath: string;

interface BuildOptions {
  breakHeader?: boolean;
  dropFooterLabel?: string;
}

/**
 * Populate a synthetic Mantle "Price Estimate" sheet mirroring the benchmark
 * contract: a top summary block above the header (category totals with the value
 * directly below the label; id/price-list fields with the value in the next
 * non-empty cell to the right, leaving a gap column), the 11 headers in columns
 * 1-11 on row 7, two data rows, then the four footer total rows (label in column
 * A, value in column C, with an empty gap column B).
 */
function populatePriceEstimate(worksheet: ExcelJS.Worksheet, options: BuildOptions = {}): void {
  // Top summary - category totals (value directly below the label).
  worksheet.getCell("A1").value = "Hardware";
  worksheet.getCell("C1").value = "Services";
  worksheet.getCell("E1").value = "Subscription";
  worksheet.getCell("A2").value = 100;
  worksheet.getCell("C2").value = 200;
  worksheet.getCell("E2").value = 300;

  // Top summary - id/price-list (value in next non-empty cell to the right).
  worksheet.getCell("A3").value = "Project ID:";
  worksheet.getCell("C3").value = "PRJ-1";
  worksheet.getCell("A4").value = "Deal ID:";
  worksheet.getCell("C4").value = "DEAL-1";
  worksheet.getCell("A5").value = "Price List:";
  worksheet.getCell("C5").value = "Global Price List";

  // Header row 7.
  const headers: string[] = [...MANTLE_PRICE_ESTIMATE_HEADERS];
  if (options.breakHeader) headers[3] = "Wrong Header";
  headers.forEach((text, i) => {
    worksheet.getCell(7, i + 1).value = text;
  });

  // Data rows 8-9.
  worksheet.getCell("A8").value = "SKU-1";
  worksheet.getCell("C8").value = "Item one";
  worksheet.getCell("H8").value = 2;
  worksheet.getCell("A9").value = "SKU-2";
  worksheet.getCell("C9").value = "Item two";
  worksheet.getCell("H9").value = 4;

  // Footer total rows 11-14 (label column A, value column C, gap column B).
  const footer: Array<[string, number, number]> = [
    ["Product Total", 1000, 11],
    ["Service Total :", 2000, 12],
    ["Subscription Total", 3000, 13],
    ["Total Price:", 6000, 14],
  ];
  for (const [label, value, row] of footer) {
    if (label === options.dropFooterLabel) continue;
    worksheet.getCell(row, 1).value = label;
    worksheet.getCell(row, 3).value = value;
  }
}

async function writeWorkbook(path: string, sheetName: string, options: BuildOptions = {}): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  populatePriceEstimate(ws, options);
  await wb.xlsx.writeFile(path);
}

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-mantle-locator-"));
  validPath = join(tmpDir, "valid.xlsx");
  noSheetPath = join(tmpDir, "no-sheet.xlsx");
  badHeaderPath = join(tmpDir, "bad-header.xlsx");
  noFooterPath = join(tmpDir, "no-footer.xlsx");

  await writeWorkbook(validPath, MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  await writeWorkbook(noSheetPath, "Other Sheet");
  await writeWorkbook(badHeaderPath, MANTLE_PRICE_ESTIMATE_SHEET_NAME, { breakHeader: true });
  await writeWorkbook(noFooterPath, MANTLE_PRICE_ESTIMATE_SHEET_NAME, { dropFooterLabel: "Total Price:" });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("locateMantlePriceEstimateLayout", () => {
  it("throws the exact message on a blank path", async () => {
    await expect(locateMantlePriceEstimateLayout("")).rejects.toThrow(
      "Mantle workbook path is required."
    );
    await expect(locateMantlePriceEstimateLayout("   ")).rejects.toThrow(
      "Mantle workbook path is required."
    );
  });

  it("throws the exact message when there is no Price Estimate sheet", async () => {
    await expect(locateMantlePriceEstimateLayout(noSheetPath)).rejects.toThrow(
      "Mantle workbook must contain a Price Estimate sheet."
    );
  });

  it("detects the exact header row", async () => {
    const layout = await locateMantlePriceEstimateLayout(validPath);
    expect(layout.sheetName).toBe("Price Estimate");
    expect(layout.headerRowNumber).toBe(7);
  });

  it("throws the exact message when a header is wrong/missing", async () => {
    await expect(locateMantlePriceEstimateLayout(badHeaderPath)).rejects.toThrow(
      "Mantle Price Estimate header row was not found."
    );
  });

  it("derives dataStartRowNumber as headerRowNumber + 1", async () => {
    const layout = await locateMantlePriceEstimateLayout(validPath);
    expect(layout.dataStartRowNumber).toBe(layout.headerRowNumber + 1);
    expect(layout.dataStartRowNumber).toBe(8);
  });

  it("maps every header to a 1-based column index in order", async () => {
    const layout = await locateMantlePriceEstimateLayout(validPath);
    expect(layout.columns).toEqual(
      MANTLE_PRICE_ESTIMATE_HEADERS.map((header, i) => ({ header, columnNumber: i + 1 }))
    );
    expect(layout.columns).toHaveLength(11);
  });

  it("detects the footer total rows by their exact labels", async () => {
    const layout = await locateMantlePriceEstimateLayout(validPath);
    expect(layout.footerRows).toEqual([
      { label: "Product Total", rowNumber: 11, labelAddress: "A11", valueAddress: "C11" },
      { label: "Service Total :", rowNumber: 12, labelAddress: "A12", valueAddress: "C12" },
      { label: "Subscription Total", rowNumber: 13, labelAddress: "A13", valueAddress: "C13" },
      { label: "Total Price:", rowNumber: 14, labelAddress: "A14", valueAddress: "C14" },
    ]);
  });

  it("throws the exact message when a footer label is missing", async () => {
    await expect(locateMantlePriceEstimateLayout(noFooterPath)).rejects.toThrow(
      "Mantle Price Estimate footer rows were not found."
    );
  });

  it("returns top summary label/value cells as addresses when labels exist", async () => {
    const layout = await locateMantlePriceEstimateLayout(validPath);
    expect(layout.summaryCells).toEqual({
      hardwareTotal: { labelAddress: "A1", valueAddress: "A2" },
      servicesTotal: { labelAddress: "C1", valueAddress: "C2" },
      subscriptionTotal: { labelAddress: "E1", valueAddress: "E2" },
      projectId: { labelAddress: "A3", valueAddress: "C3" },
      dealId: { labelAddress: "A4", valueAddress: "C4" },
      priceList: { labelAddress: "A5", valueAddress: "C5" },
    });
  });

  it("excludes the file path and workbook metadata from the layout", async () => {
    const layout = await locateMantlePriceEstimateLayout(validPath);
    const serialized = JSON.stringify(layout);
    expect(serialized).not.toContain(validPath);
    expect(serialized).not.toContain("valid.xlsx");
    expect(serialized).not.toContain(tmpDir);
    // Only the documented top-level keys; no workbook object or timestamps.
    expect(Object.keys(layout).sort()).toEqual(
      [
        "columns",
        "dataStartRowNumber",
        "footerRows",
        "headerRowNumber",
        "sheetName",
        "summaryCells",
      ].sort()
    );
  });

  it("returns deep-equal layouts for repeated calls on the same file", async () => {
    const first = await locateMantlePriceEstimateLayout(validPath);
    const second = await locateMantlePriceEstimateLayout(validPath);
    expect(second).toEqual(first);
  });

  it("exposes only the locator function and constants at runtime", async () => {
    const mod = await import("@/lib/projects/mantle-layout-locator");
    expect(Object.keys(mod)).toEqual([
      "MANTLE_PRICE_ESTIMATE_SHEET_NAME",
      "MANTLE_PRICE_ESTIMATE_HEADERS",
      "MANTLE_PRICE_ESTIMATE_FOOTER_LABELS",
      "MANTLE_SUMMARY_FIELDS",
      "locateMantlePriceEstimateLayout",
    ]);
  });

  it("imports no DB, Project pricing/catalog/SKU/artifact, API/UI, or engine modules", async () => {
    const source = await readFile(
      join(process.cwd(), "src/lib/projects/mantle-layout-locator.ts"),
      "utf8"
    );
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line) || /from\s+["']/.test(line));
    const forbidden = [
      "@/lib/db",
      "@/lib/projects/pricing",
      "@/lib/projects/priced-boq",
      "@/lib/projects/sku",
      "@/lib/projects/priced-boq-artifact",
      "@/lib/catalog",
      "@/lib/adapters",
      "@/lib/agent",
      "@/app",
      "@/components",
      "@/engines",
      "@/coordinator",
      "drizzle",
    ];
    for (const line of importLines) {
      for (const token of forbidden) {
        expect(line).not.toContain(token);
      }
    }
    // The only runtime dependency is exceljs.
    expect(source).toContain('from "exceljs"');
  });

  it("keeps both source files ASCII-only", async () => {
    const files = [
      "src/lib/projects/mantle-layout-locator.ts",
      "tests/lib/projects/mantle-layout-locator.test.ts",
    ];
    for (const file of files) {
      const source = await readFile(join(process.cwd(), file), "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    }
  });
});

// Sanity references so the imported type and field constant are exercised.
const _typeOnly: MantlePriceEstimateLayout | undefined = undefined;
void _typeOnly;
void MANTLE_SUMMARY_FIELDS;
void MANTLE_PRICE_ESTIMATE_FOOTER_LABELS;
