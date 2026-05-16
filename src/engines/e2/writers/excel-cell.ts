// Shared ExcelJS cell helpers + the input shape every writer accepts.
// Each writer walks the source workbook in the same order as its matching
// parser, then writes priced[ordinal] back into the row at parser-emit time.

import type ExcelJS from "exceljs";

export interface PricedFillLine {
  itemNumber: string;
  partNumber?: string;
  unitPrice: number;
  qty: number;
}

export function cellValueToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v).trim();
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return String(v.result).trim();
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("").trim();
    }
    if ("text" in v) return String(v.text).trim();
  }
  return "";
}

export function readCell(row: ExcelJS.Row, colIdx0: number): string {
  return cellValueToString(row.getCell(colIdx0 + 1).value);
}

export function parseNum(s: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
}
