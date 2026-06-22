import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";

// Mock ONLY the four store boundaries (project read, evidence read, artifact
// read, artifact create); the baseline service's validation, gating, payload
// building, and summaries stay real. No DB, file bytes, parser, or AI module
// is touched anywhere in this suite.
const {
  mockGetProject,
  mockGetEvidenceItem,
  mockGetArtifact,
  mockCreateArtifact,
} = vi.hoisted(() => ({
  mockGetProject: vi.fn(),
  mockGetEvidenceItem: vi.fn(),
  mockGetArtifact: vi.fn(),
  mockCreateArtifact: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-evidence-store", () => ({
  getProjectEvidenceItemById: mockGetEvidenceItem,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  createProjectArtifactVersion: mockCreateArtifact,
}));

import {
  createRfpRequirementsBaselineDraft,
  RFP_REQUIREMENT_CATEGORIES,
  RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND,
  type CreateRfpRequirementsBaselineDraftInput,
  type CreateRfpRequirementsBaselineDraftResult,
  type RfpRequirementsBaselineCandidateInput,
} from "@/lib/projects/project-rfp-requirements-baseline";

// The two accepted evidence kinds, declared locally exactly like the service
// declares them - the persistence write module must stay unimported here too.
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PACKAGE_A = "art-input-package-1";
const PACKAGE_B = "art-input-package-2";
const BASELINE_ARTIFACT = "art-requirements-baseline-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_TEXT_B = "evidence-text-2";
const TABLE_ID = `${FILE_BOQ}:table:1`;
const CREATED_BY = "engineer@stc.example";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const STORED_AT = new Date("2026-06-03T08:15:00.000Z");
const STORED_RETAIN = new Date("2027-06-03T08:15:00.000Z");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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
      documentMetrics: {
        textCharCount: 103,
        nonWhitespaceTextCharCount: 92,
        tableCount: 1,
        tableRowCount: 2,
      },
    },
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
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
    },
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
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
    payload: { payloadKind: "rfp_input_package", marker: "PACKAGE-PAYLOAD-SECRET" },
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [],
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
    id: BASELINE_ARTIFACT,
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

function makeCandidate(
  overrides: Partial<RfpRequirementsBaselineCandidateInput> = {}
): RfpRequirementsBaselineCandidateInput {
  return {
    text: "Provide 48-port PoE access switches for all IDFs.",
    category: "technical",
    priority: "mandatory",
    evidenceIds: [EV_TEXT],
    ...overrides,
  };
}

function draft(
  overrides: Partial<CreateRfpRequirementsBaselineDraftInput> = {}
): Promise<CreateRfpRequirementsBaselineDraftResult> {
  return createRfpRequirementsBaselineDraft({
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    candidates: [makeCandidate()],
    ...overrides,
  });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetEvidenceItem).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockCreateArtifact).not.toHaveBeenCalled();
}

let evidenceById: Map<string, ProjectEvidenceItem>;
let artifactById: Map<string, ProjectArtifact>;

beforeEach(() => {
  evidenceById = new Map([
    [EV_TEXT, makeTextChunkItem(EV_TEXT)],
    [EV_TABLE, makeTableItem(EV_TABLE)],
    [
      EV_TEXT_B,
      makeTextChunkItem(EV_TEXT_B, {
        content: {
          evidenceKind: TEXT_KIND,
          inputPackageArtifactId: PACKAGE_B,
          sourceFileId: FILE_RFP,
          sourceFileName: "rfp.pdf",
          sourceFileRole: "rfp",
          chunkIndex: 2,
          chunkCount: 2,
          text: "RAW-EVIDENCE-TEXT: spares for two years.",
          charCount: 40,
        },
      }),
    ],
  ]);
  artifactById = new Map([
    [PACKAGE_A, makeInputPackageArtifact(PACKAGE_A)],
    [PACKAGE_B, makeInputPackageArtifact(PACKAGE_B)],
  ]);
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetEvidenceItem
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, evidenceId: string) =>
        evidenceById.get(evidenceId) ?? null
    );
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockCreateArtifact
    .mockReset()
    .mockImplementation(async (call: CreateArtifactCall) =>
      makeStoredArtifact(call)
    );
});

describe("createRfpRequirementsBaselineDraft - validation before store calls", () => {
  it("throws on a blank createdBy", async () => {
    for (const blank of ["", "   "]) {
      await expect(draft({ createdBy: blank })).rejects.toThrow(
        "createdBy is required."
      );
    }
    expectNoStoreCalls();
  });

  it("throws when there are no candidates", async () => {
    await expect(draft({ candidates: [] })).rejects.toThrow(
      "At least one candidate requirement is required."
    );
    expectNoStoreCalls();
  });

  it("throws on a blank candidate text", async () => {
    await expect(
      draft({ candidates: [makeCandidate(), makeCandidate({ text: "   " })] })
    ).rejects.toThrow("candidates[1].text is required.");
    expectNoStoreCalls();
  });

  it("throws when a candidate has no nonblank evidence IDs", async () => {
    for (const evidenceIds of [[], ["", "   "]]) {
      await expect(
        draft({ candidates: [makeCandidate({ evidenceIds })] })
      ).rejects.toThrow(
        "candidates[0] must cite at least one nonblank evidence ID."
      );
    }
    expectNoStoreCalls();
  });

  it("rejects an invalid category", async () => {
    const candidate = makeCandidate({
      category: "pricing" as RfpRequirementsBaselineCandidateInput["category"],
    });
    await expect(draft({ candidates: [candidate] })).rejects.toThrow(
      "candidates[0].category is invalid: pricing."
    );
    expectNoStoreCalls();
  });

  it("rejects an invalid priority", async () => {
    const candidate = makeCandidate({
      priority: "urgent" as RfpRequirementsBaselineCandidateInput["priority"],
    });
    await expect(draft({ candidates: [candidate] })).rejects.toThrow(
      "candidates[0].priority is invalid: urgent."
    );
    expectNoStoreCalls();
  });
});

describe("project gates", () => {
  it("returns not_found for a missing project and reads no evidence", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await draft()).toEqual({ status: "not_found" });
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
    expect(mockGetArtifact).not.toHaveBeenCalled();
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
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("evidence gates", () => {
  it("returns evidence_not_found with every missing evidence ID and creates nothing", async () => {
    const result = await draft({
      candidates: [
        makeCandidate({ evidenceIds: [EV_TEXT, "missing-ev-1"] }),
        makeCandidate({
          text: "Submit a bid bond.",
          evidenceIds: ["missing-ev-2", EV_TEXT],
        }),
      ],
    });

    expect(result).toEqual({
      status: "evidence_not_found",
      missingEvidenceIds: ["missing-ev-1", "missing-ev-2"],
    });
    // EV_TEXT is cited by both candidates but loaded exactly once.
    expect(mockGetEvidenceItem).toHaveBeenCalledTimes(3);
    expect(mockGetEvidenceItem).toHaveBeenCalledWith(TENANT, PROJECT, EV_TEXT);
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns evidence_not_rfp_extraction for an unrelated evidence kind, without its content", async () => {
    evidenceById.set(
      "evidence-boq-1",
      makeTableItem("evidence-boq-1", { kind: "boq_line_item" })
    );

    const result = await draft({
      candidates: [makeCandidate({ evidenceIds: [EV_TEXT, "evidence-boq-1"] })],
    });

    expect(result).toEqual({
      status: "evidence_not_rfp_extraction",
      evidence: [
        {
          id: "evidence-boq-1",
          projectId: PROJECT,
          sourceFileId: FILE_BOQ,
          kind: "boq_line_item",
          extractedAt: STORED_AT.toISOString(),
          retainUntil: STORED_RETAIN.toISOString(),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("RAW-TABLE-CELL");
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns evidence_missing_input_package for an absent, blank, or non-string inputPackageArtifactId", async () => {
    const variants: Array<(content: Record<string, unknown>) => void> = [
      (content) => {
        delete content.inputPackageArtifactId;
      },
      (content) => {
        content.inputPackageArtifactId = "   ";
      },
      (content) => {
        content.inputPackageArtifactId = 42;
      },
    ];
    for (const applyVariant of variants) {
      const base = makeTextChunkItem(EV_TEXT);
      const content: Record<string, unknown> = { ...base.content };
      applyVariant(content);
      evidenceById.set(EV_TEXT, { ...base, content });
      mockGetArtifact.mockClear();
      mockCreateArtifact.mockClear();

      const result = await draft();

      expect(result).toEqual({
        status: "evidence_missing_input_package",
        evidence: [
          {
            id: EV_TEXT,
            projectId: PROJECT,
            sourceFileId: FILE_RFP,
            kind: TEXT_KIND,
            extractedAt: STORED_AT.toISOString(),
            retainUntil: STORED_RETAIN.toISOString(),
          },
        ],
      });
      expect(JSON.stringify(result)).not.toContain("RAW-EVIDENCE-TEXT");
      expect(mockGetArtifact).not.toHaveBeenCalled();
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    }
  });
});

describe("input package gates", () => {
  it("returns input_package_artifact_not_found with the missing artifact IDs", async () => {
    artifactById.delete(PACKAGE_A);

    const result = await draft();

    expect(result).toEqual({
      status: "input_package_artifact_not_found",
      missingArtifactIds: [PACKAGE_A],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns artifact_not_input_package for a wrong artifact type", async () => {
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
      artifacts: [
        {
          id: PACKAGE_A,
          projectId: PROJECT,
          stageId: "boq_format_validation",
          type: "normalized_boq",
          status: "approved",
          version: 3,
          sourceFileIds: [FILE_RFP, FILE_BOQ],
          sourceArtifactIds: [],
          createdAt: TS1.toISOString(),
          updatedAt: TS2.toISOString(),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
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
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns input_package_not_approved for a non-approved package version", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { status: "needs_review" })
    );

    const result = await draft();

    expect(result.status).toBe("input_package_not_approved");
    if (result.status !== "input_package_not_approved") {
      throw new Error("unreachable");
    }
    expect(result.artifacts).toEqual([
      {
        id: PACKAGE_A,
        projectId: PROJECT,
        stageId: "intake_package_review",
        type: "input_package",
        status: "needs_review",
        version: 3,
        sourceFileIds: [FILE_RFP, FILE_BOQ],
        sourceArtifactIds: [],
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
    ]);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  const candidateOne: RfpRequirementsBaselineCandidateInput = {
    text: "  Provide 48-port PoE access switches for all IDFs.  ",
    title: "  Access layer switching  ",
    notes: "  Cited from RFP section 3.2.  ",
    category: "technical",
    priority: "mandatory",
    evidenceIds: [`  ${EV_TEXT}  `, EV_TEXT, EV_TABLE],
  };
  const candidateTwo: RfpRequirementsBaselineCandidateInput = {
    text: "Submit a bid bond with the commercial offer.",
    evidenceIds: [EV_TABLE, EV_TEXT_B],
  };

  function successDraft(): Promise<CreateRfpRequirementsBaselineDraftResult> {
    return draft({
      createdBy: `  ${CREATED_BY}  `,
      candidates: [candidateOne, candidateTwo],
    });
  }

  it("creates exactly one needs_review requirements_baseline artifact at requirements_baseline_review", async () => {
    const result = await successDraft();

    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(call.projectId).toBe(PROJECT);
    expect(call.tenantId).toBe(TENANT);
    expect(call.stageId).toBe("requirements_baseline_review");
    expect(call.type).toBe("requirements_baseline");
    expect(call.status).toBe("needs_review");
    expect(call.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(call.sourceArtifactIds).toEqual([PACKAGE_A, PACKAGE_B]);
    expect(call.filePath).toBeUndefined();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: BASELINE_ARTIFACT,
      projectId: PROJECT,
      stageId: "requirements_baseline_review",
      type: "requirements_baseline",
      status: "needs_review",
      version: 1,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
      createdAt: STORED_AT.toISOString(),
      updatedAt: STORED_AT.toISOString(),
    });
  });

  it("builds deterministic requirement IDs, trims fields, applies defaults, and dedupes evidence IDs", async () => {
    await successDraft();

    const call = mockCreateArtifact.mock.calls[0][0];
    const payload = call.payload;
    expect(payload.payloadKind).toBe(RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND);
    expect(payload.createdBy).toBe(CREATED_BY);
    expect(payload.createdAt).toMatch(ISO_DATE);
    expect(payload.requirementCount).toBe(2);
    expect(payload.evidenceCount).toBe(3);
    expect(payload.requirements).toEqual([
      {
        id: "RFP-REQ-001",
        text: "Provide 48-port PoE access switches for all IDFs.",
        category: "technical",
        priority: "mandatory",
        title: "Access layer switching",
        notes: "Cited from RFP section 3.2.",
        evidenceReferences: [
          {
            evidenceId: EV_TEXT,
            sourceFileId: FILE_RFP,
            evidenceKind: TEXT_KIND,
            inputPackageArtifactId: PACKAGE_A,
            chunkIndex: 1,
            chunkCount: 2,
            charCount: 63,
          },
          {
            evidenceId: EV_TABLE,
            sourceFileId: FILE_BOQ,
            evidenceKind: TABLE_KIND,
            inputPackageArtifactId: PACKAGE_A,
            tableId: TABLE_ID,
            sheetName: "BoQ Sheet",
            rowCount: 2,
            columnCount: 2,
          },
        ],
      },
      {
        id: "RFP-REQ-002",
        text: "Submit a bid bond with the commercial offer.",
        category: "other",
        priority: "unknown",
        evidenceReferences: [
          {
            evidenceId: EV_TABLE,
            sourceFileId: FILE_BOQ,
            evidenceKind: TABLE_KIND,
            inputPackageArtifactId: PACKAGE_A,
            tableId: TABLE_ID,
            sheetName: "BoQ Sheet",
            rowCount: 2,
            columnCount: 2,
          },
          {
            evidenceId: EV_TEXT_B,
            sourceFileId: FILE_RFP,
            evidenceKind: TEXT_KIND,
            inputPackageArtifactId: PACKAGE_B,
            chunkIndex: 2,
            chunkCount: 2,
            charCount: 40,
          },
        ],
      },
    ]);
  });

  it("loads each unique evidence row and package artifact exactly once, in citation order", async () => {
    await successDraft();

    expect(mockGetEvidenceItem.mock.calls).toEqual([
      [TENANT, PROJECT, EV_TEXT],
      [TENANT, PROJECT, EV_TABLE],
      [TENANT, PROJECT, EV_TEXT_B],
    ]);
    expect(mockGetArtifact.mock.calls).toEqual([
      [TENANT, PROJECT, PACKAGE_A],
      [TENANT, PROJECT, PACKAGE_B],
    ]);
  });

  it("returns a lean payload summary with requirement IDs only", async () => {
    const result = await successDraft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const call = mockCreateArtifact.mock.calls[0][0];
    expect(result.payloadSummary).toEqual({
      payloadKind: RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND,
      createdBy: CREATED_BY,
      createdAt: call.payload.createdAt,
      requirementCount: 2,
      evidenceCount: 3,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
      requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
    });
    expect(result.payloadSummary.createdAt).toMatch(ISO_DATE);
  });

  it("leaks no tenantId, storage path, raw evidence text, or table rows into the payload or result", async () => {
    const result = await successDraft();

    const serializedResult = JSON.stringify(result);
    const serializedPayload = JSON.stringify(
      mockCreateArtifact.mock.calls[0][0].payload
    );
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
      "PACKAGE-PAYLOAD-SECRET",
    ]) {
      expect(serializedResult).not.toContain(leak);
      expect(serializedPayload).not.toContain(leak);
    }
  });

  it("returns serializable summaries whose arrays are copies of the stored row", async () => {
    const result = await successDraft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);

    const storedRow = await mockCreateArtifact.mock.results[0].value;
    const rowSnapshot = structuredClone(storedRow);
    result.artifact.sourceFileIds.push("hacked-file");
    result.artifact.sourceArtifactIds.push("hacked-artifact");
    result.payloadSummary.sourceFileIds.push("hacked-file");
    result.payloadSummary.sourceArtifactIds.push("hacked-artifact");
    result.payloadSummary.requirementIds.push("hacked-id");
    expect(storedRow).toEqual(rowSnapshot);
  });

  it("never mutates the input candidates, evidence rows, or artifact rows", async () => {
    const candidates = [
      { ...candidateOne, evidenceIds: candidateOne.evidenceIds.slice() },
      { ...candidateTwo, evidenceIds: candidateTwo.evidenceIds.slice() },
    ];
    const candidatesSnapshot = structuredClone(candidates);
    const evidenceSnapshot = structuredClone(
      Array.from(evidenceById.values())
    );
    const artifactSnapshot = structuredClone(
      Array.from(artifactById.values())
    );

    const result = await draft({ candidates });

    expect(result.status).toBe("ok");
    expect(candidates).toEqual(candidatesSnapshot);
    expect(Array.from(evidenceById.values())).toEqual(evidenceSnapshot);
    expect(Array.from(artifactById.values())).toEqual(artifactSnapshot);
  });

  it("bubbles an unexpected artifact create failure unhidden", async () => {
    mockCreateArtifact.mockRejectedValue(new Error("artifact insert failed"));

    await expect(draft()).rejects.toThrow("artifact insert failed");
  });
});

describe("expanded Stage 5 requirement category taxonomy", () => {
  it("snapshots the expanded category set, preserving the original baseline literals in order", () => {
    expect(RFP_REQUIREMENT_CATEGORIES).toEqual([
      "technical",
      "commercial",
      "compliance",
      "delivery",
      "security",
      "support",
      "legal",
      "other",
      "boq_product",
      "installation_configuration_testing",
      "documentation",
      "training_totk",
      "schedule_duration",
      "warranty_support",
      "permits_site_access_safety",
      "legal_regulatory_local_content",
      "insurance",
      "commercial_contractual",
      "vendor_qualification_submittals",
      "security_cybersecurity",
    ]);
  });

  it("persists every requirement category, including all new Stage 5 obligations, each with locator-only evidence", async () => {
    // One candidate per category in canonical order; each cites a real
    // evidence row so it carries at least one locator-only reference.
    const citationCycle = [EV_TEXT, EV_TABLE, EV_TEXT_B];
    const candidates: RfpRequirementsBaselineCandidateInput[] =
      RFP_REQUIREMENT_CATEGORIES.map((category, index) => ({
        text: `Obligation requirement for the ${category} category.`,
        category,
        priority: "mandatory" as const,
        evidenceIds: [citationCycle[index % citationCycle.length]],
      }));

    const result = await draft({ candidates });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    const call = mockCreateArtifact.mock.calls[0][0];
    expect(call.status).toBe("needs_review");

    const storedRequirements = call.payload.requirements as Array<{
      id: string;
      category: string;
      evidenceReferences: Array<Record<string, unknown>>;
    }>;
    // Every category in the taxonomy persisted, in canonical order.
    expect(
      storedRequirements.map((requirement) => requirement.category)
    ).toEqual(Array.from(RFP_REQUIREMENT_CATEGORIES));
    expect(storedRequirements.map((requirement) => requirement.id)).toEqual(
      RFP_REQUIREMENT_CATEGORIES.map(
        (_category, index) => `RFP-REQ-${String(index + 1).padStart(3, "0")}`
      )
    );
    // Every newly added Stage 5 obligation category was persisted.
    for (const newCategory of [
      "boq_product",
      "installation_configuration_testing",
      "documentation",
      "training_totk",
      "schedule_duration",
      "warranty_support",
      "permits_site_access_safety",
      "legal_regulatory_local_content",
      "insurance",
      "commercial_contractual",
      "vendor_qualification_submittals",
      "security_cybersecurity",
    ]) {
      expect(
        storedRequirements.some(
          (requirement) => requirement.category === newCategory
        )
      ).toBe(true);
    }
    // Each obligation carries at least one locator-only evidence reference:
    // identifiers and counts only, never a raw text body or table rows.
    for (const requirement of storedRequirements) {
      expect(requirement.evidenceReferences.length).toBeGreaterThanOrEqual(1);
      for (const reference of requirement.evidenceReferences) {
        expect(typeof reference.evidenceId).toBe("string");
        expect(typeof reference.sourceFileId).toBe("string");
        expect(typeof reference.inputPackageArtifactId).toBe("string");
        expect(
          reference.evidenceKind === TEXT_KIND ||
            reference.evidenceKind === TABLE_KIND
        ).toBe(true);
        expect(reference).not.toHaveProperty("text");
        expect(reference).not.toHaveProperty("rows");
      }
    }
    const serializedPayload = JSON.stringify(call.payload);
    expect(serializedPayload).not.toContain("RAW-EVIDENCE-TEXT");
    expect(serializedPayload).not.toContain("RAW-TABLE-CELL");
    expect(result.payloadSummary.requirementCount).toBe(
      RFP_REQUIREMENT_CATEGORIES.length
    );
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-requirements-baseline.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-requirements-baseline.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the three allowed store modules and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-evidence-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
    ]);
  });

  it("performs no store mutation except createProjectArtifactVersion", () => {
    const calls =
      source.match(/\b(?:create|update|delete|insert|remove|drop)[A-Z]\w*/g) ??
      [];
    const allowed = new Set([
      "createProjectArtifactVersion",
      "createRfpRequirementsBaselineDraft",
    ]);
    expect(calls.filter((name) => !allowed.has(name))).toEqual([]);
  });

  it("never copies the evidence text body or table rows", () => {
    expect(source).not.toContain("content.text");
    expect(source).not.toContain("content.rows");
  });

  it("imports no filesystem, parser, extraction, persistence, approval, route, UI, pricing, config, export, SKU, catalog, coordinator, engine, adapter, or AI module", () => {
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
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
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
