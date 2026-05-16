// Type B (NRM2) writeback. Source workbooks come in two variants:
//  - base ("MAIN BOQ" sheet, cols A=ref B=L1 C=L2 D=desc E=qty F=unit)
//  - addommit ("Bill02a*" sheet, cols A=ref B=L1 C=L2 D=desc E=oldQty F=newQty G=unit)
// Neither variant has price columns, so we write unit/extended price into the
// next two free columns. The walk filters mirror type-b-nrm2.ts parser exactly
// so ordinal[N] always lines up with parser's boqLines[N].

import ExcelJS from "exceljs";
import { parseNum, readCell, type PricedFillLine } from "./excel-cell";

const BASE = {
  ref: 0, b: 1, qty: 4,
  priceUnit: 6, // G — first free column after F=unit
  priceExt: 7,  // H
} as const;

const ADDOMMIT = {
  ref: 0, b: 1, oldQty: 4, newQty: 5,
  priceUnit: 7, // H — first free column after G=unit
  priceExt: 8,  // I
} as const;

const SECTION_REF_RE = /^\d+\.\d+$/;
const LINE_ITEM_REF_RE = /^[a-z]+$/;
const SUBTOTAL_RE = /carried to collection/i;

type Variant = "base" | "addommit";

function findSheet(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; variant: Variant } {
  for (const ws of wb.worksheets) {
    if (ws.name === "MAIN BOQ") return { ws, variant: "base" };
  }
  for (const ws of wb.worksheets) {
    if (ws.name.startsWith("Bill02a")) return { ws, variant: "addommit" };
  }
  throw new Error('Type B writer: no "MAIN BOQ" or "Bill02a*" sheet in workbook');
}

function isEmittedRow(row: ExcelJS.Row, variant: Variant): boolean {
  const cols = variant === "base" ? BASE : ADDOMMIT;
  const ref = readCell(row, cols.ref);
  if (SUBTOTAL_RE.test(readCell(row, cols.b))) return false;
  if (SECTION_REF_RE.test(ref)) return false;
  if (!LINE_ITEM_REF_RE.test(ref)) return false;
  if (variant === "base") {
    return parseNum(readCell(row, BASE.qty)) !== undefined;
  }
  const oldQ = parseNum(readCell(row, ADDOMMIT.oldQty));
  const newQ = parseNum(readCell(row, ADDOMMIT.newQty));
  return oldQ !== undefined || newQ !== undefined;
}

export async function writeTypeB(
  sourceFilePath: string,
  pricedLines: PricedFillLine[],
  outputPath: string,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sourceFilePath);
  const { ws, variant } = findSheet(wb);
  const cols = variant === "base" ? BASE : ADDOMMIT;
  let ordinal = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (!isEmittedRow(row, variant)) return;
    const priced = pricedLines[ordinal++];
    if (!priced) return;
    row.getCell(cols.priceUnit + 1).value = priced.unitPrice;
    row.getCell(cols.priceExt + 1).value = priced.unitPrice * priced.qty;
  });
  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}
