/**
 * Read-only structural inspector for Mantle-style priced BoQ/BoM workbooks.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * (10. Priced Output Contract - Mantle is the structural template).
 *
 * PURPOSE: produce a deterministic structural snapshot used by later Mantle
 * golden-structure tests. It captures SHAPE (sheet order, row/column counts,
 * column widths, merged ranges, formula locations, cell-population/style counts)
 * - NOT data. It deliberately omits full cell values, timestamps, absolute
 * paths, and workbook metadata so two inspections of the same file are
 * deep-equal.
 *
 * SCOPE: pure read-only. Imports only `exceljs`. Performs no export generation,
 * no artifact creation, and imports no DB store, Project artifact/pricing/catalog
 * service, API/UI, or legacy engine. It never mutates the workbook on disk.
 */
import ExcelJS from "exceljs";

// Exact guard message; callers/tests may assert on this verbatim.
const BLANK_PATH_MESSAGE = "Mantle workbook path is required.";

/** A single column's width, addressed by its 1-based column index. */
export interface MantleWorksheetColumnSnapshot {
  /** 1-based column index (column A is 1). */
  index: number;
  /** Column width as stored in the workbook. */
  width: number;
}

/** A formula cell location and its formula text (no computed result). */
export interface MantleFormulaCellSnapshot {
  /** Cell address, e.g. "F12". */
  address: string;
  /** Formula text without a leading "=". */
  formula: string;
}

/** Deterministic structural snapshot of one worksheet. */
export interface MantleWorksheetSnapshot {
  /** Sheet name. */
  name: string;
  /** Row number of the last row that has values. */
  rowCount: number;
  /** Count of rows that have values (mid-document blanks excluded). */
  actualRowCount: number;
  /** Maximum cell count across rows. */
  columnCount: number;
  /** Count of columns that have values. */
  actualColumnCount: number;
  /** Columns carrying an explicit width, by 1-based index, ascending. */
  columnWidths: MantleWorksheetColumnSnapshot[];
  /** Merged cell ranges as strings, sorted by top-left cell. */
  mergedRanges: string[];
  /** Formula cells, sorted by address (row then column). */
  formulaCells: MantleFormulaCellSnapshot[];
  /** Count of populated (non-empty, non merge-slave) cells. */
  nonEmptyCellCount: number;
  /** Count of cells carrying a non-default style. */
  styledCellCount: number;
}

/** Deterministic structural snapshot of a workbook. */
export interface MantleWorkbookSnapshot {
  /** Sheet names in workbook order. */
  sheetNames: string[];
  /** Per-sheet snapshots in workbook order. */
  sheets: MantleWorksheetSnapshot[];
}

/** Parse a cell address ("AB12") into 1-based row/column for ordering. */
function parseAddress(address: string): { row: number; col: number } {
  const match = /^([A-Za-z]+)(\d+)$/.exec(address);
  if (!match) return { row: 0, col: 0 };
  let col = 0;
  for (const ch of match[1].toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { row: Number(match[2]), col };
}

/** Deterministic order for addresses: row, then column, then raw string. */
function compareAddress(a: string, b: string): number {
  const pa = parseAddress(a);
  const pb = parseAddress(b);
  if (pa.row !== pb.row) return pa.row - pb.row;
  if (pa.col !== pb.col) return pa.col - pb.col;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Top-left cell of a merge range, e.g. "B2" from "B2:C3". */
function mergeStart(range: string): string {
  const colon = range.indexOf(":");
  return colon === -1 ? range : range.slice(0, colon);
}

/** Whether a cell holds a value worth counting (not blank, not a merge slave). */
function isNonEmptyCell(cell: ExcelJS.Cell): boolean {
  if (cell.type === ExcelJS.ValueType.Null || cell.type === ExcelJS.ValueType.Merge) {
    return false;
  }
  const value = cell.value;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/** Whether a cell carries any non-default style facet (numFmt/font/fill/border/alignment). */
function isStyledCell(cell: ExcelJS.Cell): boolean {
  const style = cell.style;
  if (!style) return false;
  if (style.numFmt) return true;
  if (style.font && Object.keys(style.font).length > 0) return true;
  if (style.fill && (style.fill as { type?: string }).type) return true;
  if (style.border && Object.keys(style.border).length > 0) return true;
  if (style.alignment && Object.keys(style.alignment).length > 0) return true;
  return false;
}

/** Build the structural snapshot for one worksheet. */
function snapshotWorksheet(worksheet: ExcelJS.Worksheet): MantleWorksheetSnapshot {
  const columnWidths: MantleWorksheetColumnSnapshot[] = [];
  for (let index = 1; index <= worksheet.columnCount; index += 1) {
    const width = worksheet.getColumn(index).width;
    if (typeof width === "number") {
      columnWidths.push({ index, width });
    }
  }

  const mergedRanges = [...worksheet.model.merges].sort((a, b) =>
    compareAddress(mergeStart(a), mergeStart(b))
  );

  const formulaCells: MantleFormulaCellSnapshot[] = [];
  let nonEmptyCellCount = 0;
  let styledCellCount = 0;

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (isNonEmptyCell(cell)) nonEmptyCellCount += 1;
      if (isStyledCell(cell)) styledCellCount += 1;
      if (cell.type === ExcelJS.ValueType.Formula && cell.formula) {
        formulaCells.push({ address: cell.address, formula: cell.formula });
      }
    });
  });

  formulaCells.sort((a, b) => compareAddress(a.address, b.address));

  return {
    name: worksheet.name,
    rowCount: worksheet.rowCount,
    actualRowCount: worksheet.actualRowCount,
    columnCount: worksheet.columnCount,
    actualColumnCount: worksheet.actualColumnCount,
    columnWidths,
    mergedRanges,
    formulaCells,
    nonEmptyCellCount,
    styledCellCount,
  };
}

/**
 * Inspect a Mantle-style workbook and return a deterministic structural
 * snapshot. Read-only: the file is opened, never written. A blank `filePath`
 * throws the exact guard message; missing/unreadable files let the underlying
 * exceljs read error bubble unchanged.
 */
export async function inspectMantleWorkbook(filePath: string): Promise<MantleWorkbookSnapshot> {
  if (!filePath || filePath.trim() === "") {
    throw new Error(BLANK_PATH_MESSAGE);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheets = workbook.worksheets.map(snapshotWorksheet);
  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets,
  };
}
