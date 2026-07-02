import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the store boundaries, the reviewable predicate, and every payload validator so
// the approval gates and the approval-only source-chain re-verification are tested
// independent of the DB and the contract internals.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateApproval,
  mockReviewable,
  mockValidateOutput,
  mockValidateDiagram,
  mockValidateModel,
  mockValidateBundle,
  mockValidateReview,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateApproval: vi.fn(),
  mockReviewable: vi.fn(),
  mockValidateOutput: vi.fn(),
  mockValidateDiagram: vi.fn(),
  mockValidateModel: vi.fn(),
  mockValidateBundle: vi.fn(),
  mockValidateReview: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProjectById }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
}));
vi.mock("@/lib/db/project-approval-store", () => ({
  createProjectApproval: mockCreateApproval,
}));
vi.mock("@/lib/projects/approvals", () => ({ isArtifactReviewable: mockReviewable }));
vi.mock("@/lib/projects/project-rfp-hld-diagram-output", () => ({
  validateRfpHldDiagramOutputPayload: mockValidateOutput,
}));
vi.mock("@/lib/projects/project-rfp-hld-diagram", () => ({
  validateRfpHldDiagramDraftPayload: mockValidateDiagram,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model", () => ({
  validateRfpHldDesignModelPayload: mockValidateModel,
}));
vi.mock("@/lib/projects/project-rfp-hld-source-bundle", () => ({
  validateRfpHldSourceBundlePayload: mockValidateBundle,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model-review", () => ({
  validateRfpHldDesignModelReviewPayload: mockValidateReview,
}));

import { reviewRfpHldDiagramOutputArtifact } from "@/lib/projects/project-rfp-hld-diagram-output-approval";

const TENANT = "33333333-3333-3333-3333-333333333333";
const PROJECT = "proj-rfp-output-1";
const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEW_ID = "hdmr-1";
const DIAGRAM_ID = "hld-diagram-1";
const OUTPUT_ID = "hld-output-1";
const DECIDED_BY = "engineer@example.com";
const TS = new Date("2026-06-20T08:00:00.000Z");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP HLD",
    customerName: "STC",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function outputArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: OUTPUT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram_output",
    status: "needs_review",
    version: 1,
    payload: {
      payloadKind: "rfp_hld_diagram_output",
      sourceArtifactIds: [DIAGRAM_ID],
      sourceHldDiagramArtifactId: DIAGRAM_ID,
      sourceDiagramVersion: 1,
    },
    sourceFileIds: [],
    sourceArtifactIds: [DIAGRAM_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function diagramArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DIAGRAM_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram",
    status: "approved",
    version: 1,
    payload: {
      payloadKind: "rfp_hld_diagram_draft",
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
      sourceReviewArtifactId: REVIEW_ID,
      sourceModelVersion: 2,
    },
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function modelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: MODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "approved",
    version: 2,
    payload: {
      payloadKind: "rfp_hld_design_model",
      sourceArtifactIds: [BUNDLE_ID],
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
    },
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function bundleArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: BUNDLE_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    payload: { payloadKind: "rfp_hld_source_bundle" },
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function reviewArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: REVIEW_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "approved",
    version: 1,
    payload: {
      payloadKind: "rfp_hld_design_model_review",
      sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
    },
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function artifactsById(map: Record<string, ProjectArtifact | null>) {
  return (_t: string, _p: string, id: string) => Promise.resolve(map[id] ?? null);
}

function defaultMap(over: Record<string, ProjectArtifact | null> = {}) {
  return {
    [OUTPUT_ID]: outputArtifact(),
    [DIAGRAM_ID]: diagramArtifact(),
    [MODEL_ID]: modelArtifact(),
    [BUNDLE_ID]: bundleArtifact(),
    [REVIEW_ID]: reviewArtifact(),
    ...over,
  };
}

const APPROVAL_RESULT = {
  approval: { id: "approval-1", artifactId: OUTPUT_ID, decision: "approved", decidedBy: DECIDED_BY },
  artifactStatus: "approved" as const,
  stageStatus: "complete" as const,
};

function input(overrides: Partial<Parameters<typeof reviewRfpHldDiagramOutputArtifact>[0]> = {}) {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: OUTPUT_ID,
    decision: "approved" as const,
    decidedBy: DECIDED_BY,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockImplementation(artifactsById(defaultMap()));
  mockCreateApproval.mockReset().mockResolvedValue(APPROVAL_RESULT);
  mockReviewable.mockReset().mockReturnValue(true);
  mockValidateOutput.mockReset().mockReturnValue({ ok: true, value: {} });
  mockValidateDiagram.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateModel.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateBundle.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateReview.mockReset().mockReturnValue({ valid: true, errors: [] });
});

// ---------------------------------------------------------------------------
// Input + project + artifact gates
// ---------------------------------------------------------------------------

describe("reviewRfpHldDiagramOutputArtifact - gates", () => {
  it("throws on blank artifactId before any store call", async () => {
    await expect(reviewRfpHldDiagramOutputArtifact(input({ artifactId: "  " }))).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("throws on blank decidedBy before any store call", async () => {
    await expect(reviewRfpHldDiagramOutputArtifact(input({ decidedBy: "  " }))).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    expect(await reviewRfpHldDiagramOutputArtifact(input())).toEqual({ status: "not_found" });
  });

  it("returns wrong_mode for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("wrong_mode");
  });

  it("returns artifact_not_hld_diagram_output for the wrong type", async () => {
    mockGetArtifactById.mockImplementation(artifactsById(defaultMap({ [OUTPUT_ID]: outputArtifact({ type: "hld_diagram" }) })));
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("artifact_not_hld_diagram_output");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("returns artifact_not_reviewable when not reviewable", async () => {
    mockReviewable.mockReturnValue(false);
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("artifact_not_reviewable");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Approval happy path + rejection
// ---------------------------------------------------------------------------

describe("reviewRfpHldDiagramOutputArtifact - decisions", () => {
  it("approval happy path writes exactly one approval", async () => {
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("ok");
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
    const arg = mockCreateApproval.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.decision).toBe("approved");
    expect(arg.artifactId).toBe(OUTPUT_ID);
  });

  it("rejection skips output payload + source-chain validation and still records", async () => {
    mockValidateOutput.mockReturnValue({ ok: false, errors: ["bad"] });
    const result = await reviewRfpHldDiagramOutputArtifact(input({ decision: "rejected" }));
    expect(result.status).toBe("ok");
    expect(mockValidateOutput).not.toHaveBeenCalled();
    // Only the output artifact itself was loaded; no source-chain walk on rejection.
    expect(mockGetArtifactById).toHaveBeenCalledTimes(1);
    expect(mockCreateApproval).toHaveBeenCalledTimes(1);
  });

  it("maps a null createProjectApproval to approval_failed", async () => {
    mockCreateApproval.mockResolvedValue(null);
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("approval_failed");
  });
});

// ---------------------------------------------------------------------------
// Approval-only source-chain re-verification
// ---------------------------------------------------------------------------

describe("reviewRfpHldDiagramOutputArtifact - approval source chain", () => {
  it("blocks with invalid_hld_diagram_output_payload when the output payload is invalid", async () => {
    mockValidateOutput.mockReturnValue({ ok: false, errors: ["bad"] });
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("invalid_hld_diagram_output_payload");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks source_artifact_ids_mismatch when the output row source ids drift", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById(defaultMap({ [OUTPUT_ID]: outputArtifact({ sourceArtifactIds: ["other"] }) }))
    );
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("stale_hld_diagram_output_source_chain");
    if (result.status !== "stale_hld_diagram_output_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_artifact_ids_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks source_diagram_unavailable when the source diagram is not approved", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById(defaultMap({ [DIAGRAM_ID]: diagramArtifact({ status: "needs_review" }) }))
    );
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("stale_hld_diagram_output_source_chain");
    if (result.status !== "stale_hld_diagram_output_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_diagram_unavailable");
  });

  it("blocks source_diagram_version_mismatch when the diagram version drifts", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById(defaultMap({ [DIAGRAM_ID]: diagramArtifact({ version: 5 }) }))
    );
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("stale_hld_diagram_output_source_chain");
    if (result.status !== "stale_hld_diagram_output_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_diagram_version_mismatch");
  });

  it("blocks source_model_unavailable when the model is not approved", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById(defaultMap({ [MODEL_ID]: modelArtifact({ status: "needs_review" }) }))
    );
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("stale_hld_diagram_output_source_chain");
    if (result.status !== "stale_hld_diagram_output_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_model_unavailable");
  });

  it("blocks source_chain_mismatch when the diagram sourceModelVersion drifts from the approved model", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById(defaultMap({
        [DIAGRAM_ID]: diagramArtifact({
          payload: {
            payloadKind: "rfp_hld_diagram_draft",
            sourceHldDesignModelArtifactId: MODEL_ID,
            sourceHldSourceBundleArtifactId: BUNDLE_ID,
            sourceReviewArtifactId: REVIEW_ID,
            sourceModelVersion: 1,
          },
        }),
      }))
    );
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("stale_hld_diagram_output_source_chain");
    if (result.status !== "stale_hld_diagram_output_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_chain_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks source_upstream_invalid when a model/bundle/review payload is invalid", async () => {
    mockValidateReview.mockReturnValue({ valid: false, errors: ["bad"] });
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("stale_hld_diagram_output_source_chain");
    if (result.status !== "stale_hld_diagram_output_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_upstream_invalid");
  });

  it("blocks source_chain_mismatch when the model payload source ids drift", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById(defaultMap({
        [MODEL_ID]: modelArtifact({
          payload: {
            payloadKind: "rfp_hld_design_model",
            sourceArtifactIds: ["other-bundle"],
            sourceHldSourceBundleArtifactId: BUNDLE_ID,
          },
        }),
      }))
    );
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("stale_hld_diagram_output_source_chain");
    if (result.status !== "stale_hld_diagram_output_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_chain_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });

  it("blocks source_chain_mismatch when the review payload source ids drift", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById(defaultMap({
        [REVIEW_ID]: reviewArtifact({
          payload: {
            payloadKind: "rfp_hld_design_model_review",
            sourceArtifactIds: [MODEL_ID, "other"],
            sourceHldDesignModelArtifactId: MODEL_ID,
            sourceHldSourceBundleArtifactId: BUNDLE_ID,
          },
        }),
      }))
    );
    const result = await reviewRfpHldDiagramOutputArtifact(input());
    expect(result.status).toBe("stale_hld_diagram_output_source_chain");
    if (result.status !== "stale_hld_diagram_output_source_chain") throw new Error("unreachable");
    expect(result.staleCode).toBe("source_chain_mismatch");
    expect(mockCreateApproval).not.toHaveBeenCalled();
  });
});
