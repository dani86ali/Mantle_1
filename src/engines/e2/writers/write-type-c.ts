// Type C (Vendor Quote) writeback. The source already has unit/total price
// columns (E=U.Price, F=T.Price) — we overwrite them with the priced values.
// Walk filter mirrors type-c-vendor-quote.ts so ordinal[N] == parser's items[N].

import ExcelJS from "exceljs";
import { parseNum, readCell, type PricedFillLine } from "./excel-cell";

const COL = {
  sNo: 1, desc: 2, qty: 3,
  unitPrice: 4, totalPrice: 5,
} as const;

const ITEM_NUM_RE = /^\d+\.\d+$/;

function findHeaderRowIndex(ws: ExcelJS.Worksheet): number {
  for (let i = 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const qty = readCell(row, COL.qty).toUpperCase();
    const price = readCell(row, COL.unitPrice).toLowerCase();
    if (qty === "QTY" && price.includes("price")) return i;
  }
  return -1;
}

export async function writeTypeC(
  sourceFilePath: string,
  pricedLines: PricedFillLine[],
  outputPath: string,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sourceFilePath);
  let ordinal = 0;
  let touchedAnySheet = false;
  for (const ws of wb.worksheets) {
    const headerIdx = findHeaderRowIndex(ws);
    if (headerIdx === -1) continue;
    touchedAnySheet = true;
    for (let r = headerIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const sNo = readCell(row, COL.sNo);
      const desc = readCell(row, COL.desc);
      const qtyStr = readCell(row, COL.qty);
      if (!sNo && !desc) continue;
      if (qtyStr.toUpperCase() === "QTY") continue;
      if (!ITEM_NUM_RE.test(sNo)) continue;
      if (parseNum(qtyStr) === undefined) continue;
      const priced = pricedLines[ordinal++];
      if (!priced) continue;
      row.getCell(COL.unitPrice + 1).value = priced.unitPrice;
      row.getCell(COL.totalPrice + 1).value = priced.unitPrice * priced.qty;
    }
  }
  if (!touchedAnySheet) {
    throw new Error('Type C writer: no sheet with QTY/U.Price header found');
  }
  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}
