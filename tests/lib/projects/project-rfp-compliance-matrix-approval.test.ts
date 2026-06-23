import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFile,
  ProjectStageId,
} from "@/types/project";

const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListArtifacts,
  mockListFiles,
  mockCreateApproval,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListArtifacts: vi.fn(),
  mockListFiles: vi.fn(),
  mockCreateApproval: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
// getProjectArtifactById loads the matrix; listProjectArtifacts + listProjectFiles
// feed the REAL (unmocked) RFP BoQ readiness helper that computes the config gate.
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifacts: mockListArtifacts,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  listProjectFiles: mockListFiles,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import {
  reviewRfpComplianceMatrixArtifact,
} from "@/lib/projects/project-rfp-compliance-matrix-approval";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-compliance-matrix-1";
const DECIDER = "u-engineer";
const CONFIG_EXP = "art-config-expansion-1";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Bid",
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

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "RFP-COMP-001",
    requirementId: "RFP-REQ-001",
    requirementText: "req",
    category: "technical",
    priority: "must",
    complianceStatus: "compliant",
    response: "ok",
    evidenceReferences: [],
    rowReviewStatus: "reviewed",
    ...overrides,
  };
}

function makePayload(rows: Record<string, unknown>[]): Record<string, unknown> {
  return {
    payloadKind: "rfp_compliance_matrix",
    sourceRequirementsBaselineArtifactId: "art-requirements-baseline-1",
    sourceEvidencePackageArtifactId: "art-evidence-1",
    sourceConfigurationExpansionArtifactId: CONFIG_EXP,
    createdBy: "u-drafter",
    createdAt: "2026-06-01T00:00:00.000Z",
    sourceFileIds: ["file-rfp-1"],
    sourceArtifactIds: ["art-requirements-baseline-1"],
    rows,
  };
}

// A BoQ ProjectFile, so the readiness helper reports hasBoqFiles=true and the
// configuration gate must be cleared by a normal approved configuration_expansion.
function makeBoqFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id: "file-boq-1",
    projectId: PROJECT,
    fileRole: "boq",
    fileName: "boq.xlsx",
    storagePath: "s3://bucket/boq.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 4096,
    uploadedAt: TS1,
    retainUntil: TS2,
    ...overrides,
  };
}

// An approved NORMAL configuration_expansion (not the draft marker, not a no-BoQ
// exception): the gate-authorized config artifact when a BoQ is present.
function makeApprovedNormalConfig(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: CONFIG_EXP,
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "approved",
    version: 1,
    payload: { payloadKind: "rfp_configuration_expansion", acceptedLines: [] },
    sourceFileIds: ["file-boq-1"],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

// An approved no-BoQ service-only exception: the gate-authorized config artifact
// only when NO BoQ file is present.
function makeApprovedNoBoqException(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: "art-no-boq-exception-1",
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "approved",
    version: 1,
    payload: {
      payloadKind: "rfp_no_boq_service_only_exception",
      reason: "service only engagement",
      acceptedLines: [],
    },
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

// A fully reviewed, mixed-status matrix: one removed row plus four active rows
// covering compliant, partially_compliant, non_compliant, and not_applicable.
function reviewedMixedRows(): Record<string, unknown>[] {
  return [
    makeRow({ id: "RFP-COMP-001", complianceStatus: "compliant", response: "PAYLOAD-SECRET" }),
    makeRow({ id: "RFP-COMP-002", complianceStatus: "partially_compliant" }),
    makeRow({ id: "RFP-COMP-003", complianceStatus: "non_compliant" }),
    makeRow({
      id: "RFP-COMP-004",
      complianceStatus: "not_applicable",
      notApplicableReason: "out of scope",
    }),
    makeRow({ id: "RFP-COMP-005", rowReviewStatus: "removed", removedReason: "duplicate" }),
  ];
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "compliance_matrix_review",
    type: "compliance_matrix",
    status: "needs_review",
    version: 1,
    payload: makePayload(reviewedMixedRows()),
    sourceFileIds: ["file-rfp-1"],
    sourceArtifactIds: ["art-requirements-baseline-1"],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  return {
    approval: {
      id: "approval-1",
      projectId: PROJECT,
      stageId: "compliance_matrix_review",
      artifactId: ARTIFACT,
      artifactVersion: 1,
      decision,
      decidedBy: DECIDER,
      decidedAt: TS2,
    },
    artifactStatus:
      decision === "approved" ? "approved" : ("rejected" as ProjectArtifactStatus),
    stageStatus:
      decision === "approved" ? "approved" : ("rejected" as ProjectArtifactStatus),
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
  // Default gate state: a BoQ file plus an approved normal configuration_expansion
  // whose id matches the matrix's sourceConfigurationExpansionArtifactId (CONFIG_EXP).
  mockListFiles.mockReset().mockResolvedValue([makeBoqFile()]);
  mockListArtifacts.mockReset().mockResolvedValue([makeApprovedNormalConfig()]);
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpComplianceMatrixArtifact", () => {
  it("approves the exact compliance matrix artifact through createProjectApproval", async () => {
    const result = await reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      note: "complete",
    });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
      note: "complete",
    });
    expect(JSON.stringify(result)).not.toContain("PAYLOAD-SECRET");
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("gates project, type, stage, and reviewable status before creating approval", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(
      await reviewRfpComplianceMatrixArtifact({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
        decision: "approved",
        decidedBy: DECIDER,
      })
    ).toEqual({ status: "not_found" });
    expect(mockCreateApproval).not.toHaveBeenCalled();

    for (const type of [
      "requirements_baseline",
      "evidence_package",
      "priced_boq",
    ] as ProjectArtifactType[]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ type }));
      const result = await reviewRfpComplianceMatrixArtifact({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
        decision: "approved",
        decidedBy: DECIDER,
      });
      expect(result.status).toBe("artifact_not_compliance_matrix");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }

    for (const stageId of [
      "requirements_baseline_review",
      "intake_package_review",
    ] as ProjectStageId[]) {
      mockCreateApproval.mockClear();
      mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ stageId }));
      const result = await reviewRfpComplianceMatrixArtifact({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
        decision: "approved",
        decidedBy: DECIDER,
      });
      expect(result.status).toBe("artifact_not_compliance_matrix");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }

    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({ status: "approved" })
    );
    const notReviewable = await reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
    });
    expect(notReviewable.status).toBe("artifact_not_reviewable");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("approval payload gates (decision: approved)", () => {
  async function approve(payload: unknown) {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({ payload: payload as Record<string, unknown> })
    );
    return reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
    });
  }

  it("approves a fully reviewed mixed matrix without leaking payload or tenant", async () => {
    const result = await reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
    });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("PAYLOAD-SECRET");
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("blocks an invalid / non-matrix payload before approval", async () => {
    for (const payload of [
      null,
      "nope",
      { secret: "PAYLOAD-SECRET" },
      { payloadKind: "rfp_compliance_matrix" },
      { payloadKind: "something_else", rows: [] },
      makePayload([makeRow({ id: "" })]),
    ]) {
      mockCreateApproval.mockClear();
      const result = await approve(payload);
      expect(result.status).toBe("invalid_compliance_matrix_payload");
      expect(mockCreateApproval).not.toHaveBeenCalled();
    }
  });

  it("blocks when there are zero active (non-removed) rows", async () => {
    const result = await approve(
      makePayload([
        makeRow({ id: "RFP-COMP-001", rowReviewStatus: "removed", removedReason: "dup" }),
      ])
    );
    expect(result.status).toBe("no_active_rows");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks active rows still needing review or with an unknown status", async () => {
    const needsReview = await approve(
      makePayload([
        makeRow({ id: "RFP-COMP-001" }),
        makeRow({ id: "RFP-COMP-002", complianceStatus: "needs_review" }),
      ])
    );
    expect(needsReview).toEqual({
      status: "rows_need_review",
      rowIds: ["RFP-COMP-002"],
    });
    expect(mockCreateApproval).not.toHaveBeenCalled();

    const unknownStatus = await approve(
      makePayload([makeRow({ id: "RFP-COMP-009", complianceStatus: "totally_made_up" })])
    );
    expect(unknownStatus).toEqual({
      status: "rows_need_review",
      rowIds: ["RFP-COMP-009"],
    });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks active rows not explicitly marked reviewed", async () => {
    const result = await approve(
      makePayload([
        makeRow({ id: "RFP-COMP-001" }),
        makeRow({ id: "RFP-COMP-002", rowReviewStatus: "pending" }),
        makeRow({ id: "RFP-COMP-003", rowReviewStatus: undefined }),
      ])
    );
    expect(result).toEqual({
      status: "rows_not_reviewed",
      rowIds: ["RFP-COMP-002", "RFP-COMP-003"],
    });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks active not_applicable rows missing a reason", async () => {
    const result = await approve(
      makePayload([
        makeRow({ id: "RFP-COMP-001", complianceStatus: "not_applicable", notApplicableReason: "   " }),
      ])
    );
    expect(result).toEqual({
      status: "not_applicable_reason_required",
      rowIds: ["RFP-COMP-001"],
    });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks removed rows missing a reason", async () => {
    const result = await approve(
      makePayload([
        makeRow({ id: "RFP-COMP-001" }),
        makeRow({ id: "RFP-COMP-002", rowReviewStatus: "removed" }),
      ])
    );
    expect(result).toEqual({
      status: "removed_reason_required",
      rowIds: ["RFP-COMP-002"],
    });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("source configuration gate (decision: approved)", () => {
  function approveDefault() {
    return reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "approved",
      decidedBy: DECIDER,
    });
  }

  function withPayload(mutate: (payload: Record<string, unknown>) => void) {
    const payload = makePayload(reviewedMixedRows());
    mutate(payload);
    mockGetArtifactById.mockResolvedValueOnce(makeArtifact({ payload }));
  }

  it("blocks a fully reviewed matrix that names no source configuration", async () => {
    withPayload((payload) => {
      delete payload.sourceConfigurationExpansionArtifactId;
    });

    const result = await approveDefault();

    expect(result).toEqual({ status: "missing_source_configuration" });
    expect(mockCreateApproval).not.toHaveBeenCalled();
    // Short-circuits before recomputing the gate from files/artifacts.
    expect(mockListFiles).not.toHaveBeenCalled();
    expect(mockListArtifacts).not.toHaveBeenCalled();
  });

  it("blocks a blank source configuration id", async () => {
    withPayload((payload) => {
      payload.sourceConfigurationExpansionArtifactId = "   ";
    });

    const result = await approveDefault();

    expect(result).toEqual({ status: "missing_source_configuration" });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the current configuration gate is unsatisfied", async () => {
    // BoQ present but no approved configuration_expansion yet.
    mockListFiles.mockResolvedValueOnce([makeBoqFile()]);
    mockListArtifacts.mockResolvedValueOnce([]);

    const result = await approveDefault();

    expect(result.status).toBe("configuration_gate_unsatisfied");
    if (result.status === "configuration_gate_unsatisfied") {
      expect(result.gateStatus).toBe("requires_boq_normalization");
      expect(typeof result.gateMessage).toBe("string");
      expect(result.gateMessage.length).toBeGreaterThan(0);
    }
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the source config is not the gate-authorized one", async () => {
    withPayload((payload) => {
      payload.sourceConfigurationExpansionArtifactId = "art-config-expansion-STALE";
    });
    // Gate authorizes CONFIG_EXP (default approved normal config).

    const result = await approveDefault();

    expect(result).toEqual({
      status: "configuration_gate_mismatch",
      authorizedConfigurationExpansionArtifactId: CONFIG_EXP,
    });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("approves when the gate authorizes the matrix's normal configuration expansion", async () => {
    const result = await approveDefault();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockListFiles).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(mockListArtifacts).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(JSON.stringify(result)).not.toContain("PAYLOAD-SECRET");
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("approves a no-BoQ service-only exception source when the gate authorizes that exception", async () => {
    const exceptionId = "art-no-boq-exception-1";
    withPayload((payload) => {
      payload.sourceConfigurationExpansionArtifactId = exceptionId;
    });
    // No BoQ file present, and an approved no-BoQ exception waives the gate.
    mockListFiles.mockResolvedValueOnce([]);
    mockListArtifacts.mockResolvedValueOnce([
      makeApprovedNoBoqException({ id: exceptionId }),
    ]);

    const result = await approveDefault();

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("blocks a no-BoQ exception source when a BoQ exists and a normal config is authorized", async () => {
    const exceptionId = "art-no-boq-exception-1";
    withPayload((payload) => {
      payload.sourceConfigurationExpansionArtifactId = exceptionId;
    });
    // BoQ present: the gate authorizes the normal config, never the exception.
    mockListFiles.mockResolvedValueOnce([makeBoqFile()]);
    mockListArtifacts.mockResolvedValueOnce([
      makeApprovedNormalConfig(),
      makeApprovedNoBoqException({ id: exceptionId }),
    ]);

    const result = await approveDefault();

    expect(result).toEqual({
      status: "configuration_gate_mismatch",
      authorizedConfigurationExpansionArtifactId: CONFIG_EXP,
    });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("rejects a legacy/pre-gate matrix without consulting the configuration gate", async () => {
    withPayload((payload) => {
      delete payload.sourceConfigurationExpansionArtifactId;
    });
    mockCreateApproval.mockResolvedValueOnce(makeCreated("rejected"));

    const result = await reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "rejected",
      decidedBy: DECIDER,
      note: "legacy, regenerate",
    });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "rejected",
      decidedBy: DECIDER,
      note: "legacy, regenerate",
    });
    expect(mockListFiles).not.toHaveBeenCalled();
    expect(mockListArtifacts).not.toHaveBeenCalled();
  });
});

describe("rejection ignores approval readiness", () => {
  it("records a rejection even when the payload is not approval-ready", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      makeArtifact({ payload: { secret: "PAYLOAD-SECRET" } })
    );
    mockCreateApproval.mockResolvedValueOnce(makeCreated("rejected"));

    const result = await reviewRfpComplianceMatrixArtifact({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "rejected",
      decidedBy: DECIDER,
      note: "incomplete",
    });

    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
      decision: "rejected",
      decidedBy: DECIDER,
      note: "incomplete",
    });
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the stores, approval helper, the pure readiness/matrix contracts, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-file-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-boq-readiness",
      "@/lib/projects/project-rfp-compliance-matrix",
      "@/types/project",
    ]);
  });

  it("keeps approval as the only mutation boundary and imports no generation or AI modules", () => {
    expect(source).toContain("createProjectApproval");
    for (const forbidden of [
      "createProjectArtifactVersion",
      'from "@/lib/projects/project-rfp-compliance-matrix-draft"',
      'from "@/lib/projects/project-rfp-compliance-matrix-drafting"',
      'from "@/lib/projects/project-rfp-compliance-matrix-generation"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/config-expansion',
      "@anthropic-ai",
      "@google/generative-ai",
      "storagePath",
      "new Date(",
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
