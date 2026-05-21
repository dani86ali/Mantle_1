/**
 * Locked BoQ/BoM input-contract helpers and pure parsers for the two MVP formats.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts (BoqInputFormat, CanonicalBoqLine).
 *
 * This module is PURE and Project-domain only. It normalizes already-read
 * worksheet/CSV rows (`string[][]`) into CanonicalBoqLine for exactly the two
 * accepted layouts (section 6, section 7). It does NOT read files from disk, parse
 * `.xlsx` buffers or CSV text, touch the database, create artifacts, or import
 * anything from the legacy generic parser/detector in src/engines/e2/. Arbitrary
 * parser expansion is out of scope (section 18).
 */
import type { BoqInputFormat, CanonicalBoqLine } from "@/types/project";

/** Exact message returned when the BoQ/BoM layout matches neither format. (section 6) */
export const INVALID_BOQ_FORMAT_MESSAGE =
  "Your BoQ/BoM format does not match the 2 formats accepted by Bomatic. Check FAQ formatting for more details.";

/** The only upload extensions accepted for MVP. `.xls`/`.txt` are unsupported. (section 6) */
export const SUPPORTED_BOQ_EXTENSIONS = [".xlsx", ".csv"] as const;

/** Maps an accepted layout to the source columns each canonical field reads from. */
interface BoqFormatSpec {
  format: BoqInputFormat;
  /** Exact (trimmed) column headers that must all be present to match. */
  required: readonly string[];
  lineNumberColumn: string;
  skuColumn: string;
  descriptionColumn: string;
  quantityColumn: string;
}

/**
 * Format specs in priority order: format #1 is checked first so a row matching
 * both layouts resolves to format #1 (section 6). Priority is per-row; an earlier
 * matching header still wins. Accepted layouts avoid that ambiguity.
 */
const BOQ_FORMAT_SPECS: readonly BoqFormatSpec[] = [
  {
    format: "format_1_line_item",
    required: ["Line Number", "Item Name", "Description", "Quantity"],
    lineNumberColumn: "Line Number",
    skuColumn: "Item Name",
    descriptionColumn: "Description",
    quantityColumn: "Quantity",
  },
  {
    format: "format_2_number_part_qty",
    required: ["#", "Description", "Part Number", "Qty"],
    lineNumberColumn: "#",
    skuColumn: "Part Number",
    descriptionColumn: "Description",
    quantityColumn: "Qty",
  },
];

/**
 * True when `fileNameOrExtension` ends with a supported extension (case-insensitive).
 * Accepts bare extensions (`.xlsx`) and full filenames (`boq.CSV`); empty input and
 * extensionless names return false. (section 6)
 */
export function isSupportedBoqExtension(fileNameOrExtension: string): boolean {
  if (!fileNameOrExtension) return false;
  const lower = fileNameOrExtension.trim().toLowerCase();
  return SUPPORTED_BOQ_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Throw the exact invalid-format message when the extension is unsupported.
 * Use before reading an uploaded BoQ/BoM. (section 6)
 */
export function assertSupportedBoqExtension(fileNameOrExtension: string): void {
  if (!isSupportedBoqExtension(fileNameOrExtension)) {
    throw new Error(INVALID_BOQ_FORMAT_MESSAGE);
  }
}

/** Located header row plus the matched format. */
interface LocatedHeader {
  spec: BoqFormatSpec;
  /** 0-based index into `rows` of the header row. */
  headerIndex: number;
}

/** True when every required column name appears among the row's trimmed cells. */
function rowMatchesFormat(trimmedCells: string[], required: readonly string[]): boolean {
  return required.every((column) => trimmedCells.includes(column));
}

/**
 * Scan rows top-down for the first row matching an accepted format's required
 * columns. Empty rows before the header are allowed; returns null when none match.
 */
function locateHeader(rows: string[][]): LocatedHeader | null {
  for (let i = 0; i < rows.length; i++) {
    const trimmedCells = rows[i].map((cell) => cell.trim());
    for (const spec of BOQ_FORMAT_SPECS) {
      if (rowMatchesFormat(trimmedCells, spec.required)) {
        return { spec, headerIndex: i };
      }
    }
  }
  return null;
}

/**
 * Detect which locked BoQ format a set of rows uses, or null when neither layout's
 * required columns are present (cells trimmed before matching). (section 6)
 */
export function detectLockedBoqFormat(rows: string[][]): BoqInputFormat | null {
  return locateHeader(rows)?.spec.format ?? null;
}

/** Input for {@link parseLockedBoqRows}. Rows are already-read worksheet/CSV cells. */
export interface ParseLockedBoqRowsInput {
  rows: string[][];
  sourceFileId: string;
  sourceSheetName?: string;
}

/** Derive `parentLineNumber` from a dotted hierarchy (`1.2.3` -> `1.2`); else undefined. */
function deriveParentLineNumber(lineNumber: string): string | undefined {
  const lastDot = lineNumber.lastIndexOf(".");
  if (lastDot <= 0) return undefined;
  const parent = lineNumber.slice(0, lastDot);
  return parent.length > 0 ? parent : undefined;
}

/**
 * Deterministically parse a quantity cell. Throws the exact invalid-format message
 * when blank or non-numeric (the only quantity handling here). (section 6)
 */
function parseQuantity(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") throw new Error(INVALID_BOQ_FORMAT_MESSAGE);
  const value = Number(trimmed);
  if (!Number.isFinite(value)) throw new Error(INVALID_BOQ_FORMAT_MESSAGE);
  return value;
}

/**
 * Normalize already-read worksheet/CSV rows into CanonicalBoqLine[] for one of the
 * two accepted formats. Throws {@link INVALID_BOQ_FORMAT_MESSAGE} when neither
 * matches. Empty rows before the header are allowed; fully blank rows after it are
 * skipped. Customer line order is preserved (rows never reordered); unresolved SKU
 * rows are kept in place (no catalog lookup, replacement, pricing, or math beyond
 * quantity parsing). `sourceRowNumber` is the 1-based worksheet row; `originalCells`
 * maps every named header to its raw (untrimmed) cell; `sku`/`description`/
 * `originalLineNumber` are trimmed. Input rows are never mutated. (section 7, 8)
 */
export function parseLockedBoqRows(input: ParseLockedBoqRowsInput): CanonicalBoqLine[] {
  const { rows, sourceFileId, sourceSheetName } = input;
  const located = locateHeader(rows);
  if (!located) throw new Error(INVALID_BOQ_FORMAT_MESSAGE);

  const { spec, headerIndex } = located;
  const headerCells = rows[headerIndex];
  const trimmedHeaders = headerCells.map((cell) => cell.trim());

  const lineNumberIndex = trimmedHeaders.indexOf(spec.lineNumberColumn);
  const skuIndex = trimmedHeaders.indexOf(spec.skuColumn);
  const descriptionIndex = trimmedHeaders.indexOf(spec.descriptionColumn);
  const quantityIndex = trimmedHeaders.indexOf(spec.quantityColumn);

  const lines: CanonicalBoqLine[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((cell) => cell.trim() === "")) continue;

    const originalLineNumber = (row[lineNumberIndex] ?? "").trim();
    const sku = (row[skuIndex] ?? "").trim();
    const description = (row[descriptionIndex] ?? "").trim();
    const quantity = parseQuantity(row[quantityIndex] ?? "");

    const originalCells: Record<string, string> = {};
    for (let col = 0; col < trimmedHeaders.length; col++) {
      const headerName = trimmedHeaders[col];
      if (headerName === "") continue;
      originalCells[headerName] = row[col] ?? "";
    }

    const parentLineNumber = deriveParentLineNumber(originalLineNumber);

    lines.push({
      sourceFormat: spec.format,
      sourceFileId,
      ...(sourceSheetName !== undefined ? { sourceSheetName } : {}),
      sourceRowNumber: i + 1,
      originalLineNumber,
      sku,
      description,
      quantity,
      ...(parentLineNumber !== undefined ? { parentLineNumber } : {}),
      originalCells,
    });
  }

  return lines;
}
