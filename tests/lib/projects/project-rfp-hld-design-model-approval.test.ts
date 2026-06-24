import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

// Mock the store boundaries only. isArtifactReviewable, the Stage 6C contract
// validator, and the pure Stage 6C readiness/compatibility helpers stay REAL so the
// reviewability gate, payload re-validation, and the live currency re-tie are true
// integration checks over the supplied fixtures.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListProjectArtifacts,
  mockCreateApproval,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListProjectArtifacts: vi.fn(),
  mockCreateApproval: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifacts: mockListProjectArtifacts,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));

import {
  reviewRfpHldDesignModelArtifact,
  type ReviewRfpHldDesignModelArtifactInput,
  type ReviewRfpHldDesignModelArtifactResult,
} from "@/lib/projects/project-rfp-hld-design-model-approval";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
  type RfpHldDesignModelReviewPayload,
} from "@/lib/projects/project-rfp-hld-design-model-review";

const TENANT = "44444444-4444-4444-4444-444444444444";
const PROJECT = "proj-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const REVIEW_ID = "hrev-1";
const DECIDER = "u-approver-7";
const CREATED_AT = "2026-06-24T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const DECIDED_AT = new Date("2026-06-24T10:00:00.000Z");
const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];
const PAYLOAD_SENTINEL = "SECRET-CREATED-BY-VALUE";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP",
    customerName: "Acme",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function validBundlePayload(): RfpHldSourceBundlePayload {
  return {
    payloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    createdBy: "engineer@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: UPSTREAM_IDS.slice(),
    lineage: {
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      compiledArtifactIds: UPSTREAM_IDS.slice(),
    },
    authorities: {
      evidencePackage: {
        artifactId: "evp-1", artifactType: "evidence_package",
        stageId: "intake_package_review", status: "approved", version: 1,
      },
      requirementsBaseline: {
        artifactId: "req-1", artifactType: "requirements_baseline",
        stageId: "requirements_baseline_review", status: "approved", version: 1,
      },
      complianceMatrix: {
        artifactId: "cmx-1", artifactType: "compliance_matrix",
        stageId: "compliance_matrix_review", status: "approved", version: 1,
      },
      configurationAuthority: {
        artifactId: "cfg-1", artifactType: "configuration_expansion",
        stageId: "configuration_expansion_review", status: "approved", version: 1,
        sourceKind: "configuration_expansion",
      },
      hldIntake: {
        artifactId: "hint-1", artifactType: "hld_intake",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
      },
      hldReadinessSnapshot: {
        artifactId: "hrs-1", artifactType: "hld_readiness_snapshot",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_readiness_snapshot",
      },
    },
    designKnowledgePackRefs: [
      {
        artifactId: "dkp-1", artifactType: "design_knowledge_pack",
        stageId: "hld_design_delta_review", status: "approved", version: 1,
        payloadKind: "rfp_hld_design_knowledge_pack", domain: "campus_switching",
      },
    ],
    coveredDomains: ["campus_switching"],
    missingDomains: [],
    excludedDomains: ["service_only"],
    assumptions: [
      { id: "a1", statement: "Existing core remains.", sourceArtifactId: "req-1" },
    ],
    constraints: [
      { id: "c1", statement: "No customer BoQ change.", sourceDomain: "campus_switching" },
    ],
    warnings: [],
    blockers: [],
    validation: { status: "passed", checkedAt: CREATED_AT },
  };
}

function validBundleArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BUNDLE_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: validBundlePayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: UPSTREAM_IDS.slice(),
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function validDesignModelPayload(): RfpHldDesignModelPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
    createdBy: "drafter@example.com",
    createdAt: CREATED_AT,
    sourceArtifactIds: [BUNDLE_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceBundleVersion: 1,
    sourceBundlePayloadKind: "rfp_hld_source_bundle",
    coveredDomains: ["campus_switching"],
    excludedDomains: ["service_only"],
    sourceReferences: [{ id: "sr-1", kind: "source_bundle", artifactId: BUNDLE_ID }],
    assumptionRefs: [{ refId: "sr-1" }],
    constraintRefs: [{ refId: "sr-1" }],
    designSections: [
      {
        id: "ds-1", domain: "campus_switching", title: "Campus Switching Design",
        sourceRefIds: ["sr-1"],
        decisions: [{ id: "dec-1", label: "Use C9300 series", sourceRefIds: ["sr-1"] }],
      },
    ],
    topology: {
      nodes: [
        { id: "n-1", label: "Core Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
        { id: "n-2", label: "Access Switch", nodeType: "switch", sourceRefIds: ["sr-1"] },
      ],
      links: [
        {
          id: "l-1", label: "Core to Access", fromNodeId: "n-1", toNodeId: "n-2",
          linkType: "ethernet", sourceRefIds: ["sr-1"],
        },
      ],
      zones: [
        { id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] },
      ],
    },
    diagramIntents: [
      { id: "di-1", title: "Campus Topology", intentType: "physical", sourceRefIds: ["sr-1"] },
    ],
    traceability: {
      requirementRefs: [{ refId: "sr-1" }],
      complianceRefs: [{ refId: "sr-1" }],
      configurationRefs: [{ refId: "sr-1" }],
      sourceBundleRefs: [{ refId: "sr-1" }],
    },
    validationFindings: [],
  };
}

function validModelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: MODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "needs_review",
    version: 1,
    payload: validDesignModelPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

function validReviewPayload(
  overrides: Partial<RfpHldDesignModelReviewPayload> = {}
): RfpHldDesignModelReviewPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    reviewedAt: CREATED_AT,
    reviewer: { type: "deterministic" },
    sourceReferences: [{ id: "ref-1", artifactId: MODEL_ID }],
    findings: [
      {
        id: "f-1",
        severity: "warning",
        category: "topology_risk",
        message: "Advisory warning only.",
        sourceReferenceIds: ["ref-1"],
      },
      {
        id: "f-2",
        severity: "suggestion",
        category: "unclear_narrative",
        message: "Advisory suggestion only.",
        sourceReferenceIds: ["ref-1"],
      },
    ],
    recommendation: "proceed_to_engineer_review",
    ...overrides,
  };
}

function blockingReviewPayload(): RfpHldDesignModelReviewPayload {
  return validReviewPayload({
    findings: [
      {
        id: "f-block",
        severity: "blocking",
        category: "source_mismatch",
        message: "Blocking advisory finding.",
        sourceReferenceIds: ["ref-1"],
      },
      {
        id: "f-warn",
        severity: "warning",
        category: "topology_risk",
        message: "Advisory warning alongside the blocker.",
        sourceReferenceIds: ["ref-1"],
      },
    ],
    recommendation: "reject_required",
  });
}

function validReviewArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: REVIEW_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "generated",
    version: 1,
    payload: validReviewPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

/** Default getProjectArtifactById: model for MODEL_ID, bundle for BUNDLE_ID. */
function setArtifactRows(model: ProjectArtifact | null, bundle: ProjectArtifact | null): void {
  mockGetArtifactById.mockImplementation(async (_t: string, _p: string, id: string) => {
    if (id === MODEL_ID) return model;
    if (id === BUNDLE_ID) return bundle;
    return null;
  });
}

function makeCreated(decision: ProjectApproval["decision"] = "approved") {
  const approval: ProjectApproval = {
    id: "appr-model-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    artifactId: MODEL_ID,
    artifactVersion: 1,
    decision,
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
  };
  return {
    approval,
    artifactStatus: (decision === "approved" ? "approved" : "rejected") as ProjectArtifactStatus,
    stageStatus: (decision === "approved" ? "approved" : "rejected") as ProjectStageStatus,
  };
}

function review(
  overrides: Partial<ReviewRfpHldDesignModelArtifactInput> = {}
): Promise<ReviewRfpHldDesignModelArtifactResult> {
  return reviewRfpHldDesignModelArtifact({
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: MODEL_ID,
    decision: "approved",
    decidedBy: DECIDER,
    ...overrides,
  });
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  setArtifactRows(validModelArtifact(), validBundleArtifact());
  mockListProjectArtifacts
    .mockReset()
    .mockResolvedValue([validBundleArtifact(), validModelArtifact(), validReviewArtifact()]);
  mockCreateApproval.mockReset().mockResolvedValue(makeCreated());
});

describe("reviewRfpHldDesignModelArtifact - input validation", () => {
  it("throws on blank artifactId before any store call", async () => {
    await expect(review({ artifactId: "  " })).rejects.toThrow("artifactId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("throws on blank decidedBy before any store call", async () => {
    await expect(review({ decidedBy: " " })).rejects.toThrow("decidedBy is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

describe("reviewRfpHldDesignModelArtifact - gates before approval", () => {
  it("returns not_found and never approves when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    expect(await review()).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns wrong_mode lean summary (no tenantId) for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await review();
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found when the exact artifact is missing", async () => {
    setArtifactRows(null, validBundleArtifact());
    expect(await review()).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, MODEL_ID);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found for a foreign-project artifact", async () => {
    setArtifactRows(validModelArtifact({ projectId: "other" }), validBundleArtifact());
    expect(await review()).toEqual({ status: "artifact_not_found" });
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_hld_design_model for the wrong type or stage", async () => {
    setArtifactRows(validModelArtifact({ type: "hld_source_bundle" }), validBundleArtifact());
    const wrongType = await review();
    expect(wrongType.status).toBe("artifact_not_hld_design_model");
    if (wrongType.status !== "artifact_not_hld_design_model") throw new Error("unreachable");
    expect("payload" in wrongType.artifact).toBe(false);

    setArtifactRows(
      validModelArtifact({ stageId: "compliance_matrix_review" }),
      validBundleArtifact()
    );
    expect((await review()).status).toBe("artifact_not_hld_design_model");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_reviewable for every non-reviewable status before payload checks", async () => {
    for (const status of [
      "approved", "rejected", "stale", "failed", "missing", "not_applicable",
    ] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear();
      setArtifactRows(validModelArtifact({ status }), validBundleArtifact());
      const result = await review();
      expect(result.status, status).toBe("artifact_not_reviewable");
      expect(mockCreateApproval, status).not.toHaveBeenCalled();
    }
  });
});

describe("reviewRfpHldDesignModelArtifact - approval currency gate", () => {
  it("approves a current valid model and records exactly one approval", async () => {
    const result = await review({ decidedAt: DECIDED_AT, note: "model approved" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: MODEL_ID,
      decision: "approved",
      decidedBy: DECIDER,
      decidedAt: DECIDED_AT,
      note: "model approved",
    });
  });

  it("blocks an invalid persisted payload as invalid_hld_design_model_payload", async () => {
    setArtifactRows(validModelArtifact({ payload: { junk: true } }), validBundleArtifact());
    const result = await review();
    expect(result.status).toBe("invalid_hld_design_model_payload");
    if (result.status !== "invalid_hld_design_model_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when current design-model readiness is blocked (no source bundle)", async () => {
    mockListProjectArtifacts.mockResolvedValue([validModelArtifact()]);
    const result = await review();
    expect(result.status).toBe("stale_hld_design_model_payload");
    if (result.status !== "stale_hld_design_model_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_readiness_blocked");
    expect((result.messages ?? []).length).toBeGreaterThan(0);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the current source bundle cannot be resolved", async () => {
    // Readiness sees the bundle in the list, but the exact re-fetch returns null.
    setArtifactRows(validModelArtifact(), null);
    const result = await review();
    expect(result.status).toBe("stale_hld_design_model_payload");
    if (result.status !== "stale_hld_design_model_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_bundle_not_found");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the artifact row sourceArtifactIds is not exactly [bundle id]", async () => {
    setArtifactRows(
      validModelArtifact({ sourceArtifactIds: ["stale-bundle"] }),
      validBundleArtifact()
    );
    const result = await review();
    expect(result.status).toBe("stale_hld_design_model_payload");
    if (result.status !== "stale_hld_design_model_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_artifact_ids_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks when the persisted payload no longer matches the current bundle (compatibility)", async () => {
    const payload = validDesignModelPayload();
    payload.sourceBundleVersion = 2; // diverges from the current bundle version 1
    setArtifactRows(
      validModelArtifact({ payload: payload as unknown as Record<string, unknown> }),
      validBundleArtifact()
    );
    const result = await review();
    expect(result.status).toBe("stale_hld_design_model_payload");
    if (result.status !== "stale_hld_design_model_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_compatibility_mismatch");
    expect((result.errors ?? []).length).toBeGreaterThan(0);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks an otherwise valid model when the current source bundle is wrong-stage", async () => {
    setArtifactRows(
      validModelArtifact(),
      validBundleArtifact({ stageId: "compliance_matrix_review" })
    );
    const result = await review();
    expect(result.status).toBe("stale_hld_design_model_payload");
    if (result.status !== "stale_hld_design_model_payload") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_compatibility_mismatch");
    expect((result.errors ?? []).some((e) => e.includes("stage"))).toBe(true);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks an otherwise valid model when the current source bundle is wrong-type or unapproved", async () => {
    setArtifactRows(validModelArtifact(), validBundleArtifact({ type: "hld_intake" }));
    const wrongType = await review();
    expect(wrongType.status).toBe("stale_hld_design_model_payload");
    if (wrongType.status !== "stale_hld_design_model_payload") throw new Error("unreachable");
    expect(wrongType.staleCode).toBe("source_compatibility_mismatch");

    setArtifactRows(validModelArtifact(), validBundleArtifact({ status: "needs_review" }));
    const unapproved = await review();
    expect(unapproved.status).toBe("stale_hld_design_model_payload");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("records a REJECTION even when the persisted payload is malformed", async () => {
    setArtifactRows(validModelArtifact({ payload: { junk: true } }), validBundleArtifact());
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "rejected" })
    );
    expect(mockListProjectArtifacts).not.toHaveBeenCalled();
  });

  it("records a REJECTION even when the persisted payload is stale", async () => {
    mockListProjectArtifacts.mockResolvedValue([validModelArtifact()]);
    setArtifactRows(validModelArtifact({ sourceArtifactIds: ["stale"] }), validBundleArtifact());
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });
});

describe("reviewRfpHldDesignModelArtifact - advisory review gate", () => {
  it("approves when the current matching review has only warning/suggestion findings", async () => {
    // Default beforeEach review carries one warning and one suggestion.
    const result = await review({ decidedAt: DECIDED_AT });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("blocks with hld_design_model_review_required when no review exists", async () => {
    mockListProjectArtifacts.mockResolvedValue([
      validBundleArtifact(),
      validModelArtifact(),
    ]);
    const result = await review();
    expect(result.status).toBe("hld_design_model_review_required");
    if (result.status !== "hld_design_model_review_required") throw new Error("unreachable");
    expect(result.artifact.id).toBe(MODEL_ID);
    expect("payload" in result.artifact).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks with invalid_hld_design_model_review_payload when the latest review payload is invalid", async () => {
    mockListProjectArtifacts.mockResolvedValue([
      validBundleArtifact(),
      validModelArtifact(),
      validReviewArtifact({ payload: { junk: true } }),
    ]);
    const result = await review();
    expect(result.status).toBe("invalid_hld_design_model_review_payload");
    if (result.status !== "invalid_hld_design_model_review_payload") throw new Error("unreachable");
    expect(result.reviewArtifact.id).toBe(REVIEW_ID);
    expect(result.errors.length).toBeGreaterThan(0);
    expect("payload" in result.artifact).toBe(false);
    expect("payload" in result.reviewArtifact).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks with blocking_hld_design_model_review_findings when the current review has a blocking finding", async () => {
    mockListProjectArtifacts.mockResolvedValue([
      validBundleArtifact(),
      validModelArtifact(),
      validReviewArtifact({
        payload: blockingReviewPayload() as unknown as Record<string, unknown>,
      }),
    ]);
    const result = await review();
    expect(result.status).toBe("blocking_hld_design_model_review_findings");
    if (result.status !== "blocking_hld_design_model_review_findings") throw new Error("unreachable");
    expect(result.recommendation).toBe("reject_required");
    expect(result.findingCounts.blocking).toBe(1);
    expect(result.findingCounts.warning).toBe(1);
    expect(result.reviewArtifact.id).toBe(REVIEW_ID);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("ignores retired (stale/rejected/failed) reviews and requires a current one", async () => {
    for (const status of ["stale", "rejected", "failed"] as ProjectArtifactStatus[]) {
      mockCreateApproval.mockClear();
      mockListProjectArtifacts.mockResolvedValue([
        validBundleArtifact(),
        validModelArtifact(),
        validReviewArtifact({ status }),
      ]);
      const result = await review();
      expect(result.status, status).toBe("hld_design_model_review_required");
      expect(mockCreateApproval, status).not.toHaveBeenCalled();
    }
  });

  it("selects the latest review version and fails closed on its invalid payload", async () => {
    mockListProjectArtifacts.mockResolvedValue([
      validBundleArtifact(),
      validModelArtifact(),
      validReviewArtifact({ id: "hrev-old", version: 1 }),
      validReviewArtifact({ id: "hrev-new", version: 2, payload: { junk: true } }),
    ]);
    const result = await review();
    expect(result.status).toBe("invalid_hld_design_model_review_payload");
    if (result.status !== "invalid_hld_design_model_review_payload") throw new Error("unreachable");
    expect(result.reviewArtifact.id).toBe("hrev-new");
  });

  it("requires a fresh review when the latest valid review ties to a stale bundle id", async () => {
    const payload = validReviewPayload({
      sourceArtifactIds: [MODEL_ID, "stale-bundle"],
      sourceHldSourceBundleArtifactId: "stale-bundle",
    });
    mockListProjectArtifacts.mockResolvedValue([
      validBundleArtifact(),
      validModelArtifact(),
      validReviewArtifact({
        payload: payload as unknown as Record<string, unknown>,
        sourceArtifactIds: [MODEL_ID, "stale-bundle"],
      }),
    ]);
    const result = await review();
    expect(result.status).toBe("hld_design_model_review_required");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("records a REJECTION even when no review exists", async () => {
    mockListProjectArtifacts.mockResolvedValue([
      validBundleArtifact(),
      validModelArtifact(),
    ]);
    mockCreateApproval.mockResolvedValue(makeCreated("rejected"));
    const result = await review({ decision: "rejected" });
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    expect(mockListProjectArtifacts).not.toHaveBeenCalled();
  });
});

describe("reviewRfpHldDesignModelArtifact - result hygiene", () => {
  it("ok result returns lean summaries without leaking the payload body or tenantId", async () => {
    const payload = validDesignModelPayload();
    payload.createdBy = PAYLOAD_SENTINEL;
    setArtifactRows(
      validModelArtifact({ payload: payload as unknown as Record<string, unknown> }),
      validBundleArtifact()
    );
    const result = await review();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactStatus).toBe("approved");
    expect(result.stageStatus).toBe("approved");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain(PAYLOAD_SENTINEL);
    expect(json).not.toContain(TENANT);
  });

  it("invalid and stale results never leak the payload body or tenantId", async () => {
    setArtifactRows(validModelArtifact({ payload: { junk: true } }), validBundleArtifact());
    const invalid = await review();
    expect(invalid.status).toBe("invalid_hld_design_model_payload");
    expect(JSON.stringify(invalid)).not.toContain(TENANT);

    setArtifactRows(validModelArtifact({ sourceArtifactIds: ["stale"] }), validBundleArtifact());
    const stale = await review();
    expect(stale.status).toBe("stale_hld_design_model_payload");
    if (stale.status !== "stale_hld_design_model_payload") throw new Error("unreachable");
    expect("payload" in stale.artifact).toBe(false);
    expect(JSON.stringify(stale)).not.toContain(TENANT);
  });

  it("maps a null createProjectApproval to approval_failed", async () => {
    mockCreateApproval.mockResolvedValue(null);
    expect(await review()).toEqual({ status: "approval_failed" });
  });

  it("lets an unexpected createProjectApproval error bubble", async () => {
    mockCreateApproval.mockRejectedValue(new Error("db boom"));
    await expect(review()).rejects.toThrow("db boom");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-design-model-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, the approval helper, the contract, the readiness helper, and types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/db/project-approval-store",
      "@/lib/projects/approvals",
      "@/lib/projects/project-rfp-hld-design-model",
      "@/lib/projects/project-rfp-hld-design-model-readiness",
      "@/lib/projects/project-rfp-hld-design-model-review",
      "@/types/project",
    ]);
  });

  it("uses createProjectApproval as its only create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(Array.from(new Set(mutationTokens))).toEqual(["createProjectApproval"]);
  });

  it("imports no fs/path/raw-doc, AI/provider, pricing/sku/catalog/config, route/component, or final-output", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/ai',
      'from "next/server"',
      'from "react"',
      "@anthropic-ai",
      "pdf-parse",
      "mammoth",
      "docxtemplater",
      "drawio",
      "<mxfile",
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
