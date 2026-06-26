import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the store boundaries, the Stage 6F readiness gate, and the two upstream
// payload validators (source bundle + design model) for compact fixtures. The
// Stage 6G diagram contract validator and the Stage 6H document-model contract
// validator are intentionally NOT mocked: the service HARD-GATEs the derived draft
// with the real document-model validator before any write, and re-validates the
// approved diagram with the real diagram validator before selecting it.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListByType,
  mockCreateArtifact,
  mockLoadReadiness,
  mockValidateBundle,
  mockValidateModel,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListByType: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockLoadReadiness: vi.fn(),
  mockValidateBundle: vi.fn(),
  mockValidateModel: vi.fn(),
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
vi.mock("@/lib/projects/project-rfp-hld-source-bundle", () => ({
  validateRfpHldSourceBundlePayload: mockValidateBundle,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model", () => ({
  validateRfpHldDesignModelPayload: mockValidateModel,
}));

import {
  createRfpHldDocumentModelDraft,
  buildRfpHldDocumentModelPayload,
} from "@/lib/projects/project-rfp-hld-document-model-draft";
import {
  validateRfpHldDocumentModelPayload,
  RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
} from "@/lib/projects/project-rfp-hld-document-model";

const TENANT = "44444444-4444-4444-4444-444444444444";
const PROJECT = "proj-rfp-docmodel-1";
const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEW_ID = "hdmr-1";
const DIAGRAM_ID = "hld-diagram-1";
const DOC_MODEL_ID = "hld-docmodel-1";
const CREATED_BY = "engineer@example.com";
const CREATED_AT = new Date("2026-06-24T00:00:00.000Z");
const TS = new Date("2026-06-20T08:00:00.000Z");

const MODEL_VERSION = 2;

// ---------------------------------------------------------------------------
// Upstream payload fixtures (bundle + model validators are mocked, so these only
// need the fields the deterministic builder + service re-checks actually read).
// ---------------------------------------------------------------------------

function bundlePayload(): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_source_bundle",
    coveredDomains: ["campus_switching"],
    assumptions: [{ statement: "Existing power and rack space are sufficient." }],
    constraints: [{ statement: "Stage migration after hours." }],
    warnings: [{ message: "Lead times may shift the schedule." }],
  };
}

function modelPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_design_model",
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceArtifactIds: [BUNDLE_ID],
    coveredDomains: ["campus_switching"],
    excludedDomains: ["wireless"],
    designSections: [
      { title: "Core Design", decisions: [{ label: "Collapsed core with redundant uplinks." }] },
    ],
    topology: { zones: [{ label: "Campus Zone" }] },
    traceability: { complianceRefs: ["c-1", "c-2"], requirementRefs: ["r-1"], configurationRefs: [] },
    validationFindings: [],
    ...overrides,
  };
}

/** A real contract-valid rfp_hld_diagram_draft payload (the diagram validator is real). */
function diagramPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_diagram_draft",
    createdAt: "2026-06-23T00:00:00.000Z",
    createdBy: CREATED_BY,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceReviewArtifactId: REVIEW_ID,
    sourceModelVersion: MODEL_VERSION,
    diagramType: "topology",
    title: "HLD Topology Diagram",
    nodes: [
      { id: "n-1", label: "Core Switch", nodeType: "switch", domain: "campus_switching", zoneId: "z-1", sourceRefIds: ["sr-model"] },
      { id: "n-2", label: "Access Switch", nodeType: "switch", zoneId: "z-1", sourceRefIds: ["sr-model"] },
    ],
    links: [
      { id: "l-1", label: "Core to Access", fromNodeId: "n-1", toNodeId: "n-2", linkType: "ethernet", sourceRefIds: ["sr-model"] },
    ],
    zones: [
      { id: "z-1", label: "Campus Zone", nodeIds: ["n-1", "n-2"], sourceRefIds: ["sr-model"] },
    ],
    sourceReferences: [
      { id: "sr-model", artifactId: MODEL_ID, artifactType: "hld_design_model" },
      { id: "sr-bundle", artifactId: BUNDLE_ID, artifactType: "hld_source_bundle" },
      { id: "sr-review", artifactId: REVIEW_ID, artifactType: "hld_design_model_review" },
    ],
    validationFindings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Artifact + project fixtures
// ---------------------------------------------------------------------------

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
    version: MODEL_VERSION,
    payload: modelPayload(),
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
    payload: bundlePayload(),
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
    payload: { payloadKind: "rfp_hld_design_model_review" },
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

/** Resolve getProjectArtifactById per artifact id. */
function artifactsById(map: Record<string, ProjectArtifact | null>) {
  return (_t: string, _p: string, id: string) => Promise.resolve(map[id] ?? null);
}

function createdRow(): ProjectArtifact {
  return {
    id: DOC_MODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_document_model",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    createdAt: TS,
    updatedAt: TS,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof createRfpHldDocumentModelDraft>[0]> = {}
): Parameters<typeof createRfpHldDocumentModelDraft>[0] {
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
  mockValidateBundle.mockReset().mockReturnValue({ valid: true, errors: [] });
  mockValidateModel.mockReset().mockReturnValue({ valid: true, errors: [] });
});

// ---------------------------------------------------------------------------
// Input gates
// ---------------------------------------------------------------------------

describe("createRfpHldDocumentModelDraft - input gates", () => {
  it("throws on blank projectId before any store call", async () => {
    await expect(createRfpHldDocumentModelDraft(baseInput({ projectId: "  " }))).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("throws on blank createdBy before any store call", async () => {
    await expect(createRfpHldDocumentModelDraft(baseInput({ createdBy: "  " }))).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Project gates
// ---------------------------------------------------------------------------

describe("createRfpHldDocumentModelDraft - project gates", () => {
  it("returns not_found when the project is missing and writes nothing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "not_found" });
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Readiness gate
// ---------------------------------------------------------------------------

describe("createRfpHldDocumentModelDraft - readiness", () => {
  it("blocks when Stage 6F readiness is not ready, writes nothing, returns status + nextAction", async () => {
    mockLoadReadiness.mockResolvedValue({
      status: "blocked",
      ready: false,
      nextAction: "Run a fresh deterministic HLD design-model review for the approved model.",
      blockers: [],
      warnings: [],
    });

    const result = await createRfpHldDocumentModelDraft(baseInput());

    expect(result.status).toBe("readiness_blocked");
    if (result.status !== "readiness_blocked") throw new Error("unreachable");
    expect(result.readinessStatus).toBe("blocked");
    expect(result.nextAction).toContain("review");
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Precondition gates (readiness-approved chain fails re-gating)
// ---------------------------------------------------------------------------

describe("createRfpHldDocumentModelDraft - precondition gates", () => {
  it("fails precondition (readiness_audit_incomplete) and writes nothing when audit ids are missing", async () => {
    mockLoadReadiness.mockResolvedValue(readyReport({ technicalAudit: { approvedModelArtifactId: MODEL_ID } }));

    const result = await createRfpHldDocumentModelDraft(baseInput());

    expect(result).toEqual({ status: "precondition_failed", code: "readiness_audit_incomplete" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (source_bundle_unavailable) when the bundle is missing/wrong-type/wrong-stage/non-approved", async () => {
    const variants: Array<ProjectArtifact | null> = [
      null,
      bundleArtifact({ status: "rejected" }),
      bundleArtifact({ type: "hld_design_model" }),
      bundleArtifact({ stageId: "lld_generation" as ProjectArtifact["stageId"] }),
    ];
    for (const bundle of variants) {
      mockCreateArtifact.mockClear();
      mockGetArtifactById.mockImplementation(
        artifactsById({ [MODEL_ID]: modelArtifact(), [BUNDLE_ID]: bundle, [REVIEW_ID]: reviewArtifact() })
      );
      const result = await createRfpHldDocumentModelDraft(baseInput());
      expect(result).toEqual({ status: "precondition_failed", code: "source_bundle_unavailable" });
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    }
  });

  it("fails precondition (approved_model_unavailable) when the model is missing/wrong-type/wrong-stage/non-approved", async () => {
    const variants: Array<ProjectArtifact | null> = [
      null,
      modelArtifact({ status: "needs_review" }),
      modelArtifact({ type: "hld_source_bundle" }),
      modelArtifact({ stageId: "lld_generation" as ProjectArtifact["stageId"] }),
    ];
    for (const model of variants) {
      mockCreateArtifact.mockClear();
      mockGetArtifactById.mockImplementation(
        artifactsById({ [MODEL_ID]: model, [BUNDLE_ID]: bundleArtifact(), [REVIEW_ID]: reviewArtifact() })
      );
      const result = await createRfpHldDocumentModelDraft(baseInput());
      expect(result).toEqual({ status: "precondition_failed", code: "approved_model_unavailable" });
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    }
  });

  it("fails precondition (review_unavailable) when the matching review is inactive", async () => {
    for (const status of ["rejected", "failed", "stale"] as const) {
      mockCreateArtifact.mockClear();
      mockGetArtifactById.mockImplementation(
        artifactsById({
          [MODEL_ID]: modelArtifact(),
          [BUNDLE_ID]: bundleArtifact(),
          [REVIEW_ID]: reviewArtifact({ status: status as ProjectArtifact["status"] }),
        })
      );
      const result = await createRfpHldDocumentModelDraft(baseInput());
      expect(result).toEqual({ status: "precondition_failed", code: "review_unavailable" });
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    }
  });

  it("fails precondition (source_bundle_invalid) when the bundle payload fails its own contract", async () => {
    mockValidateBundle.mockReturnValue({ valid: false, errors: ["bad bundle"] });
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "source_bundle_invalid" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (approved_model_invalid) when the model payload fails its own contract", async () => {
    mockValidateModel.mockReturnValue({ valid: false, errors: ["bad model"] });
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "approved_model_invalid" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (source_ids_mismatch) when the model/review source chain does not line up", async () => {
    // model row points at a different bundle
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact({ sourceArtifactIds: ["other-bundle"] }),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact(),
      })
    );
    let result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "source_ids_mismatch" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();

    // review row points at the wrong [model, bundle]
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact(),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact({ sourceArtifactIds: [MODEL_ID, "other-bundle"] }),
      })
    );
    result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "source_ids_mismatch" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (source_ids_mismatch) when the model covers a domain absent from the bundle", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact({ payload: modelPayload({ coveredDomains: ["campus_switching", "wan_routing"] }) }),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact(),
      })
    );
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "source_ids_mismatch" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (approved_diagram_unavailable) when no approved diagram exists", async () => {
    mockListByType.mockResolvedValue([diagramArtifact({ status: "needs_review" })]);
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "approved_diagram_unavailable" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (approved_diagram_stale_or_invalid) when the approved diagram is invalid/row-mismatched/version-stale", async () => {
    const variants: ProjectArtifact[] = [
      // invalid payload (corrupt)
      diagramArtifact({ payload: { payloadKind: "rfp_hld_diagram_draft" } }),
      // row source ids do not match the approved model/bundle/review
      diagramArtifact({ sourceArtifactIds: [MODEL_ID, BUNDLE_ID] }),
      // payload model version no longer matches the current approved model version
      diagramArtifact({ payload: diagramPayload({ sourceModelVersion: 1 }) }),
    ];
    for (const diagram of variants) {
      mockCreateArtifact.mockClear();
      mockListByType.mockResolvedValue([diagram]);
      const result = await createRfpHldDocumentModelDraft(baseInput());
      expect(result).toEqual({ status: "precondition_failed", code: "approved_diagram_stale_or_invalid" });
      expect(mockCreateArtifact).not.toHaveBeenCalled();
    }
  });

  // --- wrong-project edge cases -------------------------------------------

  it("fails precondition (source_bundle_unavailable) when the bundle row belongs to a different project", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact(),
        [BUNDLE_ID]: bundleArtifact({ projectId: "other-project" }),
        [REVIEW_ID]: reviewArtifact(),
      })
    );
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "source_bundle_unavailable" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (approved_model_unavailable) when the model row belongs to a different project", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact({ projectId: "other-project" }),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact(),
      })
    );
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "approved_model_unavailable" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (review_unavailable) when the review row belongs to a different project", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact(),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact({ projectId: "other-project" }),
      })
    );
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "review_unavailable" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (approved_diagram_stale_or_invalid) when diagram payload sourceReviewArtifactId points at a different id", async () => {
    // Payload is internally consistent (validator passes) but sourceReviewArtifactId
    // does not match the approved review id, so selectCurrentApprovedDiagram rejects it.
    const wrongReviewPayload = diagramPayload({
      sourceReviewArtifactId: "other-review",
      sourceArtifactIds: [MODEL_ID, BUNDLE_ID, "other-review"],
      sourceReferences: [
        { id: "sr-model", artifactId: MODEL_ID, artifactType: "hld_design_model" },
        { id: "sr-bundle", artifactId: BUNDLE_ID, artifactType: "hld_source_bundle" },
        { id: "sr-review", artifactId: "other-review", artifactType: "hld_design_model_review" },
      ],
    });
    // Row sourceArtifactIds kept matching so the row-level sameOrdered check passes;
    // the payload-level sourceReviewArtifactId mismatch is what must reject it.
    mockListByType.mockResolvedValue([
      diagramArtifact({ payload: wrongReviewPayload }),
    ]);
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result).toEqual({ status: "precondition_failed", code: "approved_diagram_stale_or_invalid" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("createRfpHldDocumentModelDraft - ok", () => {
  it("creates exactly one needs_review hld_document_model on hld_design_delta_review with the exact provenance", async () => {
    const result = await createRfpHldDocumentModelDraft(baseInput());

    expect(result.status).toBe("ok");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const arg = mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.status).toBe("needs_review");
    expect(arg.type).toBe("hld_document_model");
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([BUNDLE_ID, MODEL_ID, DIAGRAM_ID]);
  });

  it("persists a payload that passes the real validateRfpHldDocumentModelPayload", async () => {
    await createRfpHldDocumentModelDraft(baseInput());
    const arg = mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>;
    expect(validateRfpHldDocumentModelPayload(arg.payload).valid).toBe(true);
  });

  it("returns a lean result: no tenantId and no full payload body", async () => {
    const result = await createRfpHldDocumentModelDraft(baseInput());
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect("coveredDomains" in result.payloadSummary).toBe(false);
    expect("assumptions" in result.payloadSummary).toBe(false);
    expect(result.payloadSummary.payloadKind).toBe(RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND);
    expect(result.payloadSummary.sourceHldSourceBundleArtifactId).toBe(BUNDLE_ID);
    expect(result.payloadSummary.sourceHldDesignModelArtifactId).toBe(MODEL_ID);
    expect(result.payloadSummary.sourceHldDiagramArtifactId).toBe(DIAGRAM_ID);
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });
});

// ---------------------------------------------------------------------------
// Pure builder derivation semantics
// ---------------------------------------------------------------------------

describe("buildRfpHldDocumentModelPayload - deterministic derivation", () => {
  function build() {
    return buildRfpHldDocumentModelPayload({
      bundle: bundleArtifact(),
      model: modelArtifact(),
      diagram: diagramArtifact(),
      createdBy: CREATED_BY,
      createdAt: CREATED_AT.toISOString(),
    });
  }

  it("derives the expected sections, counts, and coarse provenance", () => {
    const payload = build();

    expect(payload.payloadKind).toBe(RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND);
    expect(payload.sourceArtifactIds).toEqual([BUNDLE_ID, MODEL_ID, DIAGRAM_ID]);
    expect(payload.sourceModelVersion).toBe(MODEL_VERSION);
    expect(payload.sourceDiagramVersion).toBe(1);
    expect(payload.coveredDomains).toEqual(["campus_switching"]);
    expect(payload.excludedDomains).toEqual(["wireless"]);
    expect(payload.assumptions).toHaveLength(1);
    expect(payload.designSummary).toHaveLength(1);
    // topology overview + zones section (diagram has zones).
    expect(payload.topologySummary).toHaveLength(2);
    expect(payload.siteOrScopeSummary).toHaveLength(1);
    expect(payload.implementationNotes).toHaveLength(1);
    expect(payload.dependencies).toHaveLength(0);
    expect(payload.risksAndCaveats).toHaveLength(1);
    expect(payload.complianceTraceSummary.map((t) => t.referencedCount)).toEqual([2, 1]);
    expect(payload.boqTraceSummary.map((t) => t.referencedCount)).toEqual([0]);
    expect(payload.diagramReferences).toHaveLength(1);
    expect(payload.diagramReferences[0].diagramArtifactId).toBe(DIAGRAM_ID);
    // The derived spine is contract-valid.
    expect(validateRfpHldDocumentModelPayload(payload).valid).toBe(true);
  });

  it("emits no SKU/pricing/catalog/config/provider/raw/final-output marker fields", () => {
    const json = JSON.stringify(build());
    for (const forbidden of [
      "sku", "unitPrice", "pricing", "catalogDecision", "configurationDecision",
      "rawText", "documentText", "filePath", "storagePath",
      "providerText", "aiResponse", "llmResponse", "prompt", "completion",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Static module purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-document-model-draft - module purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-document-model-draft.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-document-model-draft.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, readiness gate, upstream + document-model contracts, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-generation-readiness",
      "@/lib/projects/project-rfp-hld-source-bundle",
      "@/lib/projects/project-rfp-hld-design-model",
      "@/lib/projects/project-rfp-hld-diagram",
      "@/lib/projects/project-rfp-hld-document-model",
      "@/types/project",
    ]);
  });

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

  it("invokes no approval/upload/download/render/export behavior", () => {
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
