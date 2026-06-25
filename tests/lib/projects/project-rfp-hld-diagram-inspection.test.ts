import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact, ProjectArtifactType, ProjectStageId } from "@/types/project";

// Mock only the store boundaries. The Stage 6G-A-001 contract validator is NOT
// mocked: detail gating drives the real validator over the supplied payloads.
const { mockGetProjectById, mockGetArtifactById, mockListArtifactsByType } = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListArtifactsByType: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifactsByType: mockListArtifactsByType,
}));

import {
  loadRfpHldDiagramList,
  loadRfpHldDiagramDetail,
} from "@/lib/projects/project-rfp-hld-diagram-inspection";
import {
  RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";

const TENANT = "33333333-3333-3333-3333-333333333333";
const PROJECT = "proj-rfp-diagram-1";
const ARTIFACT = "hld-diagram-1";
const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEW_ID = "hdmr-1";
const TS = new Date("2026-06-20T08:00:00.000Z");

/** A valid topology diagram draft payload. Fresh per call. */
function validPayload(): RfpHldDiagramDraftPayload {
  return {
    payloadKind: RFP_HLD_DIAGRAM_DRAFT_PAYLOAD_KIND,
    createdAt: "2026-06-24T00:00:00.000Z",
    createdBy: "eng-1",
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceReviewArtifactId: REVIEW_ID,
    sourceModelVersion: 2,
    diagramType: "topology",
    title: "HLD Topology Diagram Draft",
    nodes: [
      { id: "n1", label: "Core Switch", nodeType: "switch", domain: "campus_switching", zoneId: "z1", sourceRefIds: ["ref-model"] },
      { id: "n2", label: "Access Switch", nodeType: "switch", sourceRefIds: ["ref-model"] },
    ],
    links: [
      { id: "l1", label: "Uplink", fromNodeId: "n1", toNodeId: "n2", linkType: "ethernet", sourceRefIds: ["ref-model"] },
    ],
    zones: [{ id: "z1", label: "Campus Core", nodeIds: ["n1"], sourceRefIds: ["ref-model"] }],
    sourceReferences: [
      { id: "ref-model", artifactId: MODEL_ID, artifactType: "hld_design_model", sourcePath: "hld_design_model:ref-model", label: "Model topology reference" },
      { id: "diagram-source-bundle", artifactId: BUNDLE_ID, artifactType: "hld_source_bundle" },
      { id: "diagram-source-review", artifactId: REVIEW_ID, artifactType: "hld_design_model_review" },
    ],
    validationFindings: [],
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

function diagramArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_diagram",
    status: "needs_review",
    version: 1,
    payload: validPayload() as unknown as Record<string, unknown>,
    sourceFileIds: ["secret-file-id"],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID, REVIEW_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(diagramArtifact());
  mockListArtifactsByType.mockReset().mockResolvedValue([diagramArtifact()]);
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("loadRfpHldDiagramList", () => {
  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await loadRfpHldDiagramList({ tenantId: TENANT, projectId: PROJECT });
    expect(result).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldDiagramList({ tenantId: TENANT, projectId: PROJECT });
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("queries the typed store for hld_diagram and returns lean counts-only rows", async () => {
    const result = await loadRfpHldDiagramList({ tenantId: TENANT, projectId: PROJECT });

    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT, PROJECT, "hld_diagram" as ProjectArtifactType
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    const art = result.artifacts[0];
    expect("payload" in art).toBe(false);
    expect("sourceFileIds" in art).toBe(false);
    expect("sourceArtifactIds" in art).toBe(false);
    expect(art.payloadSummary).toEqual({
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
    // No payload body and no leaked file refs.
    expect(JSON.stringify(result.artifacts)).not.toContain("secret-file-id");
  });

  it("filters to hld_diagram on hld_design_delta_review, ignoring other types/stages/projects", async () => {
    mockListArtifactsByType.mockResolvedValue([
      diagramArtifact(),
      diagramArtifact({ id: "wrong-stage", stageId: "compliance_matrix_review" as ProjectStageId }),
      diagramArtifact({ id: "wrong-type", type: "hld_design_model" as ProjectArtifactType }),
      diagramArtifact({ id: "wrong-project", projectId: "other-project" }),
    ]);

    const result = await loadRfpHldDiagramList({ tenantId: TENANT, projectId: PROJECT });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts.map((a) => a.id)).toEqual([ARTIFACT]);
  });
});

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

describe("loadRfpHldDiagramDetail", () => {
  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await loadRfpHldDiagramDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldDiagramDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
    expect(result.status).toBe("wrong_mode");
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found, scoping the lookup to session tenant + route project", async () => {
    mockGetArtifactById.mockResolvedValue(null);
    const result = await loadRfpHldDiagramDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
  });

  it("returns artifact_not_hld_diagram for the wrong type or stage", async () => {
    for (const overrides of [
      { type: "hld_design_model" as ProjectArtifactType },
      { stageId: "compliance_matrix_review" as ProjectStageId },
    ]) {
      mockGetArtifactById.mockResolvedValue(diagramArtifact(overrides));
      const result = await loadRfpHldDiagramDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
      expect(result.status).toBe("artifact_not_hld_diagram");
      if (result.status !== "artifact_not_hld_diagram") throw new Error("unreachable");
      expect("payload" in result.artifact).toBe(false);
    }
  });

  it("returns invalid_payload for a structurally invalid diagram payload", async () => {
    mockGetArtifactById.mockResolvedValue(
      diagramArtifact({ payload: { ...validPayload(), payloadKind: "wrong_kind" } as unknown as Record<string, unknown> })
    );
    const result = await loadRfpHldDiagramDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
    expect(result.status).toBe("invalid_payload");
  });

  it("returns a sanitized whitelisted diagram (fresh object) and no tenantId on ok", async () => {
    const stored = diagramArtifact();
    mockGetArtifactById.mockResolvedValue(stored);

    const result = await loadRfpHldDiagramDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.diagram).toEqual(validPayload());
    // Reconstructed object, not the stored payload reference.
    expect(result.diagram).not.toBe(stored.payload);
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("secret-file-id");
  });

  it("rejects (invalid_payload) a payload carrying leakable extra keys and never leaks them", async () => {
    const leaky = { ...validPayload(), tenantId: TENANT, storagePath: "/secret/storage/path" };
    mockGetArtifactById.mockResolvedValue(
      diagramArtifact({ payload: leaky as unknown as Record<string, unknown> })
    );

    const result = await loadRfpHldDiagramDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });

    expect(result.status).toBe("invalid_payload");
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("/secret/storage/path");
  });
});

// ---------------------------------------------------------------------------
// Static module purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-diagram-inspection - module purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-diagram-inspection.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-diagram-inspection.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, the diagram contract, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-diagram",
      "@/types/project",
    ]);
  });

  it("creates nothing and imports no forbidden providers/pricing/raw/approval modules", () => {
    expect(/\b(?:create|update|delete)[A-Z]\w*/.test(source)).toBe(false);
    for (const forbidden of [
      "@anthropic-ai", "@google/generative-ai", "openai", "pdf-parse", "mammoth", "xlsx",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    for (const f of froms) {
      expect(f).not.toContain("@/lib/ai");
      expect(f).not.toContain("@/lib/llm");
      expect(f).not.toContain("@/lib/adapters");
      expect(f).not.toContain("@/lib/catalog");
      expect(f).not.toContain("pricing");
      expect(f).not.toContain("sku-resolution");
      expect(f).not.toContain("config-expansion");
      expect(f).not.toContain("project-file-store");
      expect(f).not.toContain("project-evidence-store");
      expect(f).not.toContain("approval");
    }
  });

  it("keeps source and test files ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
