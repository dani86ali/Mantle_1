import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, join } from "path";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import ExcelJS from "exceljs";
import { fillBoQTemplate, type PricedLineItem } from "@/engines/e2/boq-template-filler";
import { readExcelFile } from "@/lib/io/excel-reader";
import { parseTypeA } from "@/engines/e2/parsers/type-a-ariba";

const FIXTURE_DIR = resolve(__dirname, "../../fixtures/boq");
const FIX_2024 = resolve(FIXTURE_DIR, "Aramco_4203164336.xlsx");
const FIX_2022 = resolve(FIXTURE_DIR, "Aramco_4203079088.xlsx");

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "boq-filler-"));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("fillBoQTemplate — Aramco 2024 fixture", () => {
  it("fills mock prices into the source workbook and writes a valid output", async () => {
    const items = parseTypeA(readExcelFile(FIX_2024).sheets);
    expect(items.length).toBeGreaterThan(0);

    const priced: PricedLineItem[] = items.slice(0, 3).map((b, i) => ({
      itemNumber: b.itemNumber,
      unitPrice: 1000 + i * 250,
      currency: "USD",
      leadTimeDays: 30 + i,
      mpn: `MPN-${b.itemNumber}`,
      manufacturer: "Juniper",
      modelPartNumber: `MODEL-${b.itemNumber}`,
      countryOfOrigin: "US",
      intendToRespond: "Yes",
      remarks: `auto-filled for ${b.itemNumber}`,
    }));

    const outPath = join(workDir, "filled-2024.xlsx");
    const result = await fillBoQTemplate({
      sourceWorkbookPath: FIX_2024,
      lineItems: priced,
      outputPath: outPath,
      templateType: "type_a",
    });
    expect(result).toBe(outPath);
    expect(existsSync(outPath)).toBe(true);
  });

  it("written cells round-trip to the expected values", async () => {
    const items = parseTypeA(readExcelFile(FIX_2024).sheets);
    const priced: PricedLineItem[] = [{
      itemNumber: items[0].itemNumber,
      unitPrice: 12345.67,
      currency: "USD",
      leadTimeDays: 45,
      mpn: "QFX5120-48YM-AFO",
      manufacturer: "Juniper",
      modelPartNumber: "QFX5120-48YM-AFO",
      countryOfOrigin: "US",
      intendToRespond: "Yes",
      remarks: "round-trip test",
    }];

    const outPath = join(workDir, "filled-2024-roundtrip.xlsx");
    await fillBoQTemplate({
      sourceWorkbookPath: FIX_2024,
      lineItems: priced,
      outputPath: outPath,
      templateType: "type_a",
    });

    // Read back through the same parser we use in production.
    const refilled = parseTypeA(readExcelFile(outPath).sheets);
    const filledFirst = refilled.find((r) => r.itemNumber === priced[0].itemNumber);
    expect(filledFirst).toBeDefined();
    expect(filledFirst!.unitPrice).toBe(12345.67);
    expect(filledFirst!.manufacturer).toBe("Juniper");
    expect(filledFirst!.metadata?.modelPartNumber).toBe("QFX5120-48YM-AFO");
    expect(filledFirst!.metadata?.countryOfOrigin).toBe("US");
    expect(filledFirst!.leadTime).toBe("45");
  });

  it("preserves all sheets from the source workbook", async () => {
    const sourceSheets = readExcelFile(FIX_2024).sheetNames;
    const outPath = join(workDir, "filled-2024-sheets.xlsx");
    await fillBoQTemplate({
      sourceWorkbookPath: FIX_2024,
      lineItems: [{
        itemNumber: "7.1", unitPrice: 1, currency: "USD",
      }],
      outputPath: outPath,
      templateType: "type_a",
    });
    const outSheets = readExcelFile(outPath).sheetNames;
    // Every source sheet name appears in the output (exceljs may re-order).
    for (const name of sourceSheets) {
      expect(outSheets).toContain(name);
    }
  });

  it("does NOT modify non-editable cells (header row, system rows, un-priced data rows)", async () => {
    const sourceSheets = readExcelFile(FIX_2024).sheets;
    const sourceCommercial = sourceSheets["7 Commercial Envelope"];

    const outPath = join(workDir, "filled-2024-untouched.xlsx");
    await fillBoQTemplate({
      sourceWorkbookPath: FIX_2024,
      lineItems: [{ itemNumber: "7.1", unitPrice: 999, currency: "USD" }],
      outputPath: outPath,
      templateType: "type_a",
    });

    const outCommercial = readExcelFile(outPath).sheets["7 Commercial Envelope"];

    // exceljs may normalize \r\n → \n on round-trip; compare with newline-normalized values.
    const norm = (v: string) => String(v ?? "").replace(/\r\n/g, "\n");

    // Header row (idx 0): all cells equal.
    for (let c = 0; c < sourceCommercial[0].length; c++) {
      expect(norm(outCommercial[0][c])).toBe(norm(sourceCommercial[0][c]));
    }
    // Row 7.2 (idx 5) was NOT priced — non-editable cells (item#, name, description,
    // currency, qty, material#) must equal the source.
    const nonEditableIdx = [0, 1, 5, 8, 9, 10, 11]; // A, B, F, I, J, K, L
    for (const c of nonEditableIdx) {
      expect(norm(outCommercial[5][c])).toBe(norm(sourceCommercial[5][c]));
    }
    // The priced row (7.1, idx 4): only the editable price column (N=13) changed.
    expect(Number(outCommercial[4][13])).toBe(999);
    expect(norm(outCommercial[4][5])).toBe(norm(sourceCommercial[4][5])); // description untouched
    expect(norm(outCommercial[4][0])).toBe(norm(sourceCommercial[4][0])); // item# untouched
  });
});

describe("fillBoQTemplate — Aramco 2022 fixture (41-col layout)", () => {
  it("writes price into col M (idx 12) — the 2022 * Price column", async () => {
    const outPath = join(workDir, "filled-2022.xlsx");
    await fillBoQTemplate({
      sourceWorkbookPath: FIX_2022,
      lineItems: [{
        itemNumber: "6.1",
        unitPrice: 5500,
        currency: "SAR",
        leadTimeDays: 60,
        manufacturer: "Cisco",
        modelPartNumber: "CS-DESKPRO-K9",
        countryOfOrigin: "US",
      }],
      outputPath: outPath,
      templateType: "type_a",
    });

    const sheet = readExcelFile(outPath).sheets["6 Commercial Envelope"];
    const dataRow = sheet[4]; // row 5 (1-indexed)
    expect(dataRow[0]).toBe("6.1");
    // 2022 layout: col M (idx 12) = * Price, col N (idx 13) = Quantity
    expect(Number(dataRow[12])).toBe(5500);
    expect(Number(dataRow[13])).toBe(2); // pre-filled qty stays
    // 2022 layout: leadTime at col P (idx 15)
    expect(Number(dataRow[15])).toBe(60);
    // Manufacturer at col T (idx 19)
    expect(dataRow[19]).toBe("Cisco");
    // Model/Part at col V (idx 21)
    expect(dataRow[21]).toBe("CS-DESKPRO-K9");
    // Country at col X (idx 23)
    expect(dataRow[23]).toBe("US");
  });
});

describe("fillBoQTemplate — error cases", () => {
  it("throws for unsupported template types", async () => {
    await expect(
      fillBoQTemplate({
        sourceWorkbookPath: FIX_2024,
        lineItems: [],
        outputPath: join(workDir, "unused.xlsx"),
        templateType: "type_b",
      })
    ).rejects.toThrow(/type_b/);
  });

  it("validates input shape via zod", async () => {
    await expect(
      // @ts-expect-error — intentional invalid input
      fillBoQTemplate({ sourceWorkbookPath: 1, lineItems: [], outputPath: "x", templateType: "type_a" })
    ).rejects.toThrow();
  });
});

describe("fillFromPriced bridge — parse → price → fill round trip", () => {
  it("end-to-end: 2024 fixture parsed, mock-priced, refilled, re-parsed", async () => {
    const parsed = parseTypeA(readExcelFile(FIX_2024).sheets);
    expect(parsed.length).toBe(75);

    const priced: PricedLineItem[] = parsed.map((b, i) => ({
      itemNumber: b.itemNumber,
      unitPrice: 100 + i,
      currency: "USD",
      mpn: b.partNumber,
      intendToRespond: "Yes",
    }));

    const outPath = join(workDir, "filled-2024-e2e.xlsx");
    await fillBoQTemplate({
      sourceWorkbookPath: FIX_2024,
      lineItems: priced,
      outputPath: outPath,
      templateType: "type_a",
    });

    const refilled = parseTypeA(readExcelFile(outPath).sheets);
    expect(refilled.length).toBe(75);
    expect(refilled[0].unitPrice).toBe(100);
    expect(refilled[74].unitPrice).toBe(174);
  });
});

// Sanity check: exceljs is actually installed.
describe("exceljs availability", () => {
  it("can construct a Workbook", () => {
    const wb = new ExcelJS.Workbook();
    expect(wb).toBeDefined();
  });
});
