import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

// Mock the DB store boundaries; the read model runs in isolation.
const { mockGetProjectById, mockGetArtifactById, mockListArtifactsByType } =
  vi.hoisted(() => ({
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
  loadRfpHldDesignKnowledgePackList,
  loadRfpHldDesignKnowledgePackDetail,
} from "@/lib/projects/project-rfp-hld-design-knowledge-pack-inspection";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-pack-2";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");

const PRINCIPLE = "PRINCIPLE-SENTINEL";
const STORAGE = "/secret/storage/path";
const RAW = "RAW-DOCUMENT-BODY-SENTINEL";
const SOURCE_PATH = "/secret/source/path";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "STC RFP Bid",
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

function makePayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    payloadKind: "rfp_hld_design_knowledge_pack",
    source: "manual_operator_entry",
    createdBy: "engineer-1",
    createdAt: "2026-06-20T09:15:00.000Z",
    domain: "campus_switching",
    title: "Campus switching design pack",
    designPrinciples: [PRINCIPLE, "  Trimmed  ", "", 42],
    topologyGuidance: ["Two-tier"],
    constraints: [],
    assumptions: [],
    exclusions: [],
    validationNotes: [],
    entryCount: 3,
    sectionCounts: {
      designPrinciples: 3,
      topologyGuidance: 1,
      constraints: 0,
      assumptions: 0,
      exclusions: 0,
      validationNotes: 0,
    },
    // Leakable junk the sanitizer must drop.
    tenantId: TENANT,
    storagePath: STORAGE,
    rawText: RAW,
    sourcePath: SOURCE_PATH,
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "design_knowledge_pack",
    status: "needs_review",
    version: 2,
    payload: makePayload(),
    sourceFileIds: [],
    sourceArtifactIds: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(makeArtifact());
  mockListArtifactsByType.mockReset().mockResolvedValue([makeArtifact()]);
});

describe("loadRfpHldDesignKnowledgePackList - gates", () => {
  it("throws on a blank projectId before any store call", async () => {
    await expect(
      loadRfpHldDesignKnowledgePackList({ tenantId: TENANT, projectId: "  " })
    ).rejects.toThrow("projectId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns not_found and never lists when the project is missing", async () => {
    mockGetProjectById.mockResolvedValue(null);

    const result = await loadRfpHldDesignKnowledgePackList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result).toEqual({ status: "not_found" });
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns wrong_mode (no tenantId) and never lists for a non-rfp project", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));

    const result = await loadRfpHldDesignKnowledgePackList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(mockListArtifactsByType).not.toHaveBeenCalled();
  });
});

describe("loadRfpHldDesignKnowledgePackList - lean summaries", () => {
  it("lists only design_knowledge_pack artifacts via the typed store query", async () => {
    await loadRfpHldDesignKnowledgePackList({ tenantId: TENANT, projectId: PROJECT });

    expect(mockListArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "design_knowledge_pack" as ProjectArtifactType
    );
  });

  it("returns lean payload summaries with counts but no content strings or leakable junk", async () => {
    const result = await loadRfpHldDesignKnowledgePackList({
      tenantId: TENANT,
      projectId: PROJECT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifactCount).toBe(1);
    const summary = result.artifacts[0].payloadSummary;
    expect(summary).toEqual({
      payloadKind: "rfp_hld_design_knowledge_pack",
      source: "manual_operator_entry",
      createdBy: "engineer-1",
      createdAt: "2026-06-20T09:15:00.000Z",
      domain: "campus_switching",
      title: "Campus switching design pack",
      // Only nonblank strings count: the 42 and the blank are dropped.
      entryCount: 3,
      sectionCounts: {
        designPrinciples: 2,
        topologyGuidance: 1,
        constraints: 0,
        assumptions: 0,
        exclusions: 0,
        validationNotes: 0,
      },
    });
    expect("designPrinciples" in summary).toBe(false);

    const json = JSON.stringify(result);
    for (const leak of [PRINCIPLE, STORAGE, RAW, SOURCE_PATH, TENANT]) {
      expect(json).not.toContain(leak);
    }
  });
});

describe("loadRfpHldDesignKnowledgePackDetail - gates", () => {
  it("throws on a blank artifactId before any store call", async () => {
    await expect(
      loadRfpHldDesignKnowledgePackDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: " ",
      })
    ).rejects.toThrow("artifactId is required.");
    expect(mockGetProjectById).not.toHaveBeenCalled();
  });

  it("returns artifact_not_found when the exact artifact is missing", async () => {
    mockGetArtifactById.mockResolvedValue(null);

    const result = await loadRfpHldDesignKnowledgePackDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result).toEqual({ status: "artifact_not_found" });
  });

  it("returns artifact_not_design_knowledge_pack for the wrong type or stage", async () => {
    for (const overrides of [
      { type: "compliance_matrix" as ProjectArtifactType },
      { stageId: "compliance_matrix_review" as ProjectStageId },
    ]) {
      mockGetArtifactById.mockResolvedValue(makeArtifact(overrides));

      const result = await loadRfpHldDesignKnowledgePackDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
      });

      expect(result.status).toBe("artifact_not_design_knowledge_pack");
      if (result.status !== "artifact_not_design_knowledge_pack") {
        throw new Error("unreachable");
      }
      expect("payload" in result.artifact).toBe(false);
    }
  });

  it("returns invalid_payload for a malformed payload (wrong kind or blank title)", async () => {
    for (const payload of [
      makePayload({ payloadKind: "something_else" }),
      makePayload({ title: "   " }),
    ]) {
      mockGetArtifactById.mockResolvedValue(makeArtifact({ payload }));

      const result = await loadRfpHldDesignKnowledgePackDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: ARTIFACT,
      });

      expect(result.status).toBe("invalid_payload");
    }
  });
});

describe("loadRfpHldDesignKnowledgePackDetail - sanitized detail", () => {
  it("surfaces whitelisted sanitized content only and drops arbitrary keys", async () => {
    const result = await loadRfpHldDesignKnowledgePackDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.pack).toEqual({
      payloadKind: "rfp_hld_design_knowledge_pack",
      source: "manual_operator_entry",
      createdBy: "engineer-1",
      createdAt: "2026-06-20T09:15:00.000Z",
      domain: "campus_switching",
      title: "Campus switching design pack",
      designPrinciples: [PRINCIPLE, "Trimmed"],
      topologyGuidance: ["Two-tier"],
      constraints: [],
      assumptions: [],
      exclusions: [],
      validationNotes: [],
      entryCount: 3,
      sectionCounts: {
        designPrinciples: 2,
        topologyGuidance: 1,
        constraints: 0,
        assumptions: 0,
        exclusions: 0,
        validationNotes: 0,
      },
    });

    for (const key of ["tenantId", "storagePath", "rawText", "sourcePath"]) {
      expect(key in result.pack).toBe(false);
    }
    const json = JSON.stringify(result);
    expect(json).toContain(PRINCIPLE);
    for (const leak of [STORAGE, RAW, SOURCE_PATH, TENANT]) {
      expect(json).not.toContain(leak);
    }
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-knowledge-pack-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-design-knowledge-pack-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the project store, artifact store, canonical types, and the knowledge-pack contract", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/types/project",
      "@/lib/projects/project-rfp-hld-design-knowledge-pack",
    ]);
  });

  it("performs no create/update/delete mutation and reads no file/evidence/raw stores, fs/path, pricing/sku/catalog/config, AI, routes, or UI", () => {
    expect(/\b(?:create|update|delete)[A-Z]\w*/.test(source)).toBe(false);
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
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

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
