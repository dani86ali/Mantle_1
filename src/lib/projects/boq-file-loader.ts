/**
 * Narrow Project-domain BoQ file loader for the two locked MVP input formats.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts. Locked parsers: src/lib/projects/boq-formats.ts.
 *
 * This module reads ONE recorded Project BoQ file from disk (`.xlsx` or `.csv`)
 * and normalizes it into CanonicalBoqLine[] using the locked Prompt 9 parsers.
 * It does NOT persist anything: no DB rows, no normalized_boq artifacts, no
 * output files. It does no catalog lookup, SKU replacement, pricing, or
 * validation beyond locked format/quantity parsing, never mutates the input
 * file object, and never imports from the legacy generic parser in
 * src/engines/e2/. (section 6, 7)
 */
import { readFileSync } from "fs";
import { extname } from "path";
import Papa from "papaparse";
import type { CanonicalBoqLine, ProjectFile } from "@/types/project";
import { readExcelFile } from "@/lib/io/excel-reader";
import {
  INVALID_BOQ_FORMAT_MESSAGE,
  assertSupportedBoqExtension,
  detectLockedBoqFormat,
  parseLockedBoqRows,
} from "@/lib/projects/boq-formats";

/** A recorded Project file to load; only the fields the loader reads are required. */
export interface LoadProjectBoqFileInput {
  file: Pick<ProjectFile, "id" | "fileName" | "storagePath">;
}

/**
 * Result of loading one BoQ file. `sourceSheetName` is set for `.xlsx` (the
 * matched worksheet) and omitted for `.csv`. Lines preserve customer order.
 */
export interface LoadedProjectBoq {
  sourceFileId: string;
  sourceFileName: string;
  sourceSheetName?: string;
  lines: CanonicalBoqLine[];
}

/**
 * Load `.xlsx`: scan worksheets in workbook order and pick the first whose rows
 * match a locked format, then normalize that sheet (passing its name through).
 * Throws the exact invalid-format message when no sheet matches. (section 6)
 */
function loadXlsx(
  file: LoadProjectBoqFileInput["file"]
): LoadedProjectBoq {
  const workbook = readExcelFile(file.storagePath);
  for (const sheetName of workbook.sheetNames) {
    const rows = workbook.sheets[sheetName] ?? [];
    if (detectLockedBoqFormat(rows) === null) continue;
    const lines = parseLockedBoqRows({
      rows,
      sourceFileId: file.id,
      sourceSheetName: sheetName,
    });
    return {
      sourceFileId: file.id,
      sourceFileName: file.fileName,
      sourceSheetName: sheetName,
      lines,
    };
  }
  throw new Error(INVALID_BOQ_FORMAT_MESSAGE);
}

/**
 * Load `.csv`: read UTF-8 text and parse deterministically to string[][] with
 * PapaParse (no dynamic typing, no header mode), then normalize. The locked
 * parser throws the exact invalid-format message when the rows match no format.
 */
function loadCsv(
  file: LoadProjectBoqFileInput["file"]
): LoadedProjectBoq {
  const text = readFileSync(file.storagePath, "utf8");
  const parsed = Papa.parse<string[]>(text, { header: false });
  const lines = parseLockedBoqRows({
    rows: parsed.data,
    sourceFileId: file.id,
  });
  return {
    sourceFileId: file.id,
    sourceFileName: file.fileName,
    lines,
  };
}

/**
 * Load a recorded Project BoQ file from disk and return normalized canonical
 * lines. Validates the extension from `file.fileName` first (the exact
 * invalid-format message rejects `.xls`, `.txt`, `.docx`, extensionless names).
 * Dispatches `.xlsx` to a sheet scan and `.csv` to deterministic CSV parsing;
 * both delegate normalization to the locked parsers, which preserve row order
 * and source metadata. Never persists state or mutates the input. (section 6, 7)
 */
export function loadProjectBoqFile(input: LoadProjectBoqFileInput): LoadedProjectBoq {
  const { file } = input;
  assertSupportedBoqExtension(file.fileName);
  const extension = extname(file.fileName).toLowerCase();
  return extension === ".csv" ? loadCsv(file) : loadXlsx(file);
}
