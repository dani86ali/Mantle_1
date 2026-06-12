import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ProjectEvidenceItem } from "@/types/project";
import type {
  RfpExtractionRunArtifactSummary,
  RunRfpInputPackageExtractionResult,
} from "@/lib/projects/project-rfp-extraction-run";
import type {
  RfpExtractedDocument,
  RfpExtractedTable,
} from "@/lib/projects/rfp-document-extraction";
import type { CreateProjectEvidenceItemInput } from "@/lib/db/project-evidence-store";

// Mock the prompt-178 run service and the evidence store; the persistence
// service's gate handling, chunking, and content assembly stay real. No DB,
// file bytes, or parser libraries are touched anywhere in this suite.
const { mockRunExtraction, mockCreateEvidence } = vi.hoisted(() => ({
  mockRunExtraction: vi.fn(),
  mockCreateEvidence: vi.fn(),
}));

vi.mock("@/lib/projects/project-rfp-extraction-run", () => ({
  runRfpInputPackageExtraction: mockRunExtraction,
}));
vi.mock("@/lib/db/project-evidence-store", () => ({
  createProjectEvidenceItem: mockCreateEvidence,
}));

import {
  persistRfpExtractionEvidence,
  chunkRfpDocumentText,
  DEFAULT_MAX_TEXT_CHUNK_CHARS,
  RFP_TABLE_EVIDENCE_KIND,
  RFP_TEXT_CHUNK_EVIDENCE_KIND,
  type PersistRfpExtractionEvidenceInput,
  type PersistRfpExtractionEvidenceResult,
} from "@/lib/projects/project-rfp-evidence-persistence";

type RfpExtractionRunOkResult = Extract<
  RunRfpInputPackageExtractionResult,
  { status: "ok" }
>;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-input-package-3";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const STORED_AT = new Date("2026-06-03T08:15:00.000Z");
const STORED_RETAIN = new Date("2027-06-03T08:15:00.000Z");

function makeArtifactSummary(
  overrides: Partial<RfpExtractionRunArtifactSummary> = {}
): RfpExtractionRunArtifactSummary {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "input_package",
    status: "approved",
    version: 3,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [],
    createdAt: TS1.toISOString(),
    updatedAt: TS2.toISOString(),
    ...overrides,
  };
}

function makeTable(
  fileId: string,
  rowCount: number,
  tableNumber = 1,
  overrides: Partial<RfpExtractedTable> = {}
): RfpExtractedTable {
  return {
    tableId: `${fileId}:table:${tableNumber}`,
    sourceFileId: fileId,
    sourceFileName: `${fileId}.pdf`,
    sourceFileRole: "rfp",
    rowCount,
    columnCount: 2,
    rows: Array.from({ length: rowCount }, (_, i) => [
      `SKU-${i + 1}`,
      String(i + 1),
    ]),
    ...overrides,
  };
}

/** A text-only quality-passing document unless overridden. */
function makeDocument(
  fileId: string,
  overrides: Partial<RfpExtractedDocument> = {}
): RfpExtractedDocument {
  const text =
    overrides.text !== undefined
      ? overrides.text
      : "Provide 48-port access switches.";
  const tables = overrides.tables !== undefined ? overrides.tables : [];
  return {
    sourceFileId: fileId,
    sourceFileName: `${fileId}.pdf`,
    sourceFileRole: "rfp",
    extension: ".pdf",
    text,
    tables,
    warnings: [],
    metrics: {
      textCharCount: text.length,
      nonWhitespaceTextCharCount: text.replace(/\s/g, "").length,
      tableCount: tables.length,
      tableRowCount: tables.reduce((sum, table) => sum + table.rowCount, 0),
    },
    ...overrides,
  };
}

/** An ok run whose quality gate PASSED, over the given documents in order. */
function makeOkRun(
  documents: RfpExtractedDocument[],
  overrides: Partial<RfpExtractionRunOkResult> = {}
): RfpExtractionRunOkResult {
  return {
    status: "ok",
    artifact: makeArtifactSummary({
      sourceFileIds: documents.map((d) => d.sourceFileId),
    }),
    files: documents.map((d) => ({
      fileId: d.sourceFileId,
      fileName: d.sourceFileName,
      fileRole: d.sourceFileRole,
      quality: "passed" as const,
      metrics: { ...d.metrics },
      warnings: [],
    })),
    documents,
    quality: {
      status: "passed",
      totalFiles: documents.length,
      passedFiles: documents.length,
      failedFiles: 0,
      totalTextChars: documents.reduce(
        (sum, d) => sum + d.metrics.textCharCount,
        0
      ),
      totalNonWhitespaceTextChars: documents.reduce(
        (sum, d) => sum + d.metrics.nonWhitespaceTextCharCount,
        0
      ),
      totalTables: documents.reduce((sum, d) => sum + d.metrics.tableCount, 0),
      totalTableRows: documents.reduce(
        (sum, d) => sum + d.metrics.tableRowCount,
        0
      ),
      warnings: [],
      warningDetails: [],
      blockingIssues: [],
    },
    ...overrides,
  };
}

let storedSeq = 0;

/** Echo a stored ProjectEvidenceItem the way the real store would. */
function echoStoredItem(
  input: CreateProjectEvidenceItemInput
): Promise<ProjectEvidenceItem> {
  storedSeq += 1;
  return Promise.resolve({
    id: `evidence-${storedSeq}`,
    projectId: input.projectId,
    sourceFileId: input.sourceFileId,
    kind: input.kind,
    content: input.content,
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
  });
}

function persist(
  overrides: Partial<PersistRfpExtractionEvidenceInput> = {}
): Promise<PersistRfpExtractionEvidenceResult> {
  return persistRfpExtractionEvidence({
    tenantId: TENANT,
    projectId: PROJECT,
    inputPackageArtifactId: ARTIFACT,
    ...overrides,
  });
}

function storeCalls(): CreateProjectEvidenceItemInput[] {
  return mockCreateEvidence.mock.calls.map(
    (call) => call[0] as CreateProjectEvidenceItemInput
  );
}

beforeEach(() => {
  storedSeq = 0;
  mockRunExtraction
    .mockReset()
    .mockResolvedValue(makeOkRun([makeDocument(FILE_RFP)]));
  mockCreateEvidence.mockReset().mockImplementation(echoStoredItem);
});

describe("persistRfpExtractionEvidence - input validation", () => {
  it("throws on a blank inputPackageArtifactId before any run or store call", async () => {
    for (const blank of ["", "   "]) {
      await expect(persist({ inputPackageArtifactId: blank })).rejects.toThrow(
        "inputPackageArtifactId is required."
      );
    }
    expect(mockRunExtraction).not.toHaveBeenCalled();
    expect(mockCreateEvidence).not.toHaveBeenCalled();
  });

  it("throws on a non-positive or non-integer maxTextChunkChars before any run or store call", async () => {
    for (const bad of [0, -1, 2.5]) {
      await expect(persist({ maxTextChunkChars: bad })).rejects.toThrow(
        "maxTextChunkChars must be a positive integer."
      );
    }
    expect(mockRunExtraction).not.toHaveBeenCalled();
    expect(mockCreateEvidence).not.toHaveBeenCalled();
  });
});

describe("persistRfpExtractionEvidence - extraction-run wiring", () => {
  it("calls the prompt-178 service with exactly tenant, project, and artifact id", async () => {
    await persist();

    expect(mockRunExtraction).toHaveBeenCalledTimes(1);
    expect(mockRunExtraction).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: ARTIFACT,
    });
  });

  it("uses an injected runExtraction instead of the prompt-178 module", async () => {
    const runExtraction = vi.fn(
      async (): Promise<RunRfpInputPackageExtractionResult> =>
        makeOkRun([makeDocument(FILE_RFP)])
    );

    const result = await persist({ runExtraction });

    expect(result.status).toBe("ok");
    expect(runExtraction).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: ARTIFACT,
    });
    expect(mockRunExtraction).not.toHaveBeenCalled();
  });
});

describe("persistRfpExtractionEvidence - non-ok run propagation", () => {
  it("propagates every non-ok run status unchanged and creates no evidence", async () => {
    const nonOkResults: Exclude<
      RunRfpInputPackageExtractionResult,
      { status: "ok" }
    >[] = [
      { status: "not_found" },
      {
        status: "wrong_mode",
        project: {
          id: PROJECT,
          name: "Honeywell Quick BoM",
          customerName: "Honeywell",
          mode: "quick_bom",
          createdAt: TS1.toISOString(),
          updatedAt: TS2.toISOString(),
        },
      },
      { status: "input_package_not_found" },
      {
        status: "artifact_not_input_package",
        artifact: makeArtifactSummary({ type: "priced_boq" }),
      },
      {
        status: "input_package_not_approved",
        artifact: makeArtifactSummary({ status: "needs_review" }),
      },
      {
        status: "input_package_has_no_source_files",
        artifact: makeArtifactSummary({ sourceFileIds: [] }),
      },
      { status: "source_file_not_found", missingFileId: "file-missing-1" },
    ];
    for (const runResult of nonOkResults) {
      mockRunExtraction.mockResolvedValue(runResult);

      const result = await persist();

      expect(result).toEqual(runResult);
    }
    expect(mockCreateEvidence).not.toHaveBeenCalled();
  });
});

describe("persistRfpExtractionEvidence - quality gate", () => {
  it("returns quality_gate_failed with the run summaries and creates no evidence", async () => {
    const document = makeDocument(FILE_RFP, { text: "", tables: [] });
    const run = makeOkRun([document]);
    run.files = [
      {
        fileId: FILE_RFP,
        fileName: `${FILE_RFP}.pdf`,
        fileRole: "rfp",
        quality: "failed",
        reason: "no_extractable_text_or_tables",
        metrics: { ...document.metrics },
        warnings: [],
      },
    ];
    run.quality = {
      ...run.quality,
      status: "failed",
      passedFiles: 0,
      failedFiles: 1,
    };
    mockRunExtraction.mockResolvedValue(run);

    const result = await persist();

    expect(result.status).toBe("quality_gate_failed");
    if (result.status !== "quality_gate_failed") throw new Error("unreachable");
    expect(result.artifact).toEqual(run.artifact);
    expect(result.files).toEqual(run.files);
    expect(result.quality).toEqual(run.quality);
    expect("documents" in result).toBe(false);
    expect("evidence" in result).toBe(false);
    expect(mockCreateEvidence).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("persistRfpExtractionEvidence - text chunk persistence", () => {
  it("persists one rfp_document_text_chunk with full content for a short text-only document", async () => {
    const document = makeDocument(FILE_RFP);
    mockRunExtraction.mockResolvedValue(makeOkRun([document]));

    const result = await persist();

    expect(mockCreateEvidence).toHaveBeenCalledTimes(1);
    expect(mockCreateEvidence).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      sourceFileId: FILE_RFP,
      kind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
      content: {
        evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
        inputPackageArtifactId: ARTIFACT,
        sourceFileId: FILE_RFP,
        sourceFileName: `${FILE_RFP}.pdf`,
        sourceFileRole: "rfp",
        chunkIndex: 1,
        chunkCount: 1,
        text: "Provide 48-port access switches.",
        charCount: 32,
        documentMetrics: { ...document.metrics },
      },
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.evidenceCount).toBe(1);
    expect(result.textChunkCount).toBe(1);
    expect(result.tableEvidenceCount).toBe(0);
    expect(result.artifact).toEqual(makeArtifactSummary({ sourceFileIds: [FILE_RFP] }));
    expect(result.quality.status).toBe("passed");
    expect(result.evidence).toEqual([
      {
        id: "evidence-1",
        projectId: PROJECT,
        sourceFileId: FILE_RFP,
        kind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
        extractedAt: STORED_AT.toISOString(),
        retainUntil: STORED_RETAIN.toISOString(),
        contentSummary: {
          evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
          chunkIndex: 1,
          chunkCount: 1,
          charCount: 32,
        },
      },
    ]);
  });

  it("creates no text chunks for a document whose text is only whitespace", async () => {
    const document = makeDocument(FILE_RFP, {
      text: " \n\n \n ",
      tables: [makeTable(FILE_RFP, 1)],
    });
    mockRunExtraction.mockResolvedValue(makeOkRun([document]));

    const result = await persist();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.textChunkCount).toBe(0);
    expect(result.tableEvidenceCount).toBe(1);
    expect(storeCalls().map((c) => c.kind)).toEqual([RFP_TABLE_EVIDENCE_KIND]);
  });

  it("splits long text into 1-based chunks with consistent chunkCount and metrics", async () => {
    const document = makeDocument(FILE_RFP, {
      text: "para one\n\npara two\n\npara three",
    });
    mockRunExtraction.mockResolvedValue(makeOkRun([document]));

    const result = await persist({ maxTextChunkChars: 18 });

    const calls = storeCalls();
    expect(calls.map((c) => c.content.text)).toEqual([
      "para one\n\npara two",
      "para three",
    ]);
    expect(calls.map((c) => c.content.chunkIndex)).toEqual([1, 2]);
    expect(calls.map((c) => c.content.chunkCount)).toEqual([2, 2]);
    expect(calls.map((c) => c.content.charCount)).toEqual([18, 10]);
    for (const call of calls) {
      expect(call.content.inputPackageArtifactId).toBe(ARTIFACT);
      expect(call.content.documentMetrics).toEqual(document.metrics);
    }
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.textChunkCount).toBe(2);
    expect(result.evidence.map((e) => e.contentSummary)).toEqual([
      {
        evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
        chunkIndex: 1,
        chunkCount: 2,
        charCount: 18,
      },
      {
        evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
        chunkIndex: 2,
        chunkCount: 2,
        charCount: 10,
      },
    ]);
  });

  it("defaults maxTextChunkChars to 3000 and hard-splits unbroken text at that bound", async () => {
    expect(DEFAULT_MAX_TEXT_CHUNK_CHARS).toBe(3000);
    const document = makeDocument(FILE_RFP, { text: "a".repeat(3001) });
    mockRunExtraction.mockResolvedValue(makeOkRun([document]));

    const result = await persist();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.textChunkCount).toBe(2);
    expect(storeCalls().map((c) => c.content.charCount)).toEqual([3000, 1]);
  });
});

describe("persistRfpExtractionEvidence - table persistence", () => {
  it("persists one rfp_document_table per table with rows and only-defined page/sheet fields", async () => {
    const tableWithPage = makeTable(FILE_BOQ, 2, 1, { pageNumber: 4 });
    const tableWithSheet = makeTable(FILE_BOQ, 3, 2, { sheetName: "BoQ Sheet" });
    const document = makeDocument(FILE_BOQ, {
      text: "",
      tables: [tableWithPage, tableWithSheet],
    });
    mockRunExtraction.mockResolvedValue(makeOkRun([document]));

    const result = await persist();

    expect(mockCreateEvidence).toHaveBeenCalledTimes(2);
    const calls = storeCalls();
    expect(calls[0]).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      sourceFileId: FILE_BOQ,
      kind: RFP_TABLE_EVIDENCE_KIND,
      content: {
        evidenceKind: RFP_TABLE_EVIDENCE_KIND,
        inputPackageArtifactId: ARTIFACT,
        sourceFileId: FILE_BOQ,
        sourceFileName: `${FILE_BOQ}.pdf`,
        sourceFileRole: "rfp",
        tableId: `${FILE_BOQ}:table:1`,
        pageNumber: 4,
        rowCount: 2,
        columnCount: 2,
        rows: [
          ["SKU-1", "1"],
          ["SKU-2", "2"],
        ],
      },
    });
    expect("sheetName" in calls[0].content).toBe(false);
    expect(calls[1].content).toMatchObject({
      tableId: `${FILE_BOQ}:table:2`,
      sheetName: "BoQ Sheet",
      rowCount: 3,
    });
    expect("pageNumber" in calls[1].content).toBe(false);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.textChunkCount).toBe(0);
    expect(result.tableEvidenceCount).toBe(2);
    expect(result.evidenceCount).toBe(2);
    expect(result.evidence[1]).toEqual({
      id: "evidence-2",
      projectId: PROJECT,
      sourceFileId: FILE_BOQ,
      kind: RFP_TABLE_EVIDENCE_KIND,
      extractedAt: STORED_AT.toISOString(),
      retainUntil: STORED_RETAIN.toISOString(),
      contentSummary: {
        evidenceKind: RFP_TABLE_EVIDENCE_KIND,
        tableId: `${FILE_BOQ}:table:2`,
        rowCount: 3,
        columnCount: 2,
      },
    });
  });
});

describe("persistRfpExtractionEvidence - document order", () => {
  it("persists documents in run order, each document's text chunks before its tables", async () => {
    const docA = makeDocument("file-a", {
      text: "alpha one\n\nalpha two",
      tables: [makeTable("file-a", 1)],
    });
    const docB = makeDocument("file-b", {
      text: "beta",
      tables: [makeTable("file-b", 1, 1), makeTable("file-b", 2, 2)],
    });
    mockRunExtraction.mockResolvedValue(makeOkRun([docA, docB]));

    const result = await persist({ maxTextChunkChars: 9 });

    const calls = storeCalls();
    expect(
      calls.map((c) => [
        c.sourceFileId,
        c.kind,
        c.content.chunkIndex ?? c.content.tableId,
      ])
    ).toEqual([
      ["file-a", RFP_TEXT_CHUNK_EVIDENCE_KIND, 1],
      ["file-a", RFP_TEXT_CHUNK_EVIDENCE_KIND, 2],
      ["file-a", RFP_TABLE_EVIDENCE_KIND, "file-a:table:1"],
      ["file-b", RFP_TEXT_CHUNK_EVIDENCE_KIND, 1],
      ["file-b", RFP_TABLE_EVIDENCE_KIND, "file-b:table:1"],
      ["file-b", RFP_TABLE_EVIDENCE_KIND, "file-b:table:2"],
    ]);
    for (const call of calls) {
      expect(call.tenantId).toBe(TENANT);
      expect(call.projectId).toBe(PROJECT);
    }
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.evidenceCount).toBe(6);
    expect(result.textChunkCount).toBe(3);
    expect(result.tableEvidenceCount).toBe(3);
    expect(result.evidence.map((e) => e.id)).toEqual([
      "evidence-1",
      "evidence-2",
      "evidence-3",
      "evidence-4",
      "evidence-5",
      "evidence-6",
    ]);
    expect(result.evidence.map((e) => e.sourceFileId)).toEqual([
      "file-a",
      "file-a",
      "file-a",
      "file-b",
      "file-b",
      "file-b",
    ]);
  });
});

describe("chunkRfpDocumentText", () => {
  it("throws on invalid maxChars before splitting", () => {
    for (const bad of [0, -1, 2.5]) {
      expect(() => chunkRfpDocumentText("abcdefghijk", bad)).toThrow(
        "maxChars must be a positive integer."
      );
    }
  });

  it("returns the whole text as one chunk when it fits", () => {
    expect(chunkRfpDocumentText("short text", 3000)).toEqual(["short text"]);
  });

  it("prefers paragraph boundaries over mid-paragraph cuts", () => {
    expect(chunkRfpDocumentText("aaaa\n\nbbbb\n\ncccc", 12)).toEqual([
      "aaaa\n\nbbbb",
      "cccc",
    ]);
  });

  it("falls back to line splits inside an oversized paragraph", () => {
    expect(chunkRfpDocumentText("1111\n2222\n3333", 9)).toEqual([
      "1111\n2222",
      "3333",
    ]);
  });

  it("falls back to word splits inside an oversized line", () => {
    expect(chunkRfpDocumentText("aa bb cc dd", 5)).toEqual(["aa bb", "cc dd"]);
  });

  it("hard-splits a single token longer than the budget", () => {
    expect(chunkRfpDocumentText("abcdefghijk", 4)).toEqual([
      "abcd",
      "efgh",
      "ijk",
    ]);
  });

  it("cascades paragraph, line, word, and width splits in one text and never exceeds the budget", () => {
    const text = "tiny\n\nlong line aaaaaaaaaa\nnext";

    const chunks = chunkRfpDocumentText(text, 10);

    expect(chunks).toEqual(["tiny", "long line", "aaaaaaaaaa", "next"]);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10);
    }
    expect(chunkRfpDocumentText(text, 10)).toEqual(chunks);
  });
});

describe("persistRfpExtractionEvidence - result hygiene", () => {
  it("returns serializable summaries with no tenantId, storagePath, or content bodies", async () => {
    const document = makeDocument(FILE_RFP, {
      tables: [makeTable(FILE_RFP, 2)],
    });
    mockRunExtraction.mockResolvedValue(makeOkRun([document]));

    const result = await persist();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    for (const item of result.evidence) {
      expect("content" in item).toBe(false);
      expect("tenantId" in item).toBe(false);
    }
    for (const call of storeCalls()) {
      expect("tenantId" in call.content).toBe(false);
      expect("storagePath" in call.content).toBe(false);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("Provide 48-port");
    expect(json).not.toContain("SKU-1");
    expect(JSON.parse(json)).toEqual(result);
  });
});

describe("persistRfpExtractionEvidence - immutability", () => {
  it("does not mutate the input or run result, and stores copied metrics/rows", async () => {
    const table = makeTable(FILE_BOQ, 2, 1, { sheetName: "BoQ" });
    const docA = makeDocument(FILE_RFP, { text: "para one\n\npara two" });
    const docB = makeDocument(FILE_BOQ, { text: "", tables: [table] });
    const run = makeOkRun([docA, docB]);
    mockRunExtraction.mockResolvedValue(run);
    const input: PersistRfpExtractionEvidenceInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: ARTIFACT,
      maxTextChunkChars: 9,
    };
    const runSnapshot = structuredClone(run);
    const inputSnapshot = structuredClone(input);

    const result = await persistRfpExtractionEvidence(input);

    expect(result.status).toBe("ok");
    expect(input).toEqual(inputSnapshot);
    expect(run).toEqual(runSnapshot);
    const calls = storeCalls();
    const tableCall = calls.find((c) => c.kind === RFP_TABLE_EVIDENCE_KIND);
    const chunkCall = calls.find((c) => c.kind === RFP_TEXT_CHUNK_EVIDENCE_KIND);
    if (!tableCall || !chunkCall) throw new Error("unreachable");
    expect(tableCall.content.rows).toEqual(table.rows);
    expect(tableCall.content.rows).not.toBe(table.rows);
    expect((tableCall.content.rows as string[][])[0]).not.toBe(table.rows[0]);
    expect(chunkCall.content.documentMetrics).toEqual(docA.metrics);
    expect(chunkCall.content.documentMetrics).not.toBe(docA.metrics);
  });
});

describe("persistRfpExtractionEvidence - store failures", () => {
  it("bubbles a createProjectEvidenceItem failure and attempts no further items", async () => {
    const document = makeDocument(FILE_RFP, {
      text: "para one\n\npara two",
      tables: [makeTable(FILE_RFP, 1)],
    });
    mockRunExtraction.mockResolvedValue(makeOkRun([document]));
    mockCreateEvidence
      .mockReset()
      .mockImplementationOnce(echoStoredItem)
      .mockRejectedValueOnce(new Error("insert failed"));

    await expect(persist({ maxTextChunkChars: 9 })).rejects.toThrow(
      "insert failed"
    );
    expect(mockCreateEvidence).toHaveBeenCalledTimes(2);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-evidence-persistence.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-evidence-persistence.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the prompt-178 run service, the evidence store, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-extraction-run",
      "@/lib/db/project-evidence-store",
      "@/types/project",
    ]);
  });

  it("performs no mutation other than createProjectEvidenceItem", () => {
    const mutationTokens =
      source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual([
      "createProjectEvidenceItem",
    ]);
  });

  it("imports no project/artifact/file/approval store, parser, pricing, config-expansion, export, runner, AI, catalog, coordinator, engine, adapter, intake, or UI module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-store"',
      'from "@/lib/db/project-artifact-store"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/artifacts"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/boq-formats"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      'from "react',
      "@anthropic-ai",
      "@google/generative-ai",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
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
