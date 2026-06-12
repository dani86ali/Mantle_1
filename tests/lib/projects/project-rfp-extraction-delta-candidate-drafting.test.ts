import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";

// Mock ONLY the three store boundaries (project read, artifact read, evidence
// list); the drafting contract's validation, gating, executor bundling, and
// output sanitization stay real. The executor is always a plain test function
// - no DB, file bytes, parser, or AI module is touched anywhere in this
// suite. createProjectArtifactVersion and getProjectEvidenceItemById exist on
// the mocks only because this suite imports the extraction-delta module's
// literal arrays; the afterEach below proves the drafting service NEVER
// persists and NEVER reads evidence by id.
const {
  mockGetProject,
  mockGetArtifact,
  mockCreateArtifact,
  mockListEvidence,
  mockGetEvidenceItem,
} = vi.hoisted(() => ({
  mockGetProject: vi.fn(),
  mockGetArtifact: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockListEvidence: vi.fn(),
  mockGetEvidenceItem: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  createProjectArtifactVersion: mockCreateArtifact,
}));
vi.mock("@/lib/db/project-evidence-store", () => ({
  listProjectEvidenceItems: mockListEvidence,
  getProjectEvidenceItemById: mockGetEvidenceItem,
}));

import {
  draftRfpExtractionDeltaCandidates,
  type DraftRfpExtractionDeltaCandidatesInput,
  type DraftRfpExtractionDeltaCandidatesResult,
  type RfpExtractionDeltaCandidateDraftingExecutor,
  type RfpExtractionDeltaCandidateDraftingExecutorInput,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting";
import {
  RFP_EXTRACTION_DELTA_KINDS,
  RFP_EXTRACTION_DELTA_SEVERITIES,
} from "@/lib/projects/project-rfp-extraction-delta";

// The two accepted evidence kinds, declared locally exactly like the service
// declares them - the extraction write module must stay unimported here too.
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const PACKAGE_A = "art-input-package-1";
const PACKAGE_B = "art-input-package-2";
const FILE_RFP = "file-rfp-1";
const FILE_SOW = "file-sow-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_BOQ = "evidence-boq-table-1";
const EV_BOQ_TEXT = "evidence-boq-text-1";
const EV_OTHER_PKG = "evidence-text-other-package-1";
const EV_UNRELATED = "evidence-unrelated-1";
const SOW_TABLE_ID = `${FILE_SOW}:table:1`;
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
 * One persisted RFP text-chunk row, as stored: raw text body plus a storage
 * path and an arbitrary content key that must never reach the executor or
 * the result.
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
      charCount: 63,
      text: "RAW-EVIDENCE-TEXT: contractor shall supply PoE access switches.",
      documentMetrics: {
        textCharCount: 63,
        nonWhitespaceTextCharCount: 55,
        tableCount: 0,
        tableRowCount: 0,
        extraMetric: 99,
      },
      storagePath: "C:/secret-store/rfp-chunk-1.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
    },
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
    ...overrides,
  };
}

/** One persisted non-BoQ table row (scope of work), with the same traps. */
function makeSowTableItem(
  id: string,
  overrides: Partial<ProjectEvidenceItem> = {}
): ProjectEvidenceItem {
  return {
    id,
    projectId: PROJECT,
    sourceFileId: FILE_SOW,
    kind: TABLE_KIND,
    content: {
      evidenceKind: TABLE_KIND,
      inputPackageArtifactId: PACKAGE_A,
      sourceFileId: FILE_SOW,
      sourceFileName: "scope-of-work.docx",
      sourceFileRole: "scope_of_work",
      tableId: SOW_TABLE_ID,
      pageNumber: 4,
      sheetName: "Annex A",
      rowCount: 2,
      columnCount: 2,
      rows: [
        ["RAW-TABLE-CELL-A1", "1"],
        ["RAW-TABLE-CELL-A2", "2"],
      ],
      storagePath: "C:/secret-store/sow-table-1.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
    },
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
    ...overrides,
  };
}

/** One persisted BoQ-role table row: must NEVER reach the executor. */
function makeBoqTableItem(id: string): ProjectEvidenceItem {
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
      tableId: `${FILE_BOQ}:table:1`,
      sheetName: "BoQ",
      rowCount: 1,
      columnCount: 2,
      rows: [["RAW-BOQ-TABLE-CELL", "9"]],
      storagePath: "C:/secret-store/boq-table-1.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
    },
    extractedAt: STORED_AT,
    retainUntil: STORED_RETAIN,
  };
}

/** One persisted BoQ-role text chunk: excluded by role, not by kind. */
function makeBoqTextItem(id: string): ProjectEvidenceItem {
  return makeTextChunkItem(id, {
    sourceFileId: FILE_BOQ,
    content: {
      evidenceKind: TEXT_KIND,
      inputPackageArtifactId: PACKAGE_A,
      sourceFileId: FILE_BOQ,
      sourceFileName: "boq.xlsx",
      sourceFileRole: "boq",
      chunkIndex: 1,
      chunkCount: 1,
      charCount: 30,
      text: "RAW-BOQ-TEXT: priced line items.",
      storagePath: "C:/secret-store/boq-chunk-1.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
    },
  });
}

/** One text chunk stored for ANOTHER input package: must be filtered out. */
function makeOtherPackageTextItem(id: string): ProjectEvidenceItem {
  return makeTextChunkItem(id, {
    content: {
      evidenceKind: TEXT_KIND,
      inputPackageArtifactId: PACKAGE_B,
      sourceFileId: FILE_RFP,
      sourceFileName: "rfp.pdf",
      sourceFileRole: "rfp",
      chunkIndex: 1,
      chunkCount: 1,
      charCount: 41,
      text: "RAW-OTHER-PACKAGE-TEXT: spares for two years.",
      storagePath: "C:/secret-store/rfp-chunk-other.json",
      internalScratch: "ARBITRARY-CONTENT-VALUE",
    },
  });
}

/** One evidence row of an unrelated kind: must be filtered out. */
function makeUnrelatedKindItem(id: string): ProjectEvidenceItem {
  return makeSowTableItem(id, {
    kind: "boq_line_item",
    content: {
      inputPackageArtifactId: PACKAGE_A,
      marker: "RAW-UNRELATED-CONTENT",
    },
  });
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
    sourceFileIds: [FILE_RFP, FILE_SOW, FILE_BOQ],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

/** A well-behaved minimal executor; gate tests assert it is never reached. */
function makeValidExecutor() {
  return vi.fn(
    async (_input: RfpExtractionDeltaCandidateDraftingExecutorInput) => ({
      candidates: [
        {
          kind: "missing_evidence",
          sourceFileId: FILE_RFP,
          title: "Missing spares table",
          description: "Section 7 names a spares table with no evidence row.",
        },
      ],
    })
  );
}

function draft(
  overrides: Partial<DraftRfpExtractionDeltaCandidatesInput> = {}
): Promise<DraftRfpExtractionDeltaCandidatesResult> {
  return draftRfpExtractionDeltaCandidates({
    tenantId: TENANT,
    projectId: PROJECT,
    inputPackageArtifactId: PACKAGE_A,
    requestedBy: REQUESTED_BY,
    executor: makeValidExecutor(),
    ...overrides,
  });
}

/**
 * Executor output carrying every trap: padded fields, duplicate evidence
 * ids, a blank rationale, a non-array evidenceIds, an arbitrary proposal
 * key, and model-supplied authority/review/raw fields (id, reviewStatus,
 * accepted, rejected, waived, status, artifact, payload, tenant, project,
 * pricing, sku, configuration, raw AI output) that must all be stripped by
 * whitelist copy.
 */
function richExecutorOutput() {
  return {
    executorScratch: "EXECUTOR-RAW-SECRET",
    candidates: [
      {
        kind: "incorrect_extraction",
        sourceFileId: `  ${FILE_RFP}  `,
        title: "  Truncated paragraph in section 3  ",
        description: "  The extracted chunk ends mid-sentence.  ",
        severity: "blocking",
        confidence: 0.75,
        rationale: "  Chunk ends without terminal punctuation.  ",
        evidenceIds: [`  ${EV_TEXT}  `, EV_TEXT, EV_TABLE],
        proposedEvidence: {
          evidenceKind: TABLE_KIND,
          tableId: "proposed-table-1",
          sheetName: "Annex A",
          rowCount: 2,
          columnCount: 2,
          rows: [["PROPOSED-CELL-A1", 42], "not-a-row"],
          internalScratch: "ARBITRARY-PROPOSAL-VALUE",
        },
        id: "model-made-id-1",
        reviewStatus: "accepted",
        accepted: true,
        rejected: false,
        waived: true,
        status: "approved",
        artifact: { id: "art-model-made-1" },
        payload: { secret: "EXECUTOR-RAW-SECRET" },
        tenantId: TENANT,
        projectId: "proj-model-made",
        pricing: { listPriceUsd: 12345 },
        sku: "C9300X-48HX",
        configuration: { expansion: true },
        rawAiOutput: "RAW-AI-PAYLOAD",
      },
      {
        kind: "missing_evidence",
        sourceFileId: FILE_SOW,
        title: "Spares table not extracted",
        description: "Annex A names a spares table with no evidence row.",
        rationale: "   ",
        evidenceIds: "not-an-array",
      },
    ],
  };
}

const SANITIZED_CANDIDATES = [
  {
    kind: "incorrect_extraction",
    sourceFileId: FILE_RFP,
    title: "Truncated paragraph in section 3",
    description: "The extracted chunk ends mid-sentence.",
    severity: "blocking",
    confidence: 0.75,
    rationale: "Chunk ends without terminal punctuation.",
    evidenceIds: [EV_TEXT, EV_TABLE],
    proposedEvidence: {
      evidenceKind: TABLE_KIND,
      tableId: "proposed-table-1",
      sheetName: "Annex A",
      rowCount: 2,
      columnCount: 2,
      rows: [["PROPOSED-CELL-A1", ""], []],
    },
  },
  {
    kind: "missing_evidence",
    sourceFileId: FILE_SOW,
    title: "Spares table not extracted",
    description: "Annex A names a spares table with no evidence row.",
  },
];

const EXPECTED_PROJECT_SUMMARY = {
  id: PROJECT,
  name: "STC RFP Bid",
  customerName: "STC",
  mode: "rfp",
  createdAt: TS1.toISOString(),
  updatedAt: TS2.toISOString(),
};

const EXPECTED_PACKAGE_SUMMARY = {
  id: PACKAGE_A,
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "input_package",
  status: "approved",
  version: 3,
  sourceFileIds: [FILE_RFP, FILE_SOW, FILE_BOQ],
  sourceArtifactIds: [],
  createdAt: TS1.toISOString(),
  updatedAt: TS2.toISOString(),
};

/** Run the canonical success draft over the default evidence rows. */
async function runSuccessDraft() {
  const executor = vi.fn(
    async (_input: RfpExtractionDeltaCandidateDraftingExecutorInput) =>
      richExecutorOutput()
  );
  const result = await draft({ executor, requestedBy: `  ${REQUESTED_BY}  ` });
  return { executor, result };
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockListEvidence).not.toHaveBeenCalled();
}

let evidenceRows: ProjectEvidenceItem[];
let artifactById: Map<string, ProjectArtifact>;

beforeEach(() => {
  evidenceRows = [
    makeTextChunkItem(EV_TEXT),
    makeSowTableItem(EV_TABLE),
    makeBoqTableItem(EV_BOQ),
    makeOtherPackageTextItem(EV_OTHER_PKG),
    makeUnrelatedKindItem(EV_UNRELATED),
  ];
  artifactById = new Map([[PACKAGE_A, makeInputPackageArtifact(PACKAGE_A)]]);
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockListEvidence.mockReset().mockImplementation(async () => evidenceRows);
  mockGetEvidenceItem.mockReset();
  mockCreateArtifact.mockReset();
});

afterEach(() => {
  // The drafting contract NEVER persists and NEVER reads evidence by id:
  // both mocks exist only because this suite imports the extraction-delta
  // module's literal arrays.
  expect(mockCreateArtifact).not.toHaveBeenCalled();
  expect(mockGetEvidenceItem).not.toHaveBeenCalled();
});

describe("draftRfpExtractionDeltaCandidates - validation before store calls", () => {
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

  it("throws on a blank inputPackageArtifactId", async () => {
    for (const blank of ["", "   "]) {
      const executor = makeValidExecutor();
      await expect(
        draft({ inputPackageArtifactId: blank, executor })
      ).rejects.toThrow("inputPackageArtifactId is required.");
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

  it("throws on a missing or non-function executor", async () => {
    for (const bad of [undefined, null, "not-a-function", 42, {}]) {
      await expect(
        draft({
          executor: bad as unknown as RfpExtractionDeltaCandidateDraftingExecutor,
        })
      ).rejects.toThrow("executor is required.");
    }
    expectNoStoreCalls();
  });
});

describe("project gates", () => {
  it("returns not_found for a missing project and stops before any further read", async () => {
    mockGetProject.mockResolvedValue(null);
    const executor = makeValidExecutor();

    expect(await draft({ executor })).toEqual({ status: "not_found" });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "wrong_mode",
      project: { ...EXPECTED_PROJECT_SUMMARY, mode: "quick_bom" },
    });
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(JSON.stringify(result)).not.toContain("tenantId");
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("input package gates", () => {
  it("returns input_package_not_found and stops before the evidence list", async () => {
    artifactById.delete(PACKAGE_A);
    const executor = makeValidExecutor();

    expect(await draft({ executor })).toEqual({
      status: "input_package_not_found",
    });
    expect(mockGetArtifact.mock.calls).toEqual([[TENANT, PROJECT, PACKAGE_A]]);
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns artifact_not_input_package for a wrong artifact type, without its payload", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { type: "evidence_package" })
    );
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "artifact_not_input_package",
      artifact: { ...EXPECTED_PACKAGE_SUMMARY, type: "evidence_package" },
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");
    expect(mockListEvidence).not.toHaveBeenCalled();
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
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns input_package_not_approved for every non-approved status", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { status: "needs_review" })
    );
    const result = await draft();
    expect(result).toEqual({
      status: "input_package_not_approved",
      artifact: { ...EXPECTED_PACKAGE_SUMMARY, status: "needs_review" },
    });
    expect(JSON.stringify(result)).not.toContain("PACKAGE-PAYLOAD-SECRET");

    for (const status of ["generated", "rejected", "stale"] as const) {
      artifactById.set(
        PACKAGE_A,
        makeInputPackageArtifact(PACKAGE_A, { status })
      );
      const executor = makeValidExecutor();
      expect((await draft({ executor })).status).toBe(
        "input_package_not_approved"
      );
      expect(executor).not.toHaveBeenCalled();
    }
    expect(mockListEvidence).not.toHaveBeenCalled();
  });

  it("returns input_package_has_no_source_files for an empty package file list", async () => {
    artifactById.set(
      PACKAGE_A,
      makeInputPackageArtifact(PACKAGE_A, { sourceFileIds: [] })
    );
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "input_package_has_no_source_files",
      artifact: { ...EXPECTED_PACKAGE_SUMMARY, sourceFileIds: [] },
    });
    expect(mockListEvidence).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("evidence filtering", () => {
  it("returns extraction_evidence_not_found when only BoQ, wrong-package, or unrelated rows exist", async () => {
    evidenceRows = [
      makeBoqTextItem(EV_BOQ_TEXT),
      makeBoqTableItem(EV_BOQ),
      makeOtherPackageTextItem(EV_OTHER_PKG),
      makeUnrelatedKindItem(EV_UNRELATED),
    ];
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "extraction_evidence_not_found",
      inputPackageArtifactId: PACKAGE_A,
    });
    expect(mockListEvidence.mock.calls).toEqual([[TENANT, PROJECT]]);
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns extraction_evidence_not_found when the project has no evidence at all", async () => {
    evidenceRows = [];
    const executor = makeValidExecutor();

    expect(await draft({ executor })).toEqual({
      status: "extraction_evidence_not_found",
      inputPackageArtifactId: PACKAGE_A,
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("excludes BoQ-role, wrong-package, and unrelated-kind rows from the executor bundle", async () => {
    const { executor } = await runSuccessDraft();

    const executorInput: RfpExtractionDeltaCandidateDraftingExecutorInput =
      executor.mock.calls[0][0];
    expect(executorInput.evidence.map((entry) => entry.evidenceId)).toEqual([
      EV_TEXT,
      EV_TABLE,
    ]);
    expect(executorInput.sourceFileIds).toEqual([FILE_RFP, FILE_SOW]);
    const serialized = JSON.stringify(executorInput);
    for (const leak of [
      EV_BOQ,
      "RAW-BOQ-TABLE-CELL",
      "RAW-OTHER-PACKAGE-TEXT",
      "RAW-UNRELATED-CONTENT",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("keeps a non-BoQ row whose sourceFileRole is missing (only exactly \"boq\" is excluded)", async () => {
    evidenceRows = [
      makeTextChunkItem(EV_TEXT, {
        content: {
          evidenceKind: TEXT_KIND,
          inputPackageArtifactId: PACKAGE_A,
          sourceFileId: FILE_RFP,
          chunkIndex: 1,
          chunkCount: 1,
          charCount: 10,
          text: "Some text.",
        },
      }),
    ];
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    const executorInput: RfpExtractionDeltaCandidateDraftingExecutorInput =
      executor.mock.calls[0][0];
    expect(executorInput.evidence).toHaveLength(1);
    expect("sourceFileRole" in executorInput.evidence[0]).toBe(false);
  });
});

describe("executor input", () => {
  it("hands the executor exactly the whitelisted copied bundle", async () => {
    const { executor } = await runSuccessDraft();

    expect(executor).toHaveBeenCalledTimes(1);
    const executorInput: RfpExtractionDeltaCandidateDraftingExecutorInput =
      executor.mock.calls[0][0];
    expect(executorInput).toStrictEqual({
      project: EXPECTED_PROJECT_SUMMARY,
      inputPackage: EXPECTED_PACKAGE_SUMMARY,
      requestedBy: REQUESTED_BY,
      inputPackageArtifactId: PACKAGE_A,
      sourceFileIds: [FILE_RFP, FILE_SOW],
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
          chunkCount: 2,
          charCount: 63,
          text: "RAW-EVIDENCE-TEXT: contractor shall supply PoE access switches.",
          documentMetrics: {
            textCharCount: 63,
            nonWhitespaceTextCharCount: 55,
            tableCount: 0,
            tableRowCount: 0,
          },
        },
        {
          evidenceId: EV_TABLE,
          evidenceKind: TABLE_KIND,
          sourceFileId: FILE_SOW,
          inputPackageArtifactId: PACKAGE_A,
          sourceFileName: "scope-of-work.docx",
          sourceFileRole: "scope_of_work",
          tableId: SOW_TABLE_ID,
          pageNumber: 4,
          sheetName: "Annex A",
          rowCount: 2,
          columnCount: 2,
          rows: [
            ["RAW-TABLE-CELL-A1", "1"],
            ["RAW-TABLE-CELL-A2", "2"],
          ],
        },
      ],
    });

    const serialized = JSON.stringify(executorInput);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "secret-store",
      "internalScratch",
      "ARBITRARY-CONTENT-VALUE",
      "extraMetric",
      "PACKAGE-PAYLOAD-SECRET",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("degrades malformed stored content fields to safe fallbacks", async () => {
    evidenceRows = [
      makeTextChunkItem(EV_TEXT, {
        content: {
          evidenceKind: TEXT_KIND,
          inputPackageArtifactId: PACKAGE_A,
          text: 42,
          chunkIndex: "one",
          chunkCount: null,
          documentMetrics: {
            textCharCount: 63,
            nonWhitespaceTextCharCount: "55",
            tableCount: 0,
            tableRowCount: 0,
          },
        },
      }),
      makeSowTableItem(EV_TABLE, {
        content: {
          evidenceKind: TABLE_KIND,
          inputPackageArtifactId: PACKAGE_A,
          pageNumber: "4",
          sheetName: 7,
          rowCount: Number.NaN,
          rows: [["a", 5], "not-a-row", []],
        },
      }),
    ];
    const executor = makeValidExecutor();

    await draft({ executor });

    const executorInput: RfpExtractionDeltaCandidateDraftingExecutorInput =
      executor.mock.calls[0][0];
    expect(executorInput.evidence).toStrictEqual([
      {
        evidenceId: EV_TEXT,
        evidenceKind: TEXT_KIND,
        sourceFileId: FILE_RFP,
        inputPackageArtifactId: PACKAGE_A,
        chunkIndex: 0,
        chunkCount: 0,
        charCount: 0,
        text: "",
      },
      {
        evidenceId: EV_TABLE,
        evidenceKind: TABLE_KIND,
        sourceFileId: FILE_SOW,
        inputPackageArtifactId: PACKAGE_A,
        tableId: "",
        rowCount: 0,
        columnCount: 0,
        rows: [["a", ""], [], []],
      },
    ]);
  });

  it("gives the executor copies: mutating them never alters stored rows or the result", async () => {
    const evidenceSnapshot = structuredClone(evidenceRows);
    const artifactSnapshot = structuredClone(Array.from(artifactById.values()));
    const executor = vi.fn(
      async (executorInput: RfpExtractionDeltaCandidateDraftingExecutorInput) => {
        executorInput.project.name = "HACKED-NAME";
        executorInput.inputPackage.sourceFileIds.push("hacked-file");
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
            {
              kind: "missing_evidence",
              sourceFileId: FILE_RFP,
              title: "Missing spares table",
              description: "Section 7 names a spares table with no evidence.",
            },
          ],
        };
      }
    );

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(evidenceRows).toEqual(evidenceSnapshot);
    expect(Array.from(artifactById.values())).toEqual(artifactSnapshot);
    expect(result.project.name).toBe("STC RFP Bid");
    expect(result.sourceFileIds).toEqual([FILE_RFP, FILE_SOW]);
    expect(result.sourceArtifactIds).toEqual([PACKAGE_A]);
  });
});

describe("executor failure and invalid output", () => {
  it("maps an executor throw to a fixed drafting_failed without leaking the thrown detail", async () => {
    const executor = vi.fn(async () => {
      throw new Error("PROVIDER-EXPLODED: api key sk-secret-123");
    });

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "drafting_failed",
      error: "extraction_delta_drafting_failed",
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

  it("collects every candidate violation, including BoQ and filtered evidence references", async () => {
    const valid = {
      kind: "missing_evidence",
      sourceFileId: FILE_RFP,
      title: "T",
      description: "D",
    };
    const executor = vi.fn(async () => ({
      candidates: [
        42,
        { ...valid, kind: "wrong_kind" },
        { ...valid, sourceFileId: "   " },
        // FILE_BOQ is in the package but BoQ-excluded from drafting.
        { ...valid, sourceFileId: FILE_BOQ },
        { ...valid, title: "   " },
        { ...valid, description: 42 },
        { ...valid, severity: "urgent" },
        { ...valid, confidence: 1.5 },
        { ...valid, evidenceIds: ["ghost-evidence-1"] },
        // A real stored row, but BoQ-role: filtered, so unknown here.
        { ...valid, evidenceIds: [EV_BOQ] },
        // A real stored row, but for another package: filtered too.
        { ...valid, evidenceIds: [EV_OTHER_PKG] },
      ],
    }));

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "invalid_candidate_output",
      errors: [
        "candidates[0] must be an object.",
        "candidates[1].kind is invalid: wrong_kind.",
        "candidates[2].sourceFileId is required.",
        `candidates[3].sourceFileId is unknown: ${FILE_BOQ}.`,
        "candidates[4].title is required.",
        "candidates[5].description is required.",
        "candidates[6].severity is invalid: urgent.",
        "candidates[7].confidence must be a finite number between 0 and 1 inclusive.",
        "candidates[8] cites unknown evidence ID: ghost-evidence-1.",
        `candidates[9] cites unknown evidence ID: ${EV_BOQ}.`,
        `candidates[10] cites unknown evidence ID: ${EV_OTHER_PKG}.`,
      ],
    });
  });

  it("rejects a missing kind and a non-string severity deterministically", async () => {
    const executor = vi.fn(async () => ({
      candidates: [
        { sourceFileId: FILE_RFP, title: "T", description: "D" },
        {
          kind: "missing_evidence",
          sourceFileId: FILE_RFP,
          title: "T",
          description: "D",
          severity: null,
        },
      ],
    }));

    expect(await draft({ executor })).toEqual({
      status: "invalid_candidate_output",
      errors: [
        "candidates[0].kind is invalid: undefined.",
        "candidates[1].severity is invalid: null.",
      ],
    });
  });

  it("rejects every non-finite or out-of-range confidence", async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1, "0.5"]) {
      const executor = vi.fn(async () => ({
        candidates: [
          {
            kind: "missing_evidence",
            sourceFileId: FILE_RFP,
            title: "T",
            description: "D",
            confidence: bad,
          },
        ],
      }));

      expect(await draft({ executor })).toEqual({
        status: "invalid_candidate_output",
        errors: [
          "candidates[0].confidence must be a finite number between 0 and 1 inclusive.",
        ],
      });
    }
  });
});

describe("executor output sanitization", () => {
  it("accepts an empty candidates array: no delta candidates found is valid", async () => {
    const executor = vi.fn(async () => ({ candidates: [] }));

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "ok",
      project: EXPECTED_PROJECT_SUMMARY,
      candidates: [],
      candidateCount: 0,
      evidenceCount: 2,
      sourceFileIds: [FILE_RFP, FILE_SOW],
      sourceArtifactIds: [PACKAGE_A],
    });
  });

  it("sanitizes candidates: trimmed, deduplicated, order preserved, authority fields dropped", async () => {
    const { result } = await runSuccessDraft();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.candidates).toStrictEqual(SANITIZED_CANDIDATES);
    // No severity default is applied here - the draft service owns it: the
    // second candidate carries no severity/confidence/rationale keys at all.
    expect(Object.keys(result.candidates[1]).sort()).toEqual([
      "description",
      "kind",
      "sourceFileId",
      "title",
    ]);
  });

  it("accepts every delta kind and severity literal unchanged, plus boundary confidences", async () => {
    const combos = RFP_EXTRACTION_DELTA_KINDS.flatMap((kind) =>
      RFP_EXTRACTION_DELTA_SEVERITIES.map((severity) => ({ kind, severity }))
    );
    const executor = vi.fn(async () => ({
      candidates: combos.map((combo, index) => ({
        kind: combo.kind,
        sourceFileId: FILE_RFP,
        title: `Delta ${index + 1}`,
        description: `Description ${index + 1}.`,
        severity: combo.severity,
        confidence: index % 2 === 0 ? 0 : 1,
      })),
    }));

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.candidateCount).toBe(combos.length);
    expect(
      result.candidates.map((candidate) => ({
        kind: candidate.kind,
        severity: candidate.severity,
      }))
    ).toEqual(combos);
    expect(result.candidates[0].confidence).toBe(0);
    expect(result.candidates[1].confidence).toBe(1);
  });

  it("degrades malformed proposedEvidence instead of erroring, dropping arbitrary keys", async () => {
    const base = {
      kind: "missing_evidence",
      sourceFileId: FILE_RFP,
      title: "T",
      description: "D",
    };
    const executor = vi.fn(async () => ({
      candidates: [
        { ...base, proposedEvidence: "not-an-object" },
        { ...base, proposedEvidence: { evidenceKind: "weird_kind", text: "x" } },
        {
          ...base,
          proposedEvidence: {
            evidenceKind: TEXT_KIND,
            text: 42,
            chunkIndex: "one",
            charCount: 7,
            internalScratch: "ARBITRARY-PROPOSAL-VALUE",
          },
        },
        {
          ...base,
          proposedEvidence: {
            evidenceKind: TABLE_KIND,
            rowCount: 2,
            pageNumber: "4",
            rows: [["a", 42], "not-a-row"],
          },
        },
      ],
    }));

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.candidates).toStrictEqual([
      { ...base },
      { ...base },
      {
        ...base,
        proposedEvidence: { evidenceKind: TEXT_KIND, text: "", charCount: 7 },
      },
      {
        ...base,
        proposedEvidence: {
          evidenceKind: TABLE_KIND,
          rowCount: 2,
          rows: [["a", ""], []],
        },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("ARBITRARY-PROPOSAL-VALUE");
  });

  it("copies proposedEvidence rows: never an alias of the executor output", async () => {
    const proposalRows = [["PROPOSED-CELL-A1", "PROPOSED-CELL-B1"]];
    const executorOutput = {
      candidates: [
        {
          kind: "table_reconstruction",
          sourceFileId: FILE_SOW,
          title: "Rebuild the merged table",
          description: "Merged header cells split into columns.",
          evidenceIds: [EV_TABLE],
          proposedEvidence: {
            evidenceKind: TABLE_KIND,
            tableId: "proposed-table-1",
            rowCount: 1,
            columnCount: 2,
            rows: proposalRows,
          },
        },
      ],
    };
    const executor = vi.fn(async () => executorOutput);

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const proposed = result.candidates[0].proposedEvidence;
    if (proposed === undefined || proposed.evidenceKind !== TABLE_KIND) {
      throw new Error("unreachable");
    }
    expect(proposed.rows).toEqual(proposalRows);
    expect(proposed.rows).not.toBe(proposalRows);
    if (proposed.rows === undefined) throw new Error("unreachable");
    expect(proposed.rows[0]).not.toBe(proposalRows[0]);
    proposed.rows[0].push("hacked-cell");
    proposed.rows.push(["hacked-row"]);
    expect(proposalRows).toEqual([["PROPOSED-CELL-A1", "PROPOSED-CELL-B1"]]);
  });
});

describe("success", () => {
  it("returns the lean serializable ok read model", async () => {
    const { result } = await runSuccessDraft();

    expect(result).toEqual({
      status: "ok",
      project: EXPECTED_PROJECT_SUMMARY,
      candidates: SANITIZED_CANDIDATES,
      candidateCount: 2,
      evidenceCount: 2,
      sourceFileIds: [FILE_RFP, FILE_SOW],
      sourceArtifactIds: [PACKAGE_A],
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("reads tenant scoped and lists evidence exactly once", async () => {
    await runSuccessDraft();

    expect(mockGetProject.mock.calls).toEqual([[TENANT, PROJECT]]);
    expect(mockGetArtifact.mock.calls).toEqual([[TENANT, PROJECT, PACKAGE_A]]);
    expect(mockListEvidence.mock.calls).toEqual([[TENANT, PROJECT]]);
  });

  it("leaks no stored bodies, tenant, storage path, package payload, or raw executor output", async () => {
    const { result } = await runSuccessDraft();

    const serialized = JSON.stringify(result);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "secret-store",
      "internalScratch",
      "ARBITRARY-CONTENT-VALUE",
      "ARBITRARY-PROPOSAL-VALUE",
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
      "RAW-BOQ-TABLE-CELL",
      "RAW-OTHER-PACKAGE-TEXT",
      "RAW-UNRELATED-CONTENT",
      "PACKAGE-PAYLOAD-SECRET",
      "EXECUTOR-RAW-SECRET",
      "RAW-AI-PAYLOAD",
      "model-made-id-1",
      "art-model-made-1",
      "proj-model-made",
      "reviewStatus",
      "pending_review",
      "listPriceUsd",
      "C9300X-48HX",
      "documentMetrics",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("never mutates the service input, loaded rows, executor input, or executor output", async () => {
    const evidenceSnapshot = structuredClone(evidenceRows);
    const artifactSnapshot = structuredClone(Array.from(artifactById.values()));
    const projectRow = makeProject();
    const projectSnapshot = structuredClone(projectRow);
    mockGetProject.mockResolvedValue(projectRow);

    const executorOutput = richExecutorOutput();
    const outputSnapshot = structuredClone(executorOutput);
    let capturedInput:
      | RfpExtractionDeltaCandidateDraftingExecutorInput
      | undefined;
    let capturedInputSnapshot: unknown;
    const executor = vi.fn(
      async (executorInput: RfpExtractionDeltaCandidateDraftingExecutorInput) => {
        capturedInput = executorInput;
        capturedInputSnapshot = structuredClone(executorInput);
        return executorOutput;
      }
    );
    const serviceInput: DraftRfpExtractionDeltaCandidatesInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      inputPackageArtifactId: PACKAGE_A,
      requestedBy: `  ${REQUESTED_BY}  `,
      executor,
    };
    const serviceInputSnapshot = { ...serviceInput };

    const result = await draftRfpExtractionDeltaCandidates(serviceInput);

    expect(result.status).toBe("ok");
    expect(serviceInput).toEqual(serviceInputSnapshot);
    expect(projectRow).toEqual(projectSnapshot);
    expect(evidenceRows).toEqual(evidenceSnapshot);
    expect(Array.from(artifactById.values())).toEqual(artifactSnapshot);
    expect(capturedInput).toEqual(capturedInputSnapshot);
    expect(executorOutput).toEqual(outputSnapshot);
  });

  it("returns copies: mutating the result alters neither stored rows nor the executor output", async () => {
    const evidenceSnapshot = structuredClone(evidenceRows);
    const executorOutput = richExecutorOutput();
    const outputSnapshot = structuredClone(executorOutput);
    const executor = vi.fn(async () => executorOutput);

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    result.candidates[0].title = "hacked title";
    result.candidates[0].evidenceIds?.push("hacked-evidence");
    result.candidates.push({
      kind: "missing_evidence",
      sourceFileId: "hacked-file",
      title: "hacked",
      description: "hacked",
    });
    result.sourceFileIds.push("hacked-file");
    result.sourceArtifactIds.push("hacked-artifact");
    result.project.name = "hacked-project";

    expect(executorOutput).toEqual(outputSnapshot);
    expect(evidenceRows).toEqual(evidenceSnapshot);
  });
});

describe("store failures bubble unhidden", () => {
  it("bubbles a project read failure", async () => {
    mockGetProject.mockRejectedValue(new Error("project read failed"));

    await expect(draft()).rejects.toThrow("project read failed");
  });

  it("bubbles an artifact read failure", async () => {
    mockGetArtifact.mockRejectedValue(new Error("artifact read failed"));

    await expect(draft()).rejects.toThrow("artifact read failed");
  });

  it("bubbles an evidence list failure and never calls the executor", async () => {
    mockListEvidence.mockRejectedValue(new Error("evidence list failed"));
    const executor = makeValidExecutor();

    await expect(draft({ executor })).rejects.toThrow("evidence list failed");
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-extraction-delta-candidate-drafting.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-extraction-delta-candidate-drafting.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the three read stores, canonical types, and the delta types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-evidence-store",
      "@/types/project",
      "@/lib/projects/project-rfp-extraction-delta",
    ]);
  });

  it("imports the extraction-delta module and canonical shapes as types only", () => {
    expect(source).toMatch(/import type \{[^}]*\} from "@\/types\/project";/);
    expect(source).toMatch(
      /import type \{[^}]*\} from "@\/lib\/projects\/project-rfp-extraction-delta";/
    );
    expect(
      source.match(/from "@\/lib\/projects\/project-rfp-extraction-delta"/g) ??
        []
    ).toHaveLength(1);
    expect(source).not.toContain("createRfpExtractionDeltaDraft");
    expect(source).not.toContain("getProjectEvidenceItemById");
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
      'from "@/lib/projects/project-rfp-evidence-package"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-requirements-',
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
      "openai",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
      "storagePath",
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
