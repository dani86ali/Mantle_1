import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock ONLY the two store boundaries this read-only service is allowed to
// import (project read, artifact read/list); the inspection service's
// validation, gating, whitelisting, and summaries stay real. No DB, file
// bytes, evidence store, parser, OCR, AI, provider SDK, route, UI, pricing,
// SKU, catalog, config, or export module is touched anywhere in this suite.
const { mockGetProject, mockGetArtifact, mockListArtifactsByType } = vi.hoisted(
  () => ({
    mockGetProject: vi.fn(),
    mockGetArtifact: vi.fn(),
    mockListArtifactsByType: vi.fn(),
  })
);

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  listProjectArtifactsByType: mockListArtifactsByType,
}));

import {
  loadRfpExtractionDeltaDetail,
  loadRfpExtractionDeltaList,
  type LoadRfpExtractionDeltaDetailInput,
  type LoadRfpExtractionDeltaDetailResult,
  type LoadRfpExtractionDeltaListInput,
  type LoadRfpExtractionDeltaListResult,
} from "@/lib/projects/project-rfp-extraction-delta-inspection";

// Payload marker and evidence kinds declared locally exactly like the
// service declares them - the draft/review/executor/provider modules must
// stay runtime-unimported here too.
const DELTA_KIND = "rfp_extraction_delta" as const;
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const DELTA_A = "art-extraction-delta-1";
const DELTA_B = "art-extraction-delta-2";
const PACKAGE_A = "art-input-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_TEXT_2 = "evidence-text-2";
const TABLE_ID = `${FILE_BOQ}:table:1`;
const CREATED_BY = "engineer@stc.example";
const REVIEWED_BY = "reviewer@stc.example";
const DECIDED_BY = "reviewer@stc.example";
const PAYLOAD_AT = "2026-06-03T08:15:00.000Z";
const HIST_AT = "2026-06-04T09:00:00.000Z";
const REVIEWED_AT = "2026-06-05T12:00:00.000Z";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

const CAND1_TITLE = "Missing PoE switch line";
const CAND1_DESC = "RFP section 3.2 requires PoE switches absent from the BoQ.";
const CAND1_RATIONALE = "Cross-checked against the requirements section.";
const CAND2_TITLE = "Suspicious core router quantity";
const CAND2_DESC = "Quantity for core routers looks transposed.";
const CAND2_RATIONALE = "Quantities look off versus the topology.";
const EDIT_TITLE = "Missing PoE access switch line";
const EDIT_NOTE = "Accepted after tightening the title.";
const PROPOSED_EDIT_TEXT = "PROPOSED-EDIT-TEXT replacement chunk body.";
const PROPOSED_CAND2_TEXT = "PROPOSED-CAND2-TEXT replacement chunk body.";
const PROPOSED_CELL_A = "PROPOSED-CELL-A";
const PROPOSED_CELL_B = "PROPOSED-CELL-B";

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

/** A well-formed delta payload exactly as the draft service stores it. */
function makeDeltaPayload(): Record<string, unknown> {
  return {
    payloadKind: DELTA_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    proposalSource: "deterministic",
    inputPackageArtifactId: PACKAGE_A,
    candidateCount: 2,
    evidenceReferenceCount: 3,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    candidates: [
      {
        id: "RFP-DELTA-001",
        kind: "missing_evidence",
        sourceFileId: FILE_RFP,
        title: CAND1_TITLE,
        description: CAND1_DESC,
        severity: "warning",
        confidence: 0.8,
        rationale: CAND1_RATIONALE,
        reviewStatus: "accepted",
        evidenceReferences: [
          {
            evidenceId: EV_TEXT,
            evidenceKind: TEXT_KIND,
            sourceFileId: FILE_RFP,
            inputPackageArtifactId: PACKAGE_A,
            chunkIndex: 1,
            chunkCount: 3,
            charCount: 120,
          },
          {
            evidenceId: EV_TABLE,
            evidenceKind: TABLE_KIND,
            sourceFileId: FILE_BOQ,
            inputPackageArtifactId: PACKAGE_A,
            tableId: TABLE_ID,
            sheetName: "BoQ",
            rowCount: 5,
            columnCount: 4,
          },
        ],
        proposedEvidence: {
          evidenceKind: TABLE_KIND,
          tableId: "proposed-table-1",
          sourceFileName: "boq.xlsx",
          sourceFileRole: "boq",
          sheetName: "Sheet1",
          pageNumber: 2,
          rowCount: 1,
          columnCount: 2,
          rows: [[PROPOSED_CELL_A, PROPOSED_CELL_B]],
        },
        reviewHistory: [
          {
            action: "edit_accept",
            decidedBy: DECIDED_BY,
            decidedAt: HIST_AT,
            previousReviewStatus: "pending_review",
            nextReviewStatus: "accepted",
            note: EDIT_NOTE,
            editedFields: {
              title: EDIT_TITLE,
              proposedEvidence: {
                evidenceKind: TEXT_KIND,
                text: PROPOSED_EDIT_TEXT,
                chunkIndex: 0,
                chunkCount: 1,
                charCount: 42,
              },
            },
          },
        ],
      },
      {
        id: "RFP-DELTA-002",
        kind: "suspicious_item",
        sourceFileId: FILE_BOQ,
        title: CAND2_TITLE,
        description: CAND2_DESC,
        severity: "blocking",
        confidence: 0.5,
        rationale: CAND2_RATIONALE,
        reviewStatus: "pending_review",
        evidenceReferences: [
          {
            evidenceId: EV_TEXT_2,
            evidenceKind: TEXT_KIND,
            sourceFileId: FILE_BOQ,
            inputPackageArtifactId: PACKAGE_A,
            chunkIndex: 4,
            chunkCount: 6,
            charCount: 80,
          },
        ],
        proposedEvidence: {
          evidenceKind: TEXT_KIND,
          text: PROPOSED_CAND2_TEXT,
          sourceFileName: "rfp.pdf",
          sourceFileRole: "rfp",
        },
      },
    ],
  };
}

/** The draft payload plus the review-provenance fields a review pass adds. */
function makeReviewedPayload(): Record<string, unknown> {
  const payload = makeDeltaPayload();
  payload.reviewedBy = REVIEWED_BY;
  payload.reviewedAt = REVIEWED_AT;
  payload.reviewedDecisionCount = 1;
  // Stored tallies are deliberately wrong: the summary must recompute them
  // from the candidates, never trust these.
  payload.pendingCount = 99;
  payload.acceptedCount = 99;
  payload.rejectedCount = 99;
  payload.waivedCount = 99;
  payload.sourceExtractionDeltaArtifactId = DELTA_A;
  payload.sourceExtractionDeltaArtifactVersion = 1;
  return payload;
}

/**
 * A well-formed payload with secrets smuggled into every level: payload
 * root, candidate, evidence references (raw evidence text and table rows
 * included), proposal, and review history. The whitelist must drop them all
 * while keeping the legitimate proposal bodies visible.
 */
function makeSmuggledPayload(): Record<string, unknown> {
  const payload = makeDeltaPayload();
  payload.tenantId = TENANT;
  payload.storagePath = "C:/secret/rfp.pdf";
  payload.smuggledRoot = "SMUGGLED-ROOT-SECRET";
  payload.provider = "anthropic";
  payload.filePath = "C:/secret/raw-output.json";
  const candidates = payload.candidates as Array<Record<string, unknown>>;
  candidates[0].tenantId = TENANT;
  candidates[0].smuggledCandidate = "SMUGGLED-CAND-SECRET";
  candidates[0].payload = { nested: "SMUGGLED-NESTED-SECRET" };
  candidates[0].pricing = { unitPrice: 1234 };
  candidates[0].sku = "C9300-SMUGGLED";
  candidates[0].storagePath = "C:/secret/candidate";
  const references = candidates[0].evidenceReferences as Array<
    Record<string, unknown>
  >;
  references[0].text = "RAW-EVIDENCE-TEXT contractor shall supply switches.";
  references[0].smuggledReference = "SMUGGLED-REF-SECRET";
  references[1].rows = [["RAW-TABLE-CELL-A1", "1"]];
  references[1].storagePath = "C:/secret/boq-workbook";
  const proposed = candidates[0].proposedEvidence as Record<string, unknown>;
  proposed.smuggledProposal = "SMUGGLED-PROPOSAL-SECRET";
  proposed.storagePath = "C:/secret/proposed";
  const history = candidates[0].reviewHistory as Array<Record<string, unknown>>;
  history[0].tenantId = TENANT;
  history[0].smuggledHistory = "SMUGGLED-HISTORY-SECRET";
  const editedFields = history[0].editedFields as Record<string, unknown>;
  editedFields.smuggledEdit = "SMUGGLED-EDIT-SECRET";
  return payload;
}

function makeDeltaArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: DELTA_A,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "extraction_delta",
    status: "needs_review",
    version: 1,
    payload: makeDeltaPayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function expectedProjectSummary() {
  return {
    id: PROJECT,
    name: "STC RFP Bid",
    customerName: "STC",
    mode: "rfp",
    createdAt: TS1.toISOString(),
    updatedAt: TS2.toISOString(),
  };
}

function expectedArtifactSummary(artifact: ProjectArtifact) {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

function expectedPayloadSummary() {
  return {
    payloadKind: DELTA_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    proposalSource: "deterministic",
    inputPackageArtifactId: PACKAGE_A,
    candidateCount: 2,
    evidenceReferenceCount: 3,
    pendingCount: 1,
    acceptedCount: 1,
    rejectedCount: 0,
    waivedCount: 0,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
  };
}

function expectedReviewedPayloadSummary() {
  return {
    ...expectedPayloadSummary(),
    reviewedBy: REVIEWED_BY,
    reviewedAt: REVIEWED_AT,
    reviewedDecisionCount: 1,
    sourceExtractionDeltaArtifactId: DELTA_A,
    sourceExtractionDeltaArtifactVersion: 1,
  };
}

/** The sanitized delta the detail must produce from the fixture payload. */
function expectedDelta() {
  return {
    payloadKind: DELTA_KIND,
    createdBy: CREATED_BY,
    createdAt: PAYLOAD_AT,
    proposalSource: "deterministic",
    inputPackageArtifactId: PACKAGE_A,
    candidateCount: 2,
    evidenceReferenceCount: 3,
    pendingCount: 1,
    acceptedCount: 1,
    rejectedCount: 0,
    waivedCount: 0,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    candidates: [
      {
        id: "RFP-DELTA-001",
        kind: "missing_evidence",
        sourceFileId: FILE_RFP,
        title: CAND1_TITLE,
        description: CAND1_DESC,
        severity: "warning",
        reviewStatus: "accepted",
        confidence: 0.8,
        rationale: CAND1_RATIONALE,
        evidenceReferences: [
          {
            evidenceId: EV_TEXT,
            sourceFileId: FILE_RFP,
            inputPackageArtifactId: PACKAGE_A,
            evidenceKind: TEXT_KIND,
            chunkIndex: 1,
            chunkCount: 3,
            charCount: 120,
          },
          {
            evidenceId: EV_TABLE,
            sourceFileId: FILE_BOQ,
            inputPackageArtifactId: PACKAGE_A,
            evidenceKind: TABLE_KIND,
            tableId: TABLE_ID,
            sheetName: "BoQ",
            rowCount: 5,
            columnCount: 4,
          },
        ],
        proposedEvidence: {
          evidenceKind: TABLE_KIND,
          tableId: "proposed-table-1",
          sourceFileName: "boq.xlsx",
          sourceFileRole: "boq",
          sheetName: "Sheet1",
          pageNumber: 2,
          rowCount: 1,
          columnCount: 2,
          rows: [[PROPOSED_CELL_A, PROPOSED_CELL_B]],
        },
        reviewHistory: [
          {
            action: "edit_accept",
            decidedBy: DECIDED_BY,
            decidedAt: HIST_AT,
            previousReviewStatus: "pending_review",
            nextReviewStatus: "accepted",
            note: EDIT_NOTE,
            editedFields: {
              title: EDIT_TITLE,
              proposedEvidence: {
                evidenceKind: TEXT_KIND,
                text: PROPOSED_EDIT_TEXT,
                chunkIndex: 0,
                chunkCount: 1,
                charCount: 42,
              },
            },
          },
        ],
      },
      {
        id: "RFP-DELTA-002",
        kind: "suspicious_item",
        sourceFileId: FILE_BOQ,
        title: CAND2_TITLE,
        description: CAND2_DESC,
        severity: "blocking",
        reviewStatus: "pending_review",
        confidence: 0.5,
        rationale: CAND2_RATIONALE,
        evidenceReferences: [
          {
            evidenceId: EV_TEXT_2,
            sourceFileId: FILE_BOQ,
            inputPackageArtifactId: PACKAGE_A,
            evidenceKind: TEXT_KIND,
            chunkIndex: 4,
            chunkCount: 6,
            charCount: 80,
          },
        ],
        proposedEvidence: {
          evidenceKind: TEXT_KIND,
          text: PROPOSED_CAND2_TEXT,
          sourceFileName: "rfp.pdf",
          sourceFileRole: "rfp",
        },
        reviewHistory: [],
      },
    ],
  };
}

function list(
  overrides: Partial<LoadRfpExtractionDeltaListInput> = {}
): Promise<LoadRfpExtractionDeltaListResult> {
  return loadRfpExtractionDeltaList({
    tenantId: TENANT,
    projectId: PROJECT,
    ...overrides,
  });
}

function detail(
  overrides: Partial<LoadRfpExtractionDeltaDetailInput> = {}
): Promise<LoadRfpExtractionDeltaDetailResult> {
  return loadRfpExtractionDeltaDetail({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: DELTA_A,
    ...overrides,
  });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockListArtifactsByType).not.toHaveBeenCalled();
}

let deltaArtifact: ProjectArtifact;
let artifactById: Map<string, ProjectArtifact>;

beforeEach(() => {
  deltaArtifact = makeDeltaArtifact();
  artifactById = new Map([[DELTA_A, deltaArtifact]]);
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockListArtifactsByType
    .mockReset()
    .mockImplementation(async () => [deltaArtifact]);
});

describe("validation before store calls", () => {
  it("list throws on a blank projectId", async () => {
    for (const blank of ["", "   "]) {
      await expect(list({ projectId: blank })).rejects.toThrow(
        "projectId is required."
      );
    }
    expectNoStoreCalls();
  });

  it("detail throws on a blank projectId", async () => {
    for (const blank of ["", "   "]) {
      await expect(detail({ projectId: blank })).rejects.toThrow(
        "projectId is required."
      );
    }
    expectNoStoreCalls();
  });

  it("detail throws on a blank artifactId", async () => {
    for (const blank of ["", "   "]) {
      await expect(detail({ artifactId: blank })).rejects.toThrow(
        "artifactId is required."
      );
    }
    expectNoStoreCalls();
  });
});

describe("project gates", () => {
  it("list returns not_found for a missing project and reads no artifacts", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await list()).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });

  it("detail returns not_found for a missing project and reads no artifacts", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await detail()).toEqual({ status: "not_found" });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("list returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await list();

    expect(result).toEqual({
      status: "wrong_mode",
      project: { ...expectedProjectSummary(), mode: "quick_bom" },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT);
    expect(serialized).not.toContain("tenantId");
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("detail returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await detail();

    expect(result).toEqual({
      status: "wrong_mode",
      project: { ...expectedProjectSummary(), mode: "quick_bom" },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT);
    expect(serialized).not.toContain("tenantId");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });
});

describe("loadRfpExtractionDeltaList", () => {
  it("lists extraction_delta versions with whitelisted payload summaries", async () => {
    const versionTwo = makeDeltaArtifact({
      id: DELTA_B,
      version: 2,
      status: "approved",
    });
    mockListArtifactsByType.mockResolvedValue([deltaArtifact, versionTwo]);

    const result = await list();

    expect(mockListArtifactsByType).toHaveBeenCalledTimes(1);
    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "extraction_delta"
    );
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      project: expectedProjectSummary(),
      artifacts: [
        {
          ...expectedArtifactSummary(deltaArtifact),
          payloadSummary: expectedPayloadSummary(),
        },
        {
          ...expectedArtifactSummary(versionTwo),
          payloadSummary: expectedPayloadSummary(),
        },
      ],
      artifactCount: 2,
    });
  });

  it("surfaces optional review provenance for a reviewed payload", async () => {
    mockListArtifactsByType.mockResolvedValue([
      makeDeltaArtifact({ payload: makeReviewedPayload() }),
    ]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts[0].payloadSummary).toEqual(
      expectedReviewedPayloadSummary()
    );
  });

  it("computes pending/accepted/rejected/waived tallies from candidate reviewStatus", async () => {
    const statuses = [
      "accepted",
      "pending_review",
      "rejected",
      "waived",
      "frobnicated",
    ];
    const payload = {
      payloadKind: DELTA_KIND,
      createdBy: CREATED_BY,
      createdAt: PAYLOAD_AT,
      proposalSource: "ai",
      inputPackageArtifactId: PACKAGE_A,
      candidateCount: statuses.length,
      evidenceReferenceCount: 0,
      sourceFileIds: [FILE_RFP],
      sourceArtifactIds: [PACKAGE_A],
      candidates: statuses.map((reviewStatus, index) => ({
        id: `RFP-DELTA-00${index + 1}`,
        kind: "missing_evidence",
        sourceFileId: FILE_RFP,
        title: "t",
        description: "d",
        severity: "info",
        reviewStatus,
        evidenceReferences: [],
      })),
    };
    mockListArtifactsByType.mockResolvedValue([makeDeltaArtifact({ payload })]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const summary = result.artifacts[0].payloadSummary;
    expect(summary.pendingCount).toBe(1);
    expect(summary.acceptedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.waivedCount).toBe(1);
  });

  it("keeps only extraction_delta rows even if the store returns others", async () => {
    const stray = makeDeltaArtifact({
      id: "art-stray-1",
      type: "normalized_boq",
      stageId: "boq_format_validation",
    });
    mockListArtifactsByType.mockResolvedValue([deltaArtifact, stray]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    expect(result.artifacts.map((entry) => entry.id)).toEqual([DELTA_A]);
  });

  it("degrades malformed payloads to safe summary fields without throwing or leaking", async () => {
    const malformed = makeDeltaArtifact({
      id: DELTA_B,
      payload: {
        payloadKind: 42,
        createdBy: null,
        createdAt: ["nope"],
        proposalSource: 7,
        inputPackageArtifactId: {},
        candidateCount: "two",
        evidenceReferenceCount: Number.NaN,
        candidates: "not-an-array",
        reviewedBy: 5,
        reviewedDecisionCount: "one",
        sourceExtractionDeltaArtifactVersion: "v1",
        sourceFileIds: [FILE_RFP, 5],
        sourceArtifactIds: "nope",
        tenantId: TENANT,
        storagePath: "C:/secret/rfp.pdf",
        smuggledRoot: "SMUGGLED-ROOT-SECRET",
      },
    });
    const empty = makeDeltaArtifact({ id: "art-extraction-delta-3", payload: {} });
    mockListArtifactsByType.mockResolvedValue([malformed, empty]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const safeSummary = {
      payloadKind: "",
      createdBy: "",
      createdAt: "",
      proposalSource: "",
      inputPackageArtifactId: "",
      candidateCount: 0,
      evidenceReferenceCount: 0,
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      waivedCount: 0,
      sourceFileIds: [],
      sourceArtifactIds: [],
    };
    expect(result.artifacts.map((entry) => entry.payloadSummary)).toEqual([
      safeSummary,
      safeSummary,
    ]);
    const serialized = JSON.stringify(result);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "C:/secret",
      "SMUGGLED-ROOT-SECRET",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("never includes candidate bodies, proposed rows, or raw evidence in list summaries", async () => {
    mockListArtifactsByType.mockResolvedValue([
      makeDeltaArtifact({ payload: makeSmuggledPayload() }),
    ]);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const serialized = JSON.stringify(result);
    for (const leak of [
      CAND1_TITLE,
      CAND1_DESC,
      CAND1_RATIONALE,
      CAND2_TITLE,
      PROPOSED_CELL_A,
      PROPOSED_EDIT_TEXT,
      PROPOSED_CAND2_TEXT,
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
      "SMUGGLED",
      "C9300-SMUGGLED",
      "anthropic",
      TENANT,
      "tenantId",
      "storagePath",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns serializable fresh copies whose mutation never touches the stored row", async () => {
    const snapshot = structuredClone(deltaArtifact);

    const result = await list();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    result.artifacts[0].sourceFileIds.push("hacked-file");
    result.artifacts[0].sourceArtifactIds.push("hacked-artifact");
    result.artifacts[0].payloadSummary.sourceFileIds.push("hacked-file");
    expect(deltaArtifact).toEqual(snapshot);
  });

  it("bubbles an unexpected project read failure unhidden", async () => {
    mockGetProject.mockRejectedValue(new Error("project read failed"));

    await expect(list()).rejects.toThrow("project read failed");
  });

  it("bubbles an unexpected artifact list failure unhidden", async () => {
    mockListArtifactsByType.mockRejectedValue(
      new Error("artifact list failed")
    );

    await expect(list()).rejects.toThrow("artifact list failed");
  });
});

describe("loadRfpExtractionDeltaDetail - artifact gates", () => {
  it("returns artifact_not_found for a missing artifact", async () => {
    const result = await detail({ artifactId: "art-missing-1" });

    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifact).toHaveBeenCalledTimes(1);
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT, "art-missing-1");
  });

  it("returns artifact_not_extraction_delta for a wrong type, without its payload", async () => {
    const inputPackage = makeDeltaArtifact({
      id: "art-input-package-9",
      type: "input_package",
      stageId: "intake_package_review",
      status: "approved",
      payload: {
        payloadKind: "rfp_input_package",
        marker: "PACKAGE-PAYLOAD-SECRET",
      },
    });
    artifactById.set("art-input-package-9", inputPackage);

    const result = await detail({ artifactId: "art-input-package-9" });

    expect(result).toEqual({
      status: "artifact_not_extraction_delta",
      artifact: expectedArtifactSummary(inputPackage),
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
  });

  it("returns artifact_not_extraction_delta for an extraction_delta at the wrong stage", async () => {
    artifactById.set(
      DELTA_A,
      makeDeltaArtifact({ stageId: "boq_format_validation" })
    );

    const result = await detail();

    expect(result.status).toBe("artifact_not_extraction_delta");
    expect(JSON.stringify(result)).not.toContain(CAND1_TITLE);
  });

  it("returns invalid_payload for a wrong or missing marker, without payload leaks", async () => {
    const payloads: Array<Record<string, unknown>> = [
      {},
      { payloadKind: "rfp_input_package", candidates: [] },
      { payloadKind: 42, candidates: [], secret: "SMUGGLED-ROOT-SECRET" },
    ];
    for (const payload of payloads) {
      const stored = makeDeltaArtifact({ payload });
      artifactById.set(DELTA_A, stored);

      const result = await detail();

      expect(result).toEqual({
        status: "invalid_payload",
        artifact: expectedArtifactSummary(stored),
      });
      expect(JSON.stringify(result)).not.toContain("SMUGGLED-ROOT-SECRET");
    }
  });

  it("returns invalid_payload for a non-object payload", async () => {
    const payloads: unknown[] = [[], null, "rfp_extraction_delta", 7];
    for (const payload of payloads) {
      artifactById.set(
        DELTA_A,
        makeDeltaArtifact({
          payload: payload as unknown as Record<string, unknown>,
        })
      );

      const result = await detail();

      expect(result.status).toBe("invalid_payload");
    }
  });

  it("returns invalid_payload for a malformed candidates array", async () => {
    const variants: unknown[] = [
      undefined,
      "not-an-array",
      7,
      { 0: {} },
      [{ id: "RFP-DELTA-001" }, null],
      [{ id: "RFP-DELTA-001" }, "junk"],
      [["nested"]],
    ];
    for (const candidates of variants) {
      const payload: Record<string, unknown> = {
        payloadKind: DELTA_KIND,
        createdBy: CREATED_BY,
        createdAt: PAYLOAD_AT,
        proposalSource: "deterministic",
        inputPackageArtifactId: PACKAGE_A,
        candidateCount: 0,
        evidenceReferenceCount: 0,
      };
      if (candidates !== undefined) payload.candidates = candidates;
      artifactById.set(DELTA_A, makeDeltaArtifact({ payload }));

      const result = await detail();

      expect(result.status).toBe("invalid_payload");
    }
  });
});

describe("loadRfpExtractionDeltaDetail - ok", () => {
  it("returns the full sanitized delta with locator-only references, proposals, and history", async () => {
    const result = await detail();

    expect(mockGetArtifact).toHaveBeenCalledTimes(1);
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT, DELTA_A);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ok",
      project: expectedProjectSummary(),
      artifact: expectedArtifactSummary(deltaArtifact),
      delta: expectedDelta(),
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);

    if (result.status !== "ok") throw new Error("unreachable");
    const [first] = result.delta.candidates;
    expect(Object.keys(first.evidenceReferences[0])).toEqual([
      "evidenceId",
      "sourceFileId",
      "inputPackageArtifactId",
      "evidenceKind",
      "chunkIndex",
      "chunkCount",
      "charCount",
    ]);
    expect(Object.keys(first.evidenceReferences[1])).toEqual([
      "evidenceId",
      "sourceFileId",
      "inputPackageArtifactId",
      "evidenceKind",
      "tableId",
      "sheetName",
      "rowCount",
      "columnCount",
    ]);
  });

  it("surfaces optional review provenance and recomputes tallies for a reviewed payload", async () => {
    artifactById.set(DELTA_A, makeDeltaArtifact({ payload: makeReviewedPayload() }));

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.delta.reviewedBy).toBe(REVIEWED_BY);
    expect(result.delta.reviewedAt).toBe(REVIEWED_AT);
    expect(result.delta.reviewedDecisionCount).toBe(1);
    expect(result.delta.sourceExtractionDeltaArtifactId).toBe(DELTA_A);
    expect(result.delta.sourceExtractionDeltaArtifactVersion).toBe(1);
    // Recomputed from candidates, never the bogus stored 99 tallies.
    expect(result.delta.pendingCount).toBe(1);
    expect(result.delta.acceptedCount).toBe(1);
    expect(result.delta.rejectedCount).toBe(0);
    expect(result.delta.waivedCount).toBe(0);
  });

  it("inspects any version regardless of review status", async () => {
    artifactById.set(DELTA_A, makeDeltaArtifact({ status: "rejected" }));

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact.status).toBe("rejected");
  });

  it("omits optional fields when not stored and degrades malformed candidate fields safely", async () => {
    artifactById.set(
      DELTA_A,
      makeDeltaArtifact({
        payload: {
          payloadKind: DELTA_KIND,
          createdBy: 42,
          createdAt: null,
          proposalSource: ["x"],
          inputPackageArtifactId: 7,
          candidateCount: "two",
          evidenceReferenceCount: Number.NaN,
          sourceFileIds: [FILE_RFP, 5],
          sourceArtifactIds: "nope",
          candidates: [
            {
              id: 7,
              kind: null,
              sourceFileId: ["x"],
              title: 9,
              description: {},
              severity: 1,
              reviewStatus: 2,
              confidence: "high",
              rationale: 3,
              evidenceReferences: "not-an-array",
              proposedEvidence: { evidenceKind: "boq_line_item" },
              reviewHistory: "nope",
            },
            {
              id: "RFP-DELTA-002",
              kind: "incorrect_extraction",
              sourceFileId: FILE_RFP,
              title: "t",
              description: "d",
              severity: "info",
              reviewStatus: "rejected",
              evidenceReferences: [
                {
                  evidenceId: 5,
                  evidenceKind: "boq_line_item",
                  sourceFileId: null,
                  inputPackageArtifactId: 3,
                  chunkIndex: "one",
                },
              ],
              reviewHistory: [
                null,
                {
                  action: "waive",
                  decidedBy: "eng",
                  decidedAt: HIST_AT,
                  previousReviewStatus: "pending_review",
                  nextReviewStatus: "waived",
                  note: 9,
                  editedFields: { foo: "bar" },
                },
              ],
            },
          ],
        },
      })
    );

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.delta.createdBy).toBe("");
    expect(result.delta.createdAt).toBe("");
    expect(result.delta.proposalSource).toBe("");
    expect(result.delta.inputPackageArtifactId).toBe("");
    expect(result.delta.candidateCount).toBe(0);
    expect(result.delta.evidenceReferenceCount).toBe(0);
    expect(result.delta.sourceFileIds).toEqual([]);
    expect(result.delta.sourceArtifactIds).toEqual([]);
    expect(result.delta.rejectedCount).toBe(1);

    const [first, second] = result.delta.candidates;
    expect(first).toEqual({
      id: "",
      kind: "",
      sourceFileId: "",
      title: "",
      description: "",
      severity: "",
      reviewStatus: "",
      evidenceReferences: [],
      reviewHistory: [],
    });
    expect(Object.keys(first)).toEqual([
      "id",
      "kind",
      "sourceFileId",
      "title",
      "description",
      "severity",
      "reviewStatus",
      "evidenceReferences",
      "reviewHistory",
    ]);
    expect(second.evidenceReferences).toEqual([
      {
        evidenceId: "",
        sourceFileId: "",
        inputPackageArtifactId: "",
        evidenceKind: TEXT_KIND,
        chunkIndex: 0,
        chunkCount: 0,
        charCount: 0,
      },
    ]);
    expect(second.reviewHistory).toEqual([
      {
        action: "",
        decidedBy: "",
        decidedAt: "",
        previousReviewStatus: "",
        nextReviewStatus: "",
      },
      {
        action: "waive",
        decidedBy: "eng",
        decidedAt: HIST_AT,
        previousReviewStatus: "pending_review",
        nextReviewStatus: "waived",
      },
    ]);
  });

  it("copies proposed table rows as a fresh matrix and degrades malformed rows/cells safely", async () => {
    const stored = makeDeltaArtifact({
      payload: {
        payloadKind: DELTA_KIND,
        createdBy: CREATED_BY,
        createdAt: PAYLOAD_AT,
        proposalSource: "engineer",
        inputPackageArtifactId: PACKAGE_A,
        candidateCount: 1,
        evidenceReferenceCount: 0,
        sourceFileIds: [FILE_RFP],
        sourceArtifactIds: [PACKAGE_A],
        candidates: [
          {
            id: "RFP-DELTA-001",
            kind: "table_reconstruction",
            sourceFileId: FILE_RFP,
            title: "t",
            description: "d",
            severity: "warning",
            reviewStatus: "pending_review",
            evidenceReferences: [],
            proposedEvidence: {
              evidenceKind: TABLE_KIND,
              rows: [["A", 5, null], "notarow", 42, [{}]],
            },
          },
        ],
      },
    });
    artifactById.set(DELTA_A, stored);
    const snapshot = structuredClone(stored);

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const proposed = result.delta.candidates[0].proposedEvidence;
    expect(proposed).toBeDefined();
    if (!proposed || proposed.evidenceKind !== TABLE_KIND) {
      throw new Error("unreachable");
    }
    expect(proposed.rows).toEqual([["A", "", ""], [], [], [""]]);

    proposed.rows.push(["hacked"]);
    proposed.rows[0].push("hacked-cell");
    expect(stored).toEqual(snapshot);
  });

  it("drops smuggled payload/candidate/reference/history keys and raw evidence via the whitelist", async () => {
    artifactById.set(DELTA_A, makeDeltaArtifact({ payload: makeSmuggledPayload() }));

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    // The whitelist output of the smuggled payload equals the clean one.
    expect(result.delta).toEqual(expectedDelta());
    const serialized = JSON.stringify(result);
    // Legitimate proposal bodies stay visible for review.
    expect(serialized).toContain(CAND1_TITLE);
    expect(serialized).toContain(PROPOSED_EDIT_TEXT);
    expect(serialized).toContain(PROPOSED_CELL_A);
    expect(serialized).toContain(PROPOSED_CAND2_TEXT);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "C:/secret",
      "filePath",
      "anthropic",
      "C9300-SMUGGLED",
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
      "SMUGGLED-ROOT-SECRET",
      "SMUGGLED-CAND-SECRET",
      "SMUGGLED-NESTED-SECRET",
      "SMUGGLED-REF-SECRET",
      "SMUGGLED-PROPOSAL-SECRET",
      "SMUGGLED-HISTORY-SECRET",
      "SMUGGLED-EDIT-SECRET",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns fresh copies whose deep mutation never aliases the stored payload", async () => {
    const snapshot = structuredClone(deltaArtifact);

    const result = await detail();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const storedCandidates = deltaArtifact.payload.candidates as Array<
      Record<string, unknown>
    >;
    expect(result.delta.candidates).not.toBe(storedCandidates);
    expect(result.delta.candidates[0]).not.toBe(storedCandidates[0]);
    expect(result.delta.candidates[0].evidenceReferences).not.toBe(
      storedCandidates[0].evidenceReferences
    );

    const candidate = result.delta.candidates[0];
    candidate.title = "hacked";
    candidate.evidenceReferences.push({
      evidenceId: "hacked",
      sourceFileId: "hacked",
      inputPackageArtifactId: "hacked",
      evidenceKind: TEXT_KIND,
      chunkIndex: 9,
      chunkCount: 9,
      charCount: 9,
    });
    const proposed = candidate.proposedEvidence;
    if (proposed && proposed.evidenceKind === TABLE_KIND) {
      proposed.rows.push(["hacked"]);
      proposed.rows[0].push("hacked-cell");
    }
    candidate.reviewHistory.push({
      action: "hacked",
      decidedBy: "hacked",
      decidedAt: "hacked",
      previousReviewStatus: "hacked",
      nextReviewStatus: "hacked",
    });
    result.delta.candidates.push({
      id: "hacked",
      kind: "hacked",
      sourceFileId: "hacked",
      title: "hacked",
      description: "hacked",
      severity: "hacked",
      reviewStatus: "hacked",
      evidenceReferences: [],
      reviewHistory: [],
    });
    result.delta.sourceFileIds.push("hacked-file");
    result.delta.sourceArtifactIds.push("hacked-artifact");
    result.artifact.sourceFileIds.push("hacked-file");
    expect(deltaArtifact).toEqual(snapshot);
  });

  it("bubbles an unexpected artifact read failure unhidden", async () => {
    mockGetArtifact.mockRejectedValue(new Error("artifact read failed"));

    await expect(detail()).rejects.toThrow("artifact read failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-extraction-delta-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-extraction-delta-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the allowed store modules and type-only shape modules", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-extraction-delta",
    ]);
    expect(source).toMatch(/import type \{[\s\S]*?\} from "@\/types\/project";/);
    expect(source).toMatch(
      /import type \{[\s\S]*?\} from "@\/lib\/projects\/project-rfp-extraction-delta";/
    );
  });

  it("performs no store mutation calls at all", () => {
    const calls =
      source.match(
        /\b(?:create|update|delete|insert|remove|drop|persist|save|upsert)[A-Z]\w*/g
      ) ?? [];
    expect(calls).toEqual([]);
  });

  it("never imports the evidence/file/approval stores or reads evidence content bodies", () => {
    expect(source).not.toContain("project-evidence-store");
    expect(source).not.toContain("getProjectEvidenceItemById");
    expect(source).not.toContain("listProjectEvidenceItems");
    expect(source).not.toContain("ProjectEvidenceItem");
    expect(source).not.toContain("project-file-store");
    expect(source).not.toContain("project-approval-store");
    expect(source).not.toContain("content.text");
    expect(source).not.toContain("content.rows");
    expect(source).not.toContain("storagePath");
    expect(source).not.toContain("benchmark");
  });

  it("imports no route/UI/Next/React/filesystem/parser/OCR/AI/provider/adapter/executor/review/approval/sibling delta/requirements/boq/pricing/SKU/config/export/catalog/coordinator/engine module", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "fs"',
      'from "path"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/index"',
      'from "@/lib/db/schema"',
      'from "@/lib/projects/project-rfp-extraction-delta-',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/project-rfp-evidence',
      'from "@/lib/projects/project-rfp-requirements-baseline',
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
