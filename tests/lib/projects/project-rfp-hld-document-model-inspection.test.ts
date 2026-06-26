import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact, ProjectArtifactType, ProjectStageId } from "@/types/project";

// Mock only the store boundaries. The Stage 6H-A-001 contract validator is NOT
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
  loadRfpHldDocumentModelList,
  loadRfpHldDocumentModelDetail,
} from "@/lib/projects/project-rfp-hld-document-model-inspection";
import {
  RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
  type RfpHldDocumentModelPayload,
} from "@/lib/projects/project-rfp-hld-document-model";

const TENANT = "44444444-4444-4444-4444-444444444444";
const PROJECT = "proj-rfp-docmodel-1";
const ARTIFACT = "hld-document-model-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const DIAGRAM_ID = "hdg-1";
const TS = new Date("2026-06-20T08:00:00.000Z");

/** A valid document-model payload. Fresh per call. */
function validPayload(): RfpHldDocumentModelPayload {
  return {
    payloadKind: RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
    createdAt: "2026-06-24T00:00:00.000Z",
    createdBy: "eng-1",
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldDiagramArtifactId: DIAGRAM_ID,
    sourceModelVersion: 2,
    sourceDiagramVersion: 3,
    title: "HLD Document Model",
    documentPurpose: "Internal structured spine for engineer review.",
    coveredDomains: ["campus_switching", "routing"],
    excludedDomains: ["wireless"],
    assumptions: [
      { id: "a1", text: "Greenfield deployment.", sourceRefIds: [MODEL_ID] },
    ],
    designSummary: [
      {
        id: "ds1",
        title: "Core Design",
        items: [{ id: "ds1-i1", text: "Two-tier core.", sourceRefIds: [MODEL_ID] }],
        sourceRefIds: [MODEL_ID],
      },
    ],
    topologySummary: [
      {
        id: "ts1",
        title: "Topology",
        items: [{ id: "ts1-i1", text: "Star topology.", sourceRefIds: [DIAGRAM_ID] }],
        sourceRefIds: [DIAGRAM_ID],
      },
    ],
    siteOrScopeSummary: [
      {
        id: "ss1",
        title: "Sites",
        items: [{ id: "ss1-i1", text: "Single HQ site.", sourceRefIds: [BUNDLE_ID] }],
        sourceRefIds: [BUNDLE_ID],
      },
    ],
    implementationNotes: [
      { id: "in1", text: "Stage rollout by floor.", sourceRefIds: [MODEL_ID] },
    ],
    dependencies: [
      { id: "dep1", text: "Power upgrade required.", sourceRefIds: [BUNDLE_ID] },
    ],
    risksAndCaveats: [
      { id: "rk1", text: "Lead time risk.", sourceRefIds: [MODEL_ID] },
    ],
    complianceTraceSummary: [
      { id: "ct1", label: "Compliance refs", referencedCount: 5, sourceRefIds: [BUNDLE_ID] },
    ],
    boqTraceSummary: [
      { id: "bt1", label: "BoQ refs", referencedCount: 12, sourceRefIds: [BUNDLE_ID] },
    ],
    diagramReferences: [
      {
        id: "dr1",
        diagramArtifactId: DIAGRAM_ID,
        diagramTitle: "HLD Topology Diagram",
        diagramType: "topology",
        sourceRefIds: [DIAGRAM_ID],
      },
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

function documentModelArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_document_model",
    status: "needs_review",
    version: 1,
    payload: validPayload() as unknown as Record<string, unknown>,
    sourceFileIds: ["secret-file-id"],
    sourceArtifactIds: [BUNDLE_ID, MODEL_ID, DIAGRAM_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(documentModelArtifact());
  mockListArtifactsByType.mockReset().mockResolvedValue([documentModelArtifact()]);
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("loadRfpHldDocumentModelList", () => {
  it("throws on a blank projectId without touching the store", async () => {
    await expect(
      loadRfpHldDocumentModelList({ tenantId: TENANT, projectId: "  " })
    ).rejects.toThrow(/projectId is required/);
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await loadRfpHldDocumentModelList({ tenantId: TENANT, projectId: PROJECT });
    expect(result).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldDocumentModelList({ tenantId: TENANT, projectId: PROJECT });
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("queries the typed store for hld_document_model and returns lean counts-only rows", async () => {
    const result = await loadRfpHldDocumentModelList({ tenantId: TENANT, projectId: PROJECT });

    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT, PROJECT, "hld_document_model" as ProjectArtifactType
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    const art = result.artifacts[0];
    expect("payload" in art).toBe(false);
    expect("sourceFileIds" in art).toBe(false);
    expect("sourceArtifactIds" in art).toBe(false);
    expect(art.payloadSummary).toEqual({
      payloadKind: RFP_HLD_DOCUMENT_MODEL_PAYLOAD_KIND,
      title: "HLD Document Model",
      coveredDomainCount: 2,
      excludedDomainCount: 1,
      assumptionCount: 1,
      designSummaryCount: 1,
      topologySummaryCount: 1,
      siteOrScopeSummaryCount: 1,
      implementationNoteCount: 1,
      dependencyCount: 1,
      riskCount: 1,
      complianceTraceCount: 1,
      boqTraceCount: 1,
      diagramReferenceCount: 1,
      validationFindingCount: 0,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceHldDiagramArtifactId: DIAGRAM_ID,
      sourceModelVersion: 2,
      sourceDiagramVersion: 3,
    });
    // No payload body and no leaked file refs.
    expect(JSON.stringify(result.artifacts)).not.toContain("secret-file-id");
    expect(JSON.stringify(result.artifacts)).not.toContain("Greenfield deployment");
  });

  it("filters to hld_document_model on hld_design_delta_review, ignoring other types/stages/projects", async () => {
    mockListArtifactsByType.mockResolvedValue([
      documentModelArtifact(),
      documentModelArtifact({ id: "wrong-stage", stageId: "compliance_matrix_review" as ProjectStageId }),
      documentModelArtifact({ id: "wrong-type", type: "hld_diagram" as ProjectArtifactType }),
      documentModelArtifact({ id: "wrong-project", projectId: "other-project" }),
    ]);

    const result = await loadRfpHldDocumentModelList({ tenantId: TENANT, projectId: PROJECT });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifacts.map((a) => a.id)).toEqual([ARTIFACT]);
  });
});

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

describe("loadRfpHldDocumentModelDetail", () => {
  it("throws on a blank artifactId", async () => {
    await expect(
      loadRfpHldDocumentModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: "" })
    ).rejects.toThrow(/artifactId is required/);
  });

  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await loadRfpHldDocumentModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a quick_bom project and leaks no tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldDocumentModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
    expect(result.status).toBe("wrong_mode");
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found, scoping the lookup to session tenant + route project", async () => {
    mockGetArtifactById.mockResolvedValue(null);
    const result = await loadRfpHldDocumentModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
  });

  it("returns artifact_not_hld_document_model for the wrong type or stage, with a lean summary and no payload", async () => {
    for (const overrides of [
      { type: "hld_diagram" as ProjectArtifactType },
      { stageId: "compliance_matrix_review" as ProjectStageId },
    ]) {
      mockGetArtifactById.mockResolvedValue(documentModelArtifact(overrides));
      const result = await loadRfpHldDocumentModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
      expect(result.status).toBe("artifact_not_hld_document_model");
      if (result.status !== "artifact_not_hld_document_model") throw new Error("unreachable");
      expect("payload" in result.artifact).toBe(false);
      expect(JSON.stringify(result)).not.toContain("Greenfield deployment");
    }
  });

  it("returns invalid_payload for a structurally invalid payload, leaking no payload/body/tenant", async () => {
    mockGetArtifactById.mockResolvedValue(
      documentModelArtifact({ payload: { ...validPayload(), payloadKind: "wrong_kind" } as unknown as Record<string, unknown> })
    );
    const result = await loadRfpHldDocumentModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("unreachable");
    expect("documentModel" in result).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("Greenfield deployment");
  });

  it("returns a sanitized whitelisted document model (fresh, copied arrays) and no tenantId on ok", async () => {
    const stored = documentModelArtifact();
    mockGetArtifactById.mockResolvedValue(stored);

    const result = await loadRfpHldDocumentModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.documentModel).toEqual(validPayload());
    // Reconstructed object, not the stored payload reference.
    expect(result.documentModel).not.toBe(stored.payload);
    expect(result.documentModel.coveredDomains).not.toBe(
      (stored.payload as unknown as RfpHldDocumentModelPayload).coveredDomains
    );
    expect(result.documentModel.assumptions).not.toBe(
      (stored.payload as unknown as RfpHldDocumentModelPayload).assumptions
    );
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("secret-file-id");
    expect(json).not.toContain("sourceFileIds");
  });

  it("rejects (invalid_payload) a payload carrying leakable extra keys and never leaks them", async () => {
    const leaky = { ...validPayload(), tenantId: TENANT, storagePath: "/secret/storage/path" };
    mockGetArtifactById.mockResolvedValue(
      documentModelArtifact({ payload: leaky as unknown as Record<string, unknown> })
    );

    const result = await loadRfpHldDocumentModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: ARTIFACT });

    expect(result.status).toBe("invalid_payload");
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("/secret/storage/path");
  });
});

// ---------------------------------------------------------------------------
// Static module purity
// ---------------------------------------------------------------------------

describe("project-rfp-hld-document-model-inspection - module purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-rfp-hld-document-model-inspection.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-rfp-hld-document-model-inspection.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, the document-model contract, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-document-model",
      "@/types/project",
    ]);
  });

  it("creates nothing and imports no forbidden providers/pricing/raw/approval modules", () => {
    expect(/\b(?:create|update|delete|write|approve)[A-Z]\w*/.test(source)).toBe(false);
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
      expect(f).not.toContain("/api/");
      expect(f).not.toContain("/app/");
    }
  });

  it("keeps source and test files ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
