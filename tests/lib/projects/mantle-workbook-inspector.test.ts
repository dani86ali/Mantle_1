import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { readFile } from "fs/promises";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  inspectMantleWorkbook,
  type MantleWorkbookSnapshot,
} from "@/lib/projects/mantle-workbook-inspector";

let tmpDir: string;
let workbookPath: string;

/**
 * Build a synthetic Mantle-shaped workbook covering every structural facet the
 * inspector reports: multiple sheets in a known order, explicit column widths,
 * a merged title range, formula cells, styled cells, and a mid-document blank
 * row so rowCount and actualRowCount diverge.
 */
beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-mantle-"));
  workbookPath = join(tmpDir, "mantle-fixture.xlsx");

  const wb = new ExcelJS.Workbook();

  // Sheet 1: "Priced BoQ" - the structurally rich sheet.
  const priced = wb.addWorksheet("Priced BoQ");
  priced.getColumn(1).width = 12;
  priced.getColumn(2).width = 40;
  priced.getColumn(3).width = 8;
  // Column 4 deliberately has no explicit width.

  // Merged title across the header row.
  priced.mergeCells("A1:D1");
  const title = priced.getCell("A1");
  title.value = "Priced Bill of Quantities";
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center" };

  // Column headers (styled).
  const headers = ["Part Number", "Description", "Qty", "Extended"];
  headers.forEach((text, i) => {
    const cell = priced.getCell(2, i + 1);
    cell.value = text;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDDDDDD" },
    };
  });

  // Two data rows with a unit price, qty, and an extended formula.
  priced.getCell("A3").value = "C9300-48P-E";
  priced.getCell("B3").value = "Catalyst 9300 48-port";
  priced.getCell("C3").value = 5;
  priced.getCell("D3").value = { formula: "C3*1000", result: 5000 };

  priced.getCell("A4").value = "AIR-AP-T-RAIL-R";
  priced.getCell("B4").value = "Ceiling rail mount";
  priced.getCell("C4").value = 2;
  priced.getCell("D4").value = { formula: "C4*1000", result: 2000 };

  // Mid-document blank row at row 5, then a totals row at row 6 with a formula.
  priced.getCell("B6").value = "Total";
  priced.getCell("D6").value = { formula: "SUM(D3:D4)", result: 7000 };

  // Sheet 2: "Summary" - minimal second sheet to prove order + counts.
  const summary = wb.addWorksheet("Summary");
  summary.getCell("A1").value = "Grand Total";
  summary.getCell("B1").value = { formula: "'Priced BoQ'!D6", result: 7000 };

  await wb.xlsx.writeFile(workbookPath);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("inspectMantleWorkbook", () => {
  it("throws the exact message on a blank path", async () => {
    await expect(inspectMantleWorkbook("")).rejects.toThrow(
      "Mantle workbook path is required."
    );
    await expect(inspectMantleWorkbook("   ")).rejects.toThrow(
      "Mantle workbook path is required."
    );
  });

  it("preserves sheet names in workbook order", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    expect(snapshot.sheetNames).toEqual(["Priced BoQ", "Summary"]);
    expect(snapshot.sheets.map((s) => s.name)).toEqual(["Priced BoQ", "Summary"]);
  });

  it("captures row and column counts", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    const priced = snapshot.sheets[0];
    // Last populated row is the totals row (6); widest row spans 4 columns.
    expect(priced.rowCount).toBe(6);
    expect(priced.columnCount).toBe(4);
  });

  it("captures actual (populated) row and column counts", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    const priced = snapshot.sheets[0];
    // Rows 1,2,3,4,6 have values; row 5 is blank => actualRowCount = 5 < rowCount.
    expect(priced.actualRowCount).toBe(5);
    expect(priced.actualRowCount).toBeLessThan(priced.rowCount);
    expect(priced.actualColumnCount).toBe(4);
  });

  it("captures column widths with 1-based indexes", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    const priced = snapshot.sheets[0];
    expect(priced.columnWidths).toEqual([
      { index: 1, width: 12 },
      { index: 2, width: 40 },
      { index: 3, width: 8 },
    ]);
    // Column 4 had no explicit width and is therefore absent.
    expect(priced.columnWidths.some((c) => c.index === 4)).toBe(false);
  });

  it("captures merged ranges deterministically", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    const priced = snapshot.sheets[0];
    expect(priced.mergedRanges).toEqual(["A1:D1"]);
  });

  it("captures formulas with address and formula text, sorted by address", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    const priced = snapshot.sheets[0];
    expect(priced.formulaCells).toEqual([
      { address: "D3", formula: "C3*1000" },
      { address: "D4", formula: "C4*1000" },
      { address: "D6", formula: "SUM(D3:D4)" },
    ]);

    const summary = snapshot.sheets[1];
    expect(summary.formulaCells).toEqual([
      { address: "B1", formula: "'Priced BoQ'!D6" },
    ]);
  });

  it("captures the non-empty cell count", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    const priced = snapshot.sheets[0];
    // A1 (merge master) + 4 headers + 8 data cells + 2 totals cells = 15.
    expect(priced.nonEmptyCellCount).toBe(15);
    expect(snapshot.sheets[1].nonEmptyCellCount).toBe(2);
  });

  it("captures a styled cell count covering at least the styled cells", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    const priced = snapshot.sheets[0];
    expect(Number.isInteger(priced.styledCellCount)).toBe(true);
    // Title + 4 styled headers were explicitly styled.
    expect(priced.styledCellCount).toBeGreaterThanOrEqual(5);
  });

  it("excludes the absolute filePath from the snapshot", async () => {
    const snapshot = await inspectMantleWorkbook(workbookPath);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(workbookPath);
    expect(serialized).not.toContain("mantle-fixture.xlsx");
    expect(serialized).not.toContain(tmpDir);
  });

  it("returns deep-equal snapshots for repeated inspection of the same file", async () => {
    const first = await inspectMantleWorkbook(workbookPath);
    const second = await inspectMantleWorkbook(workbookPath);
    expect(second).toEqual(first);
  });

  it("exposes only the inspector function at runtime; types are erased", async () => {
    const mod = await import("@/lib/projects/mantle-workbook-inspector");
    expect(Object.keys(mod)).toEqual(["inspectMantleWorkbook"]);
  });

  it("imports no DB, Project artifact/pricing/catalog, API/UI, or engine modules", async () => {
    const source = await readFile(
      join(process.cwd(), "src/lib/projects/mantle-workbook-inspector.ts"),
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
});

// Type-level guard: the exported snapshot type is usable without runtime cost.
const _typeOnly: MantleWorkbookSnapshot | undefined = undefined;
void _typeOnly;
