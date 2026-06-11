import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectEvidenceItem } from "@/types/project";

// Mock the project store, the evidence store, and the persistence module's
// kind constants; the inspection service's validation, gating, filtering,
// and sanitization stay real. No DB, file bytes, or parser libraries are
// touched anywhere in this suite.
const { mockGetProject, mockListEvidence, mockGetEvidenceItem, TEXT_KIND, TABLE_KIND } =
  vi.hoisted(() => ({
    mockGetProject: vi.fn(),
    mockListEvidence: vi.fn(),
    mockGetEvidenceItem: vi.fn(),
    TEXT_KIND: "rfp_document_text_chunk" as const,
    TABLE_KIND: "rfp_document_table" as const,
  }));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-evidence-store", () => ({
  listProjectEvidenceItems: mockListEvidence,
  getProjectEvidenceItemById: mockGetEvidenceItem,
}));
vi.mock("@/lib/projects/project-rfp-evidence-persistence", () => ({
  RFP_TEXT_CHUNK_EVIDENCE_KIND: TEXT_KIND,
  RFP_TABLE_EVIDENCE_KIND: TABLE_KIND,
}));

import {
  loadRfpProjectEvidenceDetail,
  loadRfpProjectEvidenceList,
  type LoadRfpProjectEvidenceDetailInput,
  type LoadRfpProjectEvidenceDetailResult,
  type LoadRfpProjectEvidenceListInput,
  type LoadRfpProjectEvidenceListResult,
} from "@/lib/projects/project-rfp-evidence-inspection";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-input-package-3";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EVIDENCE_TEXT = "evidence-text-1";
const EVIDENCE_TABLE = "evidence-table-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const STORED_AT = new Date("2026-06-03T08:15:00.000Z");
const STORED_RETAIN = new Date("2027-06-03T08:15:00.000Z");

const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "STC RFP Bid",
  customerName: "STC",
  mode: "rfp",
  createdAt: TS1.toISOString(),
  updatedAt: TS2.toISOString(),
};

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

/** One stored text-chunk row as prompt 179 persists it (text body included). */
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
        textCharCount: 64,
        nonWhitespaceTextCharCount: 58,
        tableCount: 1,
        tableRowCount: 2,
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

const TEXT_LIST_SUMMARY = {
  id: EVIDENCE_TEXT,
  projectId: PROJECT,
  sourceFileId: FILE_RFP,
  kind: TEXT_KIND,
  extractedAt: STORED_AT.toISOString(),
  retainUntil: STORED_RETAIN.toISOString(),
  contentSummary: {
    evidenceKind: TEXT_KIND,
    inputPackageArtifactId: ARTIFACT,
    sourceFileName: `${FILE_RFP}.pdf`,
    sourceFileRole: "rfp",
    chunkIndex: 1,
    chunkCount: 2,
    charCount: 32,
    documentMetrics: {
      textCharCount: 64,
      nonWhitespaceTextCharCount: 58,
      tableCount: 1,
      tableRowCount: 2,
    },
  },
};

const TABLE_LIST_SUMMARY = {
  id: EVIDENCE_TABLE,
  projectId: PROJECT,
  sourceFileId: FILE_BOQ,
  kind: TABLE_KIND,
  extractedAt: STORED_AT.toISOString(),
  retainUntil: STORED_RETAIN.toISOString(),
  contentSummary: {
    evidenceKind: TABLE_KIND,
    inputPackageArtifactId: ARTIFACT,
    sourceFileName: `${FILE_BOQ}.xlsx`,
    sourceFileRole: "boq",
    tableId: `${FILE_BOQ}:table:1`,
    sheetName: "BoQ Sheet",
    rowCount: 2,
    columnCount: 2,
  },
};

function list(
  overrides: Partial<LoadRfpProjectEvidenceListInput> = {}
): Promise<LoadRfpProjectEvidenceListResult> {
  return loadRfpProjectEvidenceList({
    tenantId: TENANT,
    projectId: PROJECT,
    ...overrides,
  });
}

function detail(
  overrides: Partial<LoadRfpProjectEvidenceDetailInput> = {}
): Promise<LoadRfpProjectEvidenceDetailResult> {
  return loadRfpProjectEvidenceDetail({
    tenantId: TENANT,
    projectId: PROJECT,
    evidenceItemId: EVIDENCE_TEXT,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockListEvidence.mockReset().mockResolvedValue([]);
  mockGetEvidenceItem.mockReset().mockResolvedValue(null);
});

describe("loadRfpProjectEvidenceList - input validation", () => {
  it("throws on a blank projectId before any store call", async () => {
    for (const blank of ["", "   "]) {
      await expect(list({ projectId: blank })).rejects.toThrow(
        "projectId is required."
      );
    }
    expect(mockGetProject).not.toHaveBeenCalled();
    expect(mockListEvidence).not.toHaveBeenCalled();
  });
});

describe("loadRfpProjectEvidenceDetail - input validation", () => {
  it("throws on a blank projectId or evidenceItemId before any store call", async () => {
    for (const blank of ["", "   "]) {
      await expect(detail({ projectId: blank })).rejects.toThrow(
        "projectId is required."
      );
      await expect(detail({ evidenceItemId: blank })).rejects.toThrow(
        "evidenceItemId is required."
      );
    }
    expect(mockGetProject).not.toHaveBeenCalled();
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
  });
});

describe("project gate", () => {
  it("list returns not_found for a missing project and never reads evidence", async () => {
    mockGetProject.mockResolvedValue(null);

    const result = await list();

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetProject).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListEvidence).not.toHaveBeenCalled();
  });

  it("list returns wrong_mode with a lean no-tenantId summary and stops before the evidence read", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await list();

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({ ...PROJECT_SUMMARY, mode: "quick_bom" });
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListEvidence).not.toHaveBeenCalled();
  });

  it("detail returns not_found / wrong_mode and stops before the evidence read", async () => {
    mockGetProject.mockResolvedValue(null);
    expect(await detail()).toEqual({ status: "not_found" });

    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await detail();
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
  });
});

describe("loadRfpProjectEvidenceList - listing", () => {
  it("returns lean summaries for the two RFP extraction kinds only, with counts and the project summary", async () => {
    mockListEvidence.mockResolvedValue([
      makeTextChunkItem(EVIDENCE_TEXT),
      makeTableItem(EVIDENCE_TABLE),
      makeTableItem("evidence-unrelated", { kind: "boq_line_item" }),
      makeTextChunkItem("evidence-requirement", { kind: "requirement" }),
    ]);

    const result = await list();

    expect(mockListEvidence).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetProject.mock.invocationCallOrder[0]).toBeLessThan(
      mockListEvidence.mock.invocationCallOrder[0]
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.project).toEqual(PROJECT_SUMMARY);
    expect(result.filters).toEqual({});
    expect(result.evidence).toEqual([TEXT_LIST_SUMMARY, TABLE_LIST_SUMMARY]);
    expect(result.evidenceCount).toBe(2);
    expect(result.textChunkCount).toBe(1);
    expect(result.tableEvidenceCount).toBe(1);
  });

  it("filters by sourceFileId exactly", async () => {
    mockListEvidence.mockResolvedValue([
      makeTextChunkItem(EVIDENCE_TEXT),
      makeTableItem(EVIDENCE_TABLE),
    ]);

    const result = await list({ sourceFileId: FILE_BOQ });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filters).toEqual({ sourceFileId: FILE_BOQ });
    expect(result.evidence).toEqual([TABLE_LIST_SUMMARY]);
    expect(result.evidenceCount).toBe(1);
    expect(result.textChunkCount).toBe(0);
    expect(result.tableEvidenceCount).toBe(1);
  });

  it("filters by kind exactly", async () => {
    mockListEvidence.mockResolvedValue([
      makeTextChunkItem(EVIDENCE_TEXT),
      makeTableItem(EVIDENCE_TABLE),
    ]);

    const result = await list({ kind: TEXT_KIND });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filters).toEqual({ kind: TEXT_KIND });
    expect(result.evidence).toEqual([TEXT_LIST_SUMMARY]);
    expect(result.textChunkCount).toBe(1);
    expect(result.tableEvidenceCount).toBe(0);
  });

  it("filters by content inputPackageArtifactId exactly, dropping rows that name another package or none", async () => {
    const otherPackage = makeTableItem("evidence-other");
    otherPackage.content = {
      ...otherPackage.content,
      inputPackageArtifactId: "art-other-package",
    };
    const missingPackage = makeTableItem("evidence-missing");
    missingPackage.content = { ...missingPackage.content };
    delete missingPackage.content.inputPackageArtifactId;
    mockListEvidence.mockResolvedValue([
      makeTextChunkItem(EVIDENCE_TEXT),
      otherPackage,
      missingPackage,
    ]);

    const result = await list({ inputPackageArtifactId: ARTIFACT });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filters).toEqual({ inputPackageArtifactId: ARTIFACT });
    expect(result.evidence).toEqual([TEXT_LIST_SUMMARY]);
    expect(result.evidenceCount).toBe(1);
  });

  it("ignores blank optional filters entirely", async () => {
    mockListEvidence.mockResolvedValue([
      makeTextChunkItem(EVIDENCE_TEXT),
      makeTableItem(EVIDENCE_TABLE),
    ]);

    const result = await list({
      sourceFileId: "   ",
      inputPackageArtifactId: "",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.filters).toEqual({});
    expect(result.evidenceCount).toBe(2);
  });

  it("returns serializable summaries with ISO dates and no tenantId, storagePath, text body, or rows", async () => {
    const smuggledText = makeTextChunkItem(EVIDENCE_TEXT);
    smuggledText.content = {
      ...smuggledText.content,
      tenantId: TENANT,
      storagePath: "C:\\uploads\\secret.pdf",
    };
    const smuggledTable = makeTableItem(EVIDENCE_TABLE);
    smuggledTable.content = {
      ...smuggledTable.content,
      tenantId: TENANT,
      storagePath: "C:\\uploads\\secret.xlsx",
    };
    mockListEvidence.mockResolvedValue([smuggledText, smuggledTable]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    for (const item of result.evidence) {
      expect("content" in item).toBe(false);
      expect("tenantId" in item).toBe(false);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("Provide 48-port");
    expect(json).not.toContain("SKU-1");
    expect(json).not.toContain('"text"');
    expect(json).not.toContain('"rows"');
    expect(JSON.parse(json)).toEqual(result);
  });

  it("includes pageNumber when numeric and degrades malformed content to safe fallbacks without throwing", async () => {
    const pagedTable = makeTableItem(EVIDENCE_TABLE);
    pagedTable.content = { ...pagedTable.content, pageNumber: 7 };
    delete pagedTable.content.sheetName;
    const malformedText = makeTextChunkItem("evidence-malformed-text", {
      content: { documentMetrics: "big" },
    });
    const malformedTable = makeTableItem("evidence-malformed-table", {
      content: {
        tableId: 42,
        rowCount: "2",
        columnCount: Number.NaN,
        pageNumber: "7",
        sheetName: 9,
        rows: "not-rows",
      },
    });
    mockListEvidence.mockResolvedValue([pagedTable, malformedText, malformedTable]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.evidence.map((item) => item.contentSummary)).toEqual([
      {
        evidenceKind: TABLE_KIND,
        inputPackageArtifactId: ARTIFACT,
        sourceFileName: `${FILE_BOQ}.xlsx`,
        sourceFileRole: "boq",
        tableId: `${FILE_BOQ}:table:1`,
        pageNumber: 7,
        rowCount: 2,
        columnCount: 2,
      },
      {
        evidenceKind: TEXT_KIND,
        inputPackageArtifactId: "",
        sourceFileName: "",
        sourceFileRole: "",
        chunkIndex: 0,
        chunkCount: 0,
        charCount: 0,
      },
      {
        evidenceKind: TABLE_KIND,
        inputPackageArtifactId: "",
        sourceFileName: "",
        sourceFileRole: "",
        tableId: "",
        rowCount: 0,
        columnCount: 0,
      },
    ]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("uses injected getProject and listEvidence instead of the store modules", async () => {
    const getProject = vi.fn(async (): Promise<Project | null> => makeProject());
    const listEvidence = vi.fn(
      async (): Promise<ProjectEvidenceItem[]> => [makeTextChunkItem(EVIDENCE_TEXT)]
    );

    const result = await list({ getProject, listEvidence });

    expect(result.status).toBe("ok");
    expect(getProject).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(listEvidence).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockGetProject).not.toHaveBeenCalled();
    expect(mockListEvidence).not.toHaveBeenCalled();
  });
});

describe("loadRfpProjectEvidenceDetail - detail", () => {
  it("returns the sanitized text detail with the persisted text body and no smuggled tenantId or storagePath", async () => {
    const stored = makeTextChunkItem(EVIDENCE_TEXT);
    stored.content = {
      ...stored.content,
      tenantId: TENANT,
      storagePath: "C:\\uploads\\secret.pdf",
    };
    mockGetEvidenceItem.mockResolvedValue(stored);

    const result = await detail();

    expect(mockGetEvidenceItem).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      EVIDENCE_TEXT
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.project).toEqual(PROJECT_SUMMARY);
    expect(result.evidence).toEqual({
      id: EVIDENCE_TEXT,
      projectId: PROJECT,
      sourceFileId: FILE_RFP,
      kind: TEXT_KIND,
      extractedAt: STORED_AT.toISOString(),
      retainUntil: STORED_RETAIN.toISOString(),
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
          textCharCount: 64,
          nonWhitespaceTextCharCount: 58,
          tableCount: 1,
          tableRowCount: 2,
        },
      },
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("secret");
    expect(JSON.parse(json)).toEqual(result);
  });

  it("returns the sanitized table detail with a copied string rows matrix", async () => {
    const stored = makeTableItem(EVIDENCE_TABLE);
    stored.content = {
      ...stored.content,
      tenantId: TENANT,
      storagePath: "C:\\uploads\\secret.xlsx",
      pageNumber: 7,
    };
    mockGetEvidenceItem.mockResolvedValue(stored);

    const result = await detail({ evidenceItemId: EVIDENCE_TABLE });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.evidence.content).toEqual({
      evidenceKind: TABLE_KIND,
      inputPackageArtifactId: ARTIFACT,
      sourceFileId: FILE_BOQ,
      sourceFileName: `${FILE_BOQ}.xlsx`,
      sourceFileRole: "boq",
      tableId: `${FILE_BOQ}:table:1`,
      pageNumber: 7,
      sheetName: "BoQ Sheet",
      rowCount: 2,
      columnCount: 2,
      rows: [
        ["SKU-1", "1"],
        ["SKU-2", "2"],
      ],
    });
    if (result.evidence.content.evidenceKind !== TABLE_KIND) {
      throw new Error("unreachable");
    }
    expect(result.evidence.content.rows).not.toBe(stored.content.rows);
    expect(result.evidence.content.rows[0]).not.toBe(
      (stored.content.rows as string[][])[0]
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain("storagePath");
  });

  it("copies malformed cells via String(value) fallbacks and degrades non-array rows safely", async () => {
    const stored = makeTableItem(EVIDENCE_TABLE);
    stored.content = {
      ...stored.content,
      rows: [["SKU-1", 1], [null, true], "not-a-row"],
    };
    mockGetEvidenceItem.mockResolvedValue(stored);

    const result = await detail({ evidenceItemId: EVIDENCE_TABLE });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    if (result.evidence.content.evidenceKind !== TABLE_KIND) {
      throw new Error("unreachable");
    }
    expect(result.evidence.content.rows).toEqual([
      ["SKU-1", "1"],
      ["", "true"],
      [],
    ]);
  });

  it("never mutates the stored row, its content, or its rows", async () => {
    const stored = makeTableItem(EVIDENCE_TABLE);
    const snapshot = structuredClone(stored);
    mockGetEvidenceItem.mockResolvedValue(stored);

    const result = await detail({ evidenceItemId: EVIDENCE_TABLE });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    if (result.evidence.content.evidenceKind !== TABLE_KIND) {
      throw new Error("unreachable");
    }
    result.evidence.content.rows[0][0] = "HACKED";
    result.evidence.content.rows.push(["new-row"]);
    expect(stored).toEqual(snapshot);
  });

  it("returns evidence_not_found for a missing item", async () => {
    mockGetEvidenceItem.mockResolvedValue(null);

    expect(await detail()).toEqual({ status: "evidence_not_found" });
  });

  it("returns evidence_not_found for an unrelated evidence kind instead of exposing it", async () => {
    mockGetEvidenceItem.mockResolvedValue(
      makeTableItem(EVIDENCE_TABLE, { kind: "boq_line_item" })
    );

    const result = await detail({ evidenceItemId: EVIDENCE_TABLE });

    expect(result).toEqual({ status: "evidence_not_found" });
    expect(JSON.stringify(result)).not.toContain("SKU-1");
  });

  it("uses injected getProject and getEvidenceItem instead of the store modules", async () => {
    const getProject = vi.fn(async (): Promise<Project | null> => makeProject());
    const getEvidenceItem = vi.fn(
      async (): Promise<ProjectEvidenceItem | null> =>
        makeTextChunkItem(EVIDENCE_TEXT)
    );

    const result = await detail({ getProject, getEvidenceItem });

    expect(result.status).toBe("ok");
    expect(getProject).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getEvidenceItem).toHaveBeenCalledWith(TENANT, PROJECT, EVIDENCE_TEXT);
    expect(mockGetProject).not.toHaveBeenCalled();
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
  });
});

describe("store failures bubble", () => {
  it("bubbles a project read failure from both services", async () => {
    mockGetProject.mockRejectedValue(new Error("project read failed"));

    await expect(list()).rejects.toThrow("project read failed");
    await expect(detail()).rejects.toThrow("project read failed");
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
  });

  it("bubbles evidence read failures unhidden", async () => {
    mockListEvidence.mockRejectedValue(new Error("list failed"));
    await expect(list()).rejects.toThrow("list failed");

    mockGetEvidenceItem.mockRejectedValue(new Error("get failed"));
    await expect(detail()).rejects.toThrow("get failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-evidence-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-evidence-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, the evidence store, persistence constants/types, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-evidence-store",
      "@/lib/projects/project-rfp-evidence-persistence",
      "@/types/project",
    ]);
  });

  it("performs no store mutation of its own", () => {
    expect(source.match(/\b(?:create|update|delete)[A-Z]\w*/g)).toBeNull();
  });

  it("never calls the extraction or persistence write services", () => {
    for (const writeService of [
      "persistRfpExtractionEvidence",
      "runRfpInputPackageExtraction",
      "runRfpExtractionEvidencePersistence",
    ]) {
      expect(source).not.toContain(writeService);
    }
  });

  it("imports no artifact/file/approval store, extraction, parser, pricing, config-expansion, export, runner, AI, catalog, coordinator, engine, adapter, intake, or UI module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-artifact-store"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/artifacts"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/project-rfp-evidence-run"',
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
