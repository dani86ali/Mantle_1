import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

// Mock the store boundaries, the Stage 6F readiness gate, and the upstream design
// model contract validator. The Stage 6G-A-001 diagram contract validator is
// intentionally NOT mocked: the service HARD-GATEs the derived draft with the real
// validator before any write.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockCreateArtifact,
  mockLoadReadiness,
  mockValidateModel,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockCreateArtifact: vi.fn(),
  mockLoadReadiness: vi.fn(),
  mockValidateModel: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  createProjectArtifactVersion: mockCreateArtifact,
}));
vi.mock("@/lib/projects/project-rfp-hld-generation-readiness", () => ({
  loadRfpHldGenerationReadiness: mockLoadReadiness,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model", () => ({
  validateRfpHldDesignModelPayload: mockValidateModel,
}));

import {
  createRfpHldDiagramDraft,
  buildRfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram-draft";
import {
  validateRfpHldDiagramDraftPayload,
  RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
} from "@/lib/projects/project-rfp-hld-diagram";

const TENANT = "33333333-3333-3333-3333-333333333333";
const PROJECT = "proj-rfp-diagram-1";
const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEW_ID = "hdmr-1";
const DIAGRAM_ID = "hld-diagram-1";
const CREATED_BY = "engineer@example.com";
const CREATED_AT = new Date("2026-06-24T00:00:00.000Z");
const TS = new Date("2026-06-20T08:00:00.000Z");

/** A valid design-model topology. Fresh per call. */
function validTopology() {
  return {
    nodes: [
      { id: "n-1", label: "Core Switch", nodeType: "switch", domain: "campus_switching", sourceRefIds: ["sr-1"] },
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
  };
}

function modelPayload(topology: unknown = validTopology()): Record<string, unknown> {
  return { payloadKind: "rfp_hld_design_model", topology };
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
    payload: { payloadKind: "rfp_hld_design_model_review" },
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
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
    id: DIAGRAM_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    createdAt: TS,
    updatedAt: TS,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof createRfpHldDiagramDraft>[0]> = {}
): Parameters<typeof createRfpHldDiagramDraft>[0] {
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
  mockCreateArtifact.mockReset().mockResolvedValue(createdRow());
  mockLoadReadiness.mockReset().mockResolvedValue(readyReport());
  mockValidateModel.mockReset().mockReturnValue({ valid: true, errors: [] });
});

// ---------------------------------------------------------------------------
// Input gates
// ---------------------------------------------------------------------------

describe("createRfpHldDiagramDraft - input gates", () => {
  it("throws on blank projectId before any store call", async () => {
    await expect(
      createRfpHldDiagramDraft(baseInput({ projectId: "  " }))
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("throws on blank createdBy before any store call", async () => {
    await expect(
      createRfpHldDiagramDraft(baseInput({ createdBy: "  " }))
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Project gates
// ---------------------------------------------------------------------------

describe("createRfpHldDiagramDraft - project gates", () => {
  it("returns not_found when the project is missing and writes nothing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await createRfpHldDiagramDraft(baseInput());
    expect(result).toEqual({ status: "not_found" });
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await createRfpHldDiagramDraft(baseInput());
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Readiness + topology gates
// ---------------------------------------------------------------------------

describe("createRfpHldDiagramDraft - readiness + topology", () => {
  it("blocks when Stage 6F readiness is not ready, writes nothing, returns nextAction", async () => {
    mockLoadReadiness.mockResolvedValue({
      status: "blocked",
      ready: false,
      nextAction: "Run a fresh deterministic HLD design-model review for the approved model.",
      blockers: [],
      warnings: [],
    });

    const result = await createRfpHldDiagramDraft(baseInput());

    expect(result.status).toBe("readiness_blocked");
    if (result.status !== "readiness_blocked") throw new Error("unreachable");
    expect(result.readinessStatus).toBe("blocked");
    expect(result.nextAction).toContain("review");
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("blocks no_topology / no_diagram_topology when the approved model has zero nodes, inventing nothing", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact({ payload: modelPayload({ nodes: [], links: [], zones: [] }) }),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact(),
      })
    );

    const result = await createRfpHldDiagramDraft(baseInput());

    expect(result).toEqual({ status: "no_topology", code: "no_diagram_topology" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Precondition gates (readiness-approved artifact fails re-gating)
// ---------------------------------------------------------------------------

describe("createRfpHldDiagramDraft - precondition gates", () => {
  it("fails precondition (readiness_audit_incomplete) and writes nothing when audit ids are missing", async () => {
    mockLoadReadiness.mockResolvedValue(readyReport({ technicalAudit: { approvedModelArtifactId: MODEL_ID } }));

    const result = await createRfpHldDiagramDraft(baseInput());

    expect(result).toEqual({ status: "precondition_failed", code: "readiness_audit_incomplete" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });

  it("fails precondition (source_ids_mismatch) and writes nothing when the review source ids do not match", async () => {
    mockGetArtifactById.mockImplementation(
      artifactsById({
        [MODEL_ID]: modelArtifact(),
        [BUNDLE_ID]: bundleArtifact(),
        [REVIEW_ID]: reviewArtifact({ sourceArtifactIds: [MODEL_ID, "other-bundle"] }),
      })
    );

    const result = await createRfpHldDiagramDraft(baseInput());

    expect(result).toEqual({ status: "precondition_failed", code: "source_ids_mismatch" });
    expect(mockCreateArtifact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("createRfpHldDiagramDraft - ok", () => {
  it("creates exactly one needs_review hld_diagram on hld_design_delta_review with the exact source provenance", async () => {
    const result = await createRfpHldDiagramDraft(baseInput());

    expect(result.status).toBe("ok");
    expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
    const arg = mockCreateArtifact.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.status).toBe("needs_review");
    expect(arg.type).toBe("hld_diagram");
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.sourceFileIds).toEqual([]);
    expect(arg.sourceArtifactIds).toEqual([MODEL_ID, BUNDLE_ID, REVIEW_ID]);
    // The persisted payload is the contract-valid diagram draft.
    expect(validateRfpHldDiagramDraftPayload(arg.payload).valid).toBe(true);
  });

  it("returns a lean artifact summary and counts-only payloadSummary, no payload body and no tenantId", async () => {
    const result = await createRfpHldDiagramDraft(baseInput());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
    expect("nodes" in result.payloadSummary).toBe(false);
    expect(result.payloadSummary).toEqual({
      payloadKind: RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
      diagramType: "topology",
      title: "HLD Topology Diagram Draft",
      nodeCount: 2,
      linkCount: 1,
      zoneCount: 1,
      sourceReferenceCount: 3,
      validationFindingCount: 0,
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
      sourceReviewArtifactId: REVIEW_ID,
      sourceModelVersion: 2,
    });
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });
});

// ---------------------------------------------------------------------------
// Pure builder derivation semantics
// ---------------------------------------------------------------------------

describe("buildRfpHldDiagramDraftPayload - deterministic derivation", () => {
  it("derives nodes/links/zones from the model topology and preserves ids/labels/types/domain", () => {
    const payload = buildRfpHldDiagramDraftPayload({
      model: modelArtifact(),
      bundleId: BUNDLE_ID,
      reviewId: REVIEW_ID,
      createdBy: CREATED_BY,
      createdAt: CREATED_AT.toISOString(),
      diagramType: "topology",
    });

    expect(payload.nodes.map((n) => n.id)).toEqual(["n-1", "n-2"]);
    expect(payload.nodes[0].label).toBe("Core Switch");
    expect(payload.nodes[0].nodeType).toBe("switch");
    expect(payload.nodes[0].domain).toBe("campus_switching");
    expect(payload.nodes[1].domain).toBeUndefined();
    expect(payload.links[0]).toMatchObject({ id: "l-1", fromNodeId: "n-1", toNodeId: "n-2", linkType: "ethernet" });
    expect(payload.zones.map((z) => z.id)).toEqual(["z-1"]);
    // The derived draft is contract-valid and carries the exact ordered provenance.
    expect(validateRfpHldDiagramDraftPayload(payload).valid).toBe(true);
    expect(payload.sourceArtifactIds).toEqual([MODEL_ID, BUNDLE_ID, REVIEW_ID]);
  });

  it("maps zoneId only when a node belongs to exactly one zone", () => {
    const single = buildRfpHldDiagramDraftPayload({
      model: modelArtifact(),
      bundleId: BUNDLE_ID, reviewId: REVIEW_ID,
      createdBy: CREATED_BY, createdAt: CREATED_AT.toISOString(), diagramType: "topology",
    });
    // n-1 / n-2 each sit in exactly one zone -> zoneId is set.
    expect(single.nodes[0].zoneId).toBe("z-1");

    const topo = validTopology();
    topo.zones.push({ id: "z-2", label: "Second Zone", nodeIds: ["n-1"], sourceRefIds: ["sr-1"] });
    const multi = buildRfpHldDiagramDraftPayload({
      model: modelArtifact({ payload: modelPayload(topo) }),
      bundleId: BUNDLE_ID, reviewId: REVIEW_ID,
      createdBy: CREATED_BY, createdAt: CREATED_AT.toISOString(), diagramType: "topology",
    });
    // n-1 now sits in two zones -> no zoneId is invented.
    const n1 = multi.nodes.find((n) => n.id === "n-1");
    expect(n1?.zoneId).toBeUndefined();
  });

  it("emits no SKU/pricing/catalog/config/provider/raw/final-output fields", () => {
    const payload = buildRfpHldDiagramDraftPayload({
      model: modelArtifact(),
      bundleId: BUNDLE_ID, reviewId: REVIEW_ID,
      createdBy: CREATED_BY, createdAt: CREATED_AT.toISOString(), diagramType: "topology",
    });
    const json = JSON.stringify(payload);
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

describe("project-rfp-hld-diagram-draft - module purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-diagram-draft.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-diagram-draft.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, readiness gate, model + diagram contracts, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-generation-readiness",
      "@/lib/projects/project-rfp-hld-design-model",
      "@/lib/projects/project-rfp-hld-diagram",
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
