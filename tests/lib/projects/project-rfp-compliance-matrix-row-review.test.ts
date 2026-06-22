import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
  type RfpComplianceMatrixPayload,
  type RfpComplianceMatrixRow,
  type RfpComplianceMatrixEvidenceReference,
  type RfpComplianceMatrixConfigurationReference,
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

import * as serviceModule from "@/lib/projects/project-rfp-compliance-matrix-row-review";
import {
  reviewRfpComplianceMatrixRows,
  type ReviewRfpComplianceMatrixRowsInput,
  type ReviewRfpComplianceMatrixRowsResult,
  type RfpComplianceMatrixReviewedPayload,
  type RfpComplianceMatrixRowEditedFieldsInput,
} from "@/lib/projects/project-rfp-compliance-matrix-row-review";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const SOURCE_MATRIX = "art-compliance-matrix-1";
const CREATED_MATRIX = "art-compliance-matrix-2";
const BASELINE = "art-requirements-baseline-1";
const EVIDENCE_PACKAGE = "art-evidence-package-1";
const CONFIG_EXPANSION = "art-config-expansion-1";
const INPUT_PACKAGE = "art-input-package-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const REVIEWED_BY = "lead-engineer@stc.example";
const CREATED_BY = "draft-author@stc.example";
const CREATED_AT = "2026-06-10T09:30:00.000Z";
const REVIEWED_AT = new Date("2026-06-14T09:00:00.000Z");
const TS1 = new Date("2026-06-10T09:30:00.000Z");
const TS2 = new Date("2026-06-12T10:15:00.000Z");
const STORED_AT = new Date("2026-06-14T09:05:00.000Z");
const VERSION = 2;

const TEXT_KIND = "rfp_document_text_chunk" as const;

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

function textRef(
  evidenceId = "evidence-text-1",
  chunkIndex = 1
): RfpComplianceMatrixEvidenceReference {
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

function configRef(
  overrides: Partial<RfpComplianceMatrixConfigurationReference> = {}
): RfpComplianceMatrixConfigurationReference {
  return {
    configurationExpansionArtifactId: CONFIG_EXPANSION,
    lineId: "cfg-line-1",
    origin: "expansion",
    sku: "C9300-NM-8X",
    description: "8x10G network module",
    sourceFileId: FILE_BOQ,
    sourceRowNumber: 11,
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

function makeRow(
  id: string,
  requirementId: string,
  overrides: Partial<RfpComplianceMatrixRow> = {}
): RfpComplianceMatrixRow {
  return {
    id,
    requirementId,
    requirementText: `Requirement text for ${requirementId}.`,
    category: "technical",
    priority: "mandatory",
    complianceStatus: "needs_review",
    response: `Draft response for ${id}.`,
    evidenceReferences: [textRef(`evidence-${id}`)],
    ...overrides,
  };
}

function makePayload(
  overrides: Partial<RfpComplianceMatrixPayload> = {}
): RfpComplianceMatrixPayload {
  const rows =
    overrides.rows ?? [
      makeRow("RFP-COMP-001", "RFP-REQ-001"),
      makeRow("RFP-COMP-002", "RFP-REQ-002"),
      makeRow("RFP-COMP-003", "RFP-REQ-003"),
    ];
  return {
    payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
    sourceRequirementsBaselineArtifactId: BASELINE,
    sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE,
    sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION,
    createdBy: CREATED_BY,
    createdAt: CREATED_AT,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG_EXPANSION],
    rows,
    ...overrides,
  };
}

function makeComplianceMatrixArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: SOURCE_MATRIX,
    projectId: PROJECT,
    stageId: "compliance_matrix_review",
    type: "compliance_matrix",
    status: "needs_review",
    version: VERSION,
    payload: makePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG_EXPANSION],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeStoredArtifact(call: CreateArtifactCall): ProjectArtifact {
  return {
    id: CREATED_MATRIX,
    projectId: call.projectId,
    stageId: call.stageId,
    type: call.type,
    status: call.status ?? "generated",
    version: VERSION + 1,
    payload: call.payload ?? {},
    sourceFileIds: (call.sourceFileIds ?? []).slice(),
    sourceArtifactIds: (call.sourceArtifactIds ?? []).slice(),
    createdAt: STORED_AT,
    updatedAt: STORED_AT,
  };
}

function review(
  overrides: Partial<ReviewRfpComplianceMatrixRowsInput> = {}
): Promise<ReviewRfpComplianceMatrixRowsResult> {
  return reviewRfpComplianceMatrixRows({
    tenantId: TENANT,
    projectId: PROJECT,
    complianceMatrixArtifactId: SOURCE_MATRIX,
    reviewedBy: REVIEWED_BY,
    reviewedAt: REVIEWED_AT,
    decisions: [
      {
        rowId: "RFP-COMP-001",
        action: "edit",
        editedFields: { response: "Updated response." },
      },
    ],
    ...overrides,
  });
}

function expectNoStoreCalls(): void {
  expect(mockGetProject).not.toHaveBeenCalled();
  expect(mockGetArtifact).not.toHaveBeenCalled();
  expect(mockCreateArtifact).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact.mockReset().mockResolvedValue(makeComplianceMatrixArtifact());
  mockCreateArtifact
    .mockReset()
    .mockImplementation(async (call: CreateArtifactCall) =>
      makeStoredArtifact(call)
    );
});

describe("reviewRfpComplianceMatrixRows - validation before store calls", () => {
  it("throws on blank ids, blank reviewer, invalid reviewedAt, and empty/non-array decisions", async () => {
    await expect(review({ projectId: "  " })).rejects.toThrow(
      "projectId is required."
    );
    await expect(
      review({ complianceMatrixArtifactId: " " })
    ).rejects.toThrow("complianceMatrixArtifactId is required.");
    await expect(review({ reviewedBy: " " })).rejects.toThrow(
      "reviewedBy is required."
    );
    await expect(
      review({ reviewedAt: new Date(Number.NaN) })
    ).rejects.toThrow("reviewedAt must be a valid Date.");
    await expect(review({ decisions: [] })).rejects.toThrow(
      "decisions must be a nonempty array."
    );
    await expect(
      review({
        decisions: "nope" as unknown as ReviewRfpComplianceMatrixRowsInput["decisions"],
      })
    ).rejects.toThrow("decisions must be a nonempty array.");
    expectNoStoreCalls();
  });

  it("throws deterministic decision shape errors before store calls", async () => {
    await expect(
      review({
        decisions: [
          42 as unknown as ReviewRfpComplianceMatrixRowsInput["decisions"][number],
        ],
      })
    ).rejects.toThrow("decisions[0] must be an object.");
    await expect(
      review({ decisions: [{ rowId: "  ", action: "edit" }] })
    ).rejects.toThrow("decisions[0].rowId is required.");
    await expect(
      review({
        decisions: [
          { rowId: "RFP-COMP-001", action: "approve" },
        ] as unknown as ReviewRfpComplianceMatrixRowsInput["decisions"],
      })
    ).rejects.toThrow(
      "decisions[0].action must be one of edit | mark_not_applicable | remove | restore."
    );
    expectNoStoreCalls();
  });
});

describe("reviewRfpComplianceMatrixRows - project and artifact gates", () => {
  it("returns not_found for a missing project and never loads the artifact", async () => {
    mockGetProject.mockResolvedValue(null);

    expect(await review()).toEqual({ status: "not_found" });
    expect(mockGetArtifact).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean project summary and no tenant", async () => {
    mockGetProject.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await review();

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
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("gates artifact existence, type/stage, status, and payload shape without persisting", async () => {
    mockGetArtifact.mockResolvedValueOnce(null);
    expect(await review()).toEqual({ status: "compliance_matrix_not_found" });

    mockGetArtifact.mockResolvedValueOnce(
      makeComplianceMatrixArtifact({ type: "evidence_package" })
    );
    expect((await review()).status).toBe("artifact_not_compliance_matrix");

    mockGetArtifact.mockResolvedValueOnce(
      makeComplianceMatrixArtifact({ stageId: "requirements_baseline_review" })
    );
    expect((await review()).status).toBe("artifact_not_compliance_matrix");

    mockGetArtifact.mockResolvedValueOnce(
      makeComplianceMatrixArtifact({ status: "approved" })
    );
    expect((await review()).status).toBe("compliance_matrix_not_reviewable");

    mockGetArtifact.mockResolvedValueOnce(
      makeComplianceMatrixArtifact({ payload: { payloadKind: "wrong" } })
    );
    expect((await review()).status).toBe("invalid_compliance_matrix_payload");

    mockGetArtifact.mockResolvedValueOnce(
      makeComplianceMatrixArtifact({
        payload: makePayload({ sourceRequirementsBaselineArtifactId: "  " }),
      })
    );
    expect((await review()).status).toBe("invalid_compliance_matrix_payload");

    mockGetArtifact.mockResolvedValueOnce(
      makeComplianceMatrixArtifact({
        payload: makePayload({
          rows: [
            {
              ...makeRow("RFP-COMP-001", "RFP-REQ-001"),
              complianceStatus: "unknown",
            } as unknown as RfpComplianceMatrixRow,
          ],
        }),
      })
    );
    expect((await review()).status).toBe("invalid_compliance_matrix_payload");

    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("reviewRfpComplianceMatrixRows - decision gates", () => {
  it("rejects duplicate, unknown, removed-target, restore-on-active, missing-reason, and invalid edits", async () => {
    let result = await review({
      decisions: [
        {
          rowId: "RFP-COMP-001",
          action: "edit",
          editedFields: { response: "A" },
        },
        { rowId: "RFP-COMP-001", action: "mark_not_applicable", reason: "dup" },
      ],
    });
    expect(result).toEqual({
      status: "duplicate_decision",
      rowIds: ["RFP-COMP-001"],
    });

    result = await review({
      decisions: [
        {
          rowId: "RFP-COMP-404",
          action: "edit",
          editedFields: { response: "A" },
        },
      ],
    });
    expect(result).toEqual({
      status: "decision_target_not_found",
      rowIds: ["RFP-COMP-404"],
    });

    mockGetArtifact.mockResolvedValueOnce(
      makeComplianceMatrixArtifact({
        payload: makePayload({
          rows: [
            makeRow("RFP-COMP-001", "RFP-REQ-001", {
              complianceStatus: "not_applicable",
              rowReviewStatus: "removed",
              removedReason: "Already removed.",
            }),
          ],
        }),
      })
    );
    result = await review({
      decisions: [
        { rowId: "RFP-COMP-001", action: "mark_not_applicable", reason: "x" },
      ],
    });
    expect(result).toEqual({
      status: "row_already_removed",
      rowIds: ["RFP-COMP-001"],
    });

    result = await review({
      decisions: [{ rowId: "RFP-COMP-001", action: "restore" }],
    });
    expect(result).toEqual({
      status: "row_not_removed",
      rowIds: ["RFP-COMP-001"],
    });

    result = await review({
      decisions: [
        { rowId: "RFP-COMP-001", action: "remove", reason: "  " },
        { rowId: "RFP-COMP-002", action: "mark_not_applicable" },
      ],
    });
    expect(result).toEqual({
      status: "reason_required",
      rowIds: ["RFP-COMP-001", "RFP-COMP-002"],
    });

    result = await review({
      decisions: [
        {
          rowId: "RFP-COMP-001",
          action: "edit",
          editedFields: { response: "   " },
        },
      ],
    });
    expect(result).toEqual({
      status: "invalid_edit",
      edits: [
        {
          rowId: "RFP-COMP-001",
          reason: "editedFields.response must be a nonblank string.",
        },
      ],
    });

    result = await review({
      decisions: [
        { rowId: "RFP-COMP-001", action: "edit", editedFields: {} },
      ],
    });
    expect(result.status).toBe("invalid_edit");

    result = await review({
      decisions: [
        {
          rowId: "RFP-COMP-001",
          action: "edit",
          editedFields: { complianceStatus: "not_applicable" },
        },
      ],
    });
    expect(result).toEqual({
      status: "invalid_edit",
      edits: [
        {
          rowId: "RFP-COMP-001",
          reason:
            "editedFields.complianceStatus must be one of compliant | partially_compliant | non_compliant | needs_review.",
        },
      ],
    });

    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

describe("reviewRfpComplianceMatrixRows - row review persistence", () => {
  it("creates one needs_review version with an edit, mark, remove, and restore", async () => {
    const priorRemovedEvent = {
      action: "removed" as const,
      at: "2026-06-11T08:00:00.000Z",
      by: "earlier-engineer@stc.example",
      note: "Removed earlier as superseded.",
    };
    const loaded = makeComplianceMatrixArtifact({
      payload: makePayload({
        rows: [
          makeRow("RFP-COMP-001", "RFP-REQ-001", {
            response: "Old response.",
            configurationReferences: [
              {
                ...configRef(),
                unitPrice: 9999,
                listPrice: 12000,
                currency: "SAR",
              } as unknown as RfpComplianceMatrixConfigurationReference,
            ],
          }),
          makeRow("RFP-COMP-002", "RFP-REQ-002"),
          makeRow("RFP-COMP-003", "RFP-REQ-003"),
          makeRow("RFP-COMP-004", "RFP-REQ-004", {
            complianceStatus: "not_applicable",
            rowReviewStatus: "removed",
            removedReason: "Removed earlier as superseded.",
            reviewHistory: [priorRemovedEvent],
          }),
        ],
      }),
    });
    mockGetArtifact.mockResolvedValue(loaded);

    const result = await review({
      decisions: [
        {
          rowId: "RFP-COMP-001",
          action: "edit",
          note: "Tightened the response wording.",
          editedFields: {
            response: "  Compliant; the offered switch meets the requirement.  ",
            complianceStatus: "compliant",
            responseLane: "technical",
            ownerLane: "security",
            hldImpact: "required",
            tpImpact: "potential",
            boqConfigImpact: "owner_review_required",
            requiresOwnerReview: true,
            rationale: "  Datasheet confirms the port count.  ",
            notes: "  Reviewed by the lead engineer.  ",
            sectionReference: "  RFP-SECTION-3.2.1  ",
            rowReviewStatus: "removed",
            removedReason: "should-not-store",
            reviewHistory: [{ action: "removed", at: "x", by: "y" }],
            id: "HACK-ID",
            requirementId: "HACK-REQ",
            evidenceReferences: [{ evidenceId: "HACK-EV" }],
            configurationReferences: [{ lineId: "HACK-CFG" }],
            unitPrice: 1234.5,
            acceptedSku: "SKU-HACK",
          } as unknown as RfpComplianceMatrixRowEditedFieldsInput,
        },
        {
          rowId: "RFP-COMP-002",
          action: "mark_not_applicable",
          reason: "  Out of scope per addendum 2.  ",
        },
        {
          rowId: "RFP-COMP-003",
          action: "remove",
          reason: "  Duplicate of RFP-COMP-001.  ",
        },
        {
          rowId: "RFP-COMP-004",
          action: "restore",
          note: "  Back in scope after the clarification.  ",
        },
      ],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const call = mockCreateArtifact.mock.calls[0][0] as CreateArtifactCall;
    expect(call).toMatchObject({
      tenantId: TENANT,
      projectId: PROJECT,
      stageId: "compliance_matrix_review",
      type: "compliance_matrix",
      status: "needs_review",
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [
        BASELINE,
        EVIDENCE_PACKAGE,
        CONFIG_EXPANSION,
        SOURCE_MATRIX,
      ],
    });

    const payload = call.payload as RfpComplianceMatrixReviewedPayload;
    expect(payload).toMatchObject({
      payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
      sourceRequirementsBaselineArtifactId: BASELINE,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION,
      createdBy: CREATED_BY,
      createdAt: CREATED_AT,
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
      reviewedDecisionCount: 4,
      activeRowCount: 3,
      removedRowCount: 1,
      sourceComplianceMatrixArtifactId: SOURCE_MATRIX,
      sourceComplianceMatrixArtifactVersion: VERSION,
    });

    const editedRow = payload.rows[0];
    expect(editedRow).toMatchObject({
      id: "RFP-COMP-001",
      requirementId: "RFP-REQ-001",
      response: "Compliant; the offered switch meets the requirement.",
      complianceStatus: "compliant",
      responseLane: "technical",
      ownerLane: "security",
      hldImpact: "required",
      tpImpact: "potential",
      boqConfigImpact: "owner_review_required",
      requiresOwnerReview: true,
      rationale: "Datasheet confirms the port count.",
      notes: "Reviewed by the lead engineer.",
      sectionReference: "RFP-SECTION-3.2.1",
    });
    expect(editedRow).not.toHaveProperty("rowReviewStatus");
    expect(editedRow).not.toHaveProperty("removedReason");
    expect(editedRow.reviewHistory).toHaveLength(1);
    expect(editedRow.reviewHistory?.at(-1)).toEqual({
      action: "status_changed",
      at: REVIEWED_AT.toISOString(),
      by: REVIEWED_BY,
      note: "Tightened the response wording.",
    });
    // The locator-only configuration reference survives; jammed pricing does not.
    expect(editedRow.configurationReferences?.[0]).toEqual({
      configurationExpansionArtifactId: CONFIG_EXPANSION,
      lineId: "cfg-line-1",
      origin: "expansion",
      sku: "C9300-NM-8X",
      description: "8x10G network module",
      sourceFileId: FILE_BOQ,
      sourceRowNumber: 11,
    });

    const markedRow = payload.rows[1];
    expect(markedRow).toMatchObject({
      complianceStatus: "not_applicable",
      notApplicableReason: "Out of scope per addendum 2.",
      rowReviewStatus: "reviewed",
    });
    expect(markedRow.reviewHistory?.at(-1)).toEqual({
      action: "marked_not_applicable",
      at: REVIEWED_AT.toISOString(),
      by: REVIEWED_BY,
      note: "Out of scope per addendum 2.",
    });

    const removedRow = payload.rows[2];
    expect(removedRow).toMatchObject({
      complianceStatus: "not_applicable",
      rowReviewStatus: "removed",
      removedReason: "Duplicate of RFP-COMP-001.",
    });
    expect(removedRow.reviewHistory?.at(-1)).toEqual({
      action: "removed",
      at: REVIEWED_AT.toISOString(),
      by: REVIEWED_BY,
      note: "Duplicate of RFP-COMP-001.",
    });

    const restoredRow = payload.rows[3];
    expect(restoredRow).toMatchObject({
      complianceStatus: "needs_review",
      rowReviewStatus: "pending",
    });
    expect(restoredRow).not.toHaveProperty("removedReason");
    expect(restoredRow.reviewHistory).toEqual([
      priorRemovedEvent,
      {
        action: "restored",
        at: REVIEWED_AT.toISOString(),
        by: REVIEWED_BY,
        note: "Back in scope after the clarification.",
      },
    ]);

    const serializedPayload = JSON.stringify(payload);
    for (const leak of [
      "HACK-ID",
      "HACK-REQ",
      "HACK-EV",
      "HACK-CFG",
      "unitPrice",
      "listPrice",
      "acceptedSku",
      "SKU-HACK",
      "should-not-store",
      "9999",
    ]) {
      expect(serializedPayload).not.toContain(leak);
    }

    expect(result.payloadSummary).toEqual({
      payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
      sourceRequirementsBaselineArtifactId: BASELINE,
      sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE,
      sourceConfigurationExpansionArtifactId: CONFIG_EXPANSION,
      createdBy: CREATED_BY,
      createdAt: CREATED_AT,
      rowCount: 4,
      rowIds: [
        "RFP-COMP-001",
        "RFP-COMP-002",
        "RFP-COMP-003",
        "RFP-COMP-004",
      ],
      requirementIds: [
        "RFP-REQ-001",
        "RFP-REQ-002",
        "RFP-REQ-003",
        "RFP-REQ-004",
      ],
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [
        BASELINE,
        EVIDENCE_PACKAGE,
        CONFIG_EXPANSION,
        SOURCE_MATRIX,
      ],
      statusCounts: {
        compliant: 1,
        partially_compliant: 0,
        non_compliant: 0,
        not_applicable: 2,
        needs_review: 1,
      },
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT.toISOString(),
      reviewedDecisionCount: 4,
      activeRowCount: 3,
      removedRowCount: 1,
      sourceComplianceMatrixArtifactId: SOURCE_MATRIX,
      sourceComplianceMatrixArtifactVersion: VERSION,
    });

    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain(
      "Compliant; the offered switch meets the requirement."
    );
    expect(serializedResult).not.toContain("Datasheet confirms the port count.");
    expect(serializedResult).not.toContain("evidence-RFP-COMP-001");
    expect(serializedResult).not.toContain(TENANT);

    expect(result.artifact).toMatchObject({
      id: CREATED_MATRIX,
      type: "compliance_matrix",
      stageId: "compliance_matrix_review",
      status: "needs_review",
    });
    expect(result.artifact).not.toHaveProperty("payload");
  });

  it("preserves undecided rows as fresh copies and decides only the named row", async () => {
    const result = await review({
      decisions: [
        { rowId: "RFP-COMP-002", action: "mark_not_applicable", reason: "n/a" },
      ],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const call = mockCreateArtifact.mock.calls[0][0] as CreateArtifactCall;
    const payload = call.payload as RfpComplianceMatrixReviewedPayload;
    expect(payload.rows.map((row) => row.complianceStatus)).toEqual([
      "needs_review",
      "not_applicable",
      "needs_review",
    ]);
    expect(payload.rows[0]).not.toHaveProperty("reviewHistory");
    expect(payload.rows[2]).not.toHaveProperty("reviewHistory");
    expect(payload.reviewedDecisionCount).toBe(1);
    expect(payload.activeRowCount).toBe(3);
    expect(payload.removedRowCount).toBe(0);
  });
});

describe("reviewRfpComplianceMatrixRows - immutability and fresh arrays", () => {
  it("does not mutate inputs or the loaded artifact and returns fresh summary arrays", async () => {
    const artifact = makeComplianceMatrixArtifact();
    const artifactSnapshot = structuredClone(artifact);
    mockGetArtifact.mockResolvedValue(artifact);
    const input: ReviewRfpComplianceMatrixRowsInput = {
      tenantId: TENANT,
      projectId: PROJECT,
      complianceMatrixArtifactId: SOURCE_MATRIX,
      reviewedBy: `  ${REVIEWED_BY}  `,
      reviewedAt: REVIEWED_AT,
      decisions: [
        {
          rowId: "RFP-COMP-002",
          action: "mark_not_applicable",
          reason: "  not in scope  ",
        },
      ],
    };
    const inputSnapshot = structuredClone(input);

    const result = await reviewRfpComplianceMatrixRows(input);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(input).toEqual(inputSnapshot);
    expect(artifact).toEqual(artifactSnapshot);

    const call = mockCreateArtifact.mock.calls[0][0] as CreateArtifactCall;
    const payload = call.payload as RfpComplianceMatrixReviewedPayload;
    expect(payload.reviewedBy).toBe(REVIEWED_BY);
    expect(call.sourceFileIds).not.toBe(artifact.sourceFileIds);
    expect(call.sourceArtifactIds).not.toBe(artifact.sourceArtifactIds);
    expect(result.payloadSummary.sourceFileIds).not.toBe(call.sourceFileIds);
    expect(result.payloadSummary.sourceArtifactIds).not.toBe(
      call.sourceArtifactIds
    );

    result.payloadSummary.sourceFileIds.push("mutated");
    result.payloadSummary.sourceArtifactIds.push("mutated");
    expect(call.sourceFileIds).toEqual([FILE_RFP, FILE_BOQ]);
    expect(call.sourceArtifactIds).toEqual([
      BASELINE,
      EVIDENCE_PACKAGE,
      CONFIG_EXPANSION,
      SOURCE_MATRIX,
    ]);
  });
});

describe("module purity and surface", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-row-review.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-row-review.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the project store, artifact store, canonical types, and the compliance-matrix contract", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-compliance-matrix",
    ]);
  });

  it("imports no approval, AI/provider, document reader/parser, pricing, SKU, catalog, config, HLD, TP, export, route, or UI module", () => {
    for (const forbidden of [
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/index"',
      'from "@/lib/db/schema"',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/project-rfp-compliance-matrix-',
      'from "@/lib/projects/project-rfp-requirements',
      'from "@/lib/projects/project-rfp-evidence',
      'from "@/lib/projects/project-rfp-extraction',
      'from "@/lib/projects/project-rfp-config-expansion',
      'from "@/lib/projects/project-rfp-hld',
      'from "@/lib/projects/project-rfp-tp',
      'from "@/lib/projects/project-boq',
      'from "@/lib/projects/boq-',
      'from "@/lib/projects/config-expansion',
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
      "@google/generative-ai",
      "openai",
      "generateText",
      "generateObject",
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

  it("exposes only the review service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual([
      "reviewRfpComplianceMatrixRows",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
