import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { readFile, mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import * as mod from "@/lib/projects/mantle-workbook-writer";
import {
  writeMantlePriceEstimateWorkbook,
  DEFAULT_MANTLE_TEMPLATE_PATH,
} from "@/lib/projects/mantle-workbook-writer";
import {
  locateMantlePriceEstimateLayout,
  MANTLE_PRICE_ESTIMATE_SHEET_NAME,
  MANTLE_PRICE_ESTIMATE_HEADERS,
} from "@/lib/projects/mantle-layout-locator";
import type {
  MantlePriceEstimateModel,
  MantlePriceEstimateRow,
} from "@/lib/projects/mantle-price-estimate-model";

// The 11 explicit column widths the template carries, preserved verbatim.
const EXPECTED_COLUMN_WIDTHS = [20, 16, 48, 15, 15, 16, 11, 8, 16, 10, 18];

// Structural merges that live outside the data band and must survive a write.
const STRUCTURAL_MERGES = ["A2:K2", "A8:K9", "A87:K87"];

/** A priced Mantle row with sane defaults (list 100, net 80 -> 20% disc, qty 2). */
function pricedRow(overrides: Partial<MantlePriceEstimateRow> = {}): MantlePriceEstimateRow {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: 1,
    originalLineNumber: "1",
    originalSku: "ORIG-1",
    acceptedSku: "ACC-1",
    status: "priced",
    partNumber: "ACC-1",
    smartAccountMandatory: "-",
    description: "Item one",
    serviceDurationMonths: "---",
    estimatedLeadTimeDays: "N/A",
    unitListPriceSar: 100,
    pricingTerm: "",
    quantity: 2,
    unitNetPriceSar: 80,
    discountPercent: 20,
    extendedNetPriceSar: 160,
    category: "product",
    categoryWasDefaulted: false,
    ...overrides,
  };
}

/** An unpriced (retained) Mantle row with null price fields. */
function unpricedRow(overrides: Partial<MantlePriceEstimateRow> = {}): MantlePriceEstimateRow {
  return {
    sourceFileId: "file-1",
    sourceRowNumber: 2,
    originalLineNumber: "2",
    originalSku: "ORIG-2",
    status: "missing_price",
    warning: "Accepted SKU has no SAR unit price.",
    partNumber: "NO-PRICE",
    smartAccountMandatory: "-",
    description: "Item two",
    serviceDurationMonths: "---",
    estimatedLeadTimeDays: "N/A",
    unitListPriceSar: null,
    pricingTerm: "",
    quantity: 3,
    unitNetPriceSar: null,
    discountPercent: null,
    extendedNetPriceSar: null,
    category: null,
    categoryWasDefaulted: false,
    ...overrides,
  };
}

/** Wrap rows into a model with explicit totals; counts are not used by the writer. */
function modelOf(
  rows: MantlePriceEstimateRow[],
  totals: Partial<MantlePriceEstimateModel["totals"]> = {}
): MantlePriceEstimateModel {
  return {
    rows,
    totals: {
      totalPriceSar: 0,
      productTotalSar: 0,
      serviceTotalSar: 0,
      subscriptionTotalSar: 0,
      vatAmountSar: 0,
      totalIncVatSar: 0,
      pricedLineCount: 0,
      unpricedLineCount: 0,
      missingDecisionCount: 0,
      notAcceptedCount: 0,
      missingPriceCount: 0,
      ...totals,
    },
    warnings: [],
  };
}

let tmpDir: string;
let basicPath: string;

/** Open a written workbook's Price Estimate sheet for assertions. */
async function openSheet(path: string): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  if (!ws) throw new Error("missing sheet");
  return ws;
}

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-mantle-writer-"));
  basicPath = join(tmpDir, "basic.xlsx");
  // Service/subscription cached totals are deliberately non-zero even though the
  // fixture has no service/subscription rows. This proves cached results win over
  // the rebuilt formula text - matching the spec rule that Excel formulas are not
  // the source of truth. In production buildMantlePriceEstimateModel only emits
  // non-zero category totals when matching rows exist, so this divergence cannot
  // arise from real input.
  await writeMantlePriceEstimateWorkbook({
    model: modelOf(
      [
        pricedRow({ sourceRowNumber: 1, partNumber: "HW-1", description: "Switch" }),
        unpricedRow({ sourceRowNumber: 2, partNumber: "MP-1", description: "Router" }),
        pricedRow({ sourceRowNumber: 3, partNumber: "HW-2", description: "AP" }),
      ],
      {
        productTotalSar: 320,
        serviceTotalSar: 50,
        subscriptionTotalSar: 25,
        totalPriceSar: 395,
      }
    ),
    outputPath: basicPath,
    projectId: "PRJ-42",
    dealId: "DEAL-99",
    priceList: "STC SAR Price List",
  });
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("writeMantlePriceEstimateWorkbook - validation", () => {
  it("throws the exact message on a blank output path", async () => {
    await expect(
      writeMantlePriceEstimateWorkbook({ model: modelOf([pricedRow()]), outputPath: "" })
    ).rejects.toThrow("Mantle workbook output path is required.");
    await expect(
      writeMantlePriceEstimateWorkbook({ model: modelOf([pricedRow()]), outputPath: "   " })
    ).rejects.toThrow("Mantle workbook output path is required.");
  });

  it("throws the exact message when the model has no rows", async () => {
    await expect(
      writeMantlePriceEstimateWorkbook({ model: modelOf([]), outputPath: join(tmpDir, "x.xlsx") })
    ).rejects.toThrow("Mantle workbook requires at least one row.");
  });
});

describe("writeMantlePriceEstimateWorkbook - structure preservation", () => {
  it("writes a readable .xlsx and returns the output path", async () => {
    const out = join(tmpDir, "readable.xlsx");
    const returned = await writeMantlePriceEstimateWorkbook({
      model: modelOf([pricedRow()]),
      outputPath: out,
    });
    expect(returned).toBe(out);
    const stats = await stat(out);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
    // Readable enough for the locator to re-parse it.
    const layout = await locateMantlePriceEstimateLayout(out);
    expect(layout.sheetName).toBe(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  });

  it("preserves the Price Estimate sheet name", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(basicPath);
    expect(wb.worksheets.map((w) => w.name)).toContain(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  });

  it("preserves the Mantle header order", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    expect(layout.columns.map((c) => c.header)).toEqual([...MANTLE_PRICE_ESTIMATE_HEADERS]);
  });

  it("preserves the explicit column widths", async () => {
    const ws = await openSheet(basicPath);
    const widths = EXPECTED_COLUMN_WIDTHS.map((_, i) => ws.getColumn(i + 1).width);
    expect(widths).toEqual(EXPECTED_COLUMN_WIDTHS);
  });

  it("preserves the structural merged ranges", async () => {
    const ws = await openSheet(basicPath);
    for (const range of STRUCTURAL_MERGES) {
      expect(ws.model.merges).toContain(range);
    }
  });
});

describe("writeMantlePriceEstimateWorkbook - metadata", () => {
  it("writes projectId/dealId/priceList into the located summary cells", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    expect(ws.getCell(layout.summaryCells.projectId!.valueAddress).value).toBe("PRJ-42");
    expect(ws.getCell(layout.summaryCells.dealId!.valueAddress).value).toBe("DEAL-99");
    expect(ws.getCell(layout.summaryCells.priceList!.valueAddress).value).toBe(
      "STC SAR Price List"
    );
  });

  it("leaves absent metadata cells blank", async () => {
    const out = join(tmpDir, "no-meta.xlsx");
    await writeMantlePriceEstimateWorkbook({ model: modelOf([pricedRow()]), outputPath: out });
    const layout = await locateMantlePriceEstimateLayout(out);
    const ws = await openSheet(out);
    const projectIdCell = ws.getCell(layout.summaryCells.projectId!.valueAddress).value;
    expect(projectIdCell === null || projectIdCell === undefined).toBe(true);
  });
});

describe("writeMantlePriceEstimateWorkbook - rows", () => {
  it("writes priced rows into the exact Mantle columns", async () => {
    const out = join(tmpDir, "priced.xlsx");
    await writeMantlePriceEstimateWorkbook({
      model: modelOf([
        pricedRow({
          partNumber: "C9300-48",
          description: "Catalyst switch",
          unitListPriceSar: 200,
          quantity: 4,
          discountPercent: 10,
          unitNetPriceSar: 180,
          extendedNetPriceSar: 720,
        }),
      ]),
      outputPath: out,
    });
    const layout = await locateMantlePriceEstimateLayout(out);
    const ws = await openSheet(out);
    const r = layout.dataStartRowNumber;
    const at = (header: string) =>
      ws.getRow(r).getCell(layout.columns.find((c) => c.header === header)!.columnNumber);
    expect(at("Part Number").value).toBe("C9300-48");
    expect(at("Description").value).toBe("Catalyst switch");
    expect(at("Unit List Price").value).toBe(200);
    expect(at("Qty").value).toBe(4);
    expect(at("Disc(%)").value).toBe(10);
    expect(at("Unit Net Price").result).toBe(180);
    expect(at("Extended Net Price").result).toBe(720);
  });

  it("preserves model row order", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const partCol = layout.columns.find((c) => c.header === "Part Number")!.columnNumber;
    const start = layout.dataStartRowNumber;
    expect([
      ws.getRow(start).getCell(partCol).value,
      ws.getRow(start + 1).getCell(partCol).value,
      ws.getRow(start + 2).getCell(partCol).value,
    ]).toEqual(["HW-1", "MP-1", "HW-2"]);
  });

  it("writes blank price cells for unpriced rows", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const row = ws.getRow(layout.dataStartRowNumber + 1); // the unpriced MP-1 row
    const at = (header: string) =>
      row.getCell(layout.columns.find((c) => c.header === header)!.columnNumber).value;
    for (const header of ["Unit List Price", "Unit Net Price", "Disc(%)", "Extended Net Price"]) {
      const value = at(header);
      expect(value === null || value === undefined || value === "").toBe(true);
    }
  });

  it("appends the status and warning to the unpriced row description", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const descCol = layout.columns.find((c) => c.header === "Description")!.columnNumber;
    const text = String(ws.getRow(layout.dataStartRowNumber + 1).getCell(descCol).value);
    expect(text).toContain("Router");
    expect(text).toContain("[status: missing_price; warning: Accepted SKU has no SAR unit price.]");
  });

  it("keeps unpriced rows in place rather than dropping or reordering them", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const statusCol = layout.columns.find((c) => c.header === "Part Number")!.columnNumber;
    // The unpriced row stays at the middle position (index 1).
    expect(ws.getRow(layout.dataStartRowNumber + 1).getCell(statusCol).value).toBe("MP-1");
  });
});

describe("writeMantlePriceEstimateWorkbook - totals", () => {
  it("writes the product/service/subscription/total footer totals as cached results", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const totalCol = layout.columns.find((c) => c.header === "Extended Net Price")!.columnNumber;
    const byLabel = (label: string) =>
      ws.getRow(layout.footerRows.find((f) => f.label === label)!.rowNumber).getCell(totalCol);
    expect(byLabel("Product Total").result).toBe(320);
    expect(byLabel("Service Total :").result).toBe(50);
    expect(byLabel("Subscription Total").result).toBe(25);
    expect(byLabel("Total Price:").result).toBe(395);
  });

  it("preserves the formula cells in the footer totals", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const totalCol = layout.columns.find((c) => c.header === "Extended Net Price")!.columnNumber;
    for (const footer of layout.footerRows) {
      const cell = ws.getRow(footer.rowNumber).getCell(totalCol);
      expect(cell.type).toBe(ExcelJS.ValueType.Formula);
      expect(typeof cell.formula).toBe("string");
    }
  });

  it("preserves the category summary formula cells with cached results", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const cases: Array<[keyof typeof layout.summaryCells, number]> = [
      ["hardwareTotal", 320],
      ["servicesTotal", 50],
      ["subscriptionTotal", 25],
    ];
    for (const [key, expected] of cases) {
      const cell = ws.getCell(layout.summaryCells[key]!.valueAddress);
      expect(cell.type).toBe(ExcelJS.ValueType.Formula);
      expect(typeof cell.formula).toBe("string");
      expect(cell.result).toBe(expected);
    }
  });
});

describe("writeMantlePriceEstimateWorkbook - unused rows & rebuilt formulas", () => {
  it("blanks every Mantle column on unused rows below the model and above the footer", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const lastWritten = layout.dataStartRowNumber + 2; // 3 model rows
    const footerStart = layout.footerRows.reduce(
      (min, f) => Math.min(min, f.rowNumber),
      Number.POSITIVE_INFINITY
    );
    const columnCount = layout.columns.reduce((m, c) => Math.max(m, c.columnNumber), 0);
    for (let r = lastWritten + 1; r < footerStart; r += 1) {
      const row = ws.getRow(r);
      for (let c = 1; c <= columnCount; c += 1) {
        const cell = row.getCell(c);
        expect(cell.type, `row ${r} col ${c} should not be a formula`).not.toBe(
          ExcelJS.ValueType.Formula
        );
        const value = cell.value;
        expect(
          value === null || value === undefined || value === "",
          `row ${r} col ${c} should be blank (got ${JSON.stringify(value)})`
        ).toBe(true);
      }
    }
  });

  it("rebuilds category footer formulas to reference the actual written rows", async () => {
    const out = join(tmpDir, "mixed.xlsx");
    await writeMantlePriceEstimateWorkbook({
      model: modelOf(
        [
          pricedRow({ sourceRowNumber: 1, partNumber: "HW", category: "product" }),
          pricedRow({
            sourceRowNumber: 2,
            partNumber: "SVC",
            category: "service",
            unitListPriceSar: 60,
            unitNetPriceSar: 50,
            extendedNetPriceSar: 100,
            quantity: 2,
            discountPercent: 16.67,
          }),
          unpricedRow({ sourceRowNumber: 3, partNumber: "MP" }),
          pricedRow({
            sourceRowNumber: 4,
            partNumber: "SUB",
            category: "subscription",
            unitListPriceSar: 30,
            unitNetPriceSar: 25,
            extendedNetPriceSar: 25,
            quantity: 1,
            discountPercent: 16.67,
          }),
          pricedRow({ sourceRowNumber: 5, partNumber: "HW2", category: "product" }),
        ],
        {
          productTotalSar: 320,
          serviceTotalSar: 100,
          subscriptionTotalSar: 25,
          totalPriceSar: 445,
        }
      ),
      outputPath: out,
    });
    const layout = await locateMantlePriceEstimateLayout(out);
    const ws = await openSheet(out);
    const totalCol = layout.columns.find((c) => c.header === "Extended Net Price")!.columnNumber;
    const start = layout.dataStartRowNumber;
    const formulaFor = (label: string) =>
      ws.getRow(layout.footerRows.find((f) => f.label === label)!.rowNumber).getCell(totalCol)
        .formula;
    // Product rows landed at start and start+4; service at start+1; subscription at start+3.
    expect(formulaFor("Product Total")).toBe(`SUM(K${start},K${start + 4})`);
    expect(formulaFor("Service Total :")).toBe(`SUM(K${start + 1})`);
    expect(formulaFor("Subscription Total")).toBe(`SUM(K${start + 3})`);
    // Formulas must not reference benchmark rows the model never touched.
    expect(formulaFor("Product Total")).not.toMatch(/K2[12]/);
    expect(formulaFor("Product Total")).not.toMatch(/K7[0-9]/);
  });

  it("emits a SUM(K...) formula for empty categories and references no rows", async () => {
    // basicPath has only product rows; service/subscription formulas must be the constant "0".
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const totalCol = layout.columns.find((c) => c.header === "Extended Net Price")!.columnNumber;
    const formulaFor = (label: string) =>
      ws.getRow(layout.footerRows.find((f) => f.label === label)!.rowNumber).getCell(totalCol)
        .formula;
    expect(formulaFor("Service Total :")).toBe("0");
    expect(formulaFor("Subscription Total")).toBe("0");
  });

  it("rebuilds Total Price as the sum of the three category footer cells", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const totalCol = layout.columns.find((c) => c.header === "Extended Net Price")!.columnNumber;
    const rowFor = (label: string) =>
      layout.footerRows.find((f) => f.label === label)!.rowNumber;
    const totalFormula = ws.getRow(rowFor("Total Price:")).getCell(totalCol).formula;
    expect(totalFormula).toBe(
      `K${rowFor("Product Total")}+K${rowFor("Service Total :")}+K${rowFor("Subscription Total")}`
    );
  });

  it("rebuilds top summary formula cells to reference the shifted footer total cells", async () => {
    const layout = await locateMantlePriceEstimateLayout(basicPath);
    const ws = await openSheet(basicPath);
    const rowFor = (label: string) =>
      layout.footerRows.find((f) => f.label === label)!.rowNumber;
    expect(ws.getCell(layout.summaryCells.hardwareTotal!.valueAddress).formula).toBe(
      `K${rowFor("Product Total")}`
    );
    expect(ws.getCell(layout.summaryCells.servicesTotal!.valueAddress).formula).toBe(
      `K${rowFor("Service Total :")}`
    );
    expect(ws.getCell(layout.summaryCells.subscriptionTotal!.valueAddress).formula).toBe(
      `K${rowFor("Subscription Total")}`
    );
  });
});

describe("writeMantlePriceEstimateWorkbook - row insertion", () => {
  it("supports more rows than the initial data area by inserting/copying template rows", async () => {
    const rowCount = 70;
    const rows = Array.from({ length: rowCount }, (_, i) =>
      pricedRow({ sourceRowNumber: i + 1, partNumber: `BULK-${i + 1}` })
    );
    const out = join(tmpDir, "bulk.xlsx");
    await writeMantlePriceEstimateWorkbook({
      model: modelOf(rows, { productTotalSar: 11200, totalPriceSar: 11200 }),
      outputPath: out,
    });
    const layout = await locateMantlePriceEstimateLayout(out);
    const ws = await openSheet(out);
    const partCol = layout.columns.find((c) => c.header === "Part Number")!.columnNumber;
    const start = layout.dataStartRowNumber;
    // First and last bulk rows landed contiguously.
    expect(ws.getRow(start).getCell(partCol).value).toBe("BULK-1");
    expect(ws.getRow(start + rowCount - 1).getCell(partCol).value).toBe(`BULK-${rowCount}`);
    // The footer shifted below the expanded data area and still totals correctly.
    const totalCol = layout.columns.find((c) => c.header === "Extended Net Price")!.columnNumber;
    const productFooter = layout.footerRows.find((f) => f.label === "Product Total")!;
    expect(productFooter.rowNumber).toBeGreaterThan(start + rowCount - 1);
    expect(ws.getRow(productFooter.rowNumber).getCell(totalCol).result).toBe(11200);
    // The rebuilt Product Total formula references every written row contiguously,
    // including the rows added by the splice insertion (e.g., the final BULK-70 row).
    const productFormula = ws.getRow(productFooter.rowNumber).getCell(totalCol).formula!;
    const expectedRefs = Array.from({ length: rowCount }, (_, i) => `K${start + i}`).join(",");
    expect(productFormula).toBe(`SUM(${expectedRefs})`);
    // Total Price and the top summary formulas track the shifted footer rows.
    const totalFooter = layout.footerRows.find((f) => f.label === "Total Price:")!;
    expect(ws.getRow(totalFooter.rowNumber).getCell(totalCol).formula).toBe(
      `K${productFooter.rowNumber}+K${
        layout.footerRows.find((f) => f.label === "Service Total :")!.rowNumber
      }+K${layout.footerRows.find((f) => f.label === "Subscription Total")!.rowNumber}`
    );
    expect(ws.getCell(layout.summaryCells.hardwareTotal!.valueAddress).formula).toBe(
      `K${productFooter.rowNumber}`
    );
  });
});

describe("writeMantlePriceEstimateWorkbook - purity, surface & isolation", () => {
  it("does not mutate the input model", async () => {
    const model = modelOf([pricedRow(), unpricedRow()], { productTotalSar: 160, totalPriceSar: 160 });
    const snapshot = structuredClone(model);
    await writeMantlePriceEstimateWorkbook({
      model,
      outputPath: join(tmpDir, "purity.xlsx"),
      projectId: "P",
    });
    expect(model).toEqual(snapshot);
  });

  it("exposes only the writer function and default template path at runtime", () => {
    expect(Object.keys(mod).sort()).toEqual(
      ["DEFAULT_MANTLE_TEMPLATE_PATH", "writeMantlePriceEstimateWorkbook"].sort()
    );
    expect(typeof DEFAULT_MANTLE_TEMPLATE_PATH).toBe("string");
  });

  it("imports only exceljs, node path, and existing Mantle helpers/model types", async () => {
    const source = await readFile(
      join(process.cwd(), "src/lib/projects/mantle-workbook-writer.ts"),
      "utf8"
    );
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line) || /from\s+["']/.test(line));
    const forbidden = [
      "@/lib/db",
      "drizzle",
      "@/lib/catalog",
      "@/lib/projects/sku",
      "@/lib/projects/priced-boq",
      "approval",
      "staleness",
      "@/engines",
      "@/coordinator",
      "@/lib/agent",
      "@/lib/adapters",
      "@/app",
      "@/components",
      "anthropic",
      "openai",
    ];
    for (const line of importLines) {
      for (const token of forbidden) {
        expect(line).not.toContain(token);
      }
    }
    expect(source).toContain('from "exceljs"');
  });

  it("keeps both source files ASCII-only", async () => {
    const files = [
      "src/lib/projects/mantle-workbook-writer.ts",
      "tests/lib/projects/mantle-workbook-writer.test.ts",
    ];
    for (const file of files) {
      const text = await readFile(join(process.cwd(), file), "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[^\x00-\x7F]/.test(text)).toBe(false);
    }
  });
});
