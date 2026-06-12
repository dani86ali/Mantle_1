import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectStageId,
} from "@/types/project";
import type {
  ExtractRfpDocumentFileResult,
  RfpExtractedDocument,
  RfpExtractedTable,
} from "@/lib/projects/rfp-document-extraction";

// Mock the three DB store boundaries plus the prompt-177 extraction module.
// The service's gates and quality arithmetic stay real; no file bytes, parser
// libraries, or DB are touched anywhere in this suite.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockGetFileById,
  mockExtractRfpDocumentFile,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockGetFileById: vi.fn(),
  mockExtractRfpDocumentFile: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  getProjectFileById: mockGetFileById,
}));
vi.mock("@/lib/projects/rfp-document-extraction", () => ({
  extractRfpDocumentFile: mockExtractRfpDocumentFile,
}));

import {
  runRfpInputPackageExtraction,
  type RunRfpInputPackageExtractionInput,
  type RunRfpInputPackageExtractionResult,
} from "@/lib/projects/project-rfp-extraction-run";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-input-package-3";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const RETAIN = new Date("2027-06-02T11:30:00.000Z");
const PAYLOAD_SENTINEL = "payload-only-do-not-leak";
const STORAGE_SENTINEL = "secret-storage-root-do-not-leak";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Bid",
    customerName: "STC",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "input_package",
    status: "approved",
    version: 3,
    payload: { payloadKind: "rfp_input_package", secret: PAYLOAD_SENTINEL },
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeFile(id: string, overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id,
    projectId: PROJECT,
    fileRole: "rfp",
    fileName: `${id}.pdf`,
    storagePath: `${STORAGE_SENTINEL}/${id}.pdf`,
    uploadedAt: TS1,
    retainUntil: RETAIN,
    ...overrides,
  };
}

function makeTable(
  file: Pick<ProjectFile, "id" | "fileName" | "fileRole">,
  rowCount: number,
  tableNumber = 1
): RfpExtractedTable {
  return {
    tableId: `${file.id}:table:${tableNumber}`,
    sourceFileId: file.id,
    sourceFileName: file.fileName,
    sourceFileRole: file.fileRole,
    rowCount,
    columnCount: 2,
    rows: Array.from({ length: rowCount }, (_, i) => [`SKU-${i}`, String(i + 1)]),
  };
}

/** A quality-PASSING text-only document unless overridden. */
function makeDocument(
  file: Pick<ProjectFile, "id" | "fileName" | "fileRole">,
  overrides: Partial<RfpExtractedDocument> = {}
): RfpExtractedDocument {
  return {
    sourceFileId: file.id,
    sourceFileName: file.fileName,
    sourceFileRole: file.fileRole,
    extension: ".pdf",
    text: "Provide 48-port access switches.",
    tables: [],
    warnings: [],
    metrics: {
      textCharCount: 32,
      nonWhitespaceTextCharCount: 29,
      tableCount: 0,
      tableRowCount: 0,
    },
    ...overrides,
  };
}

function extractedResult(
  document: RfpExtractedDocument
): ExtractRfpDocumentFileResult {
  return { status: "extracted", document };
}

function run(
  overrides: Partial<RunRfpInputPackageExtractionInput> = {}
): Promise<RunRfpInputPackageExtractionResult> {
  return runRfpInputPackageExtraction({
    tenantId: TENANT,
    projectId: PROJECT,
    inputPackageArtifactId: ARTIFACT,
    ...overrides,
  });
}

function expectNoDownstreamCalls(): void {
  expect(mockGetFileById).not.toHaveBeenCalled();
  expect(mockExtractRfpDocumentFile).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
  mockGetFileById
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, fileId: string) =>
        makeFile(fileId)
    );
  mockExtractRfpDocumentFile
    .mockReset()
    .mockImplementation(async (input: { file: ProjectFile }) =>
      extractedResult(makeDocument(input.file))
    );
});

describe("runRfpInputPackageExtraction - input validation", () => {
  it("throws on a blank inputPackageArtifactId before any store or extractor call", async () => {
    for (const blank of ["", "   "]) {
      await expect(run({ inputPackageArtifactId: blank })).rejects.toThrow(
        "inputPackageArtifactId is required."
      );
    }
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expectNoDownstreamCalls();
  });
});

describe("runRfpInputPackageExtraction - project gates", () => {
  it("returns not_found and never loads the artifact, files, or extractor when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await run();

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProjectById).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expectNoDownstreamCalls();
  });

  it("returns a wrong_mode lean summary (no tenantId) for a non-rfp project and stops", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({
        mode: "quick_bom",
        name: "Honeywell Quick BoM",
        customerName: "Honeywell",
      })
    );

    const result = await run();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "Honeywell Quick BoM",
      customerName: "Honeywell",
      mode: "quick_bom",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expectNoDownstreamCalls();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    mockGetProjectById.mockResolvedValue(
      makeProject({ mode: "quick_bom", customerName: undefined })
    );

    const result = await run();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });
});

describe("runRfpInputPackageExtraction - artifact gates", () => {
  it("returns input_package_not_found when the exact artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await run();

    expect(result).toEqual({ status: "input_package_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expectNoDownstreamCalls();
  });

  it("rejects every non-input_package type as artifact_not_input_package before the approval gate", async () => {
    const otherTypes: ProjectArtifactType[] = [
      "normalized_boq",
      "sku_resolution",
      "configuration_expansion",
      "priced_boq",
      "requirements_baseline",
      "compliance_matrix",
      "hld_design_delta",
      "technical_proposal",
      "export_package",
    ];
    for (const type of otherTypes) {
      // Non-approved status proves the TYPE gate fires before the approval gate.
      mockGetArtifactById.mockResolvedValue(
        makeArtifact({ type, status: "needs_review" })
      );

      const result = await run();

      expect(result.status).toBe("artifact_not_input_package");
      if (result.status !== "artifact_not_input_package") {
        throw new Error("unreachable");
      }
      expect(result.artifact.type).toBe(type);
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain(PAYLOAD_SENTINEL);
    }
    expectNoDownstreamCalls();
  });

  it("rejects an input_package artifact outside intake_package_review as artifact_not_input_package", async () => {
    const wrongStages: ProjectStageId[] = [
      "boq_format_validation",
      "requirements_baseline_review",
    ];
    for (const stageId of wrongStages) {
      mockGetArtifactById.mockResolvedValue(
        makeArtifact({ stageId, status: "needs_review" })
      );

      const result = await run();

      expect(result.status).toBe("artifact_not_input_package");
      if (result.status !== "artifact_not_input_package") {
        throw new Error("unreachable");
      }
      expect(result.artifact.stageId).toBe(stageId);
    }
    expectNoDownstreamCalls();
  });

  it("rejects every non-approved input_package status as input_package_not_approved", async () => {
    const nonApproved: ProjectArtifactStatus[] = [
      "missing",
      "generated",
      "needs_review",
      "rejected",
      "stale",
      "failed",
      "not_applicable",
    ];
    for (const status of nonApproved) {
      mockGetArtifactById.mockResolvedValue(makeArtifact({ status }));

      const result = await run();

      expect(result.status).toBe("input_package_not_approved");
      if (result.status !== "input_package_not_approved") {
        throw new Error("unreachable");
      }
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain(PAYLOAD_SENTINEL);
    }
    expectNoDownstreamCalls();
  });
});

describe("runRfpInputPackageExtraction - source files", () => {
  it("returns input_package_has_no_source_files for an empty sourceFileIds and never extracts", async () => {
    mockGetArtifactById.mockResolvedValue(makeArtifact({ sourceFileIds: [] }));

    const result = await run();

    expect(result.status).toBe("input_package_has_no_source_files");
    if (result.status !== "input_package_has_no_source_files") {
      throw new Error("unreachable");
    }
    expect(result.artifact.id).toBe(ARTIFACT);
    expect(result.artifact.sourceFileIds).toEqual([]);
    expectNoDownstreamCalls();
  });

  it("returns source_file_not_found with the missing id, stops loading, and never extracts", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: ["file-a", "file-b", "file-c"] })
    );
    mockGetFileById.mockImplementation(
      async (_tenantId: string, _projectId: string, fileId: string) =>
        fileId === "file-b" ? null : makeFile(fileId)
    );

    const result = await run();

    expect(result).toEqual({
      status: "source_file_not_found",
      missingFileId: "file-b",
    });
    expect(mockGetFileById).toHaveBeenCalledTimes(2);
    expect(mockGetFileById).toHaveBeenNthCalledWith(1, TENANT, PROJECT, "file-a");
    expect(mockGetFileById).toHaveBeenNthCalledWith(2, TENANT, PROJECT, "file-b");
    expect(mockExtractRfpDocumentFile).not.toHaveBeenCalled();
  });

  it("loads and extracts files in artifact sourceFileIds order, tenant scoped", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: [FILE_BOQ, FILE_RFP] })
    );

    const result = await run();

    expect(mockGetFileById).toHaveBeenNthCalledWith(1, TENANT, PROJECT, FILE_BOQ);
    expect(mockGetFileById).toHaveBeenNthCalledWith(2, TENANT, PROJECT, FILE_RFP);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.files.map((f) => f.fileId)).toEqual([FILE_BOQ, FILE_RFP]);
    expect(result.documents.map((d) => d.sourceFileId)).toEqual([
      FILE_BOQ,
      FILE_RFP,
    ]);
  });
});

describe("runRfpInputPackageExtraction - extractor wiring", () => {
  it("defaults to the prompt-177 module, called with exactly { file } per source file", async () => {
    const result = await run();

    expect(result.status).toBe("ok");
    expect(mockExtractRfpDocumentFile).toHaveBeenCalledTimes(2);
    expect(mockExtractRfpDocumentFile).toHaveBeenNthCalledWith(1, {
      file: makeFile(FILE_RFP),
    });
    expect(mockExtractRfpDocumentFile).toHaveBeenNthCalledWith(2, {
      file: makeFile(FILE_BOQ),
    });
  });

  it("uses an injected extractor instead of the prompt-177 module", async () => {
    const extractor = vi.fn(
      (file: ProjectFile): Promise<ExtractRfpDocumentFileResult> =>
        Promise.resolve(extractedResult(makeDocument(file)))
    );

    const result = await run({ extractor });

    expect(result.status).toBe("ok");
    expect(extractor).toHaveBeenCalledTimes(2);
    expect(extractor).toHaveBeenNthCalledWith(1, makeFile(FILE_RFP));
    expect(extractor).toHaveBeenNthCalledWith(2, makeFile(FILE_BOQ));
    expect(mockExtractRfpDocumentFile).not.toHaveBeenCalled();
  });
});

describe("runRfpInputPackageExtraction - per-file quality gate", () => {
  it("passes a text-only document", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: [FILE_RFP] })
    );

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.files).toEqual([
      {
        fileId: FILE_RFP,
        fileName: `${FILE_RFP}.pdf`,
        fileRole: "rfp",
        quality: "passed",
        metrics: {
          textCharCount: 32,
          nonWhitespaceTextCharCount: 29,
          tableCount: 0,
          tableRowCount: 0,
        },
        warnings: [],
      },
    ]);
    expect(result.quality.status).toBe("passed");
  });

  it("passes a table-only document", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: [FILE_BOQ] })
    );
    mockExtractRfpDocumentFile.mockImplementation(
      async (input: { file: ProjectFile }) =>
        extractedResult(
          makeDocument(input.file, {
            text: "",
            tables: [makeTable(input.file, 3)],
            metrics: {
              textCharCount: 0,
              nonWhitespaceTextCharCount: 0,
              tableCount: 1,
              tableRowCount: 3,
            },
          })
        )
    );

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.files[0].quality).toBe("passed");
    expect(result.quality.status).toBe("passed");
  });

  it("passes a document with both text and tables", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: [FILE_BOQ] })
    );
    mockExtractRfpDocumentFile.mockImplementation(
      async (input: { file: ProjectFile }) =>
        extractedResult(
          makeDocument(input.file, {
            tables: [makeTable(input.file, 2)],
            metrics: {
              textCharCount: 32,
              nonWhitespaceTextCharCount: 29,
              tableCount: 1,
              tableRowCount: 2,
            },
          })
        )
    );

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.files[0].quality).toBe("passed");
    expect(result.quality.status).toBe("passed");
  });

  it("fails a document with zero nonwhitespace text and zero table rows, but still returns it", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: [FILE_RFP] })
    );
    const emptyDocument = makeDocument(makeFile(FILE_RFP), {
      text: "",
      tables: [],
      metrics: {
        textCharCount: 0,
        nonWhitespaceTextCharCount: 0,
        tableCount: 0,
        tableRowCount: 0,
      },
    });
    mockExtractRfpDocumentFile.mockResolvedValue(extractedResult(emptyDocument));

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.files[0]).toMatchObject({
      fileId: FILE_RFP,
      quality: "failed",
      reason: "no_extractable_text_or_tables",
    });
    // Extraction itself succeeded, so the (empty) document is still surfaced.
    expect(result.documents).toEqual([emptyDocument]);
    expect(result.quality.status).toBe("failed");
  });

  it("captures an unsupported extension as a failed file result instead of throwing", async () => {
    mockExtractRfpDocumentFile.mockImplementation(
      async (input: { file: ProjectFile }) =>
        input.file.id === FILE_BOQ
          ? { status: "unsupported_extension", extension: ".zip" }
          : extractedResult(makeDocument(input.file))
    );

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.files[1]).toEqual({
      fileId: FILE_BOQ,
      fileName: `${FILE_BOQ}.pdf`,
      fileRole: "rfp",
      quality: "failed",
      reason: "unsupported_extension",
      metrics: {
        textCharCount: 0,
        nonWhitespaceTextCharCount: 0,
        tableCount: 0,
        tableRowCount: 0,
      },
      warnings: [],
    });
    expect(result.documents.map((d) => d.sourceFileId)).toEqual([FILE_RFP]);
    expect(result.quality).toMatchObject({
      status: "failed",
      totalFiles: 2,
      passedFiles: 1,
      failedFiles: 1,
    });
  });

  it("captures an extractor throw as extractor_failed, keeps extracting, and leaks no stack or storagePath", async () => {
    mockExtractRfpDocumentFile.mockImplementation(
      async (input: { file: ProjectFile }) => {
        if (input.file.id === FILE_RFP) {
          throw new Error(`parser exploded reading ${input.file.storagePath}`);
        }
        return extractedResult(makeDocument(input.file));
      }
    );

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.files[0]).toMatchObject({
      fileId: FILE_RFP,
      quality: "failed",
      reason: "extractor_failed",
    });
    // The throw on the first file must not stop the second file's extraction.
    expect(result.files[1]).toMatchObject({ fileId: FILE_BOQ, quality: "passed" });
    expect(result.documents.map((d) => d.sourceFileId)).toEqual([FILE_BOQ]);
    expect(result.quality.blockingIssues).toEqual([
      {
        fileId: FILE_RFP,
        fileName: `${FILE_RFP}.pdf`,
        fileRole: "rfp",
        reason: "extractor_failed",
        severity: "blocking",
        message: "File could not be parsed by the extractor.",
      },
    ]);
    const json = JSON.stringify(result);
    expect(json).not.toContain("parser exploded");
    expect(json).not.toContain(STORAGE_SENTINEL);
    expect(json).not.toContain("Error:");
  });
});

describe("runRfpInputPackageExtraction - quality report", () => {
  function mixedRunSetup(): void {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: ["file-a", "file-b", "file-c"] })
    );
    mockExtractRfpDocumentFile.mockImplementation(
      async (input: { file: ProjectFile }) => {
        if (input.file.id === "file-a") {
          return extractedResult(
            makeDocument(input.file, {
              tables: [makeTable(input.file, 6), makeTable(input.file, 4, 2)],
              warnings: ["pdf_table_extraction_failed"],
              metrics: {
                textCharCount: 100,
                nonWhitespaceTextCharCount: 80,
                tableCount: 2,
                tableRowCount: 10,
              },
            })
          );
        }
        if (input.file.id === "file-b") {
          return { status: "unsupported_extension", extension: ".zip" };
        }
        return extractedResult(
          makeDocument(input.file, {
            text: "",
            tables: [],
            warnings: ["docx_parser_warning:odd style"],
            metrics: {
              textCharCount: 0,
              nonWhitespaceTextCharCount: 0,
              tableCount: 0,
              tableRowCount: 0,
            },
          })
        );
      }
    );
  }

  it("aggregates counts, file-scoped warnings, and structured details across mixed results", async () => {
    mixedRunSetup();

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.quality).toEqual({
      status: "failed",
      totalFiles: 3,
      passedFiles: 1,
      failedFiles: 2,
      totalTextChars: 100,
      totalNonWhitespaceTextChars: 80,
      totalTables: 2,
      totalTableRows: 10,
      warnings: [
        "file-a:pdf_table_extraction_failed",
        "file-c:docx_parser_warning:odd style",
      ],
      warningDetails: [
        {
          fileId: "file-a",
          fileName: "file-a.pdf",
          fileRole: "rfp",
          warning: "pdf_table_extraction_failed",
          category: "table_extraction_failed",
          severity: "warning",
        },
        {
          fileId: "file-c",
          fileName: "file-c.pdf",
          fileRole: "rfp",
          warning: "docx_parser_warning:odd style",
          category: "parser_warning",
          severity: "warning",
        },
      ],
      blockingIssues: [
        {
          fileId: "file-b",
          fileName: "file-b.pdf",
          fileRole: "rfp",
          reason: "unsupported_extension",
          severity: "blocking",
          message: "File extension is not supported for extraction.",
        },
        {
          fileId: "file-c",
          fileName: "file-c.pdf",
          fileRole: "rfp",
          reason: "no_extractable_text_or_tables",
          severity: "blocking",
          message: "File has no extractable text or table rows.",
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(result.quality))).toEqual(result.quality);
  });

  it("is deterministic: two identical runs produce identical results", async () => {
    mixedRunSetup();

    const first = await run();
    const second = await run();

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("reports passed only when every file passes", async () => {
    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.quality).toEqual({
      status: "passed",
      totalFiles: 2,
      passedFiles: 2,
      failedFiles: 0,
      totalTextChars: 64,
      totalNonWhitespaceTextChars: 58,
      totalTables: 0,
      totalTableRows: 0,
      warnings: [],
      warningDetails: [],
      blockingIssues: [],
    });
  });
});

describe("runRfpInputPackageExtraction - structured warning details", () => {
  it("parses merged-cell warnings into merged_cells details without failing the file", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: [FILE_BOQ] })
    );
    mockGetFileById.mockImplementation(
      async (_tenantId: string, _projectId: string, fileId: string) =>
        makeFile(fileId, { fileName: `${fileId}.xlsx`, fileRole: "boq" })
    );
    mockExtractRfpDocumentFile.mockImplementation(
      async (input: { file: ProjectFile }) =>
        extractedResult(
          makeDocument(input.file, {
            extension: ".xlsx",
            warnings: [
              "xlsx_merged_cells:BoQ Sheet:A1:D1",
              "xlsx_merged_cells:Summary:B2:B5",
            ],
          })
        )
    );

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    // Merged cells are engineer-visible warnings, never a failure.
    expect(result.files[0].quality).toBe("passed");
    expect(result.quality.status).toBe("passed");
    expect(result.quality.blockingIssues).toEqual([]);
    expect(result.quality.warnings).toEqual([
      `${FILE_BOQ}:xlsx_merged_cells:BoQ Sheet:A1:D1`,
      `${FILE_BOQ}:xlsx_merged_cells:Summary:B2:B5`,
    ]);
    expect(result.quality.warningDetails).toEqual([
      {
        fileId: FILE_BOQ,
        fileName: `${FILE_BOQ}.xlsx`,
        fileRole: "boq",
        warning: "xlsx_merged_cells:BoQ Sheet:A1:D1",
        category: "merged_cells",
        severity: "warning",
        sheetName: "BoQ Sheet",
        range: "A1:D1",
      },
      {
        fileId: FILE_BOQ,
        fileName: `${FILE_BOQ}.xlsx`,
        fileRole: "boq",
        warning: "xlsx_merged_cells:Summary:B2:B5",
        category: "merged_cells",
        severity: "warning",
        sheetName: "Summary",
        range: "B2:B5",
      },
    ]);
  });

  it("categorizes table-extraction, parser, unknown, and malformed merged-cell warnings deterministically", async () => {
    const warnings = [
      "pdf_table_extraction_failed",
      "docx_table_extraction_failed",
      "docx_parser_warning:odd style",
      "csv_parser_warning:Quotes",
      "totally_unexpected_warning",
      "xlsx_merged_cells:SheetWithoutRange",
    ];
    mockGetArtifactById.mockResolvedValue(
      makeArtifact({ sourceFileIds: [FILE_RFP] })
    );
    mockExtractRfpDocumentFile.mockImplementation(
      async (input: { file: ProjectFile }) =>
        extractedResult(makeDocument(input.file, { warnings: warnings.slice() }))
    );

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.quality.status).toBe("passed");
    expect(
      result.quality.warningDetails.map((d) => [d.warning, d.category])
    ).toEqual([
      ["pdf_table_extraction_failed", "table_extraction_failed"],
      ["docx_table_extraction_failed", "table_extraction_failed"],
      ["docx_parser_warning:odd style", "parser_warning"],
      ["csv_parser_warning:Quotes", "parser_warning"],
      ["totally_unexpected_warning", "extractor_warning"],
      ["xlsx_merged_cells:SheetWithoutRange", "merged_cells"],
    ]);
    for (const detail of result.quality.warningDetails) {
      expect(detail.severity).toBe("warning");
      expect(detail.fileId).toBe(FILE_RFP);
      expect(detail.fileName).toBe(`${FILE_RFP}.pdf`);
      expect(detail.fileRole).toBe("rfp");
    }
    // A merged-cells warning without a parsable location keeps its category
    // but omits sheetName/range entirely.
    const malformed = result.quality.warningDetails[5];
    expect("sheetName" in malformed).toBe(false);
    expect("range" in malformed).toBe(false);
    // The legacy flat list stays index-aligned with the structured details.
    expect(result.quality.warnings).toEqual(
      warnings.map((w) => `${FILE_RFP}:${w}`)
    );
  });
});

describe("runRfpInputPackageExtraction - ok result hygiene", () => {
  it("returns the exact artifact summary with copied arrays and no payload", async () => {
    const loaded = makeArtifact();
    mockGetArtifactById.mockResolvedValue(loaded);

    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
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
    });
    expect(result.artifact.sourceFileIds).not.toBe(loaded.sourceFileIds);
    expect(result.artifact.sourceArtifactIds).not.toBe(loaded.sourceArtifactIds);
  });

  it("returns serializable summaries with no tenantId, payload, or storagePath anywhere", async () => {
    const result = await run();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);
    for (const file of result.files) {
      expect("storagePath" in file).toBe(false);
    }
    for (const document of result.documents) {
      expect("storagePath" in document).toBe(false);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain(PAYLOAD_SENTINEL);
    expect(json).not.toContain(STORAGE_SENTINEL);
    expect(JSON.parse(json)).toEqual(result);
  });
});

describe("runRfpInputPackageExtraction - immutability", () => {
  it("does not mutate the input, loaded artifact, loaded files, or extractor documents", async () => {
    const loadedArtifact = makeArtifact();
    mockGetArtifactById.mockResolvedValue(loadedArtifact);
    const loadedFiles: Record<string, ProjectFile> = {
      [FILE_RFP]: makeFile(FILE_RFP),
      [FILE_BOQ]: makeFile(FILE_BOQ),
    };
    mockGetFileById.mockImplementation(
      async (_tenantId: string, _projectId: string, fileId: string) =>
        loadedFiles[fileId] ?? null
    );
    const returnedDocuments: RfpExtractedDocument[] = [];
    const documentSnapshots: RfpExtractedDocument[] = [];
    const extractor = vi.fn(
      (file: ProjectFile): Promise<ExtractRfpDocumentFileResult> => {
        const document = makeDocument(file);
        returnedDocuments.push(document);
        documentSnapshots.push(structuredClone(document));
        return Promise.resolve(extractedResult(document));
      }
    );
    const input: RunRfpInputPackageExtractionInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: ARTIFACT,
      extractor,
    };
    const artifactSnapshot = structuredClone(loadedArtifact);
    const fileSnapshots = structuredClone(loadedFiles);

    const result = await runRfpInputPackageExtraction(input);

    expect(result.status).toBe("ok");
    expect(input).toEqual({
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: ARTIFACT,
      extractor,
    });
    expect(loadedArtifact).toEqual(artifactSnapshot);
    expect(loadedFiles).toEqual(fileSnapshots);
    expect(returnedDocuments).toEqual(documentSnapshots);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-extraction-run.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-extraction-run.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, file store, extraction module, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-file-store",
      "@/lib/projects/rfp-document-extraction",
      "@/types/project",
    ]);
  });

  it("performs no create/update/delete mutations at all", () => {
    const mutationTokens =
      source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(mutationTokens).toEqual([]);
  });

  it("imports no filesystem, evidence/approval store, artifact creation, parser/loader, pricing, config-expansion, export, runner, AI, catalog, coordinator, engine, adapter, intake, or UI module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/artifacts"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/project-rfp-input-package"',
      'from "@/lib/projects/project-rfp-input-package-approval"',
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
