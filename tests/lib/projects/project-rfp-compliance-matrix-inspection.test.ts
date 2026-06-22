import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

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
  loadRfpComplianceMatrixDetail,
  loadRfpComplianceMatrixList,
} from "@/lib/projects/project-rfp-compliance-matrix-inspection";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-compliance-matrix-1";
const BASELINE = "art-requirements-baseline-1";
const PACKAGE = "art-evidence-package-1";
const CONFIG = "art-configuration-expansion-1";
const FILE_RFP = "file-rfp-1";
const FILE_BOQ = "file-boq-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const PAYLOAD_AT = "2026-06-11T08:15:00.000Z";
const REQ_TEXT = "Provide 48-port PoE access switches for all IDFs.";
const RESPONSE = "Compliant based on the approved evidence package.";
const REVIEWED_BY = "u-reviewer";
const REVIEWED_AT = "2026-06-12T09:00:00.000Z";
const REVIEWED_AT_2 = "2026-06-12T09:05:00.000Z";
const SOURCE_PREV = "art-compliance-matrix-prev";
const SECTION_REF = "SEC-REF-3.2.1";
const HISTORY_NOTE = "Tightened the access-switch response.";

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

function makePayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_compliance_matrix",
    sourceRequirementsBaselineArtifactId: BASELINE,
    sourceEvidencePackageArtifactId: PACKAGE,
    sourceConfigurationExpansionArtifactId: CONFIG,
    createdBy: "u-engineer",
    createdAt: PAYLOAD_AT,
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [BASELINE, PACKAGE, CONFIG],
    tenantId: TENANT,
    storagePath: "C:/secret/compliance.json",
    reviewedBy: REVIEWED_BY,
    reviewedAt: REVIEWED_AT,
    reviewedDecisionCount: 1,
    activeRowCount: 2,
    removedRowCount: 0,
    sourceComplianceMatrixArtifactId: SOURCE_PREV,
    sourceComplianceMatrixArtifactVersion: 1,
    rows: [
      {
        id: "RFP-COMP-001",
        requirementId: "RFP-REQ-001",
        requirementText: REQ_TEXT,
        category: "technical",
        priority: "mandatory",
        complianceStatus: "needs_review",
        response: RESPONSE,
        rationale: "Matches the mandatory access-switch requirement.",
        notes: "Engineer must still approve.",
        sectionReference: SECTION_REF,
        responseLane: "technical",
        ownerLane: "project_delivery",
        hldImpact: "required",
        tpImpact: "potential",
        boqConfigImpact: "owner_review_required",
        requiresOwnerReview: true,
        rowReviewStatus: "reviewed",
        reviewHistory: [
          { action: "edited", at: REVIEWED_AT, by: REVIEWED_BY, note: HISTORY_NOTE },
          {
            action: "owner_review_requested",
            at: REVIEWED_AT_2,
            by: REVIEWED_BY,
          },
        ],
        rawAnswer: "RAW-COMPLIANCE-SECRET",
        evidenceReferences: [
          {
            evidenceId: "evidence-text-1",
            sourceFileId: FILE_RFP,
            inputPackageArtifactId: PACKAGE,
            evidenceKind: "rfp_document_text_chunk",
            chunkIndex: 1,
            chunkCount: 2,
            charCount: 64,
            text: "RAW-EVIDENCE-TEXT",
          },
          {
            evidenceId: "evidence-table-1",
            sourceFileId: FILE_BOQ,
            inputPackageArtifactId: PACKAGE,
            evidenceKind: "rfp_document_table",
            tableId: "file-boq-1:table:1",
            sheetName: "BoQ",
            rowCount: 2,
            columnCount: 3,
            rows: [["RAW-TABLE-CELL"]],
          },
        ],
        configurationReferences: [
          {
            configurationExpansionArtifactId: CONFIG,
            lineId: "cfg-line-1",
            origin: "expansion",
            sku: "C9300-48P-A",
            description: "Catalyst access switch",
            parentLineId: "parent-1",
            parentLineNumber: "1",
            sourceFileId: FILE_BOQ,
            sourceRowNumber: 12,
            originalLineNumber: "1.1",
            unitPrice: 999,
            discountPercent: 40,
            catalogLookup: "secret",
          },
        ],
      },
      {
        id: "RFP-COMP-002",
        requirementId: "RFP-REQ-002",
        requirementText: "Submit compliance statement.",
        category: "compliance",
        priority: "preferred",
        complianceStatus: "compliant",
        response: "Included in the proposal response.",
        evidenceReferences: [],
      },
    ],
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "compliance_matrix_review",
    type: "compliance_matrix",
    status: "needs_review",
    version: 1,
    payload: makePayload(),
    sourceFileIds: [FILE_RFP, FILE_BOQ],
    sourceArtifactIds: [BASELINE, PACKAGE, CONFIG],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

let artifact: ProjectArtifact;
let artifactById: Map<string, ProjectArtifact>;

beforeEach(() => {
  artifact = makeArtifact();
  artifactById = new Map([[ARTIFACT, artifact]]);
  mockGetProject.mockReset().mockResolvedValue(makeProject());
  mockGetArtifact
    .mockReset()
    .mockImplementation(
      async (_tenantId: string, _projectId: string, artifactId: string) =>
        artifactById.get(artifactId) ?? null
    );
  mockListArtifactsByType.mockReset().mockResolvedValue([artifact]);
});

describe("loadRfpComplianceMatrixList", () => {
  it("lists compliance_matrix versions with identifier summaries only", async () => {
    const result = await loadRfpComplianceMatrixList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "compliance_matrix"
    );
    expect(result.artifactCount).toBe(1);
    expect(result.artifacts[0].payloadSummary).toEqual({
      payloadKind: "rfp_compliance_matrix",
      sourceRequirementsBaselineArtifactId: BASELINE,
      sourceEvidencePackageArtifactId: PACKAGE,
      sourceConfigurationExpansionArtifactId: CONFIG,
      createdBy: "u-engineer",
      createdAt: PAYLOAD_AT,
      rowCount: 2,
      rowIds: ["RFP-COMP-001", "RFP-COMP-002"],
      requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
      sourceFileIds: [FILE_RFP, FILE_BOQ],
      sourceArtifactIds: [BASELINE, PACKAGE, CONFIG],
      statusCounts: {
        compliant: 1,
        partially_compliant: 0,
        non_compliant: 0,
        not_applicable: 0,
        needs_review: 1,
      },
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT,
      reviewedDecisionCount: 1,
      activeRowCount: 2,
      removedRowCount: 0,
      sourceComplianceMatrixArtifactId: SOURCE_PREV,
      sourceComplianceMatrixArtifactVersion: 1,
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain(REQ_TEXT);
    expect(json).not.toContain(RESPONSE);
    expect(json).not.toContain("RAW-EVIDENCE-TEXT");
    expect(json).not.toContain("RAW-TABLE-CELL");
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain(TENANT);
    // Row-level metadata (section reference, review history) must not leak into
    // the lean list summary, which carries provenance and identifiers only.
    expect(json).not.toContain(SECTION_REF);
    expect(json).not.toContain(HISTORY_NOTE);
    expect(json).not.toContain("reviewHistory");
  });

  it("degrades malformed payload summaries and filters wrong returned types", async () => {
    mockListArtifactsByType.mockResolvedValue([
      makeArtifact({ type: "requirements_baseline" }),
      makeArtifact({
        id: "art-compliance-matrix-2",
        payload: { payloadKind: 42, rows: [{ id: 7 }, null] },
      }),
    ]);

    const result = await loadRfpComplianceMatrixList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    expect(result.artifacts[0].payloadSummary).toMatchObject({
      payloadKind: "",
      rowCount: 2,
      rowIds: ["", ""],
      requirementIds: ["", ""],
    });
  });
});

describe("loadRfpComplianceMatrixDetail", () => {
  it("returns sanitized row detail with locator-only references", async () => {
    const result = await loadRfpComplianceMatrixDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.matrix.rows[0]).toEqual({
      id: "RFP-COMP-001",
      requirementId: "RFP-REQ-001",
      requirementText: REQ_TEXT,
      category: "technical",
      priority: "mandatory",
      complianceStatus: "needs_review",
      response: RESPONSE,
      rationale: "Matches the mandatory access-switch requirement.",
      notes: "Engineer must still approve.",
      evidenceReferences: [
        {
          evidenceId: "evidence-text-1",
          sourceFileId: FILE_RFP,
          inputPackageArtifactId: PACKAGE,
          evidenceKind: "rfp_document_text_chunk",
          chunkIndex: 1,
          chunkCount: 2,
          charCount: 64,
        },
        {
          evidenceId: "evidence-table-1",
          sourceFileId: FILE_BOQ,
          inputPackageArtifactId: PACKAGE,
          evidenceKind: "rfp_document_table",
          tableId: "file-boq-1:table:1",
          sheetName: "BoQ",
          rowCount: 2,
          columnCount: 3,
        },
      ],
      configurationReferences: [
        {
          configurationExpansionArtifactId: CONFIG,
          lineId: "cfg-line-1",
          origin: "expansion",
          sku: "C9300-48P-A",
          description: "Catalyst access switch",
          parentLineId: "parent-1",
          parentLineNumber: "1",
          sourceFileId: FILE_BOQ,
          sourceRowNumber: 12,
          originalLineNumber: "1.1",
        },
      ],
      sectionReference: SECTION_REF,
      responseLane: "technical",
      ownerLane: "project_delivery",
      hldImpact: "required",
      tpImpact: "potential",
      boqConfigImpact: "owner_review_required",
      requiresOwnerReview: true,
      rowReviewStatus: "reviewed",
      reviewHistory: [
        { action: "edited", at: REVIEWED_AT, by: REVIEWED_BY, note: HISTORY_NOTE },
        {
          action: "owner_review_requested",
          at: REVIEWED_AT_2,
          by: REVIEWED_BY,
        },
      ],
    });
    expect(result.matrix).toMatchObject({
      reviewedBy: REVIEWED_BY,
      reviewedAt: REVIEWED_AT,
      reviewedDecisionCount: 1,
      activeRowCount: 2,
      removedRowCount: 0,
      sourceComplianceMatrixArtifactId: SOURCE_PREV,
      sourceComplianceMatrixArtifactVersion: 1,
    });
    const json = JSON.stringify(result);
    expect(json).toContain(REQ_TEXT);
    expect(json).toContain(RESPONSE);
    for (const leak of [
      TENANT,
      "tenantId",
      "storagePath",
      "RAW-COMPLIANCE-SECRET",
      "RAW-EVIDENCE-TEXT",
      "RAW-TABLE-CELL",
      "unitPrice",
      "discountPercent",
      "catalogLookup",
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it("drops malformed metadata and history entries, keeps valid ones", async () => {
    artifactById.set(
      ARTIFACT,
      makeArtifact({
        payload: {
          payloadKind: "rfp_compliance_matrix",
          sourceRequirementsBaselineArtifactId: BASELINE,
          sourceEvidencePackageArtifactId: PACKAGE,
          createdBy: "u-engineer",
          createdAt: PAYLOAD_AT,
          sourceFileIds: [FILE_RFP],
          sourceArtifactIds: [BASELINE, PACKAGE],
          rows: [
            {
              id: "RFP-COMP-009",
              requirementId: "RFP-REQ-009",
              requirementText: "Malformed metadata requirement.",
              category: "technical",
              priority: "mandatory",
              complianceStatus: "needs_review",
              response: "Response body.",
              evidenceReferences: [],
              sectionReference: 7,
              responseLane: "made_up_lane",
              ownerLane: 42,
              hldImpact: "catastrophic",
              tpImpact: "",
              boqConfigImpact: null,
              requiresOwnerReview: "yes",
              rowReviewStatus: "archived",
              notApplicableReason: 5,
              removedReason: false,
              reviewHistory: [
                {
                  action: "edited",
                  at: "2026-06-12T10:00:00.000Z",
                  by: REVIEWED_BY,
                  note: "Valid entry.",
                  extraKey: "DROP-EXTRA",
                },
                {
                  action: "bogus",
                  at: "2026-06-12T10:01:00.000Z",
                  by: REVIEWED_BY,
                },
                { action: "removed", at: "", by: REVIEWED_BY },
                { action: "removed", at: "2026-06-12T10:02:00.000Z", by: "   " },
                {
                  action: "restored",
                  at: "2026-06-12T10:03:00.000Z",
                  by: REVIEWED_BY,
                  note: "   ",
                },
                "not-an-object",
                null,
              ],
            },
          ],
        },
      })
    );

    const result = await loadRfpComplianceMatrixDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.matrix.rows[0]).toEqual({
      id: "RFP-COMP-009",
      requirementId: "RFP-REQ-009",
      requirementText: "Malformed metadata requirement.",
      category: "technical",
      priority: "mandatory",
      complianceStatus: "needs_review",
      response: "Response body.",
      evidenceReferences: [],
      reviewHistory: [
        {
          action: "edited",
          at: "2026-06-12T10:00:00.000Z",
          by: REVIEWED_BY,
          note: "Valid entry.",
        },
        { action: "restored", at: "2026-06-12T10:03:00.000Z", by: REVIEWED_BY },
      ],
    });
    const json = JSON.stringify(result.matrix.rows[0]);
    for (const dropped of [
      "made_up_lane",
      "catastrophic",
      "archived",
      "DROP-EXTRA",
      "bogus",
    ]) {
      expect(json).not.toContain(dropped);
    }
  });

  it("preserves removed and not_applicable review metadata and history", async () => {
    artifactById.set(
      ARTIFACT,
      makeArtifact({
        payload: {
          payloadKind: "rfp_compliance_matrix",
          sourceRequirementsBaselineArtifactId: BASELINE,
          sourceEvidencePackageArtifactId: PACKAGE,
          createdBy: "u-engineer",
          createdAt: PAYLOAD_AT,
          sourceFileIds: [FILE_RFP],
          sourceArtifactIds: [BASELINE, PACKAGE],
          reviewedBy: REVIEWED_BY,
          reviewedAt: REVIEWED_AT,
          reviewedDecisionCount: 1,
          activeRowCount: 0,
          removedRowCount: 1,
          sourceComplianceMatrixArtifactId: SOURCE_PREV,
          sourceComplianceMatrixArtifactVersion: 2,
          rows: [
            {
              id: "RFP-COMP-010",
              requirementId: "RFP-REQ-010",
              requirementText: "Out-of-scope requirement.",
              category: "commercial",
              priority: "optional",
              complianceStatus: "not_applicable",
              response: "Removed from scope after review.",
              evidenceReferences: [],
              rowReviewStatus: "removed",
              notApplicableReason: "Superseded by RFP-REQ-002.",
              removedReason: "Out of contract lot scope.",
              reviewHistory: [
                {
                  action: "marked_not_applicable",
                  at: "2026-06-12T11:00:00.000Z",
                  by: REVIEWED_BY,
                  note: "Out of lot.",
                },
                {
                  action: "removed",
                  at: "2026-06-12T11:01:00.000Z",
                  by: REVIEWED_BY,
                  note: "Duplicate requirement.",
                },
              ],
            },
          ],
        },
      })
    );

    const result = await loadRfpComplianceMatrixDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.matrix).toMatchObject({
      reviewedBy: REVIEWED_BY,
      reviewedDecisionCount: 1,
      activeRowCount: 0,
      removedRowCount: 1,
      sourceComplianceMatrixArtifactId: SOURCE_PREV,
      sourceComplianceMatrixArtifactVersion: 2,
    });
    expect(result.matrix.rows[0]).toEqual({
      id: "RFP-COMP-010",
      requirementId: "RFP-REQ-010",
      requirementText: "Out-of-scope requirement.",
      category: "commercial",
      priority: "optional",
      complianceStatus: "not_applicable",
      response: "Removed from scope after review.",
      evidenceReferences: [],
      rowReviewStatus: "removed",
      notApplicableReason: "Superseded by RFP-REQ-002.",
      removedReason: "Out of contract lot scope.",
      reviewHistory: [
        {
          action: "marked_not_applicable",
          at: "2026-06-12T11:00:00.000Z",
          by: REVIEWED_BY,
          note: "Out of lot.",
        },
        {
          action: "removed",
          at: "2026-06-12T11:01:00.000Z",
          by: REVIEWED_BY,
          note: "Duplicate requirement.",
        },
      ],
    });
  });

  it("returns artifact_not_compliance_matrix for wrong type or stage", async () => {
    artifactById.set(
      ARTIFACT,
      makeArtifact({ type: "requirements_baseline" })
    );
    let result = await loadRfpComplianceMatrixDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    expect(result.status).toBe("artifact_not_compliance_matrix");

    artifactById.set(
      ARTIFACT,
      makeArtifact({ stageId: "requirements_baseline_review" })
    );
    result = await loadRfpComplianceMatrixDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    expect(result.status).toBe("artifact_not_compliance_matrix");
  });

  it("returns invalid_payload for wrong marker or malformed rows", async () => {
    for (const payload of [
      {},
      { payloadKind: "rfp_compliance_matrix", rows: "not-array" },
      { payloadKind: "rfp_compliance_matrix", rows: [null] },
    ]) {
      artifactById.set(ARTIFACT, makeArtifact({ payload }));
      const result = await loadRfpComplianceMatrixDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
      });
      expect(result.status).toBe("invalid_payload");
    }
  });
});

describe("project gates", () => {
  it("returns not_found and wrong_mode before reading artifacts", async () => {
    mockGetProject.mockResolvedValueOnce(null);
    expect(
      await loadRfpComplianceMatrixList({ tenantId: TENANT, projectId: PROJECT })
    ).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();

    mockGetProject.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpComplianceMatrixDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });
    expect(result.status).toBe("wrong_mode");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only project/artifact stores, canonical types, and type-only compliance shapes", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-compliance-matrix",
    ]);
    expect(source).toMatch(
      /import type \{[\s\S]*?\} from "@\/lib\/projects\/project-rfp-compliance-matrix";/
    );
  });

  it("does not import mutation stores, files, extraction, pricing, config logic, catalog, route, UI, or AI modules", () => {
    for (const forbidden of [
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/projects/project-rfp-compliance-matrix-draft"',
      'from "@/lib/projects/project-rfp-compliance-matrix-drafting"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/catalog',
      'from "@/app',
      'from "@/components',
      "@anthropic-ai",
      "@google/generative-ai",
      "tesseract",
      "storagePath",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps source and test ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
