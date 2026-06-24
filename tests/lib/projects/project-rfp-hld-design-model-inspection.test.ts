import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the store boundaries only. The Stage 6C contract validator and the pure
// Stage 6C readiness helper stay REAL so the payload gate and readiness probe are
// true integration checks over the supplied fixtures.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListProjectArtifacts,
  mockListProjectArtifactsByType,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListProjectArtifacts: vi.fn(),
  mockListProjectArtifactsByType: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifacts: mockListProjectArtifacts,
  listProjectArtifactsByType: mockListProjectArtifactsByType,
}));

import {
  loadRfpHldDesignModelList,
  loadRfpHldDesignModelDetail,
} from "@/lib/projects/project-rfp-hld-design-model-inspection";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import type { Project, ProjectArtifact } from "@/types/project";

const TENANT = "44444444-4444-4444-4444-444444444444";
const PROJECT = "proj-1";
const BUNDLE_ID = "hsb-1";
const MODEL_ID = "hdm-1";
const CREATED_AT = "2026-06-24T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);
const UPSTREAM_IDS = ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"];

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
    warnings: [
      { id: "w1", code: "PARTIAL_DETAIL", message: "Some rack detail missing.", severity: "warning" },
    ],
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
    validationFindings: [
      {
        id: "vf-1", severity: "warning", code: "PARTIAL_DETAIL",
        message: "Some rack detail missing.", sourceRefIds: ["sr-1"],
      },
    ],
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

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(validModelArtifact());
  mockListProjectArtifactsByType.mockReset().mockResolvedValue([validModelArtifact()]);
  mockListProjectArtifacts
    .mockReset()
    .mockResolvedValue([validBundleArtifact(), validModelArtifact()]);
});

describe("loadRfpHldDesignModelList - input + project gates", () => {
  it("throws on a blank projectId before any store call", async () => {
    await expect(
      loadRfpHldDesignModelList({ tenantId: TENANT, projectId: "  " })
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockListProjectArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns not_found when the project is absent", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await loadRfpHldDesignModelList({ tenantId: TENANT, projectId: PROJECT });
    expect(result).toEqual({ status: "not_found" });
    expect(mockListProjectArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean summary that omits tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldDesignModelList({ tenantId: TENANT, projectId: PROJECT });
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListProjectArtifactsByType).not.toHaveBeenCalled();
  });
});

describe("loadRfpHldDesignModelList - listing", () => {
  it("lists with listProjectArtifactsByType(..., hld_design_model)", async () => {
    await loadRfpHldDesignModelList({ tenantId: TENANT, projectId: PROJECT });
    expect(mockListProjectArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "hld_design_model"
    );
  });

  it("filters out wrong project, wrong type, and wrong stage rows", async () => {
    mockListProjectArtifactsByType.mockResolvedValue([
      validModelArtifact(),
      validModelArtifact({ id: "x-proj", projectId: "other" }),
      validModelArtifact({ id: "x-type", type: "hld_source_bundle" }),
      validModelArtifact({ id: "x-stage", stageId: "compliance_matrix_review" }),
    ]);
    const result = await loadRfpHldDesignModelList({ tenantId: TENANT, projectId: PROJECT });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.artifactCount).toBe(1);
    expect(result.artifacts[0].id).toBe(MODEL_ID);
  });

  it("returns counts-only payload summaries and never a raw payload body", async () => {
    const result = await loadRfpHldDesignModelList({ tenantId: TENANT, projectId: PROJECT });
    if (result.status !== "ok") throw new Error("expected ok");
    const summary = result.artifacts[0].payloadSummary;
    expect(summary.sourceReferenceCount).toBe(1);
    expect(summary.designSectionCount).toBe(1);
    expect(summary.topologyNodeCount).toBe(2);
    expect(summary.topologyLinkCount).toBe(1);
    expect(summary.topologyZoneCount).toBe(1);
    expect(summary.sourceBundleVersion).toBe(1);
    const json = JSON.stringify(result);
    expect(json).not.toContain("designSections");
    expect(json).not.toContain("Core Switch");
    expect(json).not.toContain("sourceReferences");
  });

  it("returns a ready designModelReadiness from the real helper", async () => {
    const result = await loadRfpHldDesignModelList({ tenantId: TENANT, projectId: PROJECT });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.designModelReadiness.status).toBe("ready");
    if (result.designModelReadiness.status !== "ready") throw new Error("unreachable");
    expect(result.designModelReadiness.sourceBundle.artifactId).toBe(BUNDLE_ID);
    expect(result.designModelReadiness.expectedSource.sourceArtifactIds).toEqual([BUNDLE_ID]);
  });

  it("returns a blocked designModelReadiness when no source bundle exists", async () => {
    mockListProjectArtifacts.mockResolvedValue([validModelArtifact()]);
    const result = await loadRfpHldDesignModelList({ tenantId: TENANT, projectId: PROJECT });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.designModelReadiness.status).toBe("blocked");
    if (result.designModelReadiness.status !== "blocked") throw new Error("unreachable");
    expect(result.designModelReadiness.blockedCode).toBe("missing_source_bundle");
    expect(result.designModelReadiness.messages.length).toBeGreaterThan(0);
  });
});

describe("loadRfpHldDesignModelDetail - gates", () => {
  it("throws on a blank projectId and a blank artifactId before any store call", async () => {
    await expect(
      loadRfpHldDesignModelDetail({ tenantId: TENANT, projectId: " ", artifactId: MODEL_ID })
    ).rejects.toThrow();
    await expect(
      loadRfpHldDesignModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: " " })
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns not_found / wrong_mode at the project gate", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(
      await loadRfpHldDesignModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID })
    ).toEqual({ status: "not_found" });

    mockGetProjectById.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    const wrong = await loadRfpHldDesignModelDetail({
      tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID,
    });
    expect(wrong.status).toBe("wrong_mode");
  });

  it("returns artifact_not_found for a missing or foreign-project artifact", async () => {
    mockGetArtifactById.mockResolvedValueOnce(null);
    expect(
      await loadRfpHldDesignModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID })
    ).toEqual({ status: "artifact_not_found" });

    mockGetArtifactById.mockResolvedValueOnce(validModelArtifact({ projectId: "other" }));
    expect(
      await loadRfpHldDesignModelDetail({ tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID })
    ).toEqual({ status: "artifact_not_found" });
  });

  it("returns artifact_not_hld_design_model for the wrong type or stage", async () => {
    mockGetArtifactById.mockResolvedValueOnce(validModelArtifact({ type: "hld_source_bundle" }));
    const wrongType = await loadRfpHldDesignModelDetail({
      tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID,
    });
    expect(wrongType.status).toBe("artifact_not_hld_design_model");

    mockGetArtifactById.mockResolvedValueOnce(
      validModelArtifact({ stageId: "compliance_matrix_review" })
    );
    const wrongStage = await loadRfpHldDesignModelDetail({
      tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID,
    });
    expect(wrongStage.status).toBe("artifact_not_hld_design_model");
  });

  it("returns invalid_payload for a malformed persisted payload", async () => {
    mockGetArtifactById.mockResolvedValue(validModelArtifact({ payload: { junk: true } }));
    const result = await loadRfpHldDesignModelDetail({
      tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID,
    });
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
  });
});

describe("loadRfpHldDesignModelDetail - ok", () => {
  it("returns a sanitized whitelist copy, not the stored object", async () => {
    const row = validModelArtifact();
    mockGetArtifactById.mockResolvedValue(row);
    const result = await loadRfpHldDesignModelDetail({
      tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    // Equal in value...
    expect(result.designModel).toEqual(validDesignModelPayload());
    // ...but a distinct copy of the stored payload and its nested arrays.
    expect(result.designModel).not.toBe(row.payload);
    expect(result.designModel.topology.nodes).not.toBe(
      (row.payload as unknown as RfpHldDesignModelPayload).topology.nodes
    );
    result.designModel.topology.nodes.push({
      id: "x", label: "x", nodeType: "x", sourceRefIds: [],
    });
    expect(
      (row.payload as unknown as RfpHldDesignModelPayload).topology.nodes
    ).toHaveLength(2);
  });

  it("leaks no tenantId, storagePath, or raw upstream bundle body", async () => {
    const result = await loadRfpHldDesignModelDetail({
      tenantId: TENANT, projectId: PROJECT, artifactId: MODEL_ID,
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("compiledArtifactIds");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-design-model-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, the contract, the readiness helper, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-design-model",
      "@/lib/projects/project-rfp-hld-design-model-readiness",
      "@/types/project",
    ]);
  });

  it("performs no create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(mutationTokens).toEqual([]);
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
