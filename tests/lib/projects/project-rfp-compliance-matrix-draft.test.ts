import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";
import type {
  RfpComplianceMatrixPayload,
  RfpComplianceMatrixRow,
} from "@/lib/projects/project-rfp-compliance-matrix";

const { mockGetProject, mockGetArtifact, mockCreateArtifact } = vi.hoisted(
  () => ({
    mockGetProject: vi.fn(),
    mockGetArtifact: vi.fn(),
    mockCreateArtifact: vi.fn(),
  })
);

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifact,
  createProjectArtifactVersion: mockCreateArtifact,
}));

import {
  createRfpComplianceMatrixDraft,
  type CreateRfpComplianceMatrixDraftInput,
} from "@/lib/projects/project-rfp-compliance-matrix-draft";

const TEXT_KIND = "rfp_document_text_chunk" as const;
const TABLE_KIND = "rfp_document_table" as const;

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const BASELINE_ARTIFACT = "art-requirements-baseline-1";
const EVIDENCE_PACKAGE = "art-evidence-package-1";
const CONFIG_ARTIFACT = "art-config-expansion-1";
const INPUT_PACKAGE = "art-input-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const EV_TEXT = "evidence-text-1";
const EV_TABLE = "evidence-table-1";
const EV_TEXT_B = "evidence-text-2";
const REQ_1 = "RFP-REQ-001";
const REQ_2 = "RFP-REQ-002";
const REQ_3 = "RFP-REQ-003";
const CFG_LINE_1 = "cfg-line-1";
const CFG_LINE_2 = "cfg-line-2";
const CREATED_BY = "engineer@stc.example";
const STORED_ARTIFACT = "art-compliance-matrix-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

function baselineTextRef(evidenceId: string, chunkIndex: number) {
  return {
    evidenceId,
    sourceFileId: FILE_RFP,
    evidenceKind: TEXT_KIND,
    inputPackageArtifactId: INPUT_PACKAGE,
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
    inputPackageArtifactId: INPUT_PACKAGE,
    tableId: `${FILE_BOQ}:table:1`,
    pageNumber: 4,
    sheetName: "BoQ Sheet",
    rowCount: 12,
    columnCount: 5,
  };
}

function packageTextEntry(
  evidenceId: string,
  chunkIndex: number,
  charCount: number,
  text: string
) {
  return {
    evidenceId,
    evidenceKind: TEXT_KIND,
    sourceFileId: FILE_RFP,
    inputPackageArtifactId: INPUT_PACKAGE,
    sourceFileName: "rfp.pdf",
    sourceFileRole: "rfp",
    chunkIndex,
    chunkCount: 2,
    charCount,
    text,
    rows: [["RAW-TEXT-ROW"]],
    storagePath: "C:/secret-store/package-text.json",
    tenantId: TENANT,
    unitPrice: 1234,
  };
}

function packageTableEntry() {
  return {
    evidenceId: EV_TABLE,
    evidenceKind: TABLE_KIND,
    sourceFileId: FILE_BOQ,
    inputPackageArtifactId: INPUT_PACKAGE,
    sourceFileName: "boq.xlsx",
    sourceFileRole: "boq",
    tableId: `${FILE_BOQ}:table:1`,
    sheetName: "BoQ Sheet",
    pageNumber: 4,
    rowCount: 2,
    columnCount: 2,
    rows: [
      ["PACKAGE-TABLE-CELL-A1", "1"],
      ["PACKAGE-TABLE-CELL-A2", "2"],
    ],
    storagePath: "C:/secret-store/package-table.json",
    sku: "SECRET-EV-SKU",
  };
}

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
    sourceRuleId: "rule-secret",
    evidence: [{ note: "CONFIG-EVIDENCE-SECRET" }],
    unitPrice: 1234.5,
    listPrice: 2000,
    margin: 0.3,
    discount: 0.1,
    currency: "SAR",
    replacementSku: "REPL-9000",
    catalogLookup: { listPriceUsd: 1 },
  };
}

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
    originalCells: { A: "10", B: "C9300X-48HX" },
  };
}

function makeBaselinePayload(overrides: Record<string, unknown> = {}) {
  return {
    payloadKind: "rfp_requirements_baseline",
    createdBy: CREATED_BY,
    createdAt: TS1.toISOString(),
    requirements: [
      {
        id: REQ_1,
        text: "Provide 48-port PoE access switches for all IDFs.",
        category: "technical",
        priority: "mandatory",
        evidenceReferences: [baselineTextRef(EV_TEXT, 1), baselineTableRef(EV_TABLE)],
      },
      {
        id: REQ_2,
        text: "Submit a bid bond with the commercial offer.",
        category: "commercial",
        priority: "mandatory",
        evidenceReferences: [baselineTextRef(EV_TEXT_B, 2)],
      },
      {
        id: REQ_3,
        text: "Optional managed services add-on.",
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
    createdAt: TS1.toISOString(),
    inputPackageArtifactId: INPUT_PACKAGE,
    evidence: [
      packageTextEntry(
        EV_TEXT,
        1,
        54,
        "PACKAGE-TEXT: supply access switching for all IDFs."
      ),
      packageTableEntry(),
      packageTextEntry(EV_TEXT_B, 2, 40, "PACKAGE-TEXT: bid bond required."),
    ],
    storagePath: "C:/secret-store/package.json",
    internalScratch: "PACKAGE-ARBITRARY-CONTENT",
    ...overrides,
  };
}

function makeConfigPayload(overrides: Record<string, unknown> = {}) {
  return {
    sourceNormalizedBoqArtifactId: "art-normalized-boq-1",
    sourceSkuResolutionArtifactId: "art-sku-resolution-1",
    sourceFileIds: [FILE_BOQ],
    acceptedLines: [configExpansionLine(), configCustomerLine()],
    rejectedLines: [],
    reviewedBy: CREATED_BY,
    reviewedAt: TS1.toISOString(),
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

function makeBaselineArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: BASELINE_ARTIFACT,
    projectId: PROJECT,
    stageId: "requirements_baseline_review",
    type: "requirements_baseline",
    status: "approved",
    version: 2,
    payload: makeBaselinePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PACKAGE],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeEvidencePackageArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: EVIDENCE_PACKAGE,
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "evidence_package",
    status: "approved",
    version: 3,
    payload: makeEvidencePackagePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [INPUT_PACKAGE],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeConfigArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: CONFIG_ARTIFACT,
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "approved",
    version: 4,
    payload: makeConfigPayload(),
    sourceFileIds: [FILE_BOQ],
    sourceArtifactIds: ["art-normalized-boq-1", "art-sku-resolution-1"],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeRows(): RfpComplianceMatrixRow[] {
  return [
    {
      id: "RFP-COMP-001",
      requirementId: REQ_1,
      requirementText: "MODEL-SUPPLIED-TEXT",
      category: "other",
      priority: "unknown",
      complianceStatus: "needs_review",
      response: "  Offered switch meets the stated port requirement.  ",
      rationale: "  Datasheet confirms 48 PoE ports.  ",
      notes: "  Reviewed by solution engineering.  ",
      evidenceReferences: [
        { evidenceId: `  ${EV_TEXT}  ` } as never,
        { evidenceId: EV_TEXT } as never,
        { evidenceId: EV_TABLE } as never,
      ],
      configurationReferences: [
        { lineId: `  ${CFG_LINE_1}  ` } as never,
        { lineId: CFG_LINE_1 } as never,
        { lineId: CFG_LINE_2 } as never,
      ],
    },
    {
      id: "RFP-COMP-002",
      requirementId: REQ_2,
      requirementText: "MODEL-SUPPLIED-TEXT-2",
      category: "other",
      priority: "unknown",
      complianceStatus: "needs_review",
      response: "Bid bond handling is under review with finance.",
      evidenceReferences: [{ evidenceId: EV_TEXT_B } as never],
    },
    {
      id: "RFP-COMP-003",
      requirementId: REQ_3,
      requirementText: "MODEL-SUPPLIED-TEXT-3",
      category: "other",
      priority: "unknown",
      complianceStatus: "needs_review",
      response: "Not part of this bid scope.",
      evidenceReferences: [],
    },
  ];
}

function draftInput(
  overrides: Partial<CreateRfpComplianceMatrixDraftInput> = {}
): CreateRfpComplianceMatrixDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT,
    sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE,
    sourceConfigurationExpansionArtifactId: CONFIG_ARTIFACT,
    rows: makeRows(),
    ...overrides,
  };
}

function storedArtifactFromCreate(
  input: Parameters<typeof mockCreateArtifact>[0]
): ProjectArtifact {
  return {
    id: STORED_ARTIFACT,
    projectId: input.projectId,
    stageId: input.stageId,
    type: input.type,
    status: input.status,
    version: 1,
    payload: input.payload,
    sourceFileIds: input.sourceFileIds,
    sourceArtifactIds: input.sourceArtifactIds,
    createdAt: TS1,
    updatedAt: TS2,
  };
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
  mockGetArtifact.mockReset().mockImplementation(
    async (_tenantId: string, _projectId: string, artifactId: string) =>
      artifactById.get(artifactId) ?? null
  );
  mockCreateArtifact.mockReset().mockImplementation(async (input) =>
    storedArtifactFromCreate(input)
  );
});

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockCreateArtifact).not.toHaveBeenCalled();
}

describe("validation before store calls", () => {
  it("throws on blank required identifiers and missing rows", async () => {
    const invalidInputs: Array<
      [Partial<CreateRfpComplianceMatrixDraftInput>, string]
    > = [
      [{ projectId: "" }, "projectId is required."],
      [{ projectId: "   " }, "projectId is required."],
      [{ createdBy: "" }, "createdBy is required."],
      [{ sourceRequirementsBaselineArtifactId: "" }, "sourceRequirementsBaselineArtifactId is required."],
      [{ sourceEvidencePackageArtifactId: "" }, "sourceEvidencePackageArtifactId is required."],
      [{ sourceConfigurationExpansionArtifactId: "" }, "sourceConfigurationExpansionArtifactId is required."],
      [{ rows: [] }, "At least one compliance-matrix row is required."],
    ];

    for (const [override, message] of invalidInputs) {
      await expect(
        createRfpComplianceMatrixDraft(draftInput(override))
      ).rejects.toThrow(message);
    }

    expectNoStoreCalls();
  });

  it("trims artifact ids and createdBy before reading and persisting", async () => {
    const result = await createRfpComplianceMatrixDraft(
      draftInput({
        createdBy: `  ${CREATED_BY}  `,
        sourceRequirementsBaselineArtifactId: `  ${BASELINE_ARTIFACT}  `,
        sourceEvidencePackageArtifactId: `  ${EVIDENCE_PACKAGE}  `,
        sourceConfigurationExpansionArtifactId: `  ${CONFIG_ARTIFACT}  `,
      })
    );

    expect(result.status).toBe("ok");
    expect(mockGetArtifact.mock.calls).toEqual([
      [TENANT, PROJECT, BASELINE_ARTIFACT],
      [TENANT, PROJECT, EVIDENCE_PACKAGE],
      [TENANT, PROJECT, CONFIG_ARTIFACT],
    ]);
    const createArg = mockCreateArtifact.mock.calls[0][0];
    expect(createArg.payload.createdBy).toBe(CREATED_BY);
    expect(createArg.payload.sourceArtifactIds).toEqual([
      BASELINE_ARTIFACT,
      EVIDENCE_PACKAGE,
      CONFIG_ARTIFACT,
    ]);
  });
});

describe("project and upstream artifact gates", () => {
  it("returns not_found or wrong_mode before reading artifacts or creating", async () => {
    mockGetProject.mockResolvedValueOnce(null);
    expect(await createRfpComplianceMatrixDraft(draftInput())).toEqual({
      status: "not_found",
    });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    mockGetProject.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    const wrongMode = await createRfpComplianceMatrixDraft(draftInput());
    expect(wrongMode.status).toBe("wrong_mode");
    expect(JSON.stringify(wrongMode)).not.toContain(TENANT);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns baseline gate failures without creating an artifact", async () => {
    artifactById.delete(BASELINE_ARTIFACT);
    expect(await createRfpComplianceMatrixDraft(draftInput())).toEqual({
      status: "requirements_baseline_not_found",
    });

    artifactById.set(BASELINE_ARTIFACT, makeBaselineArtifact({ type: "evidence_package" }));
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "artifact_not_requirements_baseline"
    );

    artifactById.set(BASELINE_ARTIFACT, makeBaselineArtifact({ status: "needs_review" }));
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "requirements_baseline_not_approved"
    );

    artifactById.set(
      BASELINE_ARTIFACT,
      makeBaselineArtifact({ payload: makeBaselinePayload({ payloadKind: "wrong" }) })
    );
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "invalid_requirements_baseline_payload"
    );
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns evidence-package gate failures without creating an artifact", async () => {
    artifactById.delete(EVIDENCE_PACKAGE);
    expect(await createRfpComplianceMatrixDraft(draftInput())).toEqual({
      status: "evidence_package_not_found",
    });

    artifactById.set(EVIDENCE_PACKAGE, makeEvidencePackageArtifact({ type: "requirements_baseline" }));
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "artifact_not_evidence_package"
    );

    artifactById.set(EVIDENCE_PACKAGE, makeEvidencePackageArtifact({ status: "generated" }));
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "evidence_package_not_approved"
    );

    artifactById.set(
      EVIDENCE_PACKAGE,
      makeEvidencePackageArtifact({
        payload: makeEvidencePackagePayload({ evidence: [{ evidenceId: EV_TEXT }] }),
      })
    );
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "invalid_evidence_package_payload"
    );
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns configuration-expansion gate failures without creating an artifact", async () => {
    artifactById.delete(CONFIG_ARTIFACT);
    expect(await createRfpComplianceMatrixDraft(draftInput())).toEqual({
      status: "configuration_expansion_not_found",
    });

    artifactById.set(CONFIG_ARTIFACT, makeConfigArtifact({ type: "priced_boq" }));
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "artifact_not_configuration_expansion"
    );

    artifactById.set(CONFIG_ARTIFACT, makeConfigArtifact({ status: "generated" }));
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "configuration_expansion_not_approved"
    );

    artifactById.set(
      CONFIG_ARTIFACT,
      makeConfigArtifact({
        payload: makeConfigPayload({ payloadKind: "configuration_expansion_draft" }),
      })
    );
    expect((await createRfpComplianceMatrixDraft(draftInput())).status).toBe(
      "invalid_configuration_expansion_payload"
    );
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("row validation", () => {
  it("collects deterministic row errors and creates nothing", async () => {
    const result = await createRfpComplianceMatrixDraft(
      draftInput({
        rows: [
          42 as unknown as RfpComplianceMatrixRow,
          {
            ...makeRows()[1],
            id: "bad-id",
            requirementId: REQ_1,
            complianceStatus: "compliant",
            response: "   ",
            evidenceReferences: [
              {} as never,
              { evidenceId: "ghost-evidence" } as never,
            ],
            configurationReferences: [{ lineId: "ghost-line" } as never],
          },
          {
            ...makeRows()[2],
            requirementId: "ghost-req",
            evidenceReferences: "not-array" as never,
          },
          makeRows()[0],
        ],
      })
    );

    expect(result).toEqual({
      status: "invalid_compliance_matrix_rows",
      errors: [
        "rows[0] must be an object.",
        "rows[1].id must be RFP-COMP-002.",
        `rows[1] is out of order: expected ${REQ_2} but found ${REQ_1}.`,
        "rows[1].complianceStatus must be needs_review.",
        "rows[1].response is required.",
        "rows[1].evidenceReferences[0] must cite an evidence ID.",
        "rows[1].evidenceReferences[1] cites unknown evidence ID: ghost-evidence.",
        "rows[1].configurationReferences[0] cites unknown configuration line ID: ghost-line.",
        "rows[2] references an unknown requirement ID: ghost-req.",
        "rows[2].evidenceReferences must be an array.",
        "rows[3] has no corresponding baseline requirement.",
      ],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("rejects configuration references when no config artifact was supplied", async () => {
    const result = await createRfpComplianceMatrixDraft(
      draftInput({ sourceConfigurationExpansionArtifactId: undefined })
    );

    expect(result).toEqual({
      status: "invalid_compliance_matrix_rows",
      errors: [
        "rows[0] cites configuration references but no configuration_expansion artifact was supplied.",
      ],
    });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("creates one needs_review compliance_matrix artifact from approved sources", async () => {
    const result = await createRfpComplianceMatrixDraft(draftInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);

    const createArg = mockCreateArtifact.mock.calls[0][0];
    expect(createArg).toMatchObject({
      tenantId: TENANT,
      projectId: PROJECT,
      stageId: "compliance_matrix_review",
      type: "compliance_matrix",
      status: "needs_review",
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [
        BASELINE_ARTIFACT,
        EVIDENCE_PACKAGE,
        CONFIG_ARTIFACT,
      ],
    });

    const payload = createArg.payload as RfpComplianceMatrixPayload;
    expect(payload.payloadKind).toBe("rfp_compliance_matrix");
    expect(payload.sourceRequirementsBaselineArtifactId).toBe(BASELINE_ARTIFACT);
    expect(payload.sourceEvidencePackageArtifactId).toBe(EVIDENCE_PACKAGE);
    expect(payload.sourceConfigurationExpansionArtifactId).toBe(CONFIG_ARTIFACT);
    expect(payload.createdBy).toBe(CREATED_BY);
    expect(payload.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(payload.sourceArtifactIds).toEqual([
      BASELINE_ARTIFACT,
      EVIDENCE_PACKAGE,
      CONFIG_ARTIFACT,
    ]);
    expect(payload.rows.map((row) => row.id)).toEqual([
      "RFP-COMP-001",
      "RFP-COMP-002",
      "RFP-COMP-003",
    ]);
    expect(payload.rows[0]).toMatchObject({
      requirementId: REQ_1,
      requirementText: "Provide 48-port PoE access switches for all IDFs.",
      category: "technical",
      priority: "mandatory",
      complianceStatus: "needs_review",
      response: "Offered switch meets the stated port requirement.",
      rationale: "Datasheet confirms 48 PoE ports.",
      notes: "Reviewed by solution engineering.",
    });
    expect(payload.rows[0].evidenceReferences).toEqual([
      {
        evidenceId: EV_TEXT,
        sourceFileId: FILE_RFP,
        evidenceKind: TEXT_KIND,
        inputPackageArtifactId: INPUT_PACKAGE,
        chunkIndex: 1,
        chunkCount: 2,
        charCount: 54,
      },
      {
        evidenceId: EV_TABLE,
        sourceFileId: FILE_BOQ,
        evidenceKind: TABLE_KIND,
        inputPackageArtifactId: INPUT_PACKAGE,
        tableId: `${FILE_BOQ}:table:1`,
        pageNumber: 4,
        sheetName: "BoQ Sheet",
        rowCount: 2,
        columnCount: 2,
      },
    ]);
    expect(payload.rows[0].configurationReferences).toEqual([
      {
        configurationExpansionArtifactId: CONFIG_ARTIFACT,
        lineId: CFG_LINE_1,
        origin: "expansion",
        sku: "C9300-NM-8X",
        description: "8x10G network module",
        parentLineId: CFG_LINE_2,
        parentLineNumber: "10",
        sourceFileId: FILE_BOQ,
        sourceRowNumber: 11,
        originalLineNumber: "10",
      },
      {
        configurationExpansionArtifactId: CONFIG_ARTIFACT,
        lineId: CFG_LINE_2,
        origin: "customer",
        sku: "C9300X-48HX",
        description: "48-port PoE switch",
        sourceFileId: FILE_BOQ,
        sourceRowNumber: 10,
        originalLineNumber: "10",
      },
    ]);
    expect(result.payloadSummary).toEqual({
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: BASELINE_ARTIFACT,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE,
      sourceConfigurationExpansionArtifactId: CONFIG_ARTIFACT,
      createdBy: CREATED_BY,
      createdAt: payload.createdAt,
      rowCount: 3,
      rowIds: ["RFP-COMP-001", "RFP-COMP-002", "RFP-COMP-003"],
      requirementIds: [REQ_1, REQ_2, REQ_3],
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [
        BASELINE_ARTIFACT,
        EVIDENCE_PACKAGE,
        CONFIG_ARTIFACT,
      ],
      statusCounts: {
        compliant: 0,
        partially_compliant: 0,
        non_compliant: 0,
        not_applicable: 0,
        needs_review: 3,
      },
    });
  });

  it("leaks no raw evidence, table rows, tenant id, pricing, or config authority", async () => {
    const result = await createRfpComplianceMatrixDraft(draftInput());
    expect(result.status).toBe("ok");

    const createArg = mockCreateArtifact.mock.calls[0][0];
    const serialized = `${JSON.stringify(createArg.payload)}${JSON.stringify(result)}`;
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "secret-store",
      "PACKAGE-TEXT",
      "PACKAGE-TABLE-CELL",
      "RAW-TEXT-ROW",
      "SECRET-EV-SKU",
      "rule-secret",
      "CONFIG-EVIDENCE-SECRET",
      "unitPrice",
      "listPrice",
      "margin",
      "discount",
      "currency",
      "REPL-9000",
      "catalogLookup",
      "quantity",
      "MODEL-SUPPLIED-TEXT",
    ]) {
      expect(serialized).not.toContain(leak);
    }
    expect(JSON.stringify(result)).not.toContain("rows");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("returns copies that do not mutate the persisted payload or loaded artifacts", async () => {
    const baselineSnapshot = structuredClone(baselineArtifact);
    const evidenceSnapshot = structuredClone(evidencePackageArtifact);
    const configSnapshot = structuredClone(configArtifact);

    const result = await createRfpComplianceMatrixDraft(draftInput());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    const createArg = mockCreateArtifact.mock.calls[0][0];
    const payload = createArg.payload as RfpComplianceMatrixPayload;
    result.payloadSummary.sourceFileIds.push("hacked-file");
    result.payloadSummary.sourceArtifactIds.push("hacked-artifact");
    result.payloadSummary.rowIds.push("hacked-row");
    result.artifact.sourceFileIds.push("hacked-artifact-file");

    expect(payload.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(payload.sourceArtifactIds).toEqual([
      BASELINE_ARTIFACT,
      EVIDENCE_PACKAGE,
      CONFIG_ARTIFACT,
    ]);
    expect(payload.rows.map((row) => row.id)).toEqual([
      "RFP-COMP-001",
      "RFP-COMP-002",
      "RFP-COMP-003",
    ]);
    expect(baselineArtifact).toEqual(baselineSnapshot);
    expect(evidencePackageArtifact).toEqual(evidenceSnapshot);
    expect(configArtifact).toEqual(configSnapshot);
  });
});

describe("store failures bubble", () => {
  it("bubbles project, artifact, and create failures", async () => {
    mockGetProject.mockRejectedValueOnce(new Error("project read failed"));
    await expect(createRfpComplianceMatrixDraft(draftInput())).rejects.toThrow(
      "project read failed"
    );

    mockGetArtifact.mockRejectedValueOnce(new Error("artifact read failed"));
    await expect(createRfpComplianceMatrixDraft(draftInput())).rejects.toThrow(
      "artifact read failed"
    );

    mockCreateArtifact.mockRejectedValueOnce(new Error("create failed"));
    await expect(createRfpComplianceMatrixDraft(draftInput())).rejects.toThrow(
      "create failed"
    );
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-draft.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-draft.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the project store, artifact store, project types, and compliance contract", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-compliance-matrix",
    ]);
  });

  it("uses exactly one createProjectArtifactVersion boundary and no other write boundary", () => {
    expect(source.match(/\bcreateProjectArtifactVersion\b/g)).toHaveLength(2);
    for (const forbidden of [
      "updateProject",
      "deleteProject",
      "createProjectApproval",
      "approveProject",
      "withTenantDb",
      "insert(",
      "update(",
      "delete(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("imports no evidence store, AI/provider, pricing, catalog, SKU decision, route, UI, export, or raw-file module", () => {
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
      'from "@/lib/projects/project-rfp-extraction',
      'from "@/lib/projects/project-rfp-evidence',
      'from "@/lib/projects/project-rfp-config-expansion',
      'from "@/lib/projects/project-rfp-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/project-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/mantle',
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
      "process.env",
      "fetch(",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
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
