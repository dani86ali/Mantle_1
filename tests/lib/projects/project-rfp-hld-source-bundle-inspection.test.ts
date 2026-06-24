import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

// Mock the composed store boundaries and the PURE assembler readiness probe.
// The Stage 6B-001 contract validator is intentionally NOT mocked: detail gating
// drives the real validator over the supplied payloads.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListArtifactsByType,
  mockListArtifacts,
  mockListProjectFiles,
  mockBuildDraft,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListArtifactsByType: vi.fn(),
  mockListArtifacts: vi.fn(),
  mockListProjectFiles: vi.fn(),
  mockBuildDraft: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-file-store", () => ({
  listProjectFiles: mockListProjectFiles,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifacts: mockListArtifacts,
  listProjectArtifactsByType: mockListArtifactsByType,
}));
vi.mock("@/lib/projects/project-rfp-hld-source-bundle-assembler", () => ({
  buildRfpHldSourceBundleDraft: mockBuildDraft,
}));

import {
  loadRfpHldSourceBundleList,
  loadRfpHldSourceBundleDetail,
} from "@/lib/projects/project-rfp-hld-source-bundle-inspection";
import {
  RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
  type RfpHldSourceBundlePayload,
} from "@/lib/projects/project-rfp-hld-source-bundle";

const TENANT = "33333333-3333-3333-3333-333333333333";
const PROJECT = "proj-rfp-bundle-1";
const ARTIFACT = "art-bundle-1";
const TS1 = new Date("2026-06-20T08:00:00.000Z");
const TS2 = new Date("2026-06-21T09:00:00.000Z");

// Sentinels that must never appear in list / detail / readiness output.
const STORAGE_SENTINEL = "/secret/storage/path";
const STATEMENT_SENTINEL = "Existing core remains.";
const CREATED_BY_SENTINEL = "engineer@example.com";

/** A coherent, fully-valid bundle payload. Fresh object per call. */
function validPayload(): RfpHldSourceBundlePayload {
  return {
    payloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    createdBy: CREATED_BY_SENTINEL,
    createdAt: "2026-06-21T00:00:00.000Z",
    sourceArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"],
    lineage: {
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      compiledArtifactIds: ["evp-1", "req-1", "cmx-1", "cfg-1", "hint-1", "hrs-1", "dkp-1"],
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
      { id: "a1", statement: STATEMENT_SENTINEL, sourceArtifactId: "req-1" },
    ],
    constraints: [
      { id: "c1", statement: "No customer BoQ change.", sourceDomain: "campus_switching" },
    ],
    warnings: [
      { id: "w1", code: "PARTIAL_DETAIL", message: "Some rack detail missing.", severity: "warning" },
    ],
    blockers: [],
    validation: { status: "passed", checkedAt: "2026-06-21T00:00:00.000Z" },
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
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeBundleArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "needs_review",
    version: 1,
    payload: validPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [...validPayload().sourceArtifactIds],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

const READY_BUILD = { status: "ok" as const, payload: validPayload() };

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeBundleArtifact());
  mockListArtifactsByType.mockReset().mockResolvedValue([makeBundleArtifact()]);
  mockListArtifacts.mockReset().mockResolvedValue([makeBundleArtifact()]);
  mockListProjectFiles.mockReset().mockResolvedValue([]);
  mockBuildDraft.mockReset().mockReturnValue(READY_BUILD);
});

// ---- list gates ------------------------------------------------------------

describe("loadRfpHldSourceBundleList - gates", () => {
  it("throws on blank projectId before any store call", async () => {
    await expect(
      loadRfpHldSourceBundleList({ tenantId: TENANT, projectId: "  " })
    ).rejects.toThrow("projectId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockBuildDraft).not.toHaveBeenCalled();
  });

  it("returns not_found and never lists or probes when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
    expect(mockListArtifacts).not.toHaveBeenCalled();
    expect(mockListProjectFiles).not.toHaveBeenCalled();
    expect(mockBuildDraft).not.toHaveBeenCalled();
  });

  it("returns wrong_mode lean summary (no tenantId) and never lists for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
    expect(mockBuildDraft).not.toHaveBeenCalled();
  });
});

// ---- list typed call + counts-only summary ---------------------------------

describe("loadRfpHldSourceBundleList - typed list + counts-only summary", () => {
  it("queries via typed listProjectArtifactsByType with hld_source_bundle", async () => {
    await loadRfpHldSourceBundleList({ tenantId: TENANT, projectId: PROJECT });

    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "hld_source_bundle" as ProjectArtifactType
    );
  });

  it("filters to hld_source_bundle on stage hld_design_delta_review", async () => {
    const wrongStage = makeBundleArtifact({
      id: "art-bundle-wrong-stage",
      stageId: "compliance_matrix_review" as ProjectStageId,
    });
    mockListArtifactsByType.mockResolvedValue([makeBundleArtifact(), wrongStage]);

    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    for (const art of result.artifacts) {
      expect(art.stageId).toBe("hld_design_delta_review");
    }
  });

  it("ignores hld_source_bundle rows whose projectId does not match the route project", async () => {
    const wrongProject = makeBundleArtifact({
      id: "wrong-project-bundle",
      projectId: "other-project",
      payload: {
        ...validPayload(),
        createdBy: "wrong-project-sentinel",
      } as unknown as Record<string, unknown>,
    });
    mockListArtifactsByType.mockResolvedValue([makeBundleArtifact(), wrongProject]);

    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    expect(result.artifacts.map((a) => a.id)).toEqual([ARTIFACT]);
    const json = JSON.stringify(result.artifacts);
    expect(json).not.toContain("wrong-project-bundle");
    expect(json).not.toContain("wrong-project-sentinel");
  });

  it("returns counts-only payloadSummary with no source arrays or raw payload body", async () => {
    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    const summary = result.artifacts[0].payloadSummary;
    expect(summary).toEqual({
      payloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
      createdBy: CREATED_BY_SENTINEL,
      createdAt: "2026-06-21T00:00:00.000Z",
      sourceArtifactCount: 7,
      designKnowledgePackCount: 1,
      coveredDomainCount: 1,
      missingDomainCount: 0,
      excludedDomainCount: 1,
      assumptionCount: 1,
      constraintCount: 1,
      warningCount: 1,
      blockerCount: 0,
    });
    expect("sourceArtifactIds" in summary).toBe(false);
    expect("authorities" in summary).toBe(false);
    expect("assumptions" in summary).toBe(false);
    const json = JSON.stringify(result.artifacts);
    expect(json).not.toContain("evp-1");
    expect(json).not.toContain(STATEMENT_SENTINEL);
  });

  it("returns a lean artifact summary with no sourceFileIds, sourceArtifactIds, or payload", async () => {
    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    if (result.status !== "ok") throw new Error("unreachable");
    const art = result.artifacts[0];
    expect("sourceFileIds" in art).toBe(false);
    expect("sourceArtifactIds" in art).toBe(false);
    expect("payload" in art).toBe(false);
  });
});

// ---- list readiness probe --------------------------------------------------

describe("loadRfpHldSourceBundleList - sourceBundleReadiness probe", () => {
  it("runs the pure assembler over all artifacts and files with a non-leaking actor", async () => {
    const allArtifacts = [makeBundleArtifact({ id: "ev", type: "evidence_package" })];
    const files = [{ id: "file-1" }];
    mockListArtifacts.mockResolvedValue(allArtifacts);
    mockListProjectFiles.mockResolvedValue(files);

    await loadRfpHldSourceBundleList({ tenantId: TENANT, projectId: PROJECT });

    expect(mockBuildDraft).toHaveBeenCalledTimes(1);
    const arg = mockBuildDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifacts).toBe(allArtifacts);
    expect(arg.files).toBe(files);
    expect(typeof arg.createdBy).toBe("string");
    expect((arg.createdBy as string).length).toBeGreaterThan(0);
  });

  it("returns a ready readiness summary (counts/provenance only, no full payload body)", async () => {
    mockBuildDraft.mockReturnValue({ status: "ok", payload: validPayload() });

    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.sourceBundleReadiness.status).toBe("ready");
    if (result.sourceBundleReadiness.status !== "ready") {
      throw new Error("unreachable");
    }
    expect(result.sourceBundleReadiness.summary).toEqual({
      compiledFromReadinessSnapshotArtifactId: "hrs-1",
      sourceArtifactCount: 7,
      designKnowledgePackCount: 1,
      coveredDomainCount: 1,
      missingDomainCount: 0,
      excludedDomainCount: 1,
      assumptionCount: 1,
      constraintCount: 1,
      warningCount: 1,
      blockerCount: 0,
    });
    const json = JSON.stringify(result.sourceBundleReadiness);
    expect(json).not.toContain("authorities");
    expect(json).not.toContain(STATEMENT_SENTINEL);
    expect(json).not.toContain(CREATED_BY_SENTINEL);
  });

  it("returns blocked readiness with a stable code and messages", async () => {
    mockBuildDraft.mockReturnValue({
      status: "blocked",
      code: "hld_readiness_not_ready",
      messages: ["HLD readiness is not ready."],
    });

    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.sourceBundleReadiness).toEqual({
      status: "blocked",
      code: "hld_readiness_not_ready",
      messages: ["HLD readiness is not ready."],
    });
    // The list itself still succeeds and writes nothing.
    expect(result.artifactCount).toBe(1);
  });

  it("returns invalid_payload readiness with errors when the assembler self-rejects", async () => {
    mockBuildDraft.mockReturnValue({
      status: "invalid_payload",
      errors: ["payload: blank createdBy"],
    });

    const result = await loadRfpHldSourceBundleList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.sourceBundleReadiness).toEqual({
      status: "invalid_payload",
      errors: ["payload: blank createdBy"],
    });
  });
});

// ---- detail gates ----------------------------------------------------------

describe("loadRfpHldSourceBundleDetail - gates", () => {
  it("throws on blank artifactId before any store call", async () => {
    await expect(
      loadRfpHldSourceBundleDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: " ",
      })
    ).rejects.toThrow("artifactId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("throws on blank projectId before any store call", async () => {
    await expect(
      loadRfpHldSourceBundleDetail({
        tenantId: TENANT,
        projectId: "  ",
        artifactId: ARTIFACT,
      })
    ).rejects.toThrow("projectId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result).toEqual({ status: "not_found" });
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(JSON.stringify(result)).not.toContain(TENANT);
  });

  it("returns artifact_not_found, scoping the lookup to session tenant + route project", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result).toEqual({ status: "artifact_not_found" });
    expect(mockGetArtifactById).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
  });

  it("rejects (artifact_not_found) an artifact whose projectId does not match the route project", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeBundleArtifact({ projectId: "other-project" })
    );

    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result).toEqual({ status: "artifact_not_found" });
  });

  it("returns artifact_not_hld_source_bundle for a wrong type", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeBundleArtifact({ type: "hld_readiness_snapshot" as ProjectArtifactType })
    );

    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("artifact_not_hld_source_bundle");
    if (result.status !== "artifact_not_hld_source_bundle") {
      throw new Error("unreachable");
    }
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns artifact_not_hld_source_bundle for the right type in a wrong stage", async () => {
    mockGetArtifactById.mockResolvedValue(
      makeBundleArtifact({ stageId: "compliance_matrix_review" as ProjectStageId })
    );

    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("artifact_not_hld_source_bundle");
  });

  it("returns invalid_payload for structurally invalid payloads", async () => {
    const cases: Record<string, unknown>[] = [
      { ...validPayload(), payloadKind: "wrong_kind" },
      { ...validPayload(), blockers: [{ id: "b1", code: "X", message: "m", severity: "blocker" }] },
      { ...validPayload(), missingDomains: ["wireless"] },
    ];

    for (const payload of cases) {
      mockGetArtifactById.mockResolvedValue(
        makeBundleArtifact({ payload: payload as Record<string, unknown> })
      );

      const result = await loadRfpHldSourceBundleDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
      });

      expect(result.status).toBe("invalid_payload");
    }
  });
});

// ---- detail sanitized output -----------------------------------------------

describe("loadRfpHldSourceBundleDetail - sanitized detail", () => {
  it("returns a sanitized detail whitelisting exactly the contract fields", async () => {
    const stored = makeBundleArtifact();
    mockGetArtifactById.mockResolvedValue(stored);

    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");

    expect(Object.keys(result.sourceBundle).sort()).toEqual([
      "assumptions",
      "authorities",
      "blockers",
      "constraints",
      "coveredDomains",
      "createdAt",
      "createdBy",
      "designKnowledgePackRefs",
      "excludedDomains",
      "lineage",
      "missingDomains",
      "payloadKind",
      "sourceArtifactIds",
      "validation",
      "warnings",
    ]);
    expect(result.sourceBundle).toEqual(validPayload());
    // Reconstructed object + arrays, not the stored payload reference.
    expect(result.sourceBundle).not.toBe(stored.payload);
    expect(result.sourceBundle.sourceArtifactIds).not.toBe(
      (stored.payload as unknown as RfpHldSourceBundlePayload).sourceArtifactIds
    );
  });

  it("rejects (invalid_payload) a payload carrying leakable extra keys and never leaks them", async () => {
    const leaky = {
      ...validPayload(),
      tenantId: TENANT,
      storagePath: STORAGE_SENTINEL,
    };
    mockGetArtifactById.mockResolvedValue(
      makeBundleArtifact({ payload: leaky as unknown as Record<string, unknown> })
    );

    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("invalid_payload");
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain(STORAGE_SENTINEL);
  });

  it("does not leak tenantId or storage sentinels in ok detail output", async () => {
    const result = await loadRfpHldSourceBundleDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain(STORAGE_SENTINEL);
  });
});

// ---- module purity (static source check) -----------------------------------

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-source-bundle-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-source-bundle-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, canonical types, the source-bundle contract, and the pure assembler", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-file-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-hld-source-bundle",
      "@/lib/projects/project-rfp-hld-source-bundle-assembler",
    ]);
  });

  it("contains no node:fs, node:path, require, or raw-document/parser imports", () => {
    expect(source).not.toContain('from "node:fs"');
    expect(source).not.toContain('from "node:path"');
    expect(source).not.toContain("require(");
    expect(source).not.toContain("pdf-parse");
    expect(source).not.toContain("mammoth");
    expect(source).not.toContain("xlsx");
  });

  it("creates nothing and imports no forbidden stores, providers, routes, or components", () => {
    expect(/\b(?:create|update|delete)[A-Z]\w*/.test(source)).toBe(false);
    for (const forbidden of [
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/catalog',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/app',
      'from "@/components',
      'from "next/server"',
      'from "react"',
      "@anthropic-ai",
      "@google/generative-ai",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
