import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { basename } from "path";

export interface ExcelReadResult {
  sheetNames: string[];
  sheets: Record<string, string[][]>;
  fileName: string;
}

function coerceCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function readExcelFile(filePath: string): ExcelReadResult {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("readExcelFile: filePath must be a non-empty string");
  }

  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetNames = wb.SheetNames.slice();
  const sheets: Record<string, string[][]> = {};

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) {
      sheets[name] = [];
      continue;
    }
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: true,
      raw: true,
    }) as unknown[][];
    sheets[name] = aoa.map((row) => row.map(coerceCell));
  }

  return { sheetNames, sheets, fileName: basename(filePath) };
}
