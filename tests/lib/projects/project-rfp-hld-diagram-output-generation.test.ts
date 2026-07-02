import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the store boundaries, the Stage 6F readiness gate, the final-authority guard,
// and the upstream payload validators. The Stage 6I-A diagram-output contract validator
// is intentionally NOT mocked: the service HARD-GATEs the derived output with the real
// validator before any write.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListByType,
  mockCreateArtifact,
  mockLoadReadiness,
  mockGuard,
  mockValidateModel,
  mockValidateBundle,
  mockValidateReview,
  mockValidateDiagram,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListByType: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockLoadReadiness: vi.fn(),
  mockGuard: vi.fn(),
  mockValidateModel: vi.fn(),
  mockValidateBundle: vi.fn(),
  mockValidateReview: vi.fn(),
  mockValidateDiagram: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifactsByType: mockListByType,
  createProjectArtifactVersion: mockCreateArtifact,
}));
vi.mock("@/lib/projects/project-rfp-hld-generation-readiness", () => ({
  loadRfpHldGenerationReadiness: mockLoadReadiness,
}));
vi.mock("@/lib/projects/project-rfp-hld-final-authority-regeneration-guard", () => ({
  evaluateRfpHldFinalAuthorityRegenerationGuard: mockGuard,
}));
vi.mock("@/lib/projects/project-rfp-hld-source-bundle", () => ({
  validateRfpHldSourceBundlePayload: mockValidateBundle,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model", () => ({
  validateRfpHldDesignModelPayload: mockValidateModel,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model-review", () => ({
  validateRfpHldDesignModelReviewPayload: mockValidateReview,
}));
vi.mock("@/lib/projects/project-rfp-hld-diagram", () => ({
  validateRfpHldDiagramDraftPayload: mockValidateDiagram,
}));

import {
  createRfpHldDiagramOutputDraft,
  buildRfpHldDiagramOutputPayload,
} from "@/lib/projects/project-rfp-hld-diagram-output-generation";
import {
  validateRfpHldDiagramOutputPayload,
  RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND,
  RFP_HLD_DIAGRAM_OUTPUT_FORMAT,
} from "@/lib/projects/project-rfp-hld-diagram-output";

const TENANT = "33333333-3333-3333-3333-333333333333";
const PROJECT = "proj-rfp-output-1";
const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEW_ID = "hdmr-1";
const DIAGRAM_ID = "hld-diagram-1";
const OUTPUT_ID = "hld-output-1";
const CREATED_BY = "engineer@example.com";
const CREATED_AT = new Date("2026-06-24T00:00:00.000Z");
const TS = new Date("2026-06-20T08:00:00.000Z");

function diagramPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_diagram_draft",
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceReviewArtifactId: REVIEW_ID,
    sourceModelVersion: 2,
    nodes: [
      { id: "n-1", label: "Core Switch", zoneId: "z-1", sourceRefIds: ["sr-1"] },
      { id: "n-2", label: "Access Switch", sourceRefIds: ["sr-1"] },
    ],
    links: [
      { id: "l-1", label: "Core to Access", fromNodeId: "n-1", toNodeId: "n-2", sourceRefIds: ["sr-1"] },
    ],
    zones: [{ id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-1"] }],
    ...overrides,
  };
}

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

function diagramArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: DIAGRAM_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram",
    status: "approved",
    version: 1,
    payload: diagramPayload(),
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function readyReport(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    ready: true,
    nextAction: "Approved HLD design model is ready for future HLD generation.",
    blockers: [],
    warnings: [],
    technicalAudit: {
      approvedModelArtifactId: MODEL_ID,
      sourceBundleArtifactId: BUNDLE_ID,
      reviewArtifactId: REVIEW_ID,
    },
    ...overrides,
  };
}

function artifactsById(map: Record<string, ProjectArtifact | null>) {
  return (_t: string, _p: string, id: string) => Promise.resolve(map[id] ?? null);
}

function createdRow(): ProjectArtifact {
  return {
    id: OUTPUT_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram_output",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [DIAGRAM_ID],
    createdAt: TS,
    updatedAt: TS,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof createRfpHldDiagramOutputDraft>[0]> = {}
): Parameters<typeof createRfpHldDiagramOutputDraft>[0] {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    createdBy: CREATED_BY,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockImplementation(
    artifactsById({ [MODEL_ID]: modelArtifact(), [BUNDLE_ID]: bundleArtifact(), [REVIEW_ID]: reviewArtifact() })
  );
  mockListByType.mockReset().mockResolvedValue([diagramArtifact()]);
  mockCreateArtifact.mockReset().mockResolvedValue(createdRow());
  mockLoadReadiness.mockReset().mockResolvedValue(readyReport());
  mockGuard.mockReset().mockResolvedValue({ blocked: false });
  mockValidateModel.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateBundle.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateReview.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateDiagram.mockReset().mockReturnValue({ valid: true, errors: [] });
});

// ---------------------------------------------------------------------------
// Final HLD authority regeneration guard
// ---------------------------------------------------------------------------

const FINAL_AUTHORITY_SUMMARY = {
  project: { id: PROJECT, name: "STC RFP HLD", mode: "rfp", createdAt: "x", updatedAt: "y" },
  artifact: { id: "hdoc-1", type: "hld_document", status: "approved" },
  payloadSummary: { payloadKind: "rfp_hld_document", drawioXmlLength: 42 },
  finalAuthorityStatus: "approved_manual_drawio_upload",
};

describe("createRfpHldDiagramOutputDraft - final HLD authority guard", () => {
  it("returns final_hld_already_approved after project/mode gate and before readiness/write", async () => {
    mockGuard.mockResolvedValue({ blocked: true, finalAuthority: FINAL_AUTHORITY_SUMMARY });

    const result = await createRfpHldDiagramOutputDraft(baseInput());

    expect(result).toEqual({
      status: "final_hld_already_approved",
      finalAuthority: FINAL_AUTHORITY_SUMMARY,
    });
    expect(mockGuard).toHaveBeenCalledWith({ tenantId: TENANT, projectId: PROJECT });
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockListByType).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Input + project gates
// ---------------------------------------------------------------------------

describe("createRfpHldDiagramOutputDraft - input + project gates", () => {
  it("throws on blank projectId before any store call", async () => {
    await expect(createRfpHldDiagramOutputDraft(baseInput({ projectId: "  " }))).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("throws on blank createdBy before any store call", async () => {
    await expect(createRfpHldDiagramOutputDraft(baseInput({ createdBy: "  " }))).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns not_found when the project is missing and writes nothing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "not_found" });
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Readiness + precondition gates
// ---------------------------------------------------------------------------

describe("createRfpHldDiagramOutputDraft - readiness + precondition", () => {
  it("blocks when Stage 6F readiness is not ready, writes nothing, returns nextAction", async () => {
    mockLoadReadiness.mockResolvedValue({
      status: "blocked",
      ready: false,
      nextAction: "Run a fresh review.",
      blockers: [],
      warnings: [],
    });

    const result = await createRfpHldDiagramOutputDraft(baseInput());

    expect(result.status).toBe("readiness_blocked");
    if (result.status !== "readiness_blocked") throw new Error("unreachable");
    expect(result.readinessStatus).toBe("blocked");
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (readiness_audit_incomplete) when audit ids are missing", async () => {
    mockLoadReadiness.mockResolvedValue(readyReport({ technicalAudit: { approvedModelArtifactId: MODEL_ID } }));
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "readiness_audit_incomplete" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  for (const status of ["rejected", "failed", "stale"] as const) {
    it(`fails precondition (review_unavailable) when the review is ${status}`, async () => {
      mockGetArtifactById.mockImplementation(
        artifactsById({
          [MODEL_ID]: modelArtifact(),
          [BUNDLE_ID]: bundleArtifact(),
          [REVIEW_ID]: reviewArtifact({ status: status as ProjectArtifact["status"] }),
        })
      );
      const result = await createRfpHldDiagramOutputDraft(baseInput());
      expect(result).toEqual({ status: "precondition_failed", code: "review_unavailable" });
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    });
  }

  it("fails precondition (approved_model_invalid) when the model payload is invalid", async () => {
    mockValidateModel.mockReturnValue({ valid: false, errors: ["bad"] });
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "approved_model_invalid" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (source_bundle_invalid) when the bundle payload is invalid", async () => {
    mockValidateBundle.mockReturnValue({ valid: false, errors: ["bad"] });
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "source_bundle_invalid" });
  });

  it("fails precondition (review_invalid) when the review payload is invalid", async () => {
    mockValidateReview.mockReturnValue({ valid: false, errors: ["bad"] });
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "review_invalid" });
  });

  it("fails precondition (source_chain_mismatch) when the review source ids do not match", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact(),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact({ sourceArtifactIds: [MODEL_ID, "other-bundle"] }),
      })
    );
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "source_chain_mismatch" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (source_chain_mismatch) when the model payload source ids do not match", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact({
          payload: {
            payloadKind: "rfp_hld_design_model",
            sourceArtifactIds: ["other-bundle"],
            sourceHldSourceBundleArtifactId: BUNDLE_ID,
          },
        }),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact(),
      })
    );
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "source_chain_mismatch" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (approved_diagram_unavailable) when no current approved diagram matches", async () => {
    mockListByType.mockResolvedValue([diagramArtifact({ status: "needs_review" })]);
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "approved_diagram_unavailable" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (approved_diagram_unavailable) when the diagram model version is stale", async () => {
    mockListByType.mockResolvedValue([
      diagramArtifact({ payload: diagramPayload({ sourceModelVersion: 1 }) }),
    ]);
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "approved_diagram_unavailable" });
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("createRfpHldDiagramOutputDraft - ok", () => {
  it("creates exactly one needs_review hld_diagram_output with exact source provenance", async () => {
    const result = await createRfpHldDiagramOutputDraft(baseInput());

    expect(result.status).toBe("ok");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const arg = mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.status).toBe("needs_review");
    expect(arg.type).toBe("hld_diagram_output");
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([DIAGRAM_ID]);
    // The persisted payload is the contract-valid diagram output.
    expect(validateRfpHldDiagramOutputPayload(arg.payload).ok).toBe(true);
    const payload = arg.payload as Record<string, unknown>;
    expect(payload.sourceDiagramVersion).toBe(1);
    // Link fields are converted to sourceNodeId / targetNodeId.
    const links = payload.links as Array<Record<string, unknown>>;
    expect(links[0].sourceNodeId).toBe("n-1");
    expect(links[0].targetNodeId).toBe("n-2");
    expect("fromNodeId" in links[0]).toBe(false);
    expect("toNodeId" in links[0]).toBe(false);
    // Output nodes carry no nodeType.
    const nodes = payload.nodes as Array<Record<string, unknown>>;
    expect("nodeType" in nodes[0]).toBe(false);
  });

  it("selects the newest matching approved diagram by version then createdAt", async () => {
    const older = diagramArtifact({ id: "d-old", version: 1, createdAt: new Date("2026-06-19T00:00:00.000Z") });
    const newer = diagramArtifact({ id: "d-new", version: 3, createdAt: new Date("2026-06-20T00:00:00.000Z") });
    mockListByType.mockResolvedValue([older, newer]);

    const result = await createRfpHldDiagramOutputDraft(baseInput());

    expect(result.status).toBe("ok");
    const arg = mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.sourceArtifactIds).toEqual(["d-new"]);
  });

  it("returns a lean artifact summary and counts-only payloadSummary, no payload body and no tenantId", async () => {
    const result = await createRfpHldDiagramOutputDraft(baseInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect("nodes" in result.payloadSummary).toBe(false);
    expect(result.payloadSummary).toMatchObject({
      payloadKind: RFP_HLD_DIAGRAM_OUTPUT_PAYLOAD_KIND,
      outputFormat: RFP_HLD_DIAGRAM_OUTPUT_FORMAT,
      diagramType: "topology",
      nodeCount: 2,
      linkCount: 1,
      zoneCount: 1,
      validationFindingCount: 0,
      sourceArtifactIds: [DIAGRAM_ID],
      sourceHldDiagramArtifactId: DIAGRAM_ID,
      sourceDiagramVersion: 1,
    });
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });
});

// ---------------------------------------------------------------------------
// Current-output guard (no second current output)
// ---------------------------------------------------------------------------

function outputArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: "hld-output-existing-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram_output",
    status: "needs_review",
    version: 1,
    payload: { payloadKind: "rfp_hld_diagram_output" },
    sourceFileIds: [],
    sourceArtifactIds: [DIAGRAM_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

/** Route DIAGRAM_TYPE list to the diagram fixture and OUTPUT_TYPE list to `outputs`. */
function listByTypeImpl(outputs: ProjectArtifact[]) {
  return (_t: string, _p: string, type: string) =>
    Promise.resolve(type === "hld_diagram_output" ? outputs : [diagramArtifact()]);
}

describe("createRfpHldDiagramOutputDraft - current-output guard", () => {
  for (const status of ["generated", "needs_review", "approved"] as const) {
    it(`blocks (current_output_exists) when a ${status} current output exists and writes nothing`, async () => {
      mockListByType.mockImplementation(
        listByTypeImpl([outputArtifact({ status: status as ProjectArtifact["status"] })])
      );

      const result = await createRfpHldDiagramOutputDraft(baseInput());

      expect(result.status).toBe("current_output_exists");
      if (result.status !== "current_output_exists") throw new Error("unreachable");
      expect(result.artifact.id).toBe("hld-output-existing-1");
      expect(result.artifact.status).toBe(status);
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    });
  }

  it("returns the newest current output by version then createdAt", async () => {
    const older = outputArtifact({ id: "o-old", version: 1, createdAt: new Date("2026-06-19T00:00:00.000Z") });
    const newer = outputArtifact({ id: "o-new", version: 3, createdAt: new Date("2026-06-20T00:00:00.000Z") });
    mockListByType.mockImplementation(listByTypeImpl([older, newer]));

    const result = await createRfpHldDiagramOutputDraft(baseInput());

    expect(result.status).toBe("current_output_exists");
    if (result.status !== "current_output_exists") throw new Error("unreachable");
    expect(result.artifact.id).toBe("o-new");
  });

  it("does not block when the only existing output is rejected", async () => {
    mockListByType.mockImplementation(listByTypeImpl([outputArtifact({ status: "rejected" })]));
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result.status).toBe("ok");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
  });

  for (const status of ["missing", "stale", "failed", "not_applicable"] as const) {
    it(`does not block when the only existing output is ${status}`, async () => {
      mockListByType.mockImplementation(
        listByTypeImpl([outputArtifact({ status: status as ProjectArtifact["status"] })])
      );
      const result = await createRfpHldDiagramOutputDraft(baseInput());
      expect(result.status).toBe("ok");
      expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    });
  }

  it("does not block when a current output is on a different stage", async () => {
    mockListByType.mockImplementation(
      listByTypeImpl([outputArtifact({ stageId: "bom_generation" as ProjectArtifact["stageId"] })])
    );
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result.status).toBe("ok");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
  });

  it("does not block when a current output belongs to a different project", async () => {
    mockListByType.mockImplementation(
      listByTypeImpl([outputArtifact({ projectId: "other-project" })])
    );
    const result = await createRfpHldDiagramOutputDraft(baseInput());
    expect(result.status).toBe("ok");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
  });

  it("returns a lean blocking artifact summary with no payload/provider/raw/final-output/download/export/draw.io/XML fields", async () => {
    mockListByType.mockImplementation(listByTypeImpl([outputArtifact()]));

    const result = await createRfpHldDiagramOutputDraft(baseInput());

    expect(result.status).toBe("current_output_exists");
    if (result.status !== "current_output_exists") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect("tenantId" in result.artifact).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    for (const forbidden of [
      "payload", "provider", "rawText", "documentText", "filePath", "storagePath",
      "finalAuthority", "drawioXml", "mxfile", "<mxfile", "downloadUrl", "exportUrl", "nodeType",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure builder derivation semantics
// ---------------------------------------------------------------------------

describe("buildRfpHldDiagramOutputPayload - deterministic derivation", () => {
  it("derives a contract-valid output, converts link endpoints, and drops nodeType", () => {
    const payload = buildRfpHldDiagramOutputPayload({
      diagram: diagramArtifact(),
      createdBy: CREATED_BY,
      createdAt: CREATED_AT.toISOString(),
    });

    expect(validateRfpHldDiagramOutputPayload(payload).ok).toBe(true);
    expect(payload.sourceArtifactIds).toEqual([DIAGRAM_ID]);
    expect(payload.sourceHldDiagramArtifactId).toBe(DIAGRAM_ID);
    expect(payload.sourceDiagramVersion).toBe(1);
    expect(payload.nodes.map((n) => n.id)).toEqual(["n-1", "n-2"]);
    expect(payload.links[0]).toMatchObject({ id: "l-1", sourceNodeId: "n-1", targetNodeId: "n-2" });
    // Every element carries the coarse single-source provenance [diagram.id].
    for (const n of payload.nodes) expect(n.sourceRefIds).toEqual([DIAGRAM_ID]);
    for (const l of payload.links) expect(l.sourceRefIds).toEqual([DIAGRAM_ID]);
    for (const z of payload.zones) expect(z.sourceRefIds).toEqual([DIAGRAM_ID]);
  });

  it("emits no SKU/pricing/catalog/config/provider/raw/final-output fields or markup", () => {
    const payload = buildRfpHldDiagramOutputPayload({
      diagram: diagramArtifact(),
      createdBy: CREATED_BY,
      createdAt: CREATED_AT.toISOString(),
    });
    const json = JSON.stringify(payload);
    for (const forbidden of [
      "sku", "unitPrice", "pricing", "catalogDecision", "configurationDecision",
      "rawText", "documentText", "filePath", "storagePath",
      "drawioXml", "mxfile", "<mxfile", "downloadUrl", "nodeType",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Static module purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-diagram-output-generation - module purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-diagram-output-generation.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-diagram-output-generation.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports no provider/AI, pricing/SKU/catalog/config, raw-file, or approval module", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    for (const forbidden of [
      "@anthropic-ai", "@google/generative-ai", "openai", "pdf-parse", "mammoth", "xlsx",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    for (const f of froms) {
      expect(f).not.toContain("@/lib/ai");
      expect(f).not.toContain("@/lib/llm");
      expect(f).not.toContain("@/lib/adapters");
      expect(f).not.toContain("@/lib/catalog");
      expect(f).not.toContain("@/engines");
      expect(f).not.toContain("pricing");
      expect(f).not.toContain("priced-boq");
      expect(f).not.toContain("sku-resolution");
      expect(f).not.toContain("config-expansion");
      expect(f).not.toContain("project-file-store");
      expect(f).not.toContain("project-evidence-store");
      expect(f).not.toContain("approval");
    }
  });

  it("invokes no approval/upload/download/edit behavior", () => {
    expect(source).not.toContain("createProjectApproval(");
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("keeps source and test files ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
