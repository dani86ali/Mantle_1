import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";

// Mock ONLY the three store boundaries (project read, evidence read, artifact
// read); the drafting contract's validation, gating, executor bundling, and
// output sanitization stay real. The executor is always a plain test function
// - no DB, file bytes, parser, or AI module is touched anywhere in this
// suite. createProjectArtifactVersion exists on the artifact-store mock only
// because this suite imports the baseline module's literal arrays; the
// afterEach below proves the drafting service NEVER persists through it.
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
  draftRfpRequirementCandidatesFromEvidence,
  draftRfpRequirementCandidatesFromEvidencePackage,
  type DraftRfpRequirementCandidatesFromEvidenceInput,
  type DraftRfpRequirementCandidatesFromEvidencePackageInput,
  type DraftRfpRequirementCandidatesFromEvidencePackageResult,
  type DraftRfpRequirementCandidatesFromEvidenceResult,
  type RfpCandidateDraftingExecutor,
  type RfpCandidateDraftingExecutorInput,
} from "@/lib/projects/project-rfp-requirements-candidate-drafting";
import {
  RFP_REQUIREMENT_CATEGORIES,
  RFP_REQUIREMENT_PRIORITIES,
} from "@/lib/projects/project-rfp-requirements-baseline";

// The two accepted evidence kinds, declared locally exactly like the service
// declares them - the extraction write module must stay unimported here too.
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PACKAGE_A = "art-input-package-1";
const PACKAGE_B = "art-input-package-2";
const EVIDENCE_PACKAGE = "art-evidence-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_TEXT_B = "evidence-text-2";
const TABLE_ID = `${FILE_BOQ}:table:1`;
const REQUESTED_BY = "engineer@stc.example";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const STORED_AT = new Date("2026-06-03T08:15:00.000Z");
const STORED_RETAIN = new Date("2027-06-03T08:15:00.000Z");
const SHAPE_ERROR = "Executor output must be an object with a candidates array.";

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

/**
 * One persisted text-chunk row, as stored: raw text body plus a storage path
 * and an arbitrary content key that must never reach the executor or result.
 */
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
      storagePath: "C:/secret-store/rfp-chunk-1.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
    },
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
    ...overrides,
  };
}

/** One persisted table row, as stored, with the same trap fields. */
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
      storagePath: "C:/secret-store/boq-table-1.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
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

/** One approved final evidence_package artifact, with trap payload keys. */
function makeEvidencePackageArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: EVIDENCE_PACKAGE,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "approved",
    version: 4,
    payload: {
      payloadKind: "rfp_evidence_package",
      createdBy: REQUESTED_BY,
      createdAt: TS2.toISOString(),
      inputPackageArtifactId: PACKAGE_A,
      evidenceCount: 2,
      textChunkCount: 1,
      tableEvidenceCount: 1,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
      evidence: [
        {
          evidenceId: EV_TEXT,
          evidenceKind: TEXT_KIND,
          sourceFileId: FILE_RFP,
          inputPackageArtifactId: PACKAGE_A,
          sourceFileName: "rfp.pdf",
          sourceFileRole: "rfp",
          chunkIndex: 1,
          chunkCount: 1,
          charCount: 54,
          text: "PACKAGE-TEXT: supply access switching for all IDFs.",
          documentMetrics: {
            textCharCount: 54,
            nonWhitespaceTextCharCount: 46,
            tableCount: 1,
            tableRowCount: 2,
          },
          storagePath: "C:/secret-store/package-text.json",
          tenantId: TENANT,
          pricing: { unitPrice: 1 },
        },
        {
          evidenceId: EV_TABLE,
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
            ["PACKAGE-TABLE-CELL-A1", "1"],
            ["PACKAGE-TABLE-CELL-A2", "2"],
          ],
          storagePath: "C:/secret-store/package-table.json",
          tenantId: TENANT,
          sku: "C9300X-48HX",
        },
      ],
      storagePath: "C:/secret-store/package.json",
      internalScratch: "PACKAGE-ARBITRARY-CONTENT",
    },
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

/** A well-behaved minimal executor; gate tests assert it is never reached. */
function makeValidExecutor() {
  return vi.fn(async () => ({
    candidates: [{ text: "Provide PoE switches.", evidenceIds: [EV_TEXT] }],
  }));
}

function draft(
  overrides: Partial<DraftRfpRequirementCandidatesFromEvidenceInput> = {}
): Promise<DraftRfpRequirementCandidatesFromEvidenceResult> {
  return draftRfpRequirementCandidatesFromEvidence({
    tenantId: TENANT,
    projectId: PROJECT,
    evidenceIds: [EV_TEXT, EV_TABLE],
    requestedBy: REQUESTED_BY,
    executor: makeValidExecutor(),
    ...overrides,
  });
}

function draftPackage(
  overrides: Partial<DraftRfpRequirementCandidatesFromEvidencePackageInput> = {}
): Promise<DraftRfpRequirementCandidatesFromEvidencePackageResult> {
  return draftRfpRequirementCandidatesFromEvidencePackage({
    tenantId: TENANT,
    projectId: PROJECT,
    evidencePackageArtifactId: EVIDENCE_PACKAGE,
    requestedBy: REQUESTED_BY,
    executor: makeValidExecutor(),
    ...overrides,
  });
}

/**
 * Executor output carrying every trap: padded fields, duplicate evidence ids,
 * a blank title, non-string notes, and model-supplied authority/content
 * fields (id, status, artifact, source, tenant, project, createdBy, payload,
 * pricing, SKU, config, export) that must all be stripped by whitelist copy.
 */
function richExecutorOutput() {
  return {
    executorScratch: "EXECUTOR-RAW-SECRET",
    candidates: [
      {
        text: "  Provide 48-port PoE access switches for all IDFs.  ",
        title: "  Access layer switching  ",
        notes: "  Cited from RFP section 3.2.  ",
        category: "technical",
        priority: "mandatory",
        evidenceIds: [`  ${EV_TEXT}  `, EV_TEXT, EV_TABLE],
        id: "model-made-id-1",
        status: "approved",
        artifactId: "art-model-made-1",
        sourceFileIds: ["file-model-made-1"],
        sourceArtifactIds: ["art-model-made-2"],
        tenantId: TENANT,
        projectId: "proj-model-made",
        createdBy: "the-model",
        payload: { secret: "EXECUTOR-RAW-SECRET" },
        pricing: { listPriceUsd: 12345 },
        sku: "C9300X-48HX",
        config: { expansion: true },
        export: { format: "proposal" },
      },
      {
        text: "Submit a bid bond with the commercial offer.",
        evidenceIds: [EV_TABLE, EV_TEXT_B],
        title: "   ",
        notes: 42,
      },
    ],
  };
}

const SANITIZED_CANDIDATES = [
  {
    text: "Provide 48-port PoE access switches for all IDFs.",
    category: "technical",
    priority: "mandatory",
    evidenceIds: [EV_TEXT, EV_TABLE],
    title: "Access layer switching",
    notes: "Cited from RFP section 3.2.",
  },
  {
    text: "Submit a bid bond with the commercial offer.",
    evidenceIds: [EV_TABLE, EV_TEXT_B],
  },
];

/** Run the canonical success draft over all three evidence rows. */
async function runSuccessDraft() {
  const executor = vi.fn(
    async (_input: RfpCandidateDraftingExecutorInput) => richExecutorOutput()
  );
  const result = await draft({
    executor,
    evidenceIds: [EV_TEXT, EV_TABLE, EV_TEXT_B],
    requestedBy: `  ${REQUESTED_BY}  `,
  });
  return { executor, result };
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
          storagePath: "C:/secret-store/rfp-chunk-2.json",
          internalScratch: "ARBITRARY-CONTENT-VALUE",
        },
      }),
    ],
  ]);
  artifactById = new Map([
    [PACKAGE_A, makeInputPackageArtifact(PACKAGE_A)],
    [PACKAGE_B, makeInputPackageArtifact(PACKAGE_B)],
    [EVIDENCE_PACKAGE, makeEvidencePackageArtifact()],
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
  mockCreateArtifact.mockReset();
});

afterEach(() => {
  // The drafting contract NEVER persists: no test path may reach the artifact
  // create boundary (it exists on the mock only for the baseline import).
  expect(mockCreateArtifact).not.toHaveBeenCalled();
});

describe("draftRfpRequirementCandidatesFromEvidence - validation before store calls", () => {
  it("throws on a blank projectId", async () => {
    for (const blank of ["", "   "]) {
      const executor = makeValidExecutor();
      await expect(draft({ projectId: blank, executor })).rejects.toThrow(
        "projectId is required."
      );
      expect(executor).not.toHaveBeenCalled();
    }
    expectNoStoreCalls();
  });

  it("throws on a blank requestedBy", async () => {
    for (const blank of ["", "   "]) {
      const executor = makeValidExecutor();
      await expect(draft({ requestedBy: blank, executor })).rejects.toThrow(
        "requestedBy is required."
      );
      expect(executor).not.toHaveBeenCalled();
    }
    expectNoStoreCalls();
  });

  it("throws when there are no nonblank evidence IDs", async () => {
    for (const evidenceIds of [[], ["", "   "]]) {
      const executor = makeValidExecutor();
      await expect(draft({ evidenceIds, executor })).rejects.toThrow(
        "At least one evidence ID is required."
      );
      expect(executor).not.toHaveBeenCalled();
    }
    expectNoStoreCalls();
  });

  it("throws when the executor is missing", async () => {
    await expect(
      draft({ executor: undefined as unknown as RfpCandidateDraftingExecutor })
    ).rejects.toThrow("executor is required.");
    expectNoStoreCalls();
  });

  it("trims and deduplicates evidence IDs preserving first-seen order", async () => {
    const result = await draft({
      evidenceIds: [`  ${EV_TABLE}  `, EV_TEXT, EV_TABLE, `${EV_TEXT}  `],
    });

    expect(result.status).toBe("ok");
    expect(mockGetEvidenceItem.mock.calls).toEqual([
      [TENANT, PROJECT, EV_TABLE],
      [TENANT, PROJECT, EV_TEXT],
    ]);
  });
});

describe("project gates", () => {
  it("returns not_found for a missing project and never calls the executor", async () => {
    mockGetProject.mockResolvedValue(null);
    const executor = makeValidExecutor();

    expect(await draft({ executor })).toEqual({ status: "not_found" });
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const executor = makeValidExecutor();

    const result = await draft({ executor });

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
    expect(JSON.stringify(result)).not.toContain("tenantId");
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("evidence gates", () => {
  it("returns evidence_not_found with every missing evidence ID", async () => {
    const executor = makeValidExecutor();

    const result = await draft({
      executor,
      evidenceIds: [EV_TEXT, "missing-ev-1", "missing-ev-2", EV_TEXT],
    });

    expect(result).toEqual({
      status: "evidence_not_found",
      missingEvidenceIds: ["missing-ev-1", "missing-ev-2"],
    });
    // EV_TEXT is requested twice but loaded exactly once.
    expect(mockGetEvidenceItem).toHaveBeenCalledTimes(3);
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns evidence_not_rfp_extraction for an unrelated kind, without its content", async () => {
    evidenceById.set(
      "evidence-boq-1",
      makeTableItem("evidence-boq-1", { kind: "boq_line_item" })
    );
    const executor = makeValidExecutor();

    const result = await draft({
      executor,
      evidenceIds: [EV_TEXT, "evidence-boq-1"],
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
    expect(executor).not.toHaveBeenCalled();
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
      const executor = makeValidExecutor();

      const result = await draft({ executor });

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
      expect(executor).not.toHaveBeenCalled();
    }
  });
});

describe("input package gates", () => {
  it("returns input_package_artifact_not_found with the missing artifact IDs", async () => {
    artifactById.delete(PACKAGE_A);
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "input_package_artifact_not_found",
      missingArtifactIds: [PACKAGE_A],
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns artifact_not_input_package for a wrong artifact type, without its payload", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, {
        type: "normalized_boq",
        stageId: "boq_format_validation",
      })
    );
    const executor = makeValidExecutor();

    const result = await draft({ executor });

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
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns artifact_not_input_package for an input_package at the wrong stage", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, {
        stageId: "requirements_baseline_review",
      })
    );
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result.status).toBe("artifact_not_input_package");
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns input_package_not_approved for a non-approved package version", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { status: "needs_review" })
    );
    const executor = makeValidExecutor();

    const result = await draft({ executor });

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
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("evidence package authority path", () => {
  it("throws on blank evidencePackageArtifactId before any store call", async () => {
    for (const blank of ["", "   "]) {
      const executor = makeValidExecutor();
      await expect(
        draftPackage({ evidencePackageArtifactId: blank, executor })
      ).rejects.toThrow("evidencePackageArtifactId is required.");
      expect(executor).not.toHaveBeenCalled();
    }
    expectNoStoreCalls();
  });

  it("returns evidence_package_not_approved and never calls the executor", async () => {
    artifactById.set(
      EVIDENCE_PACKAGE,
      makeEvidencePackageArtifact({ status: "needs_review" })
    );
    const executor = makeValidExecutor();

    const result = await draftPackage({ executor });

    expect(result).toEqual({
      status: "evidence_package_not_approved",
      artifact: {
        id: EVIDENCE_PACKAGE,
        projectId: PROJECT,
        stageId: "intake_package_review",
        type: "evidence_package",
        status: "needs_review",
        version: 4,
        sourceFileIds: [FILE_RFP, FILE_BOQ],
        sourceArtifactIds: [PACKAGE_A],
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
    });
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns artifact_not_evidence_package for the wrong artifact type or stage", async () => {
    const variants: Array<Partial<ProjectArtifact>> = [
      { type: "input_package" },
      { stageId: "requirements_baseline_review" },
    ];
    for (const variant of variants) {
      artifactById.set(EVIDENCE_PACKAGE, makeEvidencePackageArtifact(variant));
      const executor = makeValidExecutor();

      const result = await draftPackage({ executor });

      expect(result.status).toBe("artifact_not_evidence_package");
      expect(mockGetEvidenceItem).not.toHaveBeenCalled();
      expect(executor).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_evidence_package_payload for malformed package payload identity or kind", async () => {
    const basePayload = makeEvidencePackageArtifact().payload as Record<
      string,
      unknown
    >;
    const baseEvidence = basePayload.evidence as Array<Record<string, unknown>>;
    const invalidPayloads: Record<string, unknown>[] = [
      { ...basePayload, payloadKind: "rfp_input_package" },
      { ...basePayload, evidence: "not-an-array" },
      { ...basePayload, evidence: [42] },
      {
        ...basePayload,
        evidence: [{ ...baseEvidence[0], evidenceKind: "boq_line_item" }],
      },
      {
        ...basePayload,
        evidence: [{ ...baseEvidence[0], evidenceId: "   " }],
      },
      {
        ...basePayload,
        evidence: [
          baseEvidence[0],
          { ...baseEvidence[1], evidenceId: baseEvidence[0].evidenceId },
        ],
      },
      {
        ...basePayload,
        evidence: [{ ...baseEvidence[0], sourceFileId: "" }],
      },
      {
        ...basePayload,
        evidence: [{ ...baseEvidence[0], inputPackageArtifactId: null }],
      },
    ];

    for (const payload of invalidPayloads) {
      artifactById.set(
        EVIDENCE_PACKAGE,
        makeEvidencePackageArtifact({ payload })
      );
      const executor = makeValidExecutor();

      const result = await draftPackage({ executor });

      expect(result.status).toBe("invalid_evidence_package_payload");
      expect(mockGetEvidenceItem).not.toHaveBeenCalled();
      expect(executor).not.toHaveBeenCalled();
    }
  });

  it("returns evidence_package_empty for a valid package payload with no evidence", async () => {
    const basePayload = makeEvidencePackageArtifact().payload as Record<
      string,
      unknown
    >;
    artifactById.set(
      EVIDENCE_PACKAGE,
      makeEvidencePackageArtifact({
        payload: { ...basePayload, evidence: [] },
      })
    );
    const executor = makeValidExecutor();

    const result = await draftPackage({ executor });

    expect(result.status).toBe("evidence_package_empty");
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("hands the executor copied whitelisted entries from the evidence_package payload only", async () => {
    const artifact = makeEvidencePackageArtifact();
    artifactById.set(EVIDENCE_PACKAGE, artifact);
    const payloadSnapshot = structuredClone(artifact.payload);
    let capturedInput: RfpCandidateDraftingExecutorInput | undefined;
    const executor = vi.fn(
      async (executorInput: RfpCandidateDraftingExecutorInput) => {
        capturedInput = structuredClone(executorInput);
        executorInput.evidencePackageArtifactId = "hacked-package";
        executorInput.sourceFileIds.push("hacked-file");
        executorInput.sourceArtifactIds.push("hacked-artifact");
        const first = executorInput.evidence[0];
        if (first.evidenceKind === TEXT_KIND) first.text = "HACKED-TEXT";
        const second = executorInput.evidence[1];
        if (second.evidenceKind === TABLE_KIND) {
          second.rows[0].push("HACKED-CELL");
          second.rows.push(["HACKED-ROW"]);
        }
        return {
          candidates: [
            { text: "Package requirement.", evidenceIds: [EV_TEXT, EV_TABLE] },
          ],
        };
      }
    );

    const result = await draftPackage({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockGetEvidenceItem).not.toHaveBeenCalled();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(capturedInput).toMatchObject({
      requestedBy: REQUESTED_BY,
      evidencePackageArtifactId: EVIDENCE_PACKAGE,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
    });
    expect(capturedInput?.evidence).toStrictEqual([
      {
        evidenceId: EV_TEXT,
        evidenceKind: TEXT_KIND,
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: PACKAGE_A,
        sourceFileName: "rfp.pdf",
        sourceFileRole: "rfp",
        chunkIndex: 1,
        chunkCount: 1,
        charCount: 54,
        text: "PACKAGE-TEXT: supply access switching for all IDFs.",
      },
      {
        evidenceId: EV_TABLE,
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
          ["PACKAGE-TABLE-CELL-A1", "1"],
          ["PACKAGE-TABLE-CELL-A2", "2"],
        ],
      },
    ]);
    expect(artifact.payload).toEqual(payloadSnapshot);
    expect(result.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(result.sourceArtifactIds).toEqual([PACKAGE_A]);

    const serializedInput = JSON.stringify(capturedInput);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "secret-store",
      "documentMetrics",
      "PACKAGE-ARBITRARY-CONTENT",
      "unitPrice",
      "C9300X-48HX",
    ]) {
      expect(serializedInput).not.toContain(leak);
    }
  });

  it("rejects candidate citations outside the approved evidence_package", async () => {
    const executor = vi.fn(async () => ({
      candidates: [
        {
          text: "Package requirement.",
          evidenceIds: [EV_TEXT, EV_TEXT_B, "ghost-evidence"],
        },
      ],
    }));

    const result = await draftPackage({ executor });

    expect(result).toEqual({
      status: "invalid_candidate_output",
      errors: [
        `candidates[0] cites unknown evidence ID: ${EV_TEXT_B}.`,
        "candidates[0] cites unknown evidence ID: ghost-evidence.",
      ],
    });
  });

  it("returns a lean result without raw package evidence, table rows, or executor raw fields", async () => {
    const executor = vi.fn(async () => ({
      candidates: [
        {
          text: "  Package requirement.  ",
          evidenceIds: [EV_TEXT, EV_TABLE, EV_TEXT],
          category: "technical",
          priority: "mandatory",
          id: "model-made-id",
          tenantId: TENANT,
          sku: "C9300X-48HX",
          payload: { secret: "EXECUTOR-RAW-SECRET" },
        },
      ],
    }));

    const result = await draftPackage({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result).toEqual({
      status: "ok",
      project: {
        id: PROJECT,
        name: "STC RFP Bid",
        customerName: "STC",
        mode: "rfp",
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
      evidencePackageArtifactId: EVIDENCE_PACKAGE,
      candidates: [
        {
          text: "Package requirement.",
          evidenceIds: [EV_TEXT, EV_TABLE],
          category: "technical",
          priority: "mandatory",
        },
      ],
      candidateCount: 1,
      evidenceCount: 2,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A],
    });
    const serialized = JSON.stringify(result);
    for (const leak of [
      TENANT,
      "tenantId",
      "PACKAGE-TEXT",
      "PACKAGE-TABLE-CELL",
      "EXECUTOR-RAW-SECRET",
      "model-made-id",
      "C9300X-48HX",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });
});

describe("executor input", () => {
  it("hands the executor exactly the whitelisted copied bundle, in requested evidence order", async () => {
    const { executor } = await runSuccessDraft();

    expect(executor).toHaveBeenCalledTimes(1);
    const executorInput: RfpCandidateDraftingExecutorInput =
      executor.mock.calls[0][0];
    expect(executorInput).toStrictEqual({
      project: {
        id: PROJECT,
        name: "STC RFP Bid",
        customerName: "STC",
        mode: "rfp",
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
      evidence: [
        {
          evidenceId: EV_TEXT,
          evidenceKind: TEXT_KIND,
          sourceFileId: FILE_RFP,
          inputPackageArtifactId: PACKAGE_A,
          sourceFileName: "rfp.pdf",
          sourceFileRole: "rfp",
          chunkIndex: 1,
          chunkCount: 2,
          charCount: 63,
          text: "RAW-EVIDENCE-TEXT: contractor shall supply PoE access switches.",
        },
        {
          evidenceId: EV_TABLE,
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
          evidenceId: EV_TEXT_B,
          evidenceKind: TEXT_KIND,
          sourceFileId: FILE_RFP,
          inputPackageArtifactId: PACKAGE_B,
          sourceFileName: "rfp.pdf",
          sourceFileRole: "rfp",
          chunkIndex: 2,
          chunkCount: 2,
          charCount: 40,
          text: "RAW-EVIDENCE-TEXT: spares for two years.",
        },
      ],
      requestedBy: REQUESTED_BY,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
    });

    const serialized = JSON.stringify(executorInput);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "secret-store",
      "internalScratch",
      "ARBITRARY-CONTENT-VALUE",
      "PACKAGE-PAYLOAD-SECRET",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("preserves the requested (deduplicated) evidence order in the bundle", async () => {
    const executor = vi.fn(
      async (_input: RfpCandidateDraftingExecutorInput) => ({
        candidates: [
          { text: "Provide PoE switches.", evidenceIds: [EV_TABLE] },
        ],
      })
    );

    await draft({ executor, evidenceIds: [EV_TABLE, EV_TEXT, EV_TABLE] });

    const executorInput: RfpCandidateDraftingExecutorInput =
      executor.mock.calls[0][0];
    expect(executorInput.evidence.map((entry) => entry.evidenceId)).toEqual([
      EV_TABLE,
      EV_TEXT,
    ]);
  });

  it("gives the executor copies: mutating them never alters stored rows or the result", async () => {
    const evidenceSnapshot = structuredClone(Array.from(evidenceById.values()));
    const executor = vi.fn(
      async (executorInput: RfpCandidateDraftingExecutorInput) => {
        executorInput.project.name = "HACKED-NAME";
        executorInput.sourceFileIds.push("hacked-file");
        executorInput.sourceArtifactIds.push("hacked-artifact");
        const first = executorInput.evidence[0];
        if (first.evidenceKind === TEXT_KIND) first.text = "HACKED-TEXT";
        const second = executorInput.evidence[1];
        if (second.evidenceKind === TABLE_KIND) {
          second.rows[0].push("HACKED-CELL");
          second.rows.push(["HACKED-ROW"]);
        }
        return {
          candidates: [
            { text: "Provide PoE switches.", evidenceIds: [EV_TEXT] },
          ],
        };
      }
    );

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(Array.from(evidenceById.values())).toEqual(evidenceSnapshot);
    expect(result.project.name).toBe("STC RFP Bid");
    expect(result.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(result.sourceArtifactIds).toEqual([PACKAGE_A]);
  });
});

describe("executor failure and untrusted output", () => {
  it("maps an executor throw to drafting_failed without leaking the thrown detail", async () => {
    const executor = vi.fn(async () => {
      throw new Error("PROVIDER-EXPLODED: api key sk-secret-123");
    });

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "drafting_failed",
      error: "candidate_drafting_failed",
    });
    expect(JSON.stringify(result)).not.toContain("PROVIDER-EXPLODED");
    expect(JSON.stringify(result)).not.toContain("sk-secret-123");
  });

  it("rejects every non-object / candidates-less / non-array output shape", async () => {
    for (const badOutput of [
      null,
      undefined,
      "candidates",
      42,
      [],
      { wrong: true },
      { candidates: "not-an-array" },
    ]) {
      const executor = vi.fn(async () => badOutput);

      expect(await draft({ executor })).toEqual({
        status: "invalid_candidate_output",
        errors: [SHAPE_ERROR],
      });
    }
  });

  it("rejects an empty candidates array", async () => {
    const executor = vi.fn(async () => ({ candidates: [] }));

    expect(await draft({ executor })).toEqual({
      status: "invalid_candidate_output",
      errors: ["Executor output must include at least one candidate."],
    });
  });

  it("collects every candidate violation, including loaded-but-unrequested evidence IDs", async () => {
    const executor = vi.fn(async () => ({
      candidates: [
        42,
        { text: "   ", evidenceIds: [EV_TEXT] },
        { text: "Valid text.", evidenceIds: ["", "   "] },
        {
          text: "Valid text.",
          // EV_TEXT_B exists in the store but was NOT requested: still unknown.
          evidenceIds: [EV_TEXT, EV_TEXT_B, "ghost-evidence-1"],
        },
        { text: "Valid text.", evidenceIds: [EV_TEXT], category: "pricing" },
        { text: "Valid text.", evidenceIds: [EV_TEXT], priority: "urgent" },
        { text: "Valid text.", evidenceIds: [EV_TEXT], category: null },
      ],
    }));

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "invalid_candidate_output",
      errors: [
        "candidates[0] must be an object.",
        "candidates[1].text is required.",
        "candidates[2] must cite at least one nonblank evidence ID.",
        `candidates[3] cites unknown evidence ID: ${EV_TEXT_B}.`,
        "candidates[3] cites unknown evidence ID: ghost-evidence-1.",
        "candidates[4].category is invalid: pricing.",
        "candidates[5].priority is invalid: urgent.",
        "candidates[6].category is invalid: null.",
      ],
    });
  });

  it("accepts every baseline category and priority literal unchanged", async () => {
    const combos = RFP_REQUIREMENT_CATEGORIES.flatMap((category) =>
      RFP_REQUIREMENT_PRIORITIES.map((priority) => ({ category, priority }))
    );
    const executor = vi.fn(async () => ({
      candidates: combos.map((combo, index) => ({
        text: `Requirement ${index + 1}.`,
        evidenceIds: [EV_TEXT],
        category: combo.category,
        priority: combo.priority,
      })),
    }));

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.candidateCount).toBe(combos.length);
    expect(
      result.candidates.map((candidate) => ({
        category: candidate.category,
        priority: candidate.priority,
      }))
    ).toEqual(combos);
  });
});

describe("success", () => {
  it("returns sanitized candidates: trimmed, deduplicated, no defaults, authority fields stripped", async () => {
    const { result } = await runSuccessDraft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.candidates).toStrictEqual(SANITIZED_CANDIDATES);
    // Defaults belong to the baseline draft service, NOT here: the second
    // candidate carries no category/priority keys at all.
    expect(Object.keys(result.candidates[1]).sort()).toEqual([
      "evidenceIds",
      "text",
    ]);
  });

  it("returns the lean ok read model with counts and source IDs only", async () => {
    const { result } = await runSuccessDraft();

    expect(result).toEqual({
      status: "ok",
      project: {
        id: PROJECT,
        name: "STC RFP Bid",
        customerName: "STC",
        mode: "rfp",
        createdAt: TS1.toISOString(),
        updatedAt: TS2.toISOString(),
      },
      candidates: SANITIZED_CANDIDATES,
      candidateCount: 2,
      evidenceCount: 3,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [PACKAGE_A, PACKAGE_B],
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("loads each unique evidence row and package artifact exactly once, in order", async () => {
    await runSuccessDraft();

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

  it("leaks no tenantId, storage path, raw evidence body, table rows, or executor raw output", async () => {
    const { result } = await runSuccessDraft();

    const serialized = JSON.stringify(result);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "secret-store",
      "internalScratch",
      "ARBITRARY-CONTENT-VALUE",
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
      "PACKAGE-PAYLOAD-SECRET",
      "EXECUTOR-RAW-SECRET",
      "model-made-id-1",
      "C9300X-48HX",
      "the-model",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns copies: mutating the result alters neither stored rows nor the executor output", async () => {
    const evidenceSnapshot = structuredClone(Array.from(evidenceById.values()));
    const artifactSnapshot = structuredClone(Array.from(artifactById.values()));
    const executorOutput = {
      candidates: [
        { text: "Provide PoE switches.", evidenceIds: [EV_TEXT, EV_TABLE] },
      ],
    };
    const outputSnapshot = structuredClone(executorOutput);
    const executor = vi.fn(async () => executorOutput);

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    result.candidates[0].text = "hacked text";
    result.candidates[0].evidenceIds.push("hacked-evidence");
    result.candidates.push({ text: "hacked", evidenceIds: ["hacked"] });
    result.sourceFileIds.push("hacked-file");
    result.sourceArtifactIds.push("hacked-artifact");
    result.project.name = "hacked-project";

    expect(executorOutput).toEqual(outputSnapshot);
    expect(Array.from(evidenceById.values())).toEqual(evidenceSnapshot);
    expect(Array.from(artifactById.values())).toEqual(artifactSnapshot);
  });

  it("never mutates the caller's input", async () => {
    const evidenceIds = [`  ${EV_TEXT}  `, EV_TEXT, EV_TABLE];
    const evidenceIdsSnapshot = evidenceIds.slice();

    const result = await draft({ evidenceIds });

    expect(result.status).toBe("ok");
    expect(evidenceIds).toEqual(evidenceIdsSnapshot);
  });
});

describe("store failures bubble unhidden", () => {
  it("bubbles a project read failure", async () => {
    mockGetProject.mockRejectedValue(new Error("project read failed"));

    await expect(draft()).rejects.toThrow("project read failed");
  });

  it("bubbles an evidence read failure and never calls the executor", async () => {
    mockGetEvidenceItem.mockRejectedValue(new Error("evidence read failed"));
    const executor = makeValidExecutor();

    await expect(draft({ executor })).rejects.toThrow("evidence read failed");
    expect(executor).not.toHaveBeenCalled();
  });

  it("bubbles an artifact read failure", async () => {
    mockGetArtifact.mockRejectedValue(new Error("artifact read failed"));

    await expect(draft()).rejects.toThrow("artifact read failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-requirements-candidate-drafting.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-requirements-candidate-drafting.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the three read stores and the two type-only modules", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-evidence-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-requirements-baseline",
    ]);
  });

  it("imports the baseline service and canonical shapes as types only", () => {
    expect(source).toMatch(
      /import type \{[^}]*\} from "@\/types\/project";/
    );
    expect(source).toMatch(
      /import type \{[^}]*\} from "@\/lib\/projects\/project-rfp-requirements-baseline";/
    );
    expect(
      source.match(
        /from "@\/lib\/projects\/project-rfp-requirements-baseline"/g
      ) ?? []
    ).toHaveLength(1);
  });

  it("performs no store mutation or persistence call", () => {
    const calls =
      source.match(
        /\b(?:create|update|delete|insert|remove|drop|persist|write|save|upsert)[A-Z]\w*/g
      ) ?? [];
    expect(calls).toEqual([]);
  });

  it("makes no direct network or environment access", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain("process.env");
  });

  it("imports no AI, LLM, agent, coordinator, engine, adapter, parser, extraction, persistence, pricing, SKU, catalog, config, export, route, UI, or raw-file module", () => {
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
      'from "@/lib/projects/project-rfp-requirements-baseline-inspection',
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
      "openai",
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
