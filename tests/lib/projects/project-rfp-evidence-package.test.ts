import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";

// Mock ONLY the three store boundaries (project read, artifact read/create,
// evidence list); the draft service's validation, gating, filtering,
// sanitization, and summaries stay real. No DB, file bytes, parser, or AI
// module is touched anywhere in this suite.
const {
  mockGetProject,
  mockGetArtifact,
  mockCreateArtifact,
  mockListEvidence,
  mockListArtifactsByType,
} = vi.hoisted(() => ({
  mockGetProject: vi.fn(),
  mockGetArtifact: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockListEvidence: vi.fn(),
  mockListArtifactsByType: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  createProjectArtifactVersion: mockCreateArtifact,
  listProjectArtifactsByType: mockListArtifactsByType,
}));
vi.mock("@/lib/db/project-evidence-store", () => ({
  listProjectEvidenceItems: mockListEvidence,
}));

import {
  createRfpEvidencePackageDraft,
  RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND,
  type CreateRfpEvidencePackageDraftInput,
  type CreateRfpEvidencePackageDraftResult,
} from "@/lib/projects/project-rfp-evidence-package";

// The two assembled evidence kinds, declared locally exactly like the service
// declares them - the persistence write module must stay unimported here too.
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PACKAGE_A = "art-input-package-1";
const PACKAGE_B = "art-input-package-2";
const CREATED_ARTIFACT = "art-evidence-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const FILE_SOW = "file-sow-1";
const DELTA_1 = "art-extraction-delta-1";
const DELTA_2 = "art-extraction-delta-2";
const DELTA_OTHER = "art-extraction-delta-other";
const EV_TEXT_1 = "evidence-text-1";
const EV_TEXT_2 = "evidence-text-2";
const EV_TABLE_1 = "evidence-table-1";
const TABLE_ID = `${FILE_BOQ}:table:1`;
const CREATED_BY = "engineer@stc.example";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const STORED_AT = new Date("2026-06-03T08:15:00.000Z");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const DOCUMENT_METRICS = {
  textCharCount: 103,
  nonWhitespaceTextCharCount: 92,
  tableCount: 1,
  tableRowCount: 2,
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

/** One persisted text-chunk row (raw text body included, as stored). */
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
      inputPackageArtifactId: PACKAGE_A,
      sourceFileId: FILE_RFP,
      sourceFileName: "rfp.pdf",
      sourceFileRole: "rfp",
      chunkIndex: 1,
      chunkCount: 2,
      text: "RAW-EVIDENCE-TEXT: contractor shall supply PoE access switches.",
      charCount: 63,
      documentMetrics: { ...DOCUMENT_METRICS },
      internalExtractorState: "ARBITRARY-CONTENT-KEY-VALUE",
    },
    extractedAt: STORED_AT,
    retainUntil: new Date("2027-06-03T08:15:00.000Z"),
    ...overrides,
  };
}

/** One persisted table row (raw rows matrix included, as stored). */
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
      inputPackageArtifactId: PACKAGE_A,
      sourceFileId: FILE_BOQ,
      sourceFileName: "boq.xlsx",
      sourceFileRole: "boq",
      tableId: TABLE_ID,
      sheetName: "BoQ Sheet",
      rowCount: 2,
      columnCount: 2,
      rows: [
        ["RAW-TABLE-CELL-A1", "1"],
        ["RAW-TABLE-CELL-A2", "2"],
      ],
      parserDebugState: "RAW-FILE-BYTES-BASE64",
    },
    extractedAt: STORED_AT,
    retainUntil: new Date("2027-06-03T08:15:00.000Z"),
    ...overrides,
  };
}

/** One stored approved input_package artifact version. */
function makeInputPackageArtifact(
  id: string,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "input_package",
    status: "approved",
    version: 3,
    payload: {
      payloadKind: "rfp_input_package",
      marker: "PACKAGE-PAYLOAD-SECRET",
    },
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

/**
 * One stored extraction_delta artifact version. Defaults to a resolved
 * (every candidate accepted/rejected/waived) delta for PACKAGE_A; overrides
 * tune version, payload, type, or stage for the eligibility tests.
 */
function makeExtractionDeltaArtifact(
  id: string,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "extraction_delta",
    status: "needs_review",
    version: 1,
    payload: {
      payloadKind: "rfp_extraction_delta",
      inputPackageArtifactId: PACKAGE_A,
      candidates: [
        { id: "cand-1", reviewStatus: "accepted" },
        { id: "cand-2", reviewStatus: "rejected" },
        { id: "cand-3", reviewStatus: "waived" },
      ],
    },
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

/** The shape the artifact create store receives. */
interface CreateArtifactCall {
  projectId: string;
  tenantId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status?: ProjectArtifact["status"];
  payload?: Record<string, unknown>;
  sourceFileIds?: string[];
  sourceArtifactIds?: string[];
}

/** The stored row the mocked create returns, echoing the create input. */
function makeStoredArtifact(call: CreateArtifactCall): ProjectArtifact {
  return {
    id: CREATED_ARTIFACT,
    projectId: call.projectId,
    stageId: call.stageId,
    type: call.type,
    status: call.status ?? "generated",
    version: 1,
    payload: call.payload ?? {},
    sourceFileIds: (call.sourceFileIds ?? []).slice(),
    sourceArtifactIds: (call.sourceArtifactIds ?? []).slice(),
    createdAt: STORED_AT,
    updatedAt: STORED_AT,
  };
}

function draft(
  overrides: Partial<CreateRfpEvidencePackageDraftInput> = {}
): Promise<CreateRfpEvidencePackageDraftResult> {
  return createRfpEvidencePackageDraft({
    tenantId: TENANT,
    projectId: PROJECT,
    inputPackageArtifactId: PACKAGE_A,
    createdBy: `  ${CREATED_BY}  `,
    ...overrides,
  });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockListEvidence).not.toHaveBeenCalled();
  expect(mockCreateArtifact).not.toHaveBeenCalled();
}

const LEAN_PACKAGE_A_SUMMARY = {
  id: PACKAGE_A,
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

let evidenceRows: ProjectEvidenceItem[];
let artifactById: Map<string, ProjectArtifact>;
let deltaArtifacts: ProjectArtifact[];

beforeEach(() => {
  // Listed order is the deterministic payload order: text 1, table 1, text 2.
  evidenceRows = [
    makeTextChunkItem(EV_TEXT_1),
    makeTableItem(EV_TABLE_1),
    makeTextChunkItem(EV_TEXT_2, {
      content: {
        evidenceKind: TEXT_KIND,
        inputPackageArtifactId: PACKAGE_A,
        sourceFileId: FILE_RFP,
        sourceFileName: "rfp.pdf",
        sourceFileRole: "rfp",
        chunkIndex: 2,
        chunkCount: 2,
        text: "RAW-EVIDENCE-TEXT: spares for two years.",
        charCount: 40,
        documentMetrics: { ...DOCUMENT_METRICS },
      },
    }),
  ];
  artifactById = new Map([[PACKAGE_A, makeInputPackageArtifact(PACKAGE_A)]]);
  // Deterministic-only by default: no extraction_delta provenance source.
  deltaArtifacts = [];
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockListEvidence.mockReset().mockImplementation(async () => evidenceRows);
  mockListArtifactsByType
    .mockReset()
    .mockImplementation(async () => deltaArtifacts);
  mockCreateArtifact
    .mockReset()
    .mockImplementation(async (call: CreateArtifactCall) =>
      makeStoredArtifact(call)
    );
});

describe("createRfpEvidencePackageDraft - validation before store calls", () => {
  it("throws on a blank projectId", async () => {
    for (const blank of ["", "   "]) {
      await expect(draft({ projectId: blank })).rejects.toThrow(
        "projectId is required."
      );
    }
    expectNoStoreCalls();
  });

  it("throws on a blank inputPackageArtifactId", async () => {
    for (const blank of ["", "   "]) {
      await expect(draft({ inputPackageArtifactId: blank })).rejects.toThrow(
        "inputPackageArtifactId is required."
      );
    }
    expectNoStoreCalls();
  });

  it("throws on a blank createdBy", async () => {
    for (const blank of ["", "   "]) {
      await expect(draft({ createdBy: blank })).rejects.toThrow(
        "createdBy is required."
      );
    }
    expectNoStoreCalls();
  });
});

describe("project gates", () => {
  it("returns not_found for a missing project and reads no artifact or evidence", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await draft()).toEqual({ status: "not_found" });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await draft();

    expect(result).toEqual({
      status: "wrong_mode",
      project: {
        id: PROJECT,
        name: "STC RFP Bid",
        customerName: "STC",
        mode: "quick_bom",
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
    });
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("input package gates", () => {
  it("returns input_package_not_found for a missing artifact and lists no evidence", async () => {
    artifactById.delete(PACKAGE_A);

    expect(await draft()).toEqual({ status: "input_package_not_found" });
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT, PACKAGE_A);
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns artifact_not_input_package for a wrong artifact type, without its payload", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, {
        type: "normalized_boq",
        stageId: "boq_format_validation",
      })
    );

    const result = await draft();

    expect(result).toEqual({
      status: "artifact_not_input_package",
      artifact: {
        ...LEAN_PACKAGE_A_SUMMARY,
        type: "normalized_boq",
        stageId: "boq_format_validation",
      },
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns artifact_not_input_package for an input_package at the wrong stage", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, {
        stageId: "requirements_baseline_review",
      })
    );

    const result = await draft();

    expect(result.status).toBe("artifact_not_input_package");
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns input_package_not_approved for a non-approved package version", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { status: "needs_review" })
    );

    const result = await draft();

    expect(result).toEqual({
      status: "input_package_not_approved",
      artifact: { ...LEAN_PACKAGE_A_SUMMARY, status: "needs_review" },
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns input_package_has_no_source_files for an empty sourceFileIds list", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { sourceFileIds: [] })
    );

    const result = await draft();

    expect(result).toEqual({
      status: "input_package_has_no_source_files",
      artifact: { ...LEAN_PACKAGE_A_SUMMARY, sourceFileIds: [] },
    });
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("evidence matching gates", () => {
  it("returns extraction_evidence_not_found when no row matches kind AND package id", async () => {
    evidenceRows = [
      // Matching kind, but persisted for another input package version.
      makeTextChunkItem(EV_TEXT_1, {
        content: {
          evidenceKind: TEXT_KIND,
          inputPackageArtifactId: PACKAGE_B,
          text: "RAW-EVIDENCE-TEXT: other package.",
        },
      }),
      // Matching package id, but an unrelated evidence kind.
      makeTableItem(EV_TABLE_1, { kind: "boq_line_item" }),
      // Matching kind, but a non-string package reference never matches.
      makeTextChunkItem(EV_TEXT_2, {
        content: { evidenceKind: TEXT_KIND, inputPackageArtifactId: 42 },
      }),
    ];

    const result = await draft();

    expect(result).toEqual({
      status: "extraction_evidence_not_found",
      inputPackageArtifactId: PACKAGE_A,
    });
    expect(mockListEvidence).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns source_file_evidence_missing listing every uncovered package file, in package order", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, {
        sourceFileIds: [FILE_RFP, FILE_BOQ, FILE_SOW],
      })
    );
    // Only FILE_RFP has matching evidence; the FILE_BOQ row belongs to
    // another package, so it cannot cover FILE_BOQ.
    evidenceRows = [
      makeTextChunkItem(EV_TEXT_1),
      makeTableItem(EV_TABLE_1, {
        content: {
          evidenceKind: TABLE_KIND,
          inputPackageArtifactId: PACKAGE_B,
          rows: [["RAW-TABLE-CELL-A1"]],
        },
      }),
    ];

    const result = await draft();

    expect(result).toEqual({
      status: "source_file_evidence_missing",
      missingSourceFileIds: [FILE_BOQ, FILE_SOW],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("ignores unrelated kinds and other packages' rows when matching rows exist", async () => {
    evidenceRows = [
      makeTableItem("evidence-boq-line", { kind: "boq_line_item" }),
      makeTextChunkItem(EV_TEXT_1),
      makeTextChunkItem("evidence-other-package", {
        content: {
          evidenceKind: TEXT_KIND,
          inputPackageArtifactId: PACKAGE_B,
          text: "RAW-EVIDENCE-TEXT: other package.",
        },
      }),
      makeTableItem(EV_TABLE_1),
    ];

    const result = await draft();

    expect(result.status).toBe("ok");
    const payload = mockCreateArtifact.mock.calls[0][0].payload;
    expect(
      payload.evidence.map((entry: { evidenceId: string }) => entry.evidenceId)
    ).toEqual([EV_TEXT_1, EV_TABLE_1]);
    expect(payload.evidenceCount).toBe(2);
  });
});

describe("success", () => {
  it("creates exactly one needs_review evidence_package artifact at intake_package_review", async () => {
    const result = await draft();

    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(call.projectId).toBe(PROJECT);
    expect(call.tenantId).toBe(TENANT);
    expect(call.stageId).toBe("intake_package_review");
    expect(call.type).toBe("evidence_package");
    expect(call.status).toBe("needs_review");
    expect(call.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(call.sourceArtifactIds).toEqual([PACKAGE_A]);
    expect(call.filePath).toBeUndefined();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: CREATED_ARTIFACT,
      projectId: PROJECT,
      stageId: "intake_package_review",
      type: "evidence_package",
      status: "needs_review",
      version: 1,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
      createdAt: STORED_AT.toISOString(),
      updatedAt: STORED_AT.toISOString(),
    });
  });

  it("lists evidence only after the project and package gates, then creates", async () => {
    await draft();

    expect(mockListEvidence).toHaveBeenCalledTimes(1);
    expect(mockListEvidence).toHaveBeenCalledWith(TENANT, PROJECT);
    const projectOrder = mockGetProject.mock.invocationCallOrder[0];
    const artifactOrder = mockGetArtifact.mock.invocationCallOrder[0];
    const listOrder = mockListEvidence.mock.invocationCallOrder[0];
    const createOrder = mockCreateArtifact.mock.invocationCallOrder[0];
    expect(projectOrder).toBeLessThan(artifactOrder);
    expect(artifactOrder).toBeLessThan(listOrder);
    expect(listOrder).toBeLessThan(createOrder);
  });

  it("builds the sanitized payload: discriminator, trimmed createdBy, ISO createdAt, counts, copied ids, deterministic entries", async () => {
    await draft();

    const payload = mockCreateArtifact.mock.calls[0][0].payload;
    expect(payload.payloadKind).toBe(RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND);
    expect(payload.createdBy).toBe(CREATED_BY);
    expect(payload.createdAt).toMatch(ISO_DATE);
    expect(payload.inputPackageArtifactId).toBe(PACKAGE_A);
    expect(payload.evidenceCount).toBe(3);
    expect(payload.textChunkCount).toBe(2);
    expect(payload.tableEvidenceCount).toBe(1);
    expect(payload.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(payload.sourceArtifactIds).toEqual([PACKAGE_A]);
    expect(payload.evidence).toEqual([
      {
        evidenceId: EV_TEXT_1,
        evidenceKind: TEXT_KIND,
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: PACKAGE_A,
        sourceFileName: "rfp.pdf",
        sourceFileRole: "rfp",
        chunkIndex: 1,
        chunkCount: 2,
        charCount: 63,
        text: "RAW-EVIDENCE-TEXT: contractor shall supply PoE access switches.",
        documentMetrics: DOCUMENT_METRICS,
      },
      {
        evidenceId: EV_TABLE_1,
        evidenceKind: TABLE_KIND,
        sourceFileId: FILE_BOQ,
        inputPackageArtifactId: PACKAGE_A,
        sourceFileName: "boq.xlsx",
        sourceFileRole: "boq",
        tableId: TABLE_ID,
        sheetName: "BoQ Sheet",
        rowCount: 2,
        columnCount: 2,
        rows: [
          ["RAW-TABLE-CELL-A1", "1"],
          ["RAW-TABLE-CELL-A2", "2"],
        ],
      },
      {
        evidenceId: EV_TEXT_2,
        evidenceKind: TEXT_KIND,
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: PACKAGE_A,
        sourceFileName: "rfp.pdf",
        sourceFileRole: "rfp",
        chunkIndex: 2,
        chunkCount: 2,
        charCount: 40,
        text: "RAW-EVIDENCE-TEXT: spares for two years.",
        documentMetrics: DOCUMENT_METRICS,
      },
    ]);
  });

  it("degrades malformed content fields to whitelisted safe fallbacks", async () => {
    evidenceRows = [
      makeTextChunkItem(EV_TEXT_1, {
        content: {
          evidenceKind: TEXT_KIND,
          inputPackageArtifactId: PACKAGE_A,
          sourceFileName: 42,
          sourceFileRole: null,
          chunkIndex: "1",
          chunkCount: Number.NaN,
          text: 999,
          documentMetrics: { ...DOCUMENT_METRICS, textCharCount: "103" },
        },
      }),
      makeTableItem(EV_TABLE_1, {
        content: {
          evidenceKind: TABLE_KIND,
          inputPackageArtifactId: PACKAGE_A,
          pageNumber: "3",
          sheetName: 7,
          rowCount: "2",
          columnCount: Number.POSITIVE_INFINITY,
          rows: [["ok", 7], "not-a-row", [null, "x"]],
        },
      }),
      makeTableItem("evidence-table-2", {
        content: {
          evidenceKind: TABLE_KIND,
          inputPackageArtifactId: PACKAGE_A,
          tableId: `${FILE_BOQ}:table:2`,
          rowCount: 1,
          columnCount: 1,
          rows: "not-a-matrix",
          documentMetrics: [1, 2, 3],
        },
      }),
    ];

    const result = await draft();

    expect(result.status).toBe("ok");
    const payload = mockCreateArtifact.mock.calls[0][0].payload;
    expect(payload.evidence).toEqual([
      {
        evidenceId: EV_TEXT_1,
        evidenceKind: TEXT_KIND,
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: PACKAGE_A,
        chunkIndex: 0,
        chunkCount: 0,
        charCount: 0,
        text: "",
      },
      {
        evidenceId: EV_TABLE_1,
        evidenceKind: TABLE_KIND,
        sourceFileId: FILE_BOQ,
        inputPackageArtifactId: PACKAGE_A,
        tableId: "",
        rowCount: 0,
        columnCount: 0,
        rows: [["ok", ""], [], ["", "x"]],
      },
      {
        evidenceId: "evidence-table-2",
        evidenceKind: TABLE_KIND,
        sourceFileId: FILE_BOQ,
        inputPackageArtifactId: PACKAGE_A,
        tableId: `${FILE_BOQ}:table:2`,
        rowCount: 1,
        columnCount: 1,
        rows: [],
      },
    ]);
  });

  it("returns a lean payload summary without the evidence entries", async () => {
    const result = await draft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(result.payloadSummary).toEqual({
      payloadKind: RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND,
      createdBy: CREATED_BY,
      createdAt: call.payload.createdAt,
      inputPackageArtifactId: PACKAGE_A,
      evidenceCount: 3,
      textChunkCount: 2,
      tableEvidenceCount: 1,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
    });
    expect(result.payloadSummary.createdAt).toMatch(ISO_DATE);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("leaks no tenantId, storage path, package payload field, arbitrary content key, or raw bytes", async () => {
    const result = await draft();

    const serializedResult = JSON.stringify(result);
    const serializedPayload = JSON.stringify(
      mockCreateArtifact.mock.calls[0][0].payload
    );
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "PACKAGE-PAYLOAD-SECRET",
      "internalExtractorState",
      "ARBITRARY-CONTENT-KEY-VALUE",
      "parserDebugState",
      "RAW-FILE-BYTES-BASE64",
    ]) {
      expect(serializedPayload).not.toContain(leak);
      expect(serializedResult).not.toContain(leak);
    }
    // The lean summaries never carry the copied bodies either.
    expect(serializedResult).not.toContain("RAW-EVIDENCE-TEXT");
    expect(serializedResult).not.toContain("RAW-TABLE-CELL");
  });

  it("copies arrays instead of aliasing and never mutates inputs, rows, or the artifact", async () => {
    const input: CreateRfpEvidencePackageDraftInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: PACKAGE_A,
      createdBy: `  ${CREATED_BY}  `,
    };
    const inputSnapshot = structuredClone(input);
    const rowsSnapshot = structuredClone(evidenceRows);
    const artifactSnapshot = structuredClone(Array.from(artifactById.values()));

    const result = await createRfpEvidencePackageDraft(input);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const call = mockCreateArtifact.mock.calls[0][0];
    const loadedPackage = artifactById.get(PACKAGE_A);
    if (loadedPackage === undefined) throw new Error("unreachable");
    // Fresh arrays everywhere: create input, payload, and stored evidence
    // rows never share identity.
    expect(call.sourceFileIds).not.toBe(loadedPackage.sourceFileIds);
    expect(call.payload.sourceFileIds).not.toBe(loadedPackage.sourceFileIds);
    expect(call.payload.sourceFileIds).not.toBe(call.sourceFileIds);
    const payloadTable = call.payload.evidence[1];
    const storedTable = evidenceRows[1];
    expect(payloadTable.rows).not.toBe(storedTable.content.rows);
    expect(payloadTable.rows[0]).not.toBe(
      (storedTable.content.rows as string[][])[0]
    );

    // Mutating everything the service handed out reaches no loaded state.
    call.payload.sourceFileIds.push("hacked-file");
    call.payload.sourceArtifactIds.push("hacked-artifact");
    call.payload.evidence.pop();
    payloadTable.rows[0].push("hacked-cell");
    result.artifact.sourceFileIds.push("hacked-file");
    result.artifact.sourceArtifactIds.push("hacked-artifact");
    result.payloadSummary.sourceFileIds.push("hacked-file");
    result.payloadSummary.sourceArtifactIds.push("hacked-artifact");
    expect(input).toEqual(inputSnapshot);
    expect(evidenceRows).toEqual(rowsSnapshot);
    expect(Array.from(artifactById.values())).toEqual(artifactSnapshot);
  });

  it("bubbles an unexpected artifact create failure unhidden", async () => {
    mockCreateArtifact.mockRejectedValue(new Error("artifact insert failed"));

    await expect(draft()).rejects.toThrow("artifact insert failed");
  });
});

describe("extraction_delta provenance source", () => {
  function createdSourceArtifactIds(): unknown {
    return mockCreateArtifact.mock.calls[0][0].sourceArtifactIds;
  }
  function createdPayloadSourceArtifactIds(): unknown {
    return mockCreateArtifact.mock.calls[0][0].payload.sourceArtifactIds;
  }

  it("keeps deterministic-only sourceArtifactIds when no delta exists", async () => {
    deltaArtifacts = [];

    const result = await draft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "extraction_delta"
    );
    expect(createdSourceArtifactIds()).toEqual([PACKAGE_A]);
    expect(createdPayloadSourceArtifactIds()).toEqual([PACKAGE_A]);
    expect(result.payloadSummary.sourceArtifactIds).toEqual([PACKAGE_A]);
    expect(result.artifact.sourceArtifactIds).toEqual([PACKAGE_A]);
  });

  it("includes the latest resolved same-package delta in payload, create call, and summary", async () => {
    deltaArtifacts = [
      makeExtractionDeltaArtifact(DELTA_1, { version: 4 }),
      // The highest-version resolved same-package delta wins.
      makeExtractionDeltaArtifact(DELTA_2, { version: 7 }),
    ];

    const result = await draft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(createdSourceArtifactIds()).toEqual([PACKAGE_A, DELTA_2]);
    expect(createdPayloadSourceArtifactIds()).toEqual([PACKAGE_A, DELTA_2]);
    expect(result.payloadSummary.sourceArtifactIds).toEqual([
      PACKAGE_A,
      DELTA_2,
    ]);
    expect(result.artifact.sourceArtifactIds).toEqual([PACKAGE_A, DELTA_2]);
  });

  it("ignores pending, malformed, wrong-stage/type, and wrong-package deltas without blocking", async () => {
    deltaArtifacts = [
      // Highest version, but a candidate is still pending_review.
      makeExtractionDeltaArtifact("delta-pending", {
        version: 99,
        payload: {
          payloadKind: "rfp_extraction_delta",
          inputPackageArtifactId: PACKAGE_A,
          candidates: [
            { id: "c1", reviewStatus: "accepted" },
            { id: "c2", reviewStatus: "pending_review" },
          ],
        },
      }),
      // Malformed candidates array.
      makeExtractionDeltaArtifact("delta-malformed-array", {
        version: 98,
        payload: {
          payloadKind: "rfp_extraction_delta",
          inputPackageArtifactId: PACKAGE_A,
          candidates: "not-an-array",
        },
      }),
      // Malformed candidate entry (not a plain object).
      makeExtractionDeltaArtifact("delta-malformed-entry", {
        version: 97,
        payload: {
          payloadKind: "rfp_extraction_delta",
          inputPackageArtifactId: PACKAGE_A,
          candidates: [{ id: "c1", reviewStatus: "accepted" }, "nope"],
        },
      }),
      // Unknown review status.
      makeExtractionDeltaArtifact("delta-unknown-status", {
        version: 96,
        payload: {
          payloadKind: "rfp_extraction_delta",
          inputPackageArtifactId: PACKAGE_A,
          candidates: [{ id: "c1", reviewStatus: "superseded" }],
        },
      }),
      // Wrong payload kind.
      makeExtractionDeltaArtifact("delta-wrong-kind", {
        version: 95,
        payload: {
          payloadKind: "rfp_evidence_package",
          inputPackageArtifactId: PACKAGE_A,
          candidates: [],
        },
      }),
      // Wrong stage.
      makeExtractionDeltaArtifact("delta-wrong-stage", {
        version: 94,
        stageId: "requirements_baseline_review",
      }),
      // Wrong type.
      makeExtractionDeltaArtifact("delta-wrong-type", {
        version: 93,
        type: "evidence_package",
      }),
      // Resolved, but for another input package.
      makeExtractionDeltaArtifact(DELTA_OTHER, {
        version: 92,
        payload: {
          payloadKind: "rfp_extraction_delta",
          inputPackageArtifactId: PACKAGE_B,
          candidates: [{ id: "c1", reviewStatus: "accepted" }],
        },
      }),
      // The only eligible delta, at a lower version than all the ignored ones.
      makeExtractionDeltaArtifact(DELTA_1, { version: 2 }),
    ];

    const result = await draft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(createdSourceArtifactIds()).toEqual([PACKAGE_A, DELTA_1]);
    expect(result.payloadSummary.sourceArtifactIds).toEqual([
      PACKAGE_A,
      DELTA_1,
    ]);
  });

  it("stays deterministic-only when every delta is ineligible", async () => {
    deltaArtifacts = [
      makeExtractionDeltaArtifact("delta-pending", {
        version: 5,
        payload: {
          payloadKind: "rfp_extraction_delta",
          inputPackageArtifactId: PACKAGE_A,
          candidates: [{ id: "c1", reviewStatus: "pending_review" }],
        },
      }),
      makeExtractionDeltaArtifact(DELTA_OTHER, {
        version: 6,
        payload: {
          payloadKind: "rfp_extraction_delta",
          inputPackageArtifactId: PACKAGE_B,
          candidates: [{ id: "c1", reviewStatus: "accepted" }],
        },
      }),
    ];

    const result = await draft();

    expect(result.status).toBe("ok");
    expect(createdSourceArtifactIds()).toEqual([PACKAGE_A]);
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-evidence-package.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-evidence-package.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the three allowed store modules and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-evidence-store",
      "@/types/project",
    ]);
  });

  it("reads extraction_delta provenance via listProjectArtifactsByType only", () => {
    expect(source).toContain("listProjectArtifactsByType");
  });

  it("performs no store mutation except createProjectArtifactVersion", () => {
    const calls =
      source.match(/\b(?:create|update|delete|insert|remove|drop)[A-Z]\w*/g) ??
      [];
    const allowed = new Set([
      "createProjectArtifactVersion",
      "createRfpEvidencePackageDraft",
    ]);
    expect(calls.filter((name) => !allowed.has(name))).toEqual([]);
  });

  it("imports no filesystem, parser, extraction, persistence, inspection, approval, route, UI, pricing, config, export, SKU, catalog, coordinator, engine, adapter, or AI module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "fs"',
      'from "path"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/index"',
      'from "@/lib/db/schema"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction-delta"',
      'from "@/lib/projects/project-rfp-extraction-delta-review"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-requirements',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/project-rfp-upload"',
      'from "@/lib/projects/project-rfp-creation"',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/artifacts"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/stages"',
      'from "@/lib/projects/staleness"',
      'from "@/lib/projects/boq-',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/lib/validation',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      'from "next',
      'from "react',
      "@anthropic-ai",
      "@google/generative-ai",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
      "storagePath",
      "benchmark",
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
