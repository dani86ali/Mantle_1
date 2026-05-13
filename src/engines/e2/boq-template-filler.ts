// Format-preserving BoQ template filler — writes priced values back into the
// client's original BoQ workbook so all formatting/formulas/protection stay intact.
// Uses exceljs (xlsx package would drop styles, merged cells, and data validation).

import ExcelJS from "exceljs";
import { z } from "zod";
import {
  ColMap, COLS_2022, COLS_2024, detectVersion, findCommercialSheetName,
} from "@/engines/e2/parsers/type-a-cols";

export interface PricedLineItem {
  itemNumber: string;
  unitPrice: number;
  currency: string;
  leadTimeDays?: number;
  mpn?: string;
  manufacturer?: string;
  modelPartNumber?: string;
  countryOfOrigin?: string;
  intendToRespond?: "Yes" | "No";
  remarks?: string;
}

export type BoQTemplateType =
  | "type_a" | "type_b" | "type_c" | "type_d" | "type_e";

export interface BoQFillInput {
  sourceWorkbookPath: string;
  lineItems: PricedLineItem[];
  outputPath: string;
  templateType: BoQTemplateType;
}

const InputSchema = z.object({
  sourceWorkbookPath: z.string().min(1),
  outputPath: z.string().min(1),
  templateType: z.enum(["type_a", "type_b", "type_c", "type_d", "type_e"]),
  lineItems: z.array(z.object({
    itemNumber: z.string(),
    unitPrice: z.number(),
    currency: z.string(),
    leadTimeDays: z.number().optional(),
    mpn: z.string().optional(),
    manufacturer: z.string().optional(),
    modelPartNumber: z.string().optional(),
    countryOfOrigin: z.string().optional(),
    intendToRespond: z.enum(["Yes", "No"]).optional(),
    remarks: z.string().optional(),
  })),
});

const ITEM_NUM_RE = /^\d+\.\d+$/;
// Helper-text fragment Aramba expects in col U (MPN) before the actual OEM PN
// is entered below — see DV_area_4 in BoQ_Template_Patterns.md.
const MPN_OTHERS_TOKEN = "OTHERS";

export async function fillBoQTemplate(input: BoQFillInput): Promise<string> {
  InputSchema.parse(input);
  if (input.templateType !== "type_a") {
    throw new Error(
      `fillBoQTemplate: template type '${input.templateType}' not yet supported`
    );
  }

  const workbook = await loadWorkbook(input.sourceWorkbookPath);
  const sheetName = findCommercialSheetName(workbook.worksheets.map((w) => w.name));
  if (!sheetName) {
    throw new Error(
      `No 'Commercial Envelope' sheet in source workbook ${input.sourceWorkbookPath}`
    );
  }
  const ws = workbook.getWorksheet(sheetName);
  if (!ws) throw new Error(`Worksheet '${sheetName}' not found after lookup`);

  const headerWidth = ws.getRow(1).actualCellCount;
  const cols = detectVersion(sheetName, headerWidth);

  const byItem = indexByItemNumber(input.lineItems);
  const itemNumCol = cols.itemNum + 1; // exceljs is 1-indexed

  // Walk data rows (row 5 onward — rows 1-4 are system rows).
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 5) return;
    const itemNumCell = row.getCell(itemNumCol);
    const itemNum = stringifyCell(itemNumCell.value).trim();
    if (!ITEM_NUM_RE.test(itemNum)) return;
    const priced = byItem.get(itemNum);
    if (!priced) return;
    fillRow(row, priced, cols);
  });

  await workbook.xlsx.writeFile(input.outputPath);
  return input.outputPath;
}

async function loadWorkbook(path: string): Promise<ExcelJS.Workbook> {
  // Ariba files are sometimes sheet-protected but not file-encrypted; exceljs
  // reads protected workbooks transparently. If the file is genuinely encrypted,
  // exceljs throws — surface the error rather than silently producing a blank.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb;
}

function indexByItemNumber(items: PricedLineItem[]): Map<string, PricedLineItem> {
  const m = new Map<string, PricedLineItem>();
  for (const it of items) m.set(it.itemNumber, it);
  return m;
}

function fillRow(
  row: ExcelJS.Row,
  priced: PricedLineItem,
  cols: ColMap,
): void {
  // Only touch the editable cells listed in BoQ_Template_Patterns.md.
  setIfProvided(row, cols.intendToRespond, priced.intendToRespond ?? "Yes");
  setNumber(row, cols.unitPrice, priced.unitPrice);
  if (priced.leadTimeDays !== undefined) {
    setNumber(row, cols.leadTime, priced.leadTimeDays);
  }
  if (priced.mpn) {
    // MPN column accepts the OEM part number directly; Ariba's dropdown also
    // permits the 'OTHERS' sentinel when free-text follows. Send the raw MPN —
    // dropdowns coerce on load and 'OTHERS' is only required if the value
    // isn't in DV_area_4's whitelist (which is just the sentinel anyway).
    setIfProvided(row, cols.mpn, priced.mpn || MPN_OTHERS_TOKEN);
  }
  setIfProvided(row, cols.manufacturer, priced.manufacturer);
  setIfProvided(row, cols.modelPartNum, priced.modelPartNumber);
  setIfProvided(row, cols.countryOfOrigin, priced.countryOfOrigin);
  setIfProvided(row, cols.remarks, priced.remarks);
}

function setIfProvided(row: ExcelJS.Row, colIdx0: number, value: string | undefined): void {
  if (value === undefined || value === "") return;
  row.getCell(colIdx0 + 1).value = value;
}

function setNumber(row: ExcelJS.Row, colIdx0: number, value: number): void {
  row.getCell(colIdx0 + 1).value = value;
}

function stringifyCell(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "result" in v && v.result !== undefined) {
    return String(v.result);
  }
  if (typeof v === "object" && "richText" in v && Array.isArray(v.richText)) {
    return v.richText.map((r) => r.text).join("");
  }
  if (typeof v === "object" && "text" in v) return String(v.text);
  return "";
}
