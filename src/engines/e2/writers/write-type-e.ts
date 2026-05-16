// Type E (Telecom RFQ) writeback. Source has E=UnitPrice already; we
// overwrite that and write the extended sell into J=NetAmount. Walk filter
// mirrors type-e-telecom.ts (both STC-defined and vendor-defined rows emit).

import ExcelJS from "exceljs";
import { parseNum, readCell, type PricedFillLine } from "./excel-cell";

const COL = {
  itemCode: 1, itemDesc: 2, uom: 3, unitPrice: 4,
  stcQty: 5, net: 9, stcDesc: 11,
} as const;

function findMain(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; headerIdx: number } {
  for (const ws of wb.worksheets) {
    const limit = Math.min(ws.rowCount, 20);
    for (let i = 1; i <= limit; i++) {
      const row = ws.getRow(i);
      const itemCode = readCell(row, COL.itemCode).toLowerCase();
      const unitPrice = readCell(row, COL.unitPrice).toLowerCase();
      if (itemCode.includes("item code") && unitPrice.includes("unit price")) {
        return { ws, headerIdx: i };
      }
    }
  }
  throw new Error(
    'Type E writer: no sheet with "Item Code" + "Unit Price" header found'
  );
}

export async function writeTypeE(
  sourceFilePath: string,
  pricedLines: PricedFillLine[],
  outputPath: string,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sourceFilePath);
  const { ws, headerIdx } = findMain(wb);
  let ordinal = 0;
  for (let r = headerIdx + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const itemCode = readCell(row, COL.itemCode);
    const itemDesc = readCell(row, COL.itemDesc);
    const uom = readCell(row, COL.uom);
    const unitPriceStr = readCell(row, COL.unitPrice);
    const stcDescVal = readCell(row, COL.stcDesc);

    const isStcDefined =
      stcDescVal !== "" &&
      itemCode === "" && itemDesc === "" && uom === "" && unitPriceStr === "";
    const isVendorItem = itemCode !== "" && itemDesc !== "";
    if (!isStcDefined && !isVendorItem) continue;

    if (isStcDefined && parseNum(readCell(row, COL.stcQty)) === undefined) continue;

    const priced = pricedLines[ordinal++];
    if (!priced) continue;
    row.getCell(COL.unitPrice + 1).value = priced.unitPrice;
    row.getCell(COL.net + 1).value = priced.unitPrice * priced.qty;
  }
  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}
