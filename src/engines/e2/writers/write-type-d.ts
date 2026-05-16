// Type D (BoM, no price) writeback. Active BoQ sheet has A=lineNum, B=partNum,
// C=desc, D=svcDur, E=qty — no price columns. We write into F (unit) and
// G (extended). Walk filter mirrors type-d-bom.ts: skip group headers and
// rows without a numeric qty.

import ExcelJS from "exceljs";
import { parseNum, readCell, type PricedFillLine } from "./excel-cell";

const COL = {
  lineNum: 0, partNum: 1, desc: 2, svcDur: 3, qty: 4,
  priceUnit: 5, // F — first free column after E=qty
  priceExt: 6,  // G
} as const;

const GROUP_RE = /^Group Name:\s*(.+)/i;

export async function writeTypeD(
  sourceFilePath: string,
  pricedLines: PricedFillLine[],
  outputPath: string,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sourceFilePath);
  const ws = wb.getWorksheet("Active BoQ");
  if (!ws) throw new Error('Type D writer: no "Active BoQ" sheet in workbook');
  let ordinal = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const lineNum = readCell(row, COL.lineNum);
    if (GROUP_RE.test(lineNum)) return;
    if (!lineNum) return;
    if (parseNum(readCell(row, COL.qty)) === undefined) return;
    const priced = pricedLines[ordinal++];
    if (!priced) return;
    row.getCell(COL.priceUnit + 1).value = priced.unitPrice;
    row.getCell(COL.priceExt + 1).value = priced.unitPrice * priced.qty;
  });
  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}
