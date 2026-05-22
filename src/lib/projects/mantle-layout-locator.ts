/**
 * Read-only layout locator for the Mantle "Price Estimate" priced BoQ/BoM sheet.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (10. Priced Output Contract - Mantle is the structural template).
 *
 * Locates the fixed contract points a later Mantle writer will fill: sheet name,
 * the 11 column headers and their 1-based columns, the data start row, the top
 * summary label/value cells, and the footer total rows. Returns deterministic
 * plain data only (row/column numbers and cell address strings) - never the
 * workbook, file path, timestamps, or parsed business values - so two locates of
 * the same file are deep-equal.
 *
 * Pure read-only. Imports only `exceljs`; generates no workbook, creates no
 * artifact, imports no DB/Project artifact/pricing/catalog/SKU service, API/UI,
 * or legacy engine; never mutates the workbook on disk.
 */
import ExcelJS from "exceljs";

// Exact guard/error messages; callers and tests may assert on these verbatim.
const BLANK_PATH_MESSAGE = "Mantle workbook path is required.";
const MISSING_SHEET_MESSAGE = "Mantle workbook must contain a Price Estimate sheet.";
const MISSING_HEADER_MESSAGE = "Mantle Price Estimate header row was not found.";
const MISSING_FOOTER_MESSAGE = "Mantle Price Estimate footer rows were not found.";

/** The Mantle priced-output worksheet name. */
export const MANTLE_PRICE_ESTIMATE_SHEET_NAME = "Price Estimate";

/** The 11 Mantle column headers, in their exact left-to-right order. */
export const MANTLE_PRICE_ESTIMATE_HEADERS = [
  "Part Number",
  "Smart Account Mandatory",
  "Description",
  "Service Duration (Months)",
  "Estimated Lead Time (Days)",
  "Unit List Price",
  "Pricing Term",
  "Qty",
  "Unit Net Price",
  "Disc(%)",
  "Extended Net Price",
] as const;

/** The four Mantle footer total labels, with their exact (benchmark) spacing. */
export const MANTLE_PRICE_ESTIMATE_FOOTER_LABELS = [
  "Product Total",
  "Service Total :",
  "Subscription Total",
  "Total Price:",
] as const;

/** Where a summary value sits relative to its label cell. */
export type MantleSummaryValuePosition = "right" | "below";

/** Identifier for a top summary/value pair. */
export type MantleSummaryFieldKey =
  | "hardwareTotal" | "servicesTotal" | "subscriptionTotal"
  | "projectId" | "dealId" | "priceList";

/** A top summary field: its key, exact label text, and value position. */
export interface MantleSummaryFieldSpec { key: MantleSummaryFieldKey; label: string; valuePosition: MantleSummaryValuePosition; }

/**
 * Top summary label/value pairs from the benchmark. The category totals carry
 * their value directly below the label; the id/price-list fields to the right.
 */
export const MANTLE_SUMMARY_FIELDS: readonly MantleSummaryFieldSpec[] = [
  { key: "hardwareTotal", label: "Hardware", valuePosition: "below" },
  { key: "servicesTotal", label: "Services", valuePosition: "below" },
  { key: "subscriptionTotal", label: "Subscription", valuePosition: "below" },
  { key: "projectId", label: "Project ID:", valuePosition: "right" },
  { key: "dealId", label: "Deal ID:", valuePosition: "right" },
  { key: "priceList", label: "Price List:", valuePosition: "right" },
];

/** A header's exact text and the 1-based column it occupies. */
export interface MantleColumnLocation { header: string; columnNumber: number; }

/** A footer total row: its exact label, row number, and label/value addresses. */
export interface MantleFooterRow {
  label: string;
  rowNumber: number;
  labelAddress: string;
  valueAddress: string;
}

/** A located summary label cell and its paired value cell. */
export interface MantleSummaryCell { labelAddress: string; valueAddress: string; }

/** Deterministic layout of the Mantle Price Estimate sheet. */
export interface MantlePriceEstimateLayout {
  sheetName: string;
  headerRowNumber: number;
  dataStartRowNumber: number;
  columns: MantleColumnLocation[];
  footerRows: MantleFooterRow[];
  summaryCells: Partial<Record<MantleSummaryFieldKey, MantleSummaryCell>>;
}

/**
 * Cell text as a trimmed string; merge slaves and blank cells read as "". Uses
 * ExcelJS `cell.text`, which resolves formula results - so a formula-backed value
 * cell (the benchmark footer totals) reads as non-empty rather than skipped.
 */
function cellText(cell: ExcelJS.Cell): string {
  if (cell.type === ExcelJS.ValueType.Merge) return "";
  const value = cell.value;
  if (value === null || value === undefined) return "";
  return String(cell.text).trim();
}

/** Locate the header row by the 11 headers appearing in order; null if absent. */
function findHeaderRow(worksheet: ExcelJS.Worksheet): { rowNumber: number; startColumn: number } | null {
  const headerCount = MANTLE_PRICE_ESTIMATE_HEADERS.length;
  for (let r = 1; r <= worksheet.rowCount; r += 1) {
    const row = worksheet.getRow(r);
    for (let start = 1; start + headerCount - 1 <= worksheet.columnCount; start += 1) {
      let matched = true;
      for (let i = 0; i < headerCount; i += 1) {
        if (cellText(row.getCell(start + i)) !== MANTLE_PRICE_ESTIMATE_HEADERS[i]) {
          matched = false;
          break;
        }
      }
      if (matched) return { rowNumber: r, startColumn: start };
    }
  }
  return null;
}

/** First cell (row-major) in [fromRow, toRow] whose text equals label; null otherwise. */
function findLabelCell(
  worksheet: ExcelJS.Worksheet,
  label: string,
  fromRow: number,
  toRow: number
): { rowNumber: number; columnNumber: number } | null {
  for (let r = fromRow; r <= toRow; r += 1) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= worksheet.columnCount; c += 1) {
      if (cellText(row.getCell(c)) === label) return { rowNumber: r, columnNumber: c };
    }
  }
  return null;
}

/** Address of the value cell for a label at (row, col), per its value position. */
function valueAddressFor(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnNumber: number,
  position: MantleSummaryValuePosition
): string {
  if (position === "below") {
    return worksheet.getRow(rowNumber + 1).getCell(columnNumber).address;
  }
  const row = worksheet.getRow(rowNumber);
  for (let c = columnNumber + 1; c <= worksheet.columnCount; c += 1) {
    if (cellText(row.getCell(c)) !== "") return row.getCell(c).address;
  }
  return row.getCell(columnNumber + 1).address;
}

/**
 * Locate the Mantle Price Estimate layout. Read-only: the file is opened, never
 * written. Errors short-circuit in order - blank path, missing sheet, missing
 * header row, any missing footer label - each with its exact message; missing or
 * unreadable files let the exceljs read error bubble unchanged. Top summary cells
 * are included only when their label is present above the header row.
 */
export async function locateMantlePriceEstimateLayout(
  filePath: string
): Promise<MantlePriceEstimateLayout> {
  if (!filePath || filePath.trim() === "") throw new Error(BLANK_PATH_MESSAGE);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.getWorksheet(MANTLE_PRICE_ESTIMATE_SHEET_NAME);
  if (!worksheet) throw new Error(MISSING_SHEET_MESSAGE);

  const header = findHeaderRow(worksheet);
  if (!header) throw new Error(MISSING_HEADER_MESSAGE);

  const headerRowNumber = header.rowNumber;
  const dataStartRowNumber = headerRowNumber + 1;
  const columns: MantleColumnLocation[] = MANTLE_PRICE_ESTIMATE_HEADERS.map((headerText, i) => ({
    header: headerText,
    columnNumber: header.startColumn + i,
  }));

  const footerRows: MantleFooterRow[] = [];
  for (const label of MANTLE_PRICE_ESTIMATE_FOOTER_LABELS) {
    const found = findLabelCell(worksheet, label, dataStartRowNumber, worksheet.rowCount);
    if (!found) throw new Error(MISSING_FOOTER_MESSAGE);
    footerRows.push({
      label,
      rowNumber: found.rowNumber,
      labelAddress: worksheet.getRow(found.rowNumber).getCell(found.columnNumber).address,
      valueAddress: valueAddressFor(worksheet, found.rowNumber, found.columnNumber, "right"),
    });
  }

  const summaryCells: Partial<Record<MantleSummaryFieldKey, MantleSummaryCell>> = {};
  for (const field of MANTLE_SUMMARY_FIELDS) {
    const found = findLabelCell(worksheet, field.label, 1, headerRowNumber - 1);
    if (!found) continue;
    summaryCells[field.key] = {
      labelAddress: worksheet.getRow(found.rowNumber).getCell(found.columnNumber).address,
      valueAddress: valueAddressFor(worksheet, found.rowNumber, found.columnNumber, field.valuePosition),
    };
  }

  return {
    sheetName: worksheet.name,
    headerRowNumber,
    dataStartRowNumber,
    columns,
    footerRows,
    summaryCells,
  };
}
