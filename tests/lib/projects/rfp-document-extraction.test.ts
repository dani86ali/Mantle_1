import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import JSZip from "jszip";
import * as XLSX from "xlsx";

// pdf-parse and mammoth are module-mocked so the DEFAULT pdf/docx adapters can
// be exercised without binary fixtures; the xlsx, papaparse, and docx table
// (jszip + fast-xml-parser) defaults run against the real libraries on tiny
// in-memory buffers. Most tests inject fake extractor adapters and never
// touch any parser library.
const { pdfState, mammothState } = vi.hoisted(() => ({
  pdfState: {
    constructorArgs: [] as Array<{ data?: unknown }>,
    destroyCount: 0,
    getTextImpl: null as
      | (() => Promise<{
          text: string;
          pages: Array<{ num: number; text: string }>;
        }>)
      | null,
    getTableImpl: null as
      | (() => Promise<{ pages: Array<{ num: number; tables: string[][][] }> }>)
      | null,
  },
  mammothState: {
    calls: [] as Array<{ buffer: Buffer }>,
    result: {
      value: "",
      messages: [] as Array<{ type: string; message: string }>,
    },
  },
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    constructor(options: { data?: unknown }) {
      pdfState.constructorArgs.push(options);
    }
    getText() {
      if (pdfState.getTextImpl === null) {
        return Promise.reject(new Error("unexpected getText call"));
      }
      return pdfState.getTextImpl();
    }
    getTable() {
      if (pdfState.getTableImpl === null) {
        return Promise.reject(new Error("unexpected getTable call"));
      }
      return pdfState.getTableImpl();
    }
    destroy() {
      pdfState.destroyCount += 1;
      return Promise.resolve();
    }
  },
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: (input: { buffer: Buffer }) => {
      mammothState.calls.push(input);
      return Promise.resolve(mammothState.result);
    },
  },
}));

import {
  extractRfpDocumentFile,
  type ExtractRfpDocumentFileInput,
} from "@/lib/projects/rfp-document-extraction";

const FILE_ID = "file-rfp-1";
const STORAGE_PATH = "/secret/store/source-files/doc-1";

type ExtractionFile = ExtractRfpDocumentFileInput["file"];
type RawCellRows = Array<Array<string | null | undefined>>;

function makeFile(overrides: Partial<ExtractionFile> = {}): ExtractionFile {
  return {
    id: FILE_ID,
    fileName: "tender.pdf",
    fileRole: "rfp",
    storagePath: STORAGE_PATH,
    ...overrides,
  };
}

function makeFakes(content = "raw-bytes") {
  const buffer = Buffer.from(content);
  const adapters = {
    readFile: vi.fn(async (_path: string) => buffer),
    extractPdf: vi.fn(async (_buffer: Buffer) => ({
      text: "pdf text",
      tables: [] as Array<{ pageNumber?: number; rows: RawCellRows }>,
      warnings: [] as string[],
    })),
    extractDocx: vi.fn(
      async (
        _buffer: Buffer
      ): Promise<{
        text: string;
        tables?: Array<{ rows: RawCellRows }>;
        warnings?: string[];
      }> => ({ text: "docx text", warnings: [] })
    ),
    extractXlsx: vi.fn((_buffer: Buffer) => ({
      text: "xlsx text",
      tables: [] as Array<{ sheetName: string; rows: RawCellRows }>,
      warnings: [] as string[],
    })),
    extractCsv: vi.fn((_buffer: Buffer) => ({
      text: "csv text",
      tables: [] as Array<{ rows: RawCellRows }>,
      warnings: [] as string[],
    })),
  };
  return { buffer, adapters };
}

beforeEach(() => {
  pdfState.constructorArgs.length = 0;
  pdfState.destroyCount = 0;
  pdfState.getTextImpl = null;
  pdfState.getTableImpl = null;
  mammothState.calls.length = 0;
  mammothState.result = { value: "", messages: [] };
});

describe("extractRfpDocumentFile - input validation", () => {
  it("throws a deterministic error for blank or non-string id/fileName/storagePath without reading the file", async () => {
    const cases: Array<{ overrides: Partial<ExtractionFile>; field: string }> = [
      { overrides: { id: "" }, field: "file.id" },
      { overrides: { id: "   " }, field: "file.id" },
      { overrides: { id: undefined as unknown as string }, field: "file.id" },
      { overrides: { fileName: "" }, field: "file.fileName" },
      { overrides: { fileName: "  " }, field: "file.fileName" },
      { overrides: { storagePath: "" }, field: "file.storagePath" },
      { overrides: { storagePath: " " }, field: "file.storagePath" },
    ];
    for (const { overrides, field } of cases) {
      const { adapters } = makeFakes();
      await expect(
        extractRfpDocumentFile({ file: makeFile(overrides), adapters })
      ).rejects.toThrow(
        `extractRfpDocumentFile: ${field} must be a nonblank string`
      );
      expect(adapters.readFile).not.toHaveBeenCalled();
    }
  });
});

describe("extractRfpDocumentFile - extension handling", () => {
  it("returns unsupported_extension with the lowercased final extension and never reads the file", async () => {
    const cases: Array<{ fileName: string; extension: string }> = [
      { fileName: "legacy.doc", extension: ".doc" },
      { fileName: "legacy.XLS", extension: ".xls" },
      { fileName: "notes.txt", extension: ".txt" },
      { fileName: "no-extension", extension: "" },
      { fileName: "archive.csv.zip", extension: ".zip" },
    ];
    for (const { fileName, extension } of cases) {
      const { adapters } = makeFakes();
      const result = await extractRfpDocumentFile({
        file: makeFile({ fileName }),
        adapters,
      });
      expect(result).toEqual({ status: "unsupported_extension", extension });
      expect(adapters.readFile).not.toHaveBeenCalled();
      expect(adapters.extractPdf).not.toHaveBeenCalled();
      expect(adapters.extractDocx).not.toHaveBeenCalled();
      expect(adapters.extractXlsx).not.toHaveBeenCalled();
      expect(adapters.extractCsv).not.toHaveBeenCalled();
    }
  });

  it("accepts uppercase extensions, lowercasing into the document extension", async () => {
    const { adapters } = makeFakes();
    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "TENDER.PDF" }),
      adapters,
    });
    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.extension).toBe(".pdf");
    expect(result.document.sourceFileName).toBe("TENDER.PDF");
    expect(adapters.extractPdf).toHaveBeenCalledTimes(1);
  });
});

describe("extractRfpDocumentFile - extractor dispatch", () => {
  const cases: Array<{
    fileName: string;
    extension: string;
    called: "extractPdf" | "extractDocx" | "extractXlsx" | "extractCsv";
  }> = [
    { fileName: "tender.pdf", extension: ".pdf", called: "extractPdf" },
    { fileName: "scope.docx", extension: ".docx", called: "extractDocx" },
    { fileName: "boq.xlsx", extension: ".xlsx", called: "extractXlsx" },
    { fileName: "lines.csv", extension: ".csv", called: "extractCsv" },
  ];

  for (const { fileName, extension, called } of cases) {
    it(`reads the storagePath bytes once and dispatches ${extension} to ${called} only`, async () => {
      const { buffer, adapters } = makeFakes();
      const result = await extractRfpDocumentFile({
        file: makeFile({ fileName }),
        adapters,
      });

      expect(adapters.readFile).toHaveBeenCalledTimes(1);
      expect(adapters.readFile).toHaveBeenCalledWith(STORAGE_PATH);
      expect(adapters[called]).toHaveBeenCalledTimes(1);
      expect(adapters[called].mock.calls[0][0]).toBe(buffer);
      const all = [
        "extractPdf",
        "extractDocx",
        "extractXlsx",
        "extractCsv",
      ] as const;
      for (const other of all) {
        if (other !== called) expect(adapters[other]).not.toHaveBeenCalled();
      }
      expect(result.status).toBe("extracted");
      if (result.status !== "extracted") throw new Error("unreachable");
      expect(result.document.extension).toBe(extension);
      expect(result.document.sourceFileId).toBe(FILE_ID);
      expect(result.document.sourceFileName).toBe(fileName);
      expect(result.document.sourceFileRole).toBe("rfp");
    });
  }
});

describe("extractRfpDocumentFile - text normalization", () => {
  it("converts CRLF/CR to LF, trims line-trailing spaces/tabs, collapses 3+ LFs to 2, trims outer whitespace", async () => {
    const { adapters } = makeFakes();
    const raw =
      "  Title\r\nLine one   \r\rLine two\t\n\n\n\nLine three  \n\n  ";
    adapters.extractDocx.mockResolvedValue({ text: raw, warnings: [] });

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "scope.docx" }),
      adapters,
    });

    expect(result.status).toBe("extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    const expectedText = "Title\nLine one\n\nLine two\n\nLine three";
    expect(result.document.text).toBe(expectedText);
    expect(result.document.tables).toEqual([]);
    expect(result.document.metrics).toEqual({
      textCharCount: expectedText.length,
      nonWhitespaceTextCharCount: expectedText.replace(/\s/g, "").length,
      tableCount: 0,
      tableRowCount: 0,
    });
  });

  it("keeps interior spacing; only trailing whitespace per line is trimmed", async () => {
    const { adapters } = makeFakes();
    adapters.extractDocx.mockResolvedValue({
      text: "Keep  interior   spacing \t",
      warnings: [],
    });
    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "scope.docx" }),
      adapters,
    });
    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.text).toBe("Keep  interior   spacing");
  });
});

describe("extractRfpDocumentFile - table normalization", () => {
  it("trims cells, maps null/undefined to empty, drops trailing empty cells, all-empty rows, and empty tables, with consecutive output-order ids", async () => {
    const { adapters } = makeFakes();
    adapters.extractXlsx.mockReturnValue({
      text: "sheet text",
      tables: [
        {
          sheetName: "BoQ",
          rows: [
            ["  SKU  ", " Desc ", null, undefined, ""],
            ["", "   ", ""],
            ["C9300-24T", "", " Switch ", "", ""],
          ],
        },
        { sheetName: "Empty", rows: [["", ""], ["   "]] },
        { sheetName: "Totals", rows: [[" Total ", " 5 "]] },
      ],
      warnings: [],
    });

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "boq.xlsx" }),
      adapters,
    });
    if (result.status !== "extracted") throw new Error("unreachable");

    expect(result.document.tables).toEqual([
      {
        tableId: `${FILE_ID}:table:1`,
        sourceFileId: FILE_ID,
        sourceFileName: "boq.xlsx",
        sourceFileRole: "rfp",
        sheetName: "BoQ",
        rowCount: 2,
        columnCount: 3,
        rows: [
          ["SKU", "Desc"],
          ["C9300-24T", "", "Switch"],
        ],
      },
      {
        tableId: `${FILE_ID}:table:2`,
        sourceFileId: FILE_ID,
        sourceFileName: "boq.xlsx",
        sourceFileRole: "rfp",
        sheetName: "Totals",
        rowCount: 1,
        columnCount: 2,
        rows: [["Total", "5"]],
      },
    ]);
    expect(result.document.metrics.tableCount).toBe(2);
    expect(result.document.metrics.tableRowCount).toBe(3);
    expect("pageNumber" in result.document.tables[0]).toBe(false);
  });

  it("preserves the sheet order handed over by the xlsx adapter", async () => {
    const { adapters } = makeFakes();
    adapters.extractXlsx.mockReturnValue({
      text: "",
      tables: [
        { sheetName: "Zulu", rows: [["z"]] },
        { sheetName: "Alpha", rows: [["a"]] },
        { sheetName: "Mike", rows: [["m"]] },
      ],
      warnings: [],
    });
    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "boq.xlsx" }),
      adapters,
    });
    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.tables.map((t) => t.sheetName)).toEqual([
      "Zulu",
      "Alpha",
      "Mike",
    ]);
    expect(result.document.tables.map((t) => t.tableId)).toEqual([
      `${FILE_ID}:table:1`,
      `${FILE_ID}:table:2`,
      `${FILE_ID}:table:3`,
    ]);
  });

  it("carries pdf pageNumber through in page order and omits sheetName", async () => {
    const { adapters } = makeFakes();
    adapters.extractPdf.mockResolvedValue({
      text: "pdf",
      tables: [
        { pageNumber: 2, rows: [["A", "B"]] },
        { pageNumber: 5, rows: [["C"]] },
      ],
      warnings: [],
    });
    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "tender.pdf" }),
      adapters,
    });
    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.tables.map((t) => t.pageNumber)).toEqual([2, 5]);
    expect("sheetName" in result.document.tables[0]).toBe(false);
  });

  it("normalizes injected docx adapter tables with output-order ids and neither pageNumber nor sheetName", async () => {
    const { adapters } = makeFakes();
    const injected: {
      text: string;
      tables: Array<{ rows: RawCellRows }>;
      warnings: string[];
    } = {
      text: "docx body",
      tables: [
        { rows: [[" Req ", " Met ", ""], ["", "  "]] },
        { rows: [["First line\nSecond line", null, " B "]] },
      ],
      warnings: [],
    };
    adapters.extractDocx.mockResolvedValue(injected);

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "scope.docx" }),
      adapters,
    });
    if (result.status !== "extracted") throw new Error("unreachable");

    expect(result.document.tables).toEqual([
      {
        tableId: `${FILE_ID}:table:1`,
        sourceFileId: FILE_ID,
        sourceFileName: "scope.docx",
        sourceFileRole: "rfp",
        rowCount: 1,
        columnCount: 2,
        rows: [["Req", "Met"]],
      },
      {
        tableId: `${FILE_ID}:table:2`,
        sourceFileId: FILE_ID,
        sourceFileName: "scope.docx",
        sourceFileRole: "rfp",
        rowCount: 1,
        columnCount: 3,
        rows: [["First line\nSecond line", "", "B"]],
      },
    ]);
    expect(result.document.metrics.tableCount).toBe(2);
    expect(result.document.metrics.tableRowCount).toBe(2);
    expect("pageNumber" in result.document.tables[0]).toBe(false);
    expect("sheetName" in result.document.tables[0]).toBe(false);
    expect(result.document.tables[0].rows).not.toBe(injected.tables[0].rows);
  });

  it("treats an injected docx adapter result without tables as no tables", async () => {
    const { adapters } = makeFakes();
    adapters.extractDocx.mockResolvedValue({ text: "legacy", warnings: [] });
    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "scope.docx" }),
      adapters,
    });
    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.tables).toEqual([]);
    expect(result.document.metrics.tableCount).toBe(0);
    expect(result.document.metrics.tableRowCount).toBe(0);
  });
});

describe("extractRfpDocumentFile - warnings and output hygiene", () => {
  it("carries adapter warnings through as a fresh array", async () => {
    const { adapters } = makeFakes();
    const warnings = [
      "csv_parser_warning:MissingQuotes",
      "csv_parser_warning:TooManyFields",
    ];
    adapters.extractCsv.mockReturnValue({
      text: "a",
      tables: [{ rows: [["a"]] }],
      warnings,
    });

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "lines.csv" }),
      adapters,
    });
    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.warnings).toEqual(warnings);
    expect(result.document.warnings).not.toBe(warnings);
  });

  it("never includes storagePath (key or value) or raw file bytes in the result", async () => {
    const { adapters } = makeFakes("raw-file-bytes-marker");
    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "tender.pdf" }),
      adapters,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain(STORAGE_PATH);
    expect(serialized).not.toContain("raw-file-bytes-marker");
  });

  it("returns the full document shape for a pdf with text, tables, and warnings", async () => {
    const { adapters } = makeFakes();
    adapters.extractPdf.mockResolvedValue({
      text: "Body  \r\ntext",
      tables: [{ pageNumber: 1, rows: [[" SKU ", "Qty "], ["", ""]] }],
      warnings: ["w1"],
    });
    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "tender.pdf" }),
      adapters,
    });
    expect(result).toEqual({
      status: "extracted",
      document: {
        sourceFileId: FILE_ID,
        sourceFileName: "tender.pdf",
        sourceFileRole: "rfp",
        extension: ".pdf",
        text: "Body\ntext",
        tables: [
          {
            tableId: `${FILE_ID}:table:1`,
            sourceFileId: FILE_ID,
            sourceFileName: "tender.pdf",
            sourceFileRole: "rfp",
            pageNumber: 1,
            rowCount: 1,
            columnCount: 2,
            rows: [["SKU", "Qty"]],
          },
        ],
        warnings: ["w1"],
        metrics: {
          textCharCount: 9,
          nonWhitespaceTextCharCount: 8,
          tableCount: 1,
          tableRowCount: 1,
        },
      },
    });
  });
});

describe("extractRfpDocumentFile - immutability", () => {
  it("does not mutate the input file or the adapter result, and copies rows/warnings", async () => {
    const file = makeFile({ fileName: "boq.xlsx" });
    const adapterResult = {
      text: "  raw  text  \r\n",
      tables: [{ sheetName: "S1", rows: [[" a ", null, ""], ["", ""]] }],
      warnings: ["w-shared"],
    };
    const { adapters } = makeFakes();
    adapters.extractXlsx.mockReturnValue(adapterResult);

    const fileSnapshot = structuredClone(file);
    const resultSnapshot = structuredClone(adapterResult);

    const result = await extractRfpDocumentFile({ file, adapters });

    expect(file).toEqual(fileSnapshot);
    expect(adapterResult).toEqual(resultSnapshot);
    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.tables[0].rows).not.toBe(
      adapterResult.tables[0].rows
    );
    expect(result.document.tables[0].rows[0]).not.toBe(
      adapterResult.tables[0].rows[0]
    );
    expect(result.document.warnings).not.toBe(adapterResult.warnings);
  });
});

describe("default pdf adapter (pdf-parse module mocked)", () => {
  function pdfReadFile(content = "pdf-bytes") {
    const buffer = Buffer.from(content);
    return { buffer, readFile: vi.fn(async (_path: string) => buffer) };
  }

  it("extracts text and flattens page tables in order, passing a copied Uint8Array and destroying the parser", async () => {
    const { buffer, readFile } = pdfReadFile();
    pdfState.getTextImpl = () =>
      Promise.resolve({
        text: "PDF body",
        pages: [{ num: 1, text: "PDF body" }],
      });
    pdfState.getTableImpl = () =>
      Promise.resolve({
        pages: [
          { num: 1, tables: [[["H", "V"]], [["X", "Y"]]] },
          { num: 3, tables: [[["Z", "W"]]] },
        ],
      });

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "tender.pdf" }),
      adapters: { readFile },
    });

    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.text).toBe("PDF body");
    expect(result.document.tables.map((t) => t.pageNumber)).toEqual([1, 1, 3]);
    expect(result.document.tables.map((t) => t.rows)).toEqual([
      [["H", "V"]],
      [["X", "Y"]],
      [["Z", "W"]],
    ]);
    expect(result.document.warnings).toEqual([]);

    expect(pdfState.constructorArgs).toHaveLength(1);
    const data = pdfState.constructorArgs[0].data;
    expect(data).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(data)).toBe(false);
    expect(Buffer.from(data as Uint8Array)).toEqual(buffer);
    expect(pdfState.destroyCount).toBe(1);
  });

  it("degrades a getTable failure to a pdf_table_extraction_failed warning while preserving text, still destroying the parser", async () => {
    const { readFile } = pdfReadFile();
    pdfState.getTextImpl = () =>
      Promise.resolve({ text: "Text survives", pages: [] });
    pdfState.getTableImpl = () => Promise.reject(new Error("table grid boom"));

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "tender.pdf" }),
      adapters: { readFile },
    });

    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.text).toBe("Text survives");
    expect(result.document.tables).toEqual([]);
    expect(result.document.warnings).toEqual(["pdf_table_extraction_failed"]);
    expect(pdfState.destroyCount).toBe(1);
  });

  it("propagates a getText failure and still destroys the parser", async () => {
    const { readFile } = pdfReadFile();
    pdfState.getTextImpl = () => Promise.reject(new Error("pdf text boom"));

    await expect(
      extractRfpDocumentFile({
        file: makeFile({ fileName: "tender.pdf" }),
        adapters: { readFile },
      })
    ).rejects.toThrow("pdf text boom");
    expect(pdfState.destroyCount).toBe(1);
  });
});

describe("default docx adapter (mammoth module mocked; real jszip/xml tables)", () => {
  // Two document-order tables: trimmable whitespace, split runs in one
  // paragraph, two paragraphs in one cell, and an empty trailing cell.
  const DOCX_TABLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Intro paragraph</w:t></w:r></w:p>
<w:tbl>
<w:tblPr/>
<w:tr>
<w:tc><w:p><w:r><w:t xml:space="preserve">  Requirement  </w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Compliance</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
<w:tc><w:p><w:r><w:t xml:space="preserve">Provide </w:t></w:r><w:r><w:t>24 ports</w:t></w:r></w:p><w:p><w:r><w:t>Layer 3</w:t></w:r></w:p></w:tc>
<w:tc><w:p/></w:tc>
</w:tr>
</w:tbl>
<w:p><w:r><w:t>Between tables</w:t></w:r></w:p>
<w:tbl>
<w:tr>
<w:tc><w:p><w:r><w:t>Totals</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>5</w:t></w:r></w:p></w:tc>
</w:tr>
</w:tbl>
</w:body>
</w:document>`;

  async function buildDocxBuffer(
    entries: Record<string, string>
  ): Promise<Buffer> {
    const zip = new JSZip();
    for (const [path, content] of Object.entries(entries)) {
      zip.file(path, content);
    }
    return zip.generateAsync({ type: "nodebuffer" });
  }

  function docxReadFile(buffer: Buffer) {
    return vi.fn(async (_path: string) => buffer);
  }

  it("keeps mammoth-driven text/warnings, passing the read buffer, and adds document-order structured tables", async () => {
    const buffer = await buildDocxBuffer({
      "word/document.xml": DOCX_TABLES_XML,
    });
    mammothState.result = {
      value: "Hello  World\r\n\r\n\r\nBye",
      messages: [
        { type: "warning", message: "Unrecognised style abc" },
        { type: "error", message: "broken relationship" },
      ],
    };

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "scope.docx" }),
      adapters: { readFile: docxReadFile(buffer) },
    });

    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.text).toBe("Hello  World\n\nBye");
    expect(result.document.warnings).toEqual([
      "docx_parser_warning:Unrecognised style abc",
      "docx_parser_warning:broken relationship",
    ]);
    expect(mammothState.calls).toHaveLength(1);
    expect(mammothState.calls[0].buffer).toBe(buffer);

    expect(result.document.tables).toEqual([
      {
        tableId: `${FILE_ID}:table:1`,
        sourceFileId: FILE_ID,
        sourceFileName: "scope.docx",
        sourceFileRole: "rfp",
        rowCount: 2,
        columnCount: 2,
        rows: [
          ["Requirement", "Compliance"],
          ["Provide 24 ports\nLayer 3"],
        ],
      },
      {
        tableId: `${FILE_ID}:table:2`,
        sourceFileId: FILE_ID,
        sourceFileName: "scope.docx",
        sourceFileRole: "rfp",
        rowCount: 1,
        columnCount: 2,
        rows: [["Totals", "5"]],
      },
    ]);
    expect(result.document.metrics.tableCount).toBe(2);
    expect(result.document.metrics.tableRowCount).toBe(3);
    expect("pageNumber" in result.document.tables[0]).toBe(false);
    expect("sheetName" in result.document.tables[0]).toBe(false);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain(STORAGE_PATH);
  });

  it("treats a docx zip without word/document.xml as no tables and adds no failure warning", async () => {
    const buffer = await buildDocxBuffer({
      "[Content_Types].xml": "<Types/>",
    });
    mammothState.result = { value: "Text only", messages: [] };

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "scope.docx" }),
      adapters: { readFile: docxReadFile(buffer) },
    });

    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.text).toBe("Text only");
    expect(result.document.tables).toEqual([]);
    expect(result.document.warnings).toEqual([]);
  });

  it("degrades malformed word/document.xml to docx_table_extraction_failed, keeping mammoth text and warnings", async () => {
    const buffer = await buildDocxBuffer({
      "word/document.xml": "<w:document><w:body><w:tbl></w:document>",
    });
    mammothState.result = {
      value: "Body text survives",
      messages: [{ type: "error", message: "broken relationship" }],
    };

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "scope.docx" }),
      adapters: { readFile: docxReadFile(buffer) },
    });

    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.text).toBe("Body text survives");
    expect(result.document.tables).toEqual([]);
    expect(result.document.warnings).toEqual([
      "docx_parser_warning:broken relationship",
      "docx_table_extraction_failed",
    ]);
  });

  it("degrades a non-zip buffer to docx_table_extraction_failed without leaking parser internals", async () => {
    mammothState.result = { value: "Mapped anyway", messages: [] };

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "scope.docx" }),
      adapters: { readFile: docxReadFile(Buffer.from("not-a-zip")) },
    });

    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.text).toBe("Mapped anyway");
    expect(result.document.tables).toEqual([]);
    expect(result.document.warnings).toEqual(["docx_table_extraction_failed"]);
  });
});

describe("default xlsx adapter (real xlsx round-trip)", () => {
  it("keeps workbook sheet order, stringifies cells, and tab-joins text", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Zed", "1"]]),
      "Zed"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["Alpha", 2], ["x", "y"]]),
      "Alpha"
    );
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;
    const readFile = vi.fn(async (_path: string) => buffer);

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "boq.xlsx" }),
      adapters: { readFile },
    });

    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.tables).toHaveLength(2);
    expect(result.document.tables.map((t) => t.sheetName)).toEqual([
      "Zed",
      "Alpha",
    ]);
    expect(result.document.tables[0].rows).toEqual([["Zed", "1"]]);
    expect(result.document.tables[1].rows).toEqual([
      ["Alpha", "2"],
      ["x", "y"],
    ]);
    expect(result.document.text).toBe("Zed\t1\n\nAlpha\t2\nx\ty");
  });
});

describe("default csv adapter (real papaparse)", () => {
  it("parses the file into one table with tab-separated text, handling quoted commas and a leading BOM", async () => {
    const bom = String.fromCharCode(0xfeff);
    const csv = bom + 'sku,qty,note\r\nC9300-24T,2,"Core, switch"\r\n';
    const readFile = vi.fn(async (_path: string) => Buffer.from(csv, "utf8"));

    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "lines.csv" }),
      adapters: { readFile },
    });

    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.tables).toHaveLength(1);
    expect(result.document.tables[0].tableId).toBe(`${FILE_ID}:table:1`);
    expect(result.document.tables[0].rows).toEqual([
      ["sku", "qty", "note"],
      ["C9300-24T", "2", "Core, switch"],
    ]);
    expect(result.document.text).toBe(
      "sku\tqty\tnote\nC9300-24T\t2\tCore, switch"
    );
  });

  it("surfaces papaparse errors as stable csv_parser_warning codes", async () => {
    const readFile = vi.fn(async (_path: string) =>
      Buffer.from('a,"unterminated\nb,c', "utf8")
    );
    const result = await extractRfpDocumentFile({
      file: makeFile({ fileName: "lines.csv" }),
      adapters: { readFile },
    });
    if (result.status !== "extracted") throw new Error("unreachable");
    expect(result.document.warnings).toContain(
      "csv_parser_warning:MissingQuotes"
    );
    for (const warning of result.document.warnings) {
      expect(warning).toMatch(/^csv_parser_warning:/);
    }
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/rfp-document-extraction.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/rfp-document-extraction.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the allowed fs/path/parser/type modules and nothing else", () => {
    const specifiers = Array.from(
      source.matchAll(/from\s+"([^"]+)"/g),
      (match) => match[1]
    ).sort();
    expect(specifiers).toEqual([
      "@/types/project",
      "fast-xml-parser",
      "jszip",
      "mammoth",
      "node:fs/promises",
      "node:path",
      "papaparse",
      "pdf-parse",
      "xlsx",
    ]);
  });

  it("uses no dynamic module loading", () => {
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it("imports no DB/store, artifact/approval/evidence, pricing, config expansion, export, runner, AI, catalog, coordinator, engine, adapter, intake, or UI module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      'from "@/lib/projects/',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/lib/io',
      'from "@/lib/validation',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "react',
      'from "next',
      "@anthropic-ai",
      "@google/generative-ai",
      "drizzle",
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidence",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
