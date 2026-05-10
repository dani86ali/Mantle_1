import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as XLSX from "xlsx";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { readExcelFile } from "@/lib/io/excel-reader";

let tmpDir: string;
let xlsxPath: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bomatic-reader-"));
  xlsxPath = join(tmpDir, "fixture.xlsx");

  const wb = XLSX.utils.book_new();
  const sheet1 = XLSX.utils.aoa_to_sheet([
    ["Part Number", "Qty", "Unit Price"],
    ["C9300-48P-E", 5, 8000.5],
    ["AIR-AP-T-RAIL-R", 2, 15],
    ["", "", ""],
  ]);
  const sheet2 = XLSX.utils.aoa_to_sheet([
    ["Header A", "Header B"],
    ["foo", true],
  ]);
  XLSX.utils.book_append_sheet(wb, sheet1, "MAIN BOQ");
  XLSX.utils.book_append_sheet(wb, sheet2, "Notes");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  await writeFile(xlsxPath, buf);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("readExcelFile", () => {
  it("returns sheet names in workbook order", () => {
    const result = readExcelFile(xlsxPath);
    expect(result.sheetNames).toEqual(["MAIN BOQ", "Notes"]);
  });

  it("returns the file basename", () => {
    const result = readExcelFile(xlsxPath);
    expect(result.fileName).toBe("fixture.xlsx");
  });

  it("returns sheets keyed by name with string[][] shape", () => {
    const result = readExcelFile(xlsxPath);
    expect(Array.isArray(result.sheets["MAIN BOQ"])).toBe(true);
    for (const row of result.sheets["MAIN BOQ"]) {
      expect(Array.isArray(row)).toBe(true);
      for (const cell of row) {
        expect(typeof cell).toBe("string");
      }
    }
  });

  it("coerces numeric cells to strings", () => {
    const result = readExcelFile(xlsxPath);
    const dataRow = result.sheets["MAIN BOQ"][1];
    expect(dataRow[0]).toBe("C9300-48P-E");
    expect(dataRow[1]).toBe("5");
    expect(dataRow[2]).toBe("8000.5");
  });

  it("coerces boolean cells to strings", () => {
    const result = readExcelFile(xlsxPath);
    const dataRow = result.sheets["Notes"][1];
    expect(dataRow[0]).toBe("foo");
    expect(dataRow[1]).toBe("true");
  });

  it("preserves blank cells as empty strings", () => {
    const result = readExcelFile(xlsxPath);
    const blankRow = result.sheets["MAIN BOQ"][3];
    expect(blankRow.every((c) => c === "")).toBe(true);
  });

  it("throws on empty filePath", () => {
    expect(() => readExcelFile("")).toThrow();
  });
});
