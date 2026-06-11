import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ProjectEvidenceItem } from "@/types/project";
import type {
  PersistRfpExtractionEvidenceResult,
  RfpPersistedEvidenceSummary,
} from "@/lib/projects/project-rfp-evidence-persistence";
import type {
  RfpExtractionFileQualitySummary,
  RfpExtractionQualityReport,
  RfpExtractionRunArtifactSummary,
} from "@/lib/projects/project-rfp-extraction-run";

// Mock the evidence store's list and the prompt-179 persistence service; the
// run service's validation, duplicate detection, summarization, and status
// propagation stay real. No DB, file bytes, or parser libraries are touched
// anywhere in this suite.
const { mockListEvidence, mockPersistEvidence, TEXT_KIND, TABLE_KIND } =
  vi.hoisted(() => ({
    mockListEvidence: vi.fn(),
    mockPersistEvidence: vi.fn(),
    TEXT_KIND: "rfp_document_text_chunk" as const,
    TABLE_KIND: "rfp_document_table" as const,
  }));

vi.mock("@/lib/db/project-evidence-store", () => ({
  listProjectEvidenceItems: mockListEvidence,
}));
vi.mock("@/lib/projects/project-rfp-evidence-persistence", () => ({
  persistRfpExtractionEvidence: mockPersistEvidence,
  RFP_TEXT_CHUNK_EVIDENCE_KIND: TEXT_KIND,
  RFP_TABLE_EVIDENCE_KIND: TABLE_KIND,
}));

import {
  runRfpExtractionEvidencePersistence,
  type RunRfpExtractionEvidencePersistenceInput,
  type RunRfpExtractionEvidencePersistenceResult,
} from "@/lib/projects/project-rfp-evidence-run";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-input-package-3";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const STORED_AT = new Date("2026-06-03T08:15:00.000Z");
const STORED_RETAIN = new Date("2027-06-03T08:15:00.000Z");

const ARTIFACT_SUMMARY: RfpExtractionRunArtifactSummary = {
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
};

const QUALITY_PASSED: RfpExtractionQualityReport = {
  status: "passed",
  totalFiles: 1,
  passedFiles: 1,
  failedFiles: 0,
  totalTextChars: 32,
  totalNonWhitespaceTextChars: 29,
  totalTables: 0,
  totalTableRows: 0,
  warnings: [],
};

const FAILED_FILE: RfpExtractionFileQualitySummary = {
  fileId: FILE_RFP,
  fileName: `${FILE_RFP}.pdf`,
  fileRole: "rfp",
  quality: "failed",
  reason: "no_extractable_text_or_tables",
  metrics: {
    textCharCount: 0,
    nonWhitespaceTextCharCount: 0,
    tableCount: 0,
    tableRowCount: 0,
  },
  warnings: [],
};

const PERSISTED_SUMMARY: RfpPersistedEvidenceSummary = {
  id: "evidence-new-1",
  projectId: PROJECT,
  sourceFileId: FILE_RFP,
  kind: TEXT_KIND,
  extractedAt: STORED_AT.toISOString(),
  retainUntil: STORED_RETAIN.toISOString(),
  contentSummary: {
    evidenceKind: TEXT_KIND,
    chunkIndex: 1,
    chunkCount: 1,
    charCount: 32,
  },
};

const PERSIST_OK: PersistRfpExtractionEvidenceResult = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
  quality: QUALITY_PASSED,
  evidence: [PERSISTED_SUMMARY],
  evidenceCount: 1,
  textChunkCount: 1,
  tableEvidenceCount: 0,
};

/** Every prompt-179 persistence status, to be propagated unchanged. */
const ALL_PERSIST_RESULTS: PersistRfpExtractionEvidenceResult[] = [
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
    artifact: { ...ARTIFACT_SUMMARY, type: "priced_boq" },
  },
  {
    status: "input_package_not_approved",
    artifact: { ...ARTIFACT_SUMMARY, status: "needs_review" },
  },
  {
    status: "input_package_has_no_source_files",
    artifact: { ...ARTIFACT_SUMMARY, sourceFileIds: [] },
  },
  { status: "source_file_not_found", missingFileId: "file-missing-1" },
  {
    status: "quality_gate_failed",
    artifact: ARTIFACT_SUMMARY,
    files: [FAILED_FILE],
    quality: {
      ...QUALITY_PASSED,
      status: "failed",
      passedFiles: 0,
      failedFiles: 1,
    },
  },
  PERSIST_OK,
];

/** One stored text-chunk row as prompt 179 persists it (content body included). */
function makeTextChunkItem(
  id: string,
  overrides: Partial<ProjectEvidenceItem> = {}
): ProjectEvidenceItem {
  return {
    id,
    projectId: PROJECT,
    sourceFileId: FILE_RFP,
    kind: TEXT_KIND,
    content: {
      evidenceKind: TEXT_KIND,
      inputPackageArtifactId: ARTIFACT,
      sourceFileId: FILE_RFP,
      sourceFileName: `${FILE_RFP}.pdf`,
      sourceFileRole: "rfp",
      chunkIndex: 1,
      chunkCount: 2,
      text: "Provide 48-port access switches.",
      charCount: 32,
      documentMetrics: {
        textCharCount: 32,
        nonWhitespaceTextCharCount: 29,
        tableCount: 0,
        tableRowCount: 0,
      },
    },
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
    ...overrides,
  };
}

/** One stored table row as prompt 179 persists it (rows body included). */
function makeTableItem(
  id: string,
  overrides: Partial<ProjectEvidenceItem> = {}
): ProjectEvidenceItem {
  return {
    id,
    projectId: PROJECT,
    sourceFileId: FILE_BOQ,
    kind: TABLE_KIND,
    content: {
      evidenceKind: TABLE_KIND,
      inputPackageArtifactId: ARTIFACT,
      sourceFileId: FILE_BOQ,
      sourceFileName: `${FILE_BOQ}.xlsx`,
      sourceFileRole: "boq",
      tableId: `${FILE_BOQ}:table:1`,
      sheetName: "BoQ Sheet",
      rowCount: 2,
      columnCount: 2,
      rows: [
        ["SKU-1", "1"],
        ["SKU-2", "2"],
      ],
    },
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
    ...overrides,
  };
}

function run(
  overrides: Partial<RunRfpExtractionEvidencePersistenceInput> = {}
): Promise<RunRfpExtractionEvidencePersistenceResult> {
  return runRfpExtractionEvidencePersistence({
    tenantId: TENANT,
    projectId: PROJECT,
    inputPackageArtifactId: ARTIFACT,
    ...overrides,
  });
}

beforeEach(() => {
  mockListEvidence.mockReset().mockResolvedValue([]);
  mockPersistEvidence.mockReset().mockResolvedValue(PERSIST_OK);
});

describe("runRfpExtractionEvidencePersistence - input validation", () => {
  it("throws on a blank inputPackageArtifactId before any list or persistence call", async () => {
    for (const blank of ["", "   "]) {
      await expect(run({ inputPackageArtifactId: blank })).rejects.toThrow(
        "inputPackageArtifactId is required."
      );
    }
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockPersistEvidence).not.toHaveBeenCalled();
  });
});

describe("runRfpExtractionEvidencePersistence - wiring", () => {
  it("lists existing evidence tenant/project scoped, then persists with exactly tenant/project/artifact id", async () => {
    const result = await run();

    expect(mockListEvidence).toHaveBeenCalledTimes(1);
    expect(mockListEvidence).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockPersistEvidence).toHaveBeenCalledTimes(1);
    expect(mockPersistEvidence).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: ARTIFACT,
    });
    const arg = mockPersistEvidence.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "inputPackageArtifactId",
      "projectId",
      "tenantId",
    ]);
    expect(mockListEvidence.mock.invocationCallOrder[0]).toBeLessThan(
      mockPersistEvidence.mock.invocationCallOrder[0]
    );
    expect(result).toBe(PERSIST_OK);
  });

  it("uses injected listEvidenceItems and persistEvidence instead of the modules", async () => {
    const listEvidenceItems = vi.fn(
      async (): Promise<ProjectEvidenceItem[]> => []
    );
    const persistEvidence = vi.fn(
      async (): Promise<PersistRfpExtractionEvidenceResult> => PERSIST_OK
    );

    const result = await run({ listEvidenceItems, persistEvidence });

    expect(result).toBe(PERSIST_OK);
    expect(listEvidenceItems).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(persistEvidence).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: ARTIFACT,
    });
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockPersistEvidence).not.toHaveBeenCalled();
  });
});

describe("runRfpExtractionEvidencePersistence - duplicate protection", () => {
  it("returns evidence_already_exists with lean summaries and never calls persistence", async () => {
    const items = [makeTextChunkItem("evidence-1"), makeTableItem("evidence-2")];
    const snapshot = structuredClone(items);
    mockListEvidence.mockResolvedValue(items);

    const result = await run();

    expect(result.status).toBe("evidence_already_exists");
    if (result.status !== "evidence_already_exists") {
      throw new Error("unreachable");
    }
    expect(result.evidenceCount).toBe(2);
    expect(result.textChunkCount).toBe(1);
    expect(result.tableEvidenceCount).toBe(1);
    expect(result.evidence).toEqual([
      {
        id: "evidence-1",
        projectId: PROJECT,
        sourceFileId: FILE_RFP,
        kind: TEXT_KIND,
        extractedAt: STORED_AT.toISOString(),
        retainUntil: STORED_RETAIN.toISOString(),
        contentSummary: {
          evidenceKind: TEXT_KIND,
          chunkIndex: 1,
          chunkCount: 2,
          charCount: 32,
        },
      },
      {
        id: "evidence-2",
        projectId: PROJECT,
        sourceFileId: FILE_BOQ,
        kind: TABLE_KIND,
        extractedAt: STORED_AT.toISOString(),
        retainUntil: STORED_RETAIN.toISOString(),
        contentSummary: {
          evidenceKind: TABLE_KIND,
          tableId: `${FILE_BOQ}:table:1`,
          rowCount: 2,
          columnCount: 2,
        },
      },
    ]);
    expect(mockPersistEvidence).not.toHaveBeenCalled();
    // Existing rows and their content are never mutated.
    expect(items).toEqual(snapshot);
  });

  it("detects a duplicate from a single text-chunk row alone", async () => {
    mockListEvidence.mockResolvedValue([makeTextChunkItem("evidence-1")]);

    const result = await run();

    expect(result.status).toBe("evidence_already_exists");
    if (result.status !== "evidence_already_exists") {
      throw new Error("unreachable");
    }
    expect(result.evidenceCount).toBe(1);
    expect(result.textChunkCount).toBe(1);
    expect(result.tableEvidenceCount).toBe(0);
    expect(mockPersistEvidence).not.toHaveBeenCalled();
  });

  it("ignores extraction evidence that names another inputPackageArtifactId", async () => {
    const otherPackage = makeTextChunkItem("evidence-1");
    otherPackage.content = {
      ...otherPackage.content,
      inputPackageArtifactId: "art-other-package",
    };
    const missingPackageId = makeTableItem("evidence-2");
    missingPackageId.content = { ...missingPackageId.content };
    delete missingPackageId.content.inputPackageArtifactId;
    mockListEvidence.mockResolvedValue([otherPackage, missingPackageId]);

    const result = await run();

    expect(result).toBe(PERSIST_OK);
    expect(mockPersistEvidence).toHaveBeenCalledTimes(1);
  });

  it("ignores evidence of unrelated kinds even when its content names this package", async () => {
    mockListEvidence.mockResolvedValue([
      makeTableItem("evidence-1", { kind: "boq_line_item" }),
      makeTextChunkItem("evidence-2", { kind: "requirement" }),
    ]);

    const result = await run();

    expect(result).toBe(PERSIST_OK);
    expect(mockPersistEvidence).toHaveBeenCalledTimes(1);
  });

  it("summarizes malformed duplicate content with safe fallbacks and never throws", async () => {
    const malformedChunk = makeTextChunkItem("evidence-1", {
      content: { evidenceKind: TEXT_KIND, inputPackageArtifactId: ARTIFACT },
    });
    const malformedTable = makeTableItem("evidence-2", {
      content: {
        inputPackageArtifactId: ARTIFACT,
        tableId: 42,
        rowCount: "2",
        columnCount: Number.NaN,
      },
    });
    mockListEvidence.mockResolvedValue([malformedChunk, malformedTable]);

    const result = await run();

    expect(result.status).toBe("evidence_already_exists");
    if (result.status !== "evidence_already_exists") {
      throw new Error("unreachable");
    }
    expect(result.evidence.map((item) => item.contentSummary)).toEqual([
      { evidenceKind: TEXT_KIND, chunkIndex: 0, chunkCount: 0, charCount: 0 },
      { evidenceKind: TABLE_KIND, tableId: "", rowCount: 0, columnCount: 0 },
    ]);
    expect(result.evidenceCount).toBe(2);
    expect(result.textChunkCount).toBe(1);
    expect(result.tableEvidenceCount).toBe(1);
    expect(mockPersistEvidence).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("returns serializable duplicate summaries with no tenantId, storagePath, raw text, or rows", async () => {
    mockListEvidence.mockResolvedValue([
      makeTextChunkItem("evidence-1"),
      makeTableItem("evidence-2"),
    ]);

    const result = await run();

    expect(result.status).toBe("evidence_already_exists");
    if (result.status !== "evidence_already_exists") {
      throw new Error("unreachable");
    }
    for (const item of result.evidence) {
      expect("content" in item).toBe(false);
      expect("tenantId" in item).toBe(false);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("Provide 48-port");
    expect(json).not.toContain("SKU-1");
    expect(json).not.toContain('"rows"');
    expect(json).not.toContain('"text"');
    expect(json).not.toContain("documentMetrics");
    expect(JSON.parse(json)).toEqual(result);
  });
});

describe("runRfpExtractionEvidencePersistence - status propagation", () => {
  it("propagates every persistence status unchanged when no duplicate exists", async () => {
    for (const persistResult of ALL_PERSIST_RESULTS) {
      mockPersistEvidence.mockResolvedValue(persistResult);

      const result = await run();

      expect(result).toBe(persistResult);
    }
    expect(mockPersistEvidence).toHaveBeenCalledTimes(ALL_PERSIST_RESULTS.length);
  });
});

describe("runRfpExtractionEvidencePersistence - failures bubble", () => {
  it("bubbles a list failure before any persistence call", async () => {
    mockListEvidence.mockRejectedValue(new Error("list failed"));

    await expect(run()).rejects.toThrow("list failed");
    expect(mockPersistEvidence).not.toHaveBeenCalled();
  });

  it("bubbles a persistence failure unhidden", async () => {
    mockPersistEvidence.mockRejectedValue(new Error("persist failed"));

    await expect(run()).rejects.toThrow("persist failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-evidence-run.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-evidence-run.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the prompt-179 persistence service, the evidence store, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-evidence-persistence",
      "@/lib/db/project-evidence-store",
      "@/types/project",
    ]);
  });

  it("performs no store mutation of its own", () => {
    expect(source.match(/\b(?:create|update|delete)[A-Z]\w*/g)).toBeNull();
  });

  it("imports no project/artifact/file/approval store, extraction, parser, pricing, config-expansion, export, runner, AI, catalog, coordinator, engine, adapter, intake, or UI module", () => {
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
      'from "@/lib/projects/project-rfp-extraction-run"',
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
