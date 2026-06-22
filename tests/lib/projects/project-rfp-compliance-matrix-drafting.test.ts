import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock ONLY the two store boundaries (project read, artifact read); the drafting
// contract's validation, gating, executor bundling, and output sanitization stay
// real. The executor is always a plain test function - no DB, file bytes, parser, or
// AI module is touched anywhere in this suite. createProjectArtifactVersion exists on
// the artifact-store mock only so the afterEach can PROVE the drafting contract never
// persists through it.
const { mockGetProject, mockGetArtifact, mockCreateArtifact } = vi.hoisted(() => ({
  mockGetProject: vi.fn(),
  mockGetArtifact: vi.fn(),
  mockCreateArtifact: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  createProjectArtifactVersion: mockCreateArtifact,
}));

import {
  draftRfpComplianceMatrixRows,
  type DraftRfpComplianceMatrixRowsInput,
  type DraftRfpComplianceMatrixRowsResult,
  type RfpComplianceMatrixDraftingExecutor,
  type RfpComplianceMatrixDraftingExecutorInput,
} from "@/lib/projects/project-rfp-compliance-matrix-drafting";

// The two evidence-reference kinds, declared locally exactly like the contract
// declares them - the requirements-baseline value module must stay unimported.
const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const BASELINE_ARTIFACT = "art-requirements-baseline-1";
const EVIDENCE_PACKAGE = "art-evidence-package-1";
const CONFIG_ARTIFACT = "art-config-expansion-1";
const PACKAGE_A = "art-input-package-1";
const NORMALIZED_BOQ = "art-normalized-boq-1";
const SKU_RESOLUTION = "art-sku-resolution-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const TABLE_ID = `${FILE_BOQ}:table:1`;
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_TEXT_B = "evidence-text-2";
const REQ_1 = "RFP-REQ-001";
const REQ_2 = "RFP-REQ-002";
const REQ_3 = "RFP-REQ-003";
const REQ_1_TEXT = "Provide 48-port PoE access switches for all IDFs.";
const REQ_2_TEXT = "Submit a bid bond with the commercial offer.";
const REQ_3_TEXT = "Optional managed services add-on.";
const CFG_LINE_1 = "cfg-line-1";
const CFG_LINE_2 = "cfg-line-2";
const CREATED_BY = "engineer@stc.example";
const CREATED_AT = "2026-06-10T09:30:00.000Z";
const REQUESTED_BY = "engineer@stc.example";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const SHAPE_ERROR = "Executor output must be an object with a rows array.";

const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "STC RFP Bid",
  customerName: "STC",
  mode: "rfp" as const,
  createdAt: TS1.toISOString(),
  updatedAt: TS2.toISOString(),
};

/** Locator-only baseline reference; the requirement's own stored citation. */
function baselineTextRef(evidenceId: string, chunkIndex: number) {
  return {
    evidenceId,
    sourceFileId: FILE_RFP,
    evidenceKind: TEXT_KIND,
    inputPackageArtifactId: PACKAGE_A,
    chunkIndex,
    chunkCount: 3,
    charCount: 88,
  };
}
function baselineTableRef(evidenceId: string) {
  return {
    evidenceId,
    sourceFileId: FILE_BOQ,
    evidenceKind: TABLE_KIND,
    inputPackageArtifactId: PACKAGE_A,
    tableId: TABLE_ID,
    pageNumber: 4,
    sheetName: "BoQ Sheet",
    rowCount: 12,
    columnCount: 5,
  };
}

/** One persisted evidence-package text entry, as stored, with trap fields. */
function packageTextEntry(evidenceId: string, chunkIndex: number, charCount: number, text: string) {
  return {
    evidenceId,
    evidenceKind: TEXT_KIND,
    sourceFileId: FILE_RFP,
    inputPackageArtifactId: PACKAGE_A,
    sourceFileName: "rfp.pdf",
    sourceFileRole: "rfp",
    chunkIndex,
    chunkCount: 2,
    charCount,
    text,
    documentMetrics: {
      textCharCount: charCount,
      nonWhitespaceTextCharCount: charCount - 8,
      tableCount: 1,
      tableRowCount: 2,
    },
    storagePath: "C:/secret-store/package-text.json",
    tenantId: TENANT,
    pricing: { unitPrice: 1234 },
    internalScratch: "PACKAGE-ARBITRARY-CONTENT",
  };
}
/** One persisted evidence-package table entry, as stored, with trap fields. */
function packageTableEntry() {
  return {
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
    sku: "SECRET-EV-SKU",
  };
}

/** The whitelisted executor projections of the three package entries. */
const EXEC_EV_TEXT = {
  evidenceId: EV_TEXT,
  evidenceKind: TEXT_KIND,
  sourceFileId: FILE_RFP,
  inputPackageArtifactId: PACKAGE_A,
  sourceFileName: "rfp.pdf",
  sourceFileRole: "rfp",
  chunkIndex: 1,
  chunkCount: 2,
  charCount: 54,
  text: "PACKAGE-TEXT: supply access switching for all IDFs.",
};
const EXEC_EV_TABLE = {
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
};
const EXEC_EV_TEXT_B = {
  evidenceId: EV_TEXT_B,
  evidenceKind: TEXT_KIND,
  sourceFileId: FILE_RFP,
  inputPackageArtifactId: PACKAGE_A,
  sourceFileName: "rfp.pdf",
  sourceFileRole: "rfp",
  chunkIndex: 2,
  chunkCount: 2,
  charCount: 40,
  text: "PACKAGE-TEXT: spares for two years.",
};

/** Locator-only references for the package entries an executor may cite. */
const LOC_EV_TEXT = {
  evidenceId: EV_TEXT,
  sourceFileId: FILE_RFP,
  evidenceKind: TEXT_KIND,
  inputPackageArtifactId: PACKAGE_A,
  chunkIndex: 1,
  chunkCount: 2,
  charCount: 54,
};
const LOC_EV_TABLE = {
  evidenceId: EV_TABLE,
  sourceFileId: FILE_BOQ,
  evidenceKind: TABLE_KIND,
  inputPackageArtifactId: PACKAGE_A,
  tableId: TABLE_ID,
  sheetName: "BoQ Sheet",
  rowCount: 2,
  columnCount: 2,
};

/** One accepted expansion line, as stored, with pricing/authority trap fields. */
function configExpansionLine() {
  return {
    lineId: CFG_LINE_1,
    origin: "expansion",
    sku: "C9300-NM-8X",
    description: "8x10G network module",
    quantity: 1,
    parentLineId: CFG_LINE_2,
    parentLineNumber: "10",
    sourceFileId: FILE_BOQ,
    sourceRowNumber: 11,
    originalLineNumber: "10",
    relationshipType: "default_selected",
    quantityRule: "same_as_parent",
    includedItem: false,
    sourceRuleId: "rule-secret",
    evidence: [
      { sourceType: "ccw_export", sourcePath: "ccw.xlsx", evidenceNote: "CONFIG-EVIDENCE-SECRET" },
    ],
    approvalRequired: true,
    approved: true,
    unitPrice: 1234.5,
    listPrice: 2000,
    margin: 0.3,
    discount: 0.1,
    currency: "SAR",
    replacementSku: "REPL-9000",
    catalogLookup: { listPriceUsd: 1 },
  };
}
/** One preserved customer line, as stored. */
function configCustomerLine() {
  return {
    lineId: CFG_LINE_2,
    origin: "customer",
    sku: "C9300X-48HX",
    description: "48-port PoE switch",
    quantity: 2,
    sourceFileId: FILE_BOQ,
    sourceRowNumber: 10,
    originalLineNumber: "10",
    originalSku: "C9300X-48HX",
    acceptedSku: "C9300X-48HX",
    originalCells: { A: "10", B: "C9300X-48HX" },
  };
}

/** The whitelisted executor projections of the two accepted lines. */
const EXEC_CFG_1 = {
  lineId: CFG_LINE_1,
  origin: "expansion" as const,
  sku: "C9300-NM-8X",
  description: "8x10G network module",
  parentLineId: CFG_LINE_2,
  parentLineNumber: "10",
  sourceFileId: FILE_BOQ,
  sourceRowNumber: 11,
  originalLineNumber: "10",
};
const EXEC_CFG_2 = {
  lineId: CFG_LINE_2,
  origin: "customer" as const,
  sku: "C9300X-48HX",
  description: "48-port PoE switch",
  sourceFileId: FILE_BOQ,
  sourceRowNumber: 10,
  originalLineNumber: "10",
};
const REF_CFG_1 = { configurationExpansionArtifactId: CONFIG_ARTIFACT, ...EXEC_CFG_1 };
const REF_CFG_2 = { configurationExpansionArtifactId: CONFIG_ARTIFACT, ...EXEC_CFG_2 };

/** The whitelisted executor projections of the three baseline requirements. */
const EXEC_REQUIREMENTS = [
  {
    id: REQ_1,
    text: REQ_1_TEXT,
    category: "technical",
    priority: "mandatory",
    title: "Access layer switching",
    notes: "From RFP section 3.2.",
    evidenceReferences: [baselineTextRef(EV_TEXT, 1), baselineTableRef(EV_TABLE)],
  },
  {
    id: REQ_2,
    text: REQ_2_TEXT,
    category: "commercial",
    priority: "mandatory",
    evidenceReferences: [baselineTextRef(EV_TEXT_B, 2)],
  },
  {
    id: REQ_3,
    text: REQ_3_TEXT,
    category: "support",
    priority: "optional",
    evidenceReferences: [],
  },
];

function makeBaselinePayload(overrides: Record<string, unknown> = {}) {
  return {
    payloadKind: "rfp_requirements_baseline",
    createdBy: CREATED_BY,
    createdAt: CREATED_AT,
    requirementCount: 3,
    evidenceCount: 3,
    requirements: [
      {
        id: REQ_1,
        text: REQ_1_TEXT,
        category: "technical",
        priority: "mandatory",
        title: "Access layer switching",
        notes: "From RFP section 3.2.",
        evidenceReferences: [baselineTextRef(EV_TEXT, 1), baselineTableRef(EV_TABLE)],
      },
      {
        id: REQ_2,
        text: REQ_2_TEXT,
        category: "commercial",
        priority: "mandatory",
        evidenceReferences: [baselineTextRef(EV_TEXT_B, 2)],
      },
      {
        id: REQ_3,
        text: REQ_3_TEXT,
        category: "support",
        priority: "optional",
        evidenceReferences: [],
      },
    ],
    ...overrides,
  };
}

function makeEvidencePackagePayload(overrides: Record<string, unknown> = {}) {
  return {
    payloadKind: "rfp_evidence_package",
    createdBy: CREATED_BY,
    createdAt: CREATED_AT,
    inputPackageArtifactId: PACKAGE_A,
    evidenceCount: 3,
    textChunkCount: 2,
    tableEvidenceCount: 1,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    evidence: [
      packageTextEntry(EV_TEXT, 1, 54, "PACKAGE-TEXT: supply access switching for all IDFs."),
      packageTableEntry(),
      packageTextEntry(EV_TEXT_B, 2, 40, "PACKAGE-TEXT: spares for two years."),
    ],
    storagePath: "C:/secret-store/package.json",
    internalScratch: "PACKAGE-ARBITRARY-CONTENT",
    ...overrides,
  };
}

/** A REVIEWED configuration_expansion payload: no draft marker. */
function makeConfigPayload(overrides: Record<string, unknown> = {}) {
  return {
    sourceNormalizedBoqArtifactId: NORMALIZED_BOQ,
    sourceNormalizedBoqArtifactVersion: 2,
    sourceSkuResolutionArtifactId: SKU_RESOLUTION,
    sourceSkuResolutionArtifactVersion: 2,
    sourceFileIds: [FILE_BOQ],
    rulePackId: "honeywell-pack",
    rulePackVersion: "1.0.0",
    rulePackStatus: "approved",
    lineCount: 2,
    acceptedLines: [configExpansionLine(), configCustomerLine()],
    rejectedLines: [],
    summary: {
      customerLineCount: 1,
      acceptedExpansionLineCount: 1,
      rejectedExpansionLineCount: 0,
      totalAcceptedLineCount: 2,
      reviewedExpansionLineCount: 1,
    },
    reviewedBy: CREATED_BY,
    reviewedAt: CREATED_AT,
    ...overrides,
  };
}

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

function makeBaselineArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BASELINE_ARTIFACT,
    projectId: PROJECT,
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "approved",
    version: 2,
    payload: makeBaselinePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeEvidencePackageArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: EVIDENCE_PACKAGE,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "approved",
    version: 4,
    payload: makeEvidencePackagePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [PACKAGE_A],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeConfigArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: CONFIG_ARTIFACT,
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "approved",
    version: 3,
    payload: makeConfigPayload(),
    sourceFileIds: [FILE_BOQ],
    sourceArtifactIds: [NORMALIZED_BOQ, SKU_RESOLUTION],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

/** A well-behaved executor: one row per default baseline requirement. */
function makeValidExecutor() {
  return vi.fn(async () => ({
    rows: [
      { requirementId: REQ_1, response: "Compliant per datasheet." },
      { requirementId: REQ_2, response: "Under review with finance." },
      { requirementId: REQ_3, response: "Not in scope." },
    ],
  }));
}

/** Serializable artifact summary mirror used to assert executor/gate projections. */
function summaryOf(artifact: ProjectArtifact) {
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

function draft(
  overrides: Partial<DraftRfpComplianceMatrixRowsInput> = {}
): Promise<DraftRfpComplianceMatrixRowsResult> {
  return draftRfpComplianceMatrixRows({
    tenantId: TENANT,
    projectId: PROJECT,
    requirementsBaselineArtifactId: BASELINE_ARTIFACT,
    evidencePackageArtifactId: EVIDENCE_PACKAGE,
    requestedBy: REQUESTED_BY,
    executor: makeValidExecutor(),
    ...overrides,
  });
}

function draftConfig(
  overrides: Partial<DraftRfpComplianceMatrixRowsInput> = {}
): Promise<DraftRfpComplianceMatrixRowsResult> {
  return draft({ configurationExpansionArtifactId: CONFIG_ARTIFACT, ...overrides });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockCreateArtifact).not.toHaveBeenCalled();
}

let baselineArtifact: ProjectArtifact;
let evidencePackageArtifact: ProjectArtifact;
let configArtifact: ProjectArtifact;
let artifactById: Map<string, ProjectArtifact>;

beforeEach(() => {
  baselineArtifact = makeBaselineArtifact();
  evidencePackageArtifact = makeEvidencePackageArtifact();
  configArtifact = makeConfigArtifact();
  artifactById = new Map([
    [BASELINE_ARTIFACT, baselineArtifact],
    [EVIDENCE_PACKAGE, evidencePackageArtifact],
    [CONFIG_ARTIFACT, configArtifact],
  ]);
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockCreateArtifact.mockReset();
});

afterEach(() => {
  // The drafting contract NEVER persists: no test path may reach the artifact create
  // boundary (it exists on the mock only to PROVE this).
  expect(mockCreateArtifact).not.toHaveBeenCalled();
});

describe("validation before store calls", () => {
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

  it("throws on a blank requirementsBaselineArtifactId", async () => {
    for (const blank of ["", "   "]) {
      const executor = makeValidExecutor();
      await expect(
        draft({ requirementsBaselineArtifactId: blank, executor })
      ).rejects.toThrow("requirementsBaselineArtifactId is required.");
      expect(executor).not.toHaveBeenCalled();
    }
    expectNoStoreCalls();
  });

  it("throws on a blank evidencePackageArtifactId", async () => {
    for (const blank of ["", "   "]) {
      const executor = makeValidExecutor();
      await expect(
        draft({ evidencePackageArtifactId: blank, executor })
      ).rejects.toThrow("evidencePackageArtifactId is required.");
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

  it("throws on a blank configurationExpansionArtifactId when supplied", async () => {
    for (const blank of ["", "   "]) {
      const executor = makeValidExecutor();
      await expect(
        draft({ configurationExpansionArtifactId: blank, executor })
      ).rejects.toThrow("configurationExpansionArtifactId is required.");
      expect(executor).not.toHaveBeenCalled();
    }
    expectNoStoreCalls();
  });

  it("throws when the executor is missing", async () => {
    await expect(
      draft({ executor: undefined as unknown as RfpComplianceMatrixDraftingExecutor })
    ).rejects.toThrow("executor is required.");
    expectNoStoreCalls();
  });

  it("trims artifact ids and requestedBy for the store calls and the result", async () => {
    const result = await draftConfig({
      requirementsBaselineArtifactId: `  ${BASELINE_ARTIFACT}  `,
      evidencePackageArtifactId: `  ${EVIDENCE_PACKAGE}  `,
      configurationExpansionArtifactId: `  ${CONFIG_ARTIFACT}  `,
      requestedBy: `  ${REQUESTED_BY}  `,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockGetArtifact.mock.calls).toEqual([
      [TENANT, PROJECT, BASELINE_ARTIFACT],
      [TENANT, PROJECT, EVIDENCE_PACKAGE],
      [TENANT, PROJECT, CONFIG_ARTIFACT],
    ]);
    expect(result.requirementsBaselineArtifactId).toBe(BASELINE_ARTIFACT);
    expect(result.evidencePackageArtifactId).toBe(EVIDENCE_PACKAGE);
    expect(result.configurationExpansionArtifactId).toBe(CONFIG_ARTIFACT);
  });
});

describe("project gates", () => {
  it("returns not_found for a missing project and never calls the executor", async () => {
    mockGetProject.mockResolvedValue(null);
    const executor = makeValidExecutor();

    expect(await draft({ executor })).toEqual({ status: "not_found" });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean no-tenantId summary for a quick_bom project", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "wrong_mode",
      project: { ...PROJECT_SUMMARY, mode: "quick_bom" },
    });
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(JSON.stringify(result)).not.toContain("tenantId");
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("requirements_baseline gates", () => {
  it("returns requirements_baseline_not_found when the artifact is absent", async () => {
    artifactById.delete(BASELINE_ARTIFACT);
    const executor = makeValidExecutor();

    expect(await draft({ executor })).toEqual({
      status: "requirements_baseline_not_found",
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns artifact_not_requirements_baseline for the wrong type or stage, without its payload", async () => {
    const variants: Array<Partial<ProjectArtifact>> = [
      { type: "evidence_package" },
      { stageId: "intake_package_review" },
    ];
    for (const variant of variants) {
      artifactById.set(BASELINE_ARTIFACT, makeBaselineArtifact(variant));
      const executor = makeValidExecutor();

      const result = await draft({ executor });

      expect(result.status).toBe("artifact_not_requirements_baseline");
      if (result.status !== "artifact_not_requirements_baseline") {
        throw new Error("unreachable");
      }
      expect(result.artifact.id).toBe(BASELINE_ARTIFACT);
      expect(JSON.stringify(result)).not.toContain(REQ_1_TEXT);
      expect(executor).not.toHaveBeenCalled();
    }
  });

  it("returns requirements_baseline_not_approved for a non-approved version", async () => {
    artifactById.set(
      BASELINE_ARTIFACT,
      makeBaselineArtifact({ status: "needs_review" })
    );
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result.status).toBe("requirements_baseline_not_approved");
    if (result.status !== "requirements_baseline_not_approved") {
      throw new Error("unreachable");
    }
    expect(result.artifact).toEqual({
      ...summaryOf(makeBaselineArtifact()),
      status: "needs_review",
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns invalid_requirements_baseline_payload for a malformed payload", async () => {
    const invalidPayloads: Record<string, unknown>[] = [
      makeBaselinePayload({ payloadKind: "rfp_input_package" }),
      makeBaselinePayload({ requirements: "not-an-array" }),
      makeBaselinePayload({ requirements: [] }),
      makeBaselinePayload({
        requirements: [
          { id: "   ", text: "x", category: "technical", priority: "mandatory", evidenceReferences: [] },
        ],
      }),
      makeBaselinePayload({
        requirements: [
          { id: REQ_1, text: "x", category: "technical", priority: "mandatory", evidenceReferences: [] },
          { id: REQ_1, text: "y", category: "technical", priority: "mandatory", evidenceReferences: [] },
        ],
      }),
      makeBaselinePayload({
        requirements: [
          { id: REQ_1, text: "   ", category: "technical", priority: "mandatory", evidenceReferences: [] },
        ],
      }),
      makeBaselinePayload({
        requirements: [
          { id: REQ_1, text: "x", category: "pricing", priority: "mandatory", evidenceReferences: [] },
        ],
      }),
      makeBaselinePayload({
        requirements: [
          { id: REQ_1, text: "x", category: "technical", priority: "urgent", evidenceReferences: [] },
        ],
      }),
      makeBaselinePayload({
        requirements: [
          { id: REQ_1, text: "x", category: "technical", priority: "mandatory", evidenceReferences: "nope" },
        ],
      }),
      makeBaselinePayload({
        requirements: [
          { id: REQ_1, text: "x", category: "technical", priority: "mandatory", evidenceReferences: [42] },
        ],
      }),
    ];
    for (const payload of invalidPayloads) {
      artifactById.set(BASELINE_ARTIFACT, makeBaselineArtifact({ payload }));
      const executor = makeValidExecutor();

      const result = await draft({ executor });

      expect(result.status).toBe("invalid_requirements_baseline_payload");
      expect(executor).not.toHaveBeenCalled();
    }
  });
});

describe("evidence_package gates", () => {
  it("returns evidence_package_not_found when the artifact is absent", async () => {
    artifactById.delete(EVIDENCE_PACKAGE);
    const executor = makeValidExecutor();

    expect(await draft({ executor })).toEqual({
      status: "evidence_package_not_found",
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns artifact_not_evidence_package for the wrong type or stage", async () => {
    const variants: Array<Partial<ProjectArtifact>> = [
      { type: "input_package" },
      { stageId: "requirements_baseline_review" },
    ];
    for (const variant of variants) {
      artifactById.set(EVIDENCE_PACKAGE, makeEvidencePackageArtifact(variant));
      const executor = makeValidExecutor();

      const result = await draft({ executor });

      expect(result.status).toBe("artifact_not_evidence_package");
      expect(executor).not.toHaveBeenCalled();
    }
  });

  it("returns evidence_package_not_approved for a non-approved version", async () => {
    artifactById.set(
      EVIDENCE_PACKAGE,
      makeEvidencePackageArtifact({ status: "needs_review" })
    );
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result.status).toBe("evidence_package_not_approved");
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns invalid_evidence_package_payload for a malformed payload", async () => {
    const baseEvidence = makeEvidencePackagePayload().evidence as Array<
      Record<string, unknown>
    >;
    const invalidPayloads: Record<string, unknown>[] = [
      makeEvidencePackagePayload({ payloadKind: "rfp_input_package" }),
      makeEvidencePackagePayload({ evidence: "not-an-array" }),
      makeEvidencePackagePayload({ evidence: [42] }),
      makeEvidencePackagePayload({
        evidence: [{ ...baseEvidence[0], evidenceKind: "boq_line_item" }],
      }),
      makeEvidencePackagePayload({
        evidence: [{ ...baseEvidence[0], evidenceId: "   " }],
      }),
      makeEvidencePackagePayload({
        evidence: [baseEvidence[0], { ...baseEvidence[2], evidenceId: EV_TEXT }],
      }),
      makeEvidencePackagePayload({
        evidence: [{ ...baseEvidence[0], sourceFileId: "" }],
      }),
      makeEvidencePackagePayload({
        evidence: [{ ...baseEvidence[0], inputPackageArtifactId: null }],
      }),
    ];
    for (const payload of invalidPayloads) {
      artifactById.set(EVIDENCE_PACKAGE, makeEvidencePackageArtifact({ payload }));
      const executor = makeValidExecutor();

      const result = await draft({ executor });

      expect(result.status).toBe("invalid_evidence_package_payload");
      expect(executor).not.toHaveBeenCalled();
    }
  });

  it("returns invalid_requirements_baseline_payload when baseline references are outside the selected evidence package", async () => {
    const evidence = (
      makeEvidencePackagePayload().evidence as Array<Record<string, unknown>>
    ).filter((entry) => entry.evidenceId !== EV_TEXT_B);
    artifactById.set(
      EVIDENCE_PACKAGE,
      makeEvidencePackageArtifact({
        payload: makeEvidencePackagePayload({
          evidence,
          evidenceCount: evidence.length,
          textChunkCount: 1,
        }),
      })
    );
    const executor = makeValidExecutor();

    const result = await draft({ executor });

    expect(result.status).toBe("invalid_requirements_baseline_payload");
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("configuration_expansion gates (only when supplied)", () => {
  it("returns configuration_expansion_not_found when the artifact is absent", async () => {
    artifactById.delete(CONFIG_ARTIFACT);
    const executor = makeValidExecutor();

    expect(await draftConfig({ executor })).toEqual({
      status: "configuration_expansion_not_found",
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns artifact_not_configuration_expansion for the wrong type or stage", async () => {
    const variants: Array<Partial<ProjectArtifact>> = [
      { type: "normalized_boq" },
      { stageId: "boq_format_validation" },
    ];
    for (const variant of variants) {
      artifactById.set(CONFIG_ARTIFACT, makeConfigArtifact(variant));
      const executor = makeValidExecutor();

      const result = await draftConfig({ executor });

      expect(result.status).toBe("artifact_not_configuration_expansion");
      expect(executor).not.toHaveBeenCalled();
    }
  });

  it("returns configuration_expansion_not_approved for a non-approved version", async () => {
    artifactById.set(CONFIG_ARTIFACT, makeConfigArtifact({ status: "needs_review" }));
    const executor = makeValidExecutor();

    const result = await draftConfig({ executor });

    expect(result.status).toBe("configuration_expansion_not_approved");
    expect(executor).not.toHaveBeenCalled();
  });

  it("rejects a configuration_expansion DRAFT payload (the draft marker)", async () => {
    artifactById.set(
      CONFIG_ARTIFACT,
      makeConfigArtifact({
        payload: makeConfigPayload({ payloadKind: "configuration_expansion_draft" }),
      })
    );
    const executor = makeValidExecutor();

    const result = await draftConfig({ executor });

    expect(result.status).toBe("invalid_configuration_expansion_payload");
    expect(executor).not.toHaveBeenCalled();
  });

  it("returns invalid_configuration_expansion_payload for a malformed acceptedLines array", async () => {
    const invalidPayloads: Record<string, unknown>[] = [
      makeConfigPayload({ acceptedLines: "not-an-array" }),
      makeConfigPayload({ acceptedLines: [{ origin: "expansion" }] }),
      makeConfigPayload({ acceptedLines: [{ lineId: "   " }] }),
      makeConfigPayload({
        acceptedLines: [configExpansionLine(), { ...configCustomerLine(), lineId: CFG_LINE_1 }],
      }),
    ];
    for (const payload of invalidPayloads) {
      artifactById.set(CONFIG_ARTIFACT, makeConfigArtifact({ payload }));
      const executor = makeValidExecutor();

      const result = await draftConfig({ executor });

      expect(result.status).toBe("invalid_configuration_expansion_payload");
      expect(executor).not.toHaveBeenCalled();
    }
  });

  it("does not load or gate a config artifact when none is supplied", async () => {
    artifactById.delete(CONFIG_ARTIFACT);

    const result = await draft();

    expect(result.status).toBe("ok");
    expect(mockGetArtifact.mock.calls).toEqual([
      [TENANT, PROJECT, BASELINE_ARTIFACT],
      [TENANT, PROJECT, EVIDENCE_PACKAGE],
    ]);
  });
});

describe("executor input", () => {
  it("hands the executor exactly the whitelisted copied bundle (with config)", async () => {
    let captured: RfpComplianceMatrixDraftingExecutorInput | undefined;
    const executor = vi.fn(async (input: RfpComplianceMatrixDraftingExecutorInput) => {
      captured = input;
      return makeValidExecutor()();
    });

    const result = await draftConfig({ executor, requestedBy: `  ${REQUESTED_BY}  ` });

    expect(result.status).toBe("ok");
    expect(executor).toHaveBeenCalledTimes(1);
    expect(captured).toStrictEqual({
      project: PROJECT_SUMMARY,
      requirementsBaseline: summaryOf(baselineArtifact),
      evidencePackage: summaryOf(evidencePackageArtifact),
      configurationExpansion: summaryOf(configArtifact),
      requirements: EXEC_REQUIREMENTS,
      evidence: [EXEC_EV_TEXT, EXEC_EV_TABLE, EXEC_EV_TEXT_B],
      configurationLines: [EXEC_CFG_1, EXEC_CFG_2],
      requestedBy: REQUESTED_BY,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [BASELINE_ARTIFACT, EVIDENCE_PACKAGE, CONFIG_ARTIFACT],
    });
  });

  it("omits the config bundle entirely when no config artifact is supplied", async () => {
    let captured: RfpComplianceMatrixDraftingExecutorInput | undefined;
    const executor = vi.fn(async (input: RfpComplianceMatrixDraftingExecutorInput) => {
      captured = input;
      return makeValidExecutor()();
    });

    await draft({ executor });

    expect(captured).not.toHaveProperty("configurationExpansion");
    expect(captured).not.toHaveProperty("configurationLines");
    expect(captured?.sourceArtifactIds).toEqual([BASELINE_ARTIFACT, EVIDENCE_PACKAGE]);
  });

  it("leaks no tenantId, storage path, document metrics, raw payload, pricing, or config-authority field", async () => {
    let captured: RfpComplianceMatrixDraftingExecutorInput | undefined;
    const executor = vi.fn(async (input: RfpComplianceMatrixDraftingExecutorInput) => {
      captured = input;
      return makeValidExecutor()();
    });

    await draftConfig({ executor });

    const serialized = JSON.stringify(captured);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "secret-store",
      "documentMetrics",
      "PACKAGE-ARBITRARY-CONTENT",
      "unitPrice",
      "listPrice",
      "currency",
      "discount",
      "margin",
      "SECRET-EV-SKU",
      "rule-secret",
      "CONFIG-EVIDENCE-SECRET",
      "REPL-9000",
      "catalogLookup",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("gives the executor copies: mutating them never alters loaded artifacts or the result", async () => {
    const baselineSnapshot = structuredClone(baselineArtifact);
    const evidenceSnapshot = structuredClone(evidencePackageArtifact);
    const configSnapshot = structuredClone(configArtifact);
    const executor = vi.fn(async (input: RfpComplianceMatrixDraftingExecutorInput) => {
      input.project.name = "HACKED-NAME";
      input.sourceFileIds.push("hacked-file");
      input.sourceArtifactIds.push("hacked-artifact");
      input.requirements[0].text = "HACKED-REQ";
      input.requirements[0].evidenceReferences.push(baselineTableRef("hacked"));
      const first = input.evidence[0];
      if (first.evidenceKind === TEXT_KIND) first.text = "HACKED-TEXT";
      const table = input.evidence[1];
      if (table.evidenceKind === TABLE_KIND) {
        table.rows[0].push("HACKED-CELL");
        table.rows.push(["HACKED-ROW"]);
      }
      input.configurationLines?.[0] && (input.configurationLines[0].sku = "HACKED-SKU");
      return makeValidExecutor()();
    });

    const result = await draftConfig({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(baselineArtifact).toEqual(baselineSnapshot);
    expect(evidencePackageArtifact).toEqual(evidenceSnapshot);
    expect(configArtifact).toEqual(configSnapshot);
    expect(result.project.name).toBe("STC RFP Bid");
    expect(result.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(result.sourceArtifactIds).toEqual([
      BASELINE_ARTIFACT,
      EVIDENCE_PACKAGE,
      CONFIG_ARTIFACT,
    ]);
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
      error: "compliance_matrix_drafting_failed",
    });
    expect(JSON.stringify(result)).not.toContain("PROVIDER-EXPLODED");
    expect(JSON.stringify(result)).not.toContain("sk-secret-123");
  });

  it("rejects every non-object / rows-less / non-array output shape", async () => {
    for (const badOutput of [
      null,
      undefined,
      "rows",
      42,
      [],
      { wrong: true },
      { rows: "not-an-array" },
    ]) {
      const executor = vi.fn(async () => badOutput);

      expect(await draft({ executor })).toEqual({
        status: "invalid_draft_output",
        errors: [SHAPE_ERROR],
      });
    }
  });

  it("rejects an unknown requirement ID", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        { requirementId: REQ_1, response: "a" },
        { requirementId: REQ_2, response: "b" },
        { requirementId: REQ_3, response: "c" },
        { requirementId: "ghost-req", response: "d" },
      ],
    }));

    expect(await draft({ executor })).toEqual({
      status: "invalid_draft_output",
      errors: ["rows[3] references an unknown requirement ID: ghost-req."],
    });
  });

  it("rejects a duplicate requirement ID", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        { requirementId: REQ_1, response: "a" },
        { requirementId: REQ_1, response: "b" },
        { requirementId: REQ_2, response: "c" },
        { requirementId: REQ_3, response: "d" },
      ],
    }));

    expect(await draft({ executor })).toEqual({
      status: "invalid_draft_output",
      errors: [`rows[1] duplicates requirement ID: ${REQ_1}.`],
    });
  });

  it("rejects when a baseline requirement has no row", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        { requirementId: REQ_1, response: "a" },
        { requirementId: REQ_2, response: "b" },
      ],
    }));

    expect(await draft({ executor })).toEqual({
      status: "invalid_draft_output",
      errors: [`Missing compliance row for requirement ID: ${REQ_3}.`],
    });
  });

  it("collects every row-level violation in deterministic order", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        42,
        { requirementId: "   ", response: "x" },
        { requirementId: "ghost", response: "x" },
        { requirementId: REQ_1, response: "   " },
        { requirementId: REQ_1, response: "ok", evidenceIds: ["ghost-ev"] },
        { requirementId: REQ_2, response: "ok", configurationLineIds: ["cfg-x"] },
      ],
    }));

    expect(await draft({ executor })).toEqual({
      status: "invalid_draft_output",
      errors: [
        "rows[0] must be an object.",
        "rows[1].requirementId is required.",
        "rows[2] references an unknown requirement ID: ghost.",
        "rows[3].response is required.",
        "rows[4] cites unknown evidence ID: ghost-ev.",
        "rows[5] cites configuration lines but no configuration_expansion artifact was supplied.",
        `Missing compliance row for requirement ID: ${REQ_1}.`,
        `Missing compliance row for requirement ID: ${REQ_2}.`,
        `Missing compliance row for requirement ID: ${REQ_3}.`,
      ],
    });
  });

  it("rejects an unknown evidence ID even when it exists outside the package", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        { requirementId: REQ_1, response: "a", evidenceIds: [EV_TEXT, "ghost-ev"] },
        { requirementId: REQ_2, response: "b" },
        { requirementId: REQ_3, response: "c" },
      ],
    }));

    expect(await draft({ executor })).toEqual({
      status: "invalid_draft_output",
      errors: [
        "rows[0] cites unknown evidence ID: ghost-ev.",
        `Missing compliance row for requirement ID: ${REQ_1}.`,
      ],
    });
  });

  it("rejects an unknown configuration line ID when config is supplied", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        { requirementId: REQ_1, response: "a", configurationLineIds: [CFG_LINE_1, "ghost-cfg"] },
        { requirementId: REQ_2, response: "b" },
        { requirementId: REQ_3, response: "c" },
      ],
    }));

    expect(await draftConfig({ executor })).toEqual({
      status: "invalid_draft_output",
      errors: [
        "rows[0] cites unknown configuration line ID: ghost-cfg.",
        `Missing compliance row for requirement ID: ${REQ_1}.`,
      ],
    });
  });

  it("rejects configuration citations when no config artifact was supplied", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        { requirementId: REQ_1, response: "a", configurationLineIds: [CFG_LINE_1] },
        { requirementId: REQ_2, response: "b" },
        { requirementId: REQ_3, response: "c" },
      ],
    }));

    expect(await draft({ executor })).toEqual({
      status: "invalid_draft_output",
      errors: [
        "rows[0] cites configuration lines but no configuration_expansion artifact was supplied.",
        `Missing compliance row for requirement ID: ${REQ_1}.`,
      ],
    });
  });
});

describe("success", () => {
  /** A rich executor output carrying authority/raw trap fields that must be stripped. */
  function richExecutorOutput() {
    return {
      executorScratch: "EXECUTOR-RAW-SECRET",
      rows: [
        {
          requirementId: REQ_1,
          response: "  Offered switch meets the port and PoE requirement.  ",
          rationale: "  Datasheet confirms 48 PoE ports.  ",
          notes: "  Reviewed by the solution engineer.  ",
          evidenceIds: [`  ${EV_TEXT}  `, EV_TEXT, EV_TABLE],
          id: "model-made-id",
          complianceStatus: "compliant",
          status: "approved",
          approved: true,
          reviewed: true,
          artifactId: "art-model",
          payload: { secret: "EXECUTOR-RAW-SECRET" },
          tenantId: TENANT,
          projectId: "proj-model",
          createdBy: "the-model",
          pricing: { listPriceUsd: 1 },
          margin: 0.3,
          discount: 0.1,
          currency: "SAR",
          replacementSku: "REPL-9000",
          catalogLookup: {},
          sku: "MODEL-SKU",
        },
        { requirementId: REQ_2, response: "Bid bond handling is under review with finance." },
        { requirementId: REQ_3, response: "Not part of this bid scope.", evidenceIds: [] },
      ],
    };
  }

  const EXPECTED_ROWS = [
    {
      id: "RFP-COMP-001",
      requirementId: REQ_1,
      requirementText: REQ_1_TEXT,
      category: "technical",
      priority: "mandatory",
      complianceStatus: "needs_review",
      response: "Offered switch meets the port and PoE requirement.",
      rationale: "Datasheet confirms 48 PoE ports.",
      notes: "Reviewed by the solution engineer.",
      evidenceReferences: [LOC_EV_TEXT, LOC_EV_TABLE],
    },
    {
      id: "RFP-COMP-002",
      requirementId: REQ_2,
      requirementText: REQ_2_TEXT,
      category: "commercial",
      priority: "mandatory",
      complianceStatus: "needs_review",
      response: "Bid bond handling is under review with finance.",
      evidenceReferences: [baselineTextRef(EV_TEXT_B, 2)],
    },
    {
      id: "RFP-COMP-003",
      requirementId: REQ_3,
      requirementText: REQ_3_TEXT,
      category: "support",
      priority: "optional",
      complianceStatus: "needs_review",
      response: "Not part of this bid scope.",
      evidenceReferences: [],
    },
  ];

  it("returns deterministic needs_review rows: package citations, baseline fallback, stripped authority", async () => {
    const executor = vi.fn(async () => richExecutorOutput());

    const result = await draft({ executor });

    expect(result).toEqual({
      status: "ok",
      project: PROJECT_SUMMARY,
      requirementsBaselineArtifactId: BASELINE_ARTIFACT,
      evidencePackageArtifactId: EVIDENCE_PACKAGE,
      rows: EXPECTED_ROWS,
      rowCount: 3,
      requirementCount: 3,
      evidenceCount: 3,
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [BASELINE_ARTIFACT, EVIDENCE_PACKAGE],
    });
    expect(result.status === "ok" && result.rows.every((r) => r.complianceStatus === "needs_review")).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("leaks no raw evidence body, table cells, executor scratch, tenantId, pricing, or config authority", async () => {
    const executor = vi.fn(async () => richExecutorOutput());

    const result = await draft({ executor });

    const serialized = JSON.stringify(result);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "secret-store",
      "PACKAGE-TEXT",
      "PACKAGE-TABLE-CELL",
      "EXECUTOR-RAW-SECRET",
      "model-made-id",
      "the-model",
      "proj-model",
      "MODEL-SKU",
      "REPL-9000",
      "catalogLookup",
      "listPriceUsd",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("assigns RFP-COMP ids in baseline order regardless of executor row order", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        { requirementId: REQ_3, response: "third" },
        { requirementId: REQ_1, response: "first" },
        { requirementId: REQ_2, response: "second" },
      ],
    }));

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.rows.map((row) => [row.id, row.requirementId, row.response])).toEqual([
      ["RFP-COMP-001", REQ_1, "first"],
      ["RFP-COMP-002", REQ_2, "second"],
      ["RFP-COMP-003", REQ_3, "third"],
    ]);
  });

  it("trims and deduplicates cited evidence and configuration ids into locator-only references", async () => {
    const executor = vi.fn(async () => ({
      rows: [
        {
          requirementId: REQ_1,
          response: "Compliant.",
          evidenceIds: [`  ${EV_TEXT}  `, EV_TEXT, EV_TABLE],
          configurationLineIds: [`  ${CFG_LINE_1}  `, CFG_LINE_1, CFG_LINE_2],
        },
        { requirementId: REQ_2, response: "Reviewing." },
        { requirementId: REQ_3, response: "Out of scope." },
      ],
    }));

    const result = await draftConfig({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.configurationExpansionArtifactId).toBe(CONFIG_ARTIFACT);
    expect(result.sourceArtifactIds).toEqual([
      BASELINE_ARTIFACT,
      EVIDENCE_PACKAGE,
      CONFIG_ARTIFACT,
    ]);
    expect(result.rows[0].evidenceReferences).toEqual([LOC_EV_TEXT, LOC_EV_TABLE]);
    expect(result.rows[0].configurationReferences).toEqual([REF_CFG_1, REF_CFG_2]);
    // Fallback rows carry their baseline references and no configurationReferences.
    expect(result.rows[1].evidenceReferences).toEqual([baselineTextRef(EV_TEXT_B, 2)]);
    expect(result.rows[1]).not.toHaveProperty("configurationReferences");
    const serialized = JSON.stringify(result);
    for (const leak of ["rule-secret", "CONFIG-EVIDENCE-SECRET", "unitPrice", "REPL-9000", "quantity"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("returns copies: mutating the result alters neither stored artifacts nor executor output", async () => {
    const baselineSnapshot = structuredClone(baselineArtifact);
    const configSnapshot = structuredClone(configArtifact);
    const executorOutput = {
      rows: [
        { requirementId: REQ_1, response: "a", configurationLineIds: [CFG_LINE_1] },
        { requirementId: REQ_2, response: "b" },
        { requirementId: REQ_3, response: "c" },
      ],
    };
    const outputSnapshot = structuredClone(executorOutput);
    const executor = vi.fn(async () => executorOutput);

    const result = await draftConfig({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    result.rows[0].response = "hacked";
    result.rows[0].evidenceReferences.push(baselineTableRef("hacked"));
    result.rows[0].configurationReferences?.push(REF_CFG_2);
    result.rows.push(EXPECTED_ROWS[0] as never);
    result.sourceFileIds.push("hacked-file");
    result.sourceArtifactIds.push("hacked-artifact");
    result.project.name = "hacked-project";

    expect(executorOutput).toEqual(outputSnapshot);
    expect(baselineArtifact).toEqual(baselineSnapshot);
    expect(configArtifact).toEqual(configSnapshot);
  });

  it("loads the project once and each artifact once, in order", async () => {
    await draftConfig();

    expect(mockGetProject).toHaveBeenCalledTimes(1);
    expect(mockGetArtifact.mock.calls).toEqual([
      [TENANT, PROJECT, BASELINE_ARTIFACT],
      [TENANT, PROJECT, EVIDENCE_PACKAGE],
      [TENANT, PROJECT, CONFIG_ARTIFACT],
    ]);
  });

  it("snapshots new baseline category literals into needs_review rows", async () => {
    artifactById.set(
      BASELINE_ARTIFACT,
      makeBaselineArtifact({
        payload: makeBaselinePayload({
          requirements: [
            {
              id: REQ_1,
              text: REQ_1_TEXT,
              category: "boq_product",
              priority: "mandatory",
              evidenceReferences: [baselineTableRef(EV_TABLE)],
            },
            {
              id: REQ_2,
              text: REQ_2_TEXT,
              category: "warranty_support",
              priority: "preferred",
              evidenceReferences: [baselineTextRef(EV_TEXT_B, 2)],
            },
            {
              id: REQ_3,
              text: REQ_3_TEXT,
              category: "training_totk",
              priority: "optional",
              evidenceReferences: [baselineTextRef(EV_TEXT, 1)],
            },
          ],
        }),
      })
    );
    // The executor even tries to force a non-review status; the contract ignores it.
    const executor = vi.fn(async () => ({
      rows: [
        { requirementId: REQ_1, response: "Compliant.", complianceStatus: "compliant" },
        { requirementId: REQ_2, response: "Reviewing." },
        { requirementId: REQ_3, response: "Planned." },
      ],
    }));

    const result = await draft({ executor });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(
      result.rows.map((row) => [row.requirementId, row.category, row.complianceStatus])
    ).toEqual([
      [REQ_1, "boq_product", "needs_review"],
      [REQ_2, "warranty_support", "needs_review"],
      [REQ_3, "training_totk", "needs_review"],
    ]);
  });
});

describe("store failures bubble unhidden", () => {
  it("bubbles a project read failure", async () => {
    mockGetProject.mockRejectedValue(new Error("project read failed"));

    await expect(draft()).rejects.toThrow("project read failed");
  });

  it("bubbles an artifact read failure and never calls the executor", async () => {
    mockGetArtifact.mockRejectedValue(new Error("artifact read failed"));
    const executor = makeValidExecutor();

    await expect(draft({ executor })).rejects.toThrow("artifact read failed");
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-drafting.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-drafting.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the two read stores and the two type-only contracts", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-compliance-matrix",
    ]);
  });

  it("imports the canonical shapes and compliance-matrix contract as types only", () => {
    expect(source).toMatch(/import type \{[^}]*\} from "@\/types\/project";/);
    expect(source).toMatch(
      /import type \{[^}]*\} from "@\/lib\/projects\/project-rfp-compliance-matrix";/
    );
    expect(
      (source.match(/from "@\/lib\/projects\/project-rfp-compliance-matrix"/g) ?? [])
        .length
    ).toBe(1);
  });

  it("documents the deterministic RFP-COMP row-id convention", () => {
    expect(source).toContain("RFP-COMP-001");
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

  it("imports no evidence store, AI, pricing, catalog, SKU/config decision, route, UI, export, or raw-file module", () => {
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
      'from "@/lib/projects/project-rfp-requirements-baseline"',
      'from "@/lib/projects/project-rfp-requirements-candidate-drafting"',
      'from "@/lib/projects/project-rfp-extraction',
      'from "@/lib/projects/project-rfp-evidence',
      'from "@/lib/projects/project-rfp-config-expansion',
      'from "@/lib/projects/project-rfp-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/project-boq',
      'from "@/lib/projects/project-quick-bom',
      'from "@/lib/projects/quick-bom',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/artifacts"',
      'from "@/lib/projects/stages"',
      'from "@/lib/projects/staleness"',
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
      "openai",
      "@google/generative-ai",
      "generateText",
      "generateObject",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
      "storagePath",
      "process.env",
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
