/**
 * Deterministic RFP source-document extraction boundary.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Scope (RFP Milestone 1) is the low-level extraction contract only: read ONE
 * recorded Project source file (.pdf/.docx/.xlsx/.csv) and return normalized
 * text and tables plus deterministic metrics for the later extraction quality
 * gate. Everything here is deterministic parsing: no OCR (a scanned PDF with
 * no embedded text/tables stays empty so the later gate can flag it), no AI,
 * no requirement interpretation or classification, no compliance decisions,
 * no SKU/catalog/pricing/configuration logic, and no persistence (it never
 * touches Project stores, artifact, approval, or evidence rows; approved
 * input_package enforcement is a later prompt). Parser libraries sit behind a
 * dependency-injected adapter set so tests need no binary fixtures. This
 * module is the explicit boundary allowed to READ ProjectFile.storagePath;
 * returned results never include storagePath. Inputs and adapter results are
 * never mutated.
 */
import { readFile as readFileFromDisk } from "node:fs/promises";
import { extname } from "node:path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { ProjectFile, ProjectFileRole } from "@/types/project";

/** The only file extensions this extraction boundary understands. */
export type RfpDocumentFileExtension = ".pdf" | ".docx" | ".xlsx" | ".csv";

const SUPPORTED_EXTENSIONS: readonly RfpDocumentFileExtension[] = [
  ".pdf", ".docx", ".xlsx", ".csv",
];

function isSupportedExtension(ext: string): ext is RfpDocumentFileExtension {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/** Raw table cells as extractor adapters may emit them, before normalization. */
export type RfpRawTableRows = ReadonlyArray<
  ReadonlyArray<string | null | undefined>
>;

/** One normalized table extracted from a source file. */
export interface RfpExtractedTable {
  /** Deterministic `<fileId>:table:<n>`, numbered 1..N in output order. */
  tableId: string;
  sourceFileId: string;
  sourceFileName: string;
  sourceFileRole: ProjectFileRole;
  /** 1-based PDF page the table was found on (.pdf only). */
  pageNumber?: number;
  /** Workbook sheet the table came from (.xlsx only). */
  sheetName?: string;
  rowCount: number;
  /** Maximum cell count across the normalized rows. */
  columnCount: number;
  rows: string[][];
}

/** Normalized extraction output for one source file. Never carries storagePath. */
export interface RfpExtractedDocument {
  sourceFileId: string;
  sourceFileName: string;
  sourceFileRole: ProjectFileRole;
  extension: RfpDocumentFileExtension;
  text: string;
  tables: RfpExtractedTable[];
  warnings: string[];
  metrics: {
    textCharCount: number;
    nonWhitespaceTextCharCount: number;
    tableCount: number;
    tableRowCount: number;
  };
}

/**
 * Injectable parser boundary: one filesystem read plus one extractor per
 * supported format. Tests replace these with cheap fakes; production uses
 * {@link defaultRfpDocumentExtractionAdapters}. `readFile` is the only
 * consumer of storagePath.
 */
export interface RfpDocumentExtractionAdapters {
  readFile(path: string): Promise<Buffer>;
  extractPdf(buffer: Buffer): Promise<{
    text: string;
    tables: ReadonlyArray<{ pageNumber?: number; rows: RfpRawTableRows }>;
    warnings?: readonly string[];
  }>;
  extractDocx(buffer: Buffer): Promise<{
    text: string;
    warnings?: readonly string[];
  }>;
  extractXlsx(buffer: Buffer): {
    text: string;
    tables: ReadonlyArray<{ sheetName: string; rows: RfpRawTableRows }>;
    warnings?: readonly string[];
  };
  extractCsv(buffer: Buffer): {
    text: string;
    tables: ReadonlyArray<{ rows: RfpRawTableRows }>;
    warnings?: readonly string[];
  };
}

/**
 * Default .pdf extractor: embedded text via getText(), then grid tables via
 * getTable() on the same parsed document. A table-detection failure degrades
 * to a `pdf_table_extraction_failed` warning instead of failing the whole
 * extraction; the parser is always destroyed. No OCR is attempted.
 */
export const extractPdfWithPdfParse: RfpDocumentExtractionAdapters["extractPdf"] =
  async (buffer) => {
    // Copy into a fresh Uint8Array: pdfjs may transfer the bytes it is given.
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const textResult = await parser.getText();
      const tables: Array<{ pageNumber: number; rows: RfpRawTableRows }> = [];
      const warnings: string[] = [];
      try {
        const tableResult = await parser.getTable();
        for (const page of tableResult.pages) {
          for (const rows of page.tables) {
            tables.push({ pageNumber: page.num, rows });
          }
        }
      } catch {
        warnings.push("pdf_table_extraction_failed");
      }
      return { text: textResult.text, tables, warnings };
    } finally {
      await parser.destroy();
    }
  };

/** Default .docx extractor: mammoth raw text; parser messages become warnings. */
export const extractDocxWithMammoth: RfpDocumentExtractionAdapters["extractDocx"] =
  async (buffer) => {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      warnings: result.messages.map((m) => `docx_parser_warning:${m.message}`),
    };
  };

/** Default .xlsx extractor: one table per sheet in workbook order; text is tab-joined rows. */
export const extractXlsxWithSheetJs: RfpDocumentExtractionAdapters["extractXlsx"] =
  (buffer) => {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const tables: Array<{ sheetName: string; rows: RfpRawTableRows }> = [];
    const textParts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<string[]>(
        workbook.Sheets[sheetName],
        { header: 1, raw: false, blankrows: false, defval: "" }
      );
      tables.push({ sheetName, rows });
      textParts.push(rows.map((row) => row.join("\t")).join("\n"));
    }
    return { text: textParts.join("\n\n"), tables, warnings: [] };
  };

/** Default .csv extractor: the whole file is one table; text is tab-joined rows. */
export const extractCsvWithPapaParse: RfpDocumentExtractionAdapters["extractCsv"] =
  (buffer) => {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    return {
      text: parsed.data.map((row) => row.join("\t")).join("\n"),
      tables: [{ rows: parsed.data }],
      warnings: parsed.errors.map((e) => `csv_parser_warning:${e.code}`),
    };
  };

/** Production adapter set; {@link extractRfpDocumentFile} merges overrides over it. */
export const defaultRfpDocumentExtractionAdapters: RfpDocumentExtractionAdapters =
  {
    readFile: (path) => readFileFromDisk(path),
    extractPdf: extractPdfWithPdfParse,
    extractDocx: extractDocxWithMammoth,
    extractXlsx: extractXlsxWithSheetJs,
    extractCsv: extractCsvWithPapaParse,
  };

/** CRLF/CR to LF, per-line trailing space/tab trim, 3+ LF collapsed to 2, outer trim. */
function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Trim cells (null/undefined to ""), drop trailing empty cells and all-empty rows. */
function normalizeTableRows(rows: RfpRawTableRows): string[][] {
  const normalized: string[][] = [];
  for (const row of rows) {
    const cells = row.map((cell) =>
      cell === null || cell === undefined ? "" : String(cell).trim()
    );
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    if (cells.length > 0) normalized.push(cells);
  }
  return normalized;
}

/** Pre-normalization table shape unified across the four extractors. */
interface RawExtractorTable {
  pageNumber?: number;
  sheetName?: string;
  rows: RfpRawTableRows;
}

/** Dispatch one read buffer to the matching extractor adapter. */
async function runExtractor(
  extension: RfpDocumentFileExtension,
  buffer: Buffer,
  adapters: RfpDocumentExtractionAdapters
): Promise<{ text: string; tables: RawExtractorTable[]; warnings: readonly string[] }> {
  switch (extension) {
    case ".pdf": {
      const result = await adapters.extractPdf(buffer);
      return {
        text: result.text,
        tables: result.tables.map((t) => ({
          ...(t.pageNumber !== undefined ? { pageNumber: t.pageNumber } : {}),
          rows: t.rows,
        })),
        warnings: result.warnings ?? [],
      };
    }
    case ".docx": {
      const result = await adapters.extractDocx(buffer);
      return { text: result.text, tables: [], warnings: result.warnings ?? [] };
    }
    case ".xlsx": {
      const result = adapters.extractXlsx(buffer);
      return {
        text: result.text,
        tables: result.tables.map((t) => ({ sheetName: t.sheetName, rows: t.rows })),
        warnings: result.warnings ?? [],
      };
    }
    case ".csv": {
      const result = adapters.extractCsv(buffer);
      return {
        text: result.text,
        tables: result.tables.map((t) => ({ rows: t.rows })),
        warnings: result.warnings ?? [],
      };
    }
  }
}

/** Normalize raw extractor tables, dropping empties, and stamp output-order ids. */
function buildExtractedTables(
  file: Pick<ProjectFile, "id" | "fileName" | "fileRole">,
  rawTables: readonly RawExtractorTable[]
): RfpExtractedTable[] {
  const tables: RfpExtractedTable[] = [];
  for (const raw of rawTables) {
    const rows = normalizeTableRows(raw.rows);
    if (rows.length === 0) continue;
    tables.push({
      tableId: `${file.id}:table:${tables.length + 1}`,
      sourceFileId: file.id,
      sourceFileName: file.fileName,
      sourceFileRole: file.fileRole,
      ...(raw.pageNumber !== undefined ? { pageNumber: raw.pageNumber } : {}),
      ...(raw.sheetName !== undefined ? { sheetName: raw.sheetName } : {}),
      rowCount: rows.length,
      columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
      rows,
    });
  }
  return tables;
}

/** Deterministic programmer-error guard for the three fields this module reads. */
function assertNonblankString(value: unknown, field: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`extractRfpDocumentFile: ${field} must be a nonblank string`);
  }
}

/** Input for {@link extractRfpDocumentFile}; only the four read fields are required. */
export interface ExtractRfpDocumentFileInput {
  file: Pick<ProjectFile, "id" | "fileName" | "fileRole" | "storagePath">;
  /** Partial parser overrides for tests; unset entries use the defaults. */
  adapters?: Partial<RfpDocumentExtractionAdapters>;
}

/** Discriminated result of {@link extractRfpDocumentFile}. */
export type ExtractRfpDocumentFileResult =
  | { status: "unsupported_extension"; extension: string }
  | { status: "extracted"; document: RfpExtractedDocument };

/**
 * Extract normalized text/tables from ONE recorded Project source file.
 * Validates id/fileName/storagePath first (throws deterministic programmer
 * errors), derives the lowercased final file-name extension, and returns
 * `unsupported_extension` WITHOUT reading the file for anything other than
 * .pdf/.docx/.xlsx/.csv. A supported file is read once via the readFile
 * adapter and dispatched to the matching extractor; text and table cells are
 * normalized, kept tables get deterministic `<fileId>:table:<n>` ids in
 * output order (PDF page order / workbook sheet order preserved), and metrics
 * are computed for the later quality gate. The result never includes
 * storagePath, and neither the input file nor adapter results are mutated.
 */
export async function extractRfpDocumentFile(
  input: ExtractRfpDocumentFileInput
): Promise<ExtractRfpDocumentFileResult> {
  const { file } = input;
  assertNonblankString(file.id, "file.id");
  assertNonblankString(file.fileName, "file.fileName");
  assertNonblankString(file.storagePath, "file.storagePath");

  const extension = extname(file.fileName).toLowerCase();
  if (!isSupportedExtension(extension)) {
    return { status: "unsupported_extension", extension };
  }

  const adapters: RfpDocumentExtractionAdapters = {
    ...defaultRfpDocumentExtractionAdapters,
    ...input.adapters,
  };
  const buffer = await adapters.readFile(file.storagePath);
  const raw = await runExtractor(extension, buffer, adapters);

  const text = normalizeExtractedText(raw.text);
  const tables = buildExtractedTables(file, raw.tables);
  return {
    status: "extracted",
    document: {
      sourceFileId: file.id,
      sourceFileName: file.fileName,
      sourceFileRole: file.fileRole,
      extension,
      text,
      tables,
      warnings: raw.warnings.slice(),
      metrics: {
        textCharCount: text.length,
        nonWhitespaceTextCharCount: text.replace(/\s/g, "").length,
        tableCount: tables.length,
        tableRowCount: tables.reduce((sum, table) => sum + table.rowCount, 0),
      },
    },
  };
}
