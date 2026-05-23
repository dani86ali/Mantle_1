/**
 * First Mantle priced-output writer slice: model + committed template -> .xlsx.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (10. Priced Output Contract - Mantle is the structural template).
 *
 * Opens the committed sanitized Mantle template, locates its fixed layout with
 * {@link locateMantlePriceEstimateLayout}, and writes a MantlePriceEstimateModel
 * into the known Price Estimate cells/rows - it does NOT rebuild a workbook from
 * scratch. Sheet names, column widths, structural merges, styles, and formula
 * scaffolding are preserved; line rows inherit the template data-row style/height.
 * BOMATIC-computed values are written as direct values or as formula cached
 * results, never trusting Excel to recalculate.
 *
 * Narrow by design: imports only exceljs, node path, and the existing Mantle
 * locator/model types. No DB, catalog, SKU, approvals, staleness, API/UI,
 * coordinator, engines, legacy exporters, or Project artifact creation.
 */
import path from "path";
import ExcelJS from "exceljs";
import { locateMantlePriceEstimateLayout } from "@/lib/projects/mantle-layout-locator";
import type {
  MantlePriceEstimateModel,
  MantlePriceEstimateRow,
} from "@/lib/projects/mantle-price-estimate-model";

// Exact guard messages; callers and tests may assert on these verbatim.
const BLANK_OUTPUT_MESSAGE = "Mantle workbook output path is required.";
const EMPTY_ROWS_MESSAGE = "Mantle workbook requires at least one row.";

/** The committed sanitized Mantle/STC production template. */
export const DEFAULT_MANTLE_TEMPLATE_PATH = path.join(
  process.cwd(),
  "src/templates/mantle/Mantle_Priced_BoQBoM.template.xlsx"
);

/** Read-only input for {@link writeMantlePriceEstimateWorkbook}. */
export interface WriteMantlePriceEstimateWorkbookInput {
  model: MantlePriceEstimateModel;
  outputPath: string;
  templatePath?: string;
  projectId?: string;
  dealId?: string;
  priceList?: string;
}

/** Convert a 1-based column index to its A1 letter (1 -> "A", 27 -> "AA"). */
function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Parse an A1 address ("K79") into 1-based row/column. */
function parseAddress(address: string): { row: number; col: number } {
  const match = /^([A-Za-z]+)(\d+)$/.exec(address);
  if (!match) return { row: 0, col: 0 };
  let col = 0;
  for (const ch of match[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(match[2]), col };
}

/** Restrained status/warning suffix appended to unpriced row descriptions. */
function describeStatus(row: MantlePriceEstimateRow): string {
  const base = row.description;
  if (row.status === "priced") return base;
  const suffix = row.warning
    ? `[status: ${row.status}; warning: ${row.warning}]`
    : `[status: ${row.status}]`;
  return `${base} ${suffix}`;
}

/** Copy the reference data-row height and per-column style into a target row. */
function applyTemplateRowStyle(
  worksheet: ExcelJS.Worksheet,
  reference: ExcelJS.Row,
  targetRowNumber: number,
  columnCount: number
): void {
  const target = worksheet.getRow(targetRowNumber);
  target.height = reference.height;
  for (let c = 1; c <= columnCount; c += 1) {
    target.getCell(c).style = reference.getCell(c).style;
  }
}

/**
 * Unmerge the benchmark's content-specific full-width separator bands inside the
 * data region so line rows can be written contiguously. Structural merges outside
 * the data band (title, header, summary, disclaimer) are left untouched.
 */
function clearDataBandMerges(
  worksheet: ExcelJS.Worksheet,
  dataStartRow: number,
  footerStartRow: number,
  columnCount: number
): void {
  for (const range of [...worksheet.model.merges]) {
    const [startRef, endRef] = range.split(":");
    const start = parseAddress(startRef);
    const end = parseAddress(endRef ?? startRef);
    const inBand = start.row >= dataStartRow && start.row < footerStartRow;
    const fullWidth = start.col <= 1 && end.col >= columnCount;
    if (inBand && fullWidth) worksheet.unMergeCells(range);
  }
}

/** Write one model row's cells into the given worksheet row. */
function writeRow(
  worksheet: ExcelJS.Worksheet,
  columns: Record<string, number>,
  rowNumber: number,
  row: MantlePriceEstimateRow
): void {
  const set = (header: string, value: ExcelJS.CellValue) => {
    worksheet.getRow(rowNumber).getCell(columns[header]).value = value;
  };

  set("Part Number", row.partNumber);
  set("Smart Account Mandatory", row.smartAccountMandatory);
  set("Description", describeStatus(row));
  set("Service Duration (Months)", row.serviceDurationMonths);
  set("Estimated Lead Time (Days)", row.estimatedLeadTimeDays);
  set("Pricing Term", row.pricingTerm);
  set("Qty", row.quantity);

  if (row.status === "priced" && row.extendedNetPriceSar !== null) {
    const listCol = columnLetter(columns["Unit List Price"]);
    const discCol = columnLetter(columns["Disc(%)"]);
    const qtyCol = columnLetter(columns.Qty);
    const netCol = columnLetter(columns["Unit Net Price"]);
    set("Unit List Price", row.unitListPriceSar);
    set("Disc(%)", row.discountPercent);
    // Preserve the Mantle net/extended formulas, but cache the BOMATIC value.
    worksheet.getRow(rowNumber).getCell(columns["Unit Net Price"]).value = {
      formula: `ROUND(${listCol}${rowNumber}-((${listCol}${rowNumber}*${discCol}${rowNumber})/100),2)`,
      result: row.unitNetPriceSar ?? undefined,
    };
    worksheet.getRow(rowNumber).getCell(columns["Extended Net Price"]).value = {
      formula: `ROUND((${qtyCol}${rowNumber} * ${netCol}${rowNumber}),2)`,
      result: row.extendedNetPriceSar,
    };
    return;
  }

  // Unpriced rows: keep them in place with blank price cells.
  set("Unit List Price", null);
  set("Unit Net Price", null);
  set("Disc(%)", null);
  set("Extended Net Price", null);
}

/** Write a formula cell with an explicit BOMATIC-computed cached result. */
function writeFormulaCell(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnNumber: number,
  formula: string,
  result: number
): void {
  worksheet.getRow(rowNumber).getCell(columnNumber).value = { formula, result };
}

/** Build a SUM formula over K-column references; "0" when no rows match. */
function sumFormula(letter: string, rowNumbers: number[]): string {
  if (rowNumbers.length === 0) return "0";
  return `SUM(${rowNumbers.map((r) => `${letter}${r}`).join(",")})`;
}

/** Blank every Mantle data column in the inclusive row range. */
function clearDataRows(
  worksheet: ExcelJS.Worksheet,
  fromRow: number,
  toRow: number,
  columnCount: number
): void {
  for (let r = fromRow; r <= toRow; r += 1) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= columnCount; c += 1) {
      row.getCell(c).value = null;
    }
  }
}

/**
 * Write the Mantle Price Estimate model into the committed template and save it
 * to outputPath, returning that path. Validates inputs, opens the template,
 * locates the fixed layout, writes line rows from layout.dataStartRowNumber in
 * model order (inserting rows before the footer when the model exceeds the
 * template's data area), and fills metadata and category/footer totals. The input
 * model is never mutated; the customer-uploaded workbook is never touched.
 */
export async function writeMantlePriceEstimateWorkbook(
  input: WriteMantlePriceEstimateWorkbookInput
): Promise<string> {
  const { model, outputPath, templatePath, projectId, dealId, priceList } = input;

  if (typeof outputPath !== "string" || outputPath.trim() === "") {
    throw new Error(BLANK_OUTPUT_MESSAGE);
  }
  if (model.rows.length === 0) throw new Error(EMPTY_ROWS_MESSAGE);

  const sourcePath = templatePath ?? DEFAULT_MANTLE_TEMPLATE_PATH;
  const layout = await locateMantlePriceEstimateLayout(sourcePath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const worksheet = workbook.getWorksheet(layout.sheetName);
  if (!worksheet) throw new Error("Mantle workbook must contain a Price Estimate sheet.");

  const columns: Record<string, number> = {};
  for (const column of layout.columns) columns[column.header] = column.columnNumber;
  const columnCount = layout.columns.reduce((m, c) => Math.max(m, c.columnNumber), 0);

  const dataStartRow = layout.dataStartRowNumber;
  const footerStartRow = layout.footerRows.reduce(
    (min, f) => Math.min(min, f.rowNumber),
    Number.POSITIVE_INFINITY
  );

  clearDataBandMerges(worksheet, dataStartRow, footerStartRow, columnCount);

  // Insert rows before the footer when the model needs more than the data area.
  const availableRows = footerStartRow - dataStartRow;
  const insertedCount = Math.max(0, model.rows.length - availableRows);
  if (insertedCount > 0) {
    const blanks: unknown[][] = Array.from({ length: insertedCount }, () => []);
    worksheet.spliceRows(footerStartRow, 0, ...(blanks as ExcelJS.CellValue[][]));
  }

  const referenceRow = worksheet.getRow(dataStartRow);
  model.rows.forEach((row, index) => {
    const rowNumber = dataStartRow + index;
    applyTemplateRowStyle(worksheet, referenceRow, rowNumber, columnCount);
    writeRow(worksheet, columns, rowNumber, row);
  });

  // Blank every data column on rows below the model's last row and above the
  // (possibly shifted) footer so the output carries no leftover benchmark formulas
  // or text. When insertedCount > 0 the model exactly fills the expanded data
  // area and this range is empty.
  const lastWrittenRow = dataStartRow + model.rows.length - 1;
  const shiftedFooterStart = footerStartRow + insertedCount;
  clearDataRows(worksheet, lastWrittenRow + 1, shiftedFooterStart - 1, columnCount);

  // Header / summary metadata - leave absent fields blank.
  const summary = layout.summaryCells;
  if (projectId !== undefined && summary.projectId) {
    worksheet.getCell(summary.projectId.valueAddress).value = projectId;
  }
  if (dealId !== undefined && summary.dealId) {
    worksheet.getCell(summary.dealId.valueAddress).value = dealId;
  }
  if (priceList !== undefined && summary.priceList) {
    worksheet.getCell(summary.priceList.valueAddress).value = priceList;
  }

  // Group the worksheet rows of priced lines by their resolved Mantle category so
  // the rebuilt footer formulas reference the actual written rows, not the
  // benchmark's stale row list.
  const productRows: number[] = [];
  const serviceRows: number[] = [];
  const subscriptionRows: number[] = [];
  model.rows.forEach((row, index) => {
    if (row.status !== "priced") return;
    const rowNumber = dataStartRow + index;
    if (row.category === "service") serviceRows.push(rowNumber);
    else if (row.category === "subscription") subscriptionRows.push(rowNumber);
    else productRows.push(rowNumber);
  });

  // Footer totals live in the Extended Net Price column; each footer row shifts
  // down by insertedCount. Formulas reference the written category rows; cached
  // results come from model.totals so Excel recalc cannot drift them.
  const totalCol = columns["Extended Net Price"];
  const totalColLetter = columnLetter(totalCol);
  const footerRowFor: Record<string, number> = {};
  for (const footer of layout.footerRows) {
    footerRowFor[footer.label] = footer.rowNumber + insertedCount;
  }

  writeFormulaCell(
    worksheet,
    footerRowFor["Product Total"],
    totalCol,
    sumFormula(totalColLetter, productRows),
    model.totals.productTotalSar
  );
  writeFormulaCell(
    worksheet,
    footerRowFor["Service Total :"],
    totalCol,
    sumFormula(totalColLetter, serviceRows),
    model.totals.serviceTotalSar
  );
  writeFormulaCell(
    worksheet,
    footerRowFor["Subscription Total"],
    totalCol,
    sumFormula(totalColLetter, subscriptionRows),
    model.totals.subscriptionTotalSar
  );
  // Total Price sums the three (shifted) category footer cells, not the line rows.
  const productFooterRef = `${totalColLetter}${footerRowFor["Product Total"]}`;
  const serviceFooterRef = `${totalColLetter}${footerRowFor["Service Total :"]}`;
  const subscriptionFooterRef = `${totalColLetter}${footerRowFor["Subscription Total"]}`;
  writeFormulaCell(
    worksheet,
    footerRowFor["Total Price:"],
    totalCol,
    `${productFooterRef}+${serviceFooterRef}+${subscriptionFooterRef}`,
    model.totals.totalPriceSar
  );

  // Top summary category cells reference the shifted footer total cells, with
  // BOMATIC cached results so the displayed value never depends on Excel recalc.
  const summaryTargets: Array<[keyof typeof summary, string, number]> = [
    ["hardwareTotal", productFooterRef, model.totals.productTotalSar],
    ["servicesTotal", serviceFooterRef, model.totals.serviceTotalSar],
    ["subscriptionTotal", subscriptionFooterRef, model.totals.subscriptionTotalSar],
  ];
  for (const [key, formula, result] of summaryTargets) {
    const cell = summary[key];
    if (!cell) continue;
    const { row, col } = parseAddress(cell.valueAddress);
    writeFormulaCell(worksheet, row, col, formula, result);
  }

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}
