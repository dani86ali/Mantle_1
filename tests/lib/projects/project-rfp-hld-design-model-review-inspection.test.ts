import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the store boundaries only. The Stage 6E-B-001 review contract validator
// stays REAL so the detail payload gate is a true integration check over the
// supplied fixtures.
const {
  mockGetProjectById,
  mockGetArtifactById,
  mockListProjectArtifactsByType,
} = vi.hoisted(() => ({
  mockGetProjectById: vi.fn(),
  mockGetArtifactById: vi.fn(),
  mockListProjectArtifactsByType: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({
  getProjectById: mockGetProjectById,
}));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: mockGetArtifactById,
  listProjectArtifactsByType: mockListProjectArtifactsByType,
}));

import {
  loadRfpHldDesignModelReviewList,
  loadRfpHldDesignModelReviewDetail,
} from "@/lib/projects/project-rfp-hld-design-model-review-inspection";
import {
  RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
  type RfpHldDesignModelReviewPayload,
} from "@/lib/projects/project-rfp-hld-design-model-review";
import type { Project, ProjectArtifact } from "@/types/project";

const TENANT = "44444444-4444-4444-4444-444444444444";
const PROJECT = "proj-1";
const MODEL_ID = "hdm-1";
const BUNDLE_ID = "hsb-1";
const REVIEW_ID = "hdmr-1";
const CREATED_AT = "2026-06-24T00:00:00.000Z";
const CREATED_DATE = new Date(CREATED_AT);

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

function validReviewPayload(): RfpHldDesignModelReviewPayload {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceHldSourceBundleArtifactId: BUNDLE_ID,
    reviewedAt: CREATED_AT,
    reviewer: { type: "deterministic", id: "u-engineer" },
    sourceReferences: [
      { id: "ref-model", artifactId: MODEL_ID },
      { id: "ref-bundle", artifactId: BUNDLE_ID },
    ],
    findings: [
      {
        id: "rf-1",
        severity: "warning",
        category: "missing_assumption",
        message:
          "The approved source bundle records context the design model does not reference.",
        sourceReferenceIds: ["ref-model", "ref-bundle"],
      },
      {
        id: "rf-2",
        severity: "suggestion",
        category: "unclear_narrative",
        message: "A design section records no design decisions.",
        sourceReferenceIds: ["ref-model"],
      },
    ],
    recommendation: "rebuild_recommended",
    boundedRebuildInstructions: {
      summary:
        "Redraft the design model from the approved source bundle to resolve the listed review findings.",
      instructions:
        "Use the same approved source bundle. Fix only the listed review findings. " +
        "Do not add facts, products, quantities, costs, output files, or authority decisions.",
      maxAttempts: 1,
    },
  };
}

function validReviewArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: REVIEW_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "needs_review",
    version: 1,
    payload: validReviewPayload() as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, BUNDLE_ID],
    createdAt: CREATED_DATE,
    updatedAt: CREATED_DATE,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetProjectById.mockReset().mockResolvedValue(makeProject());
  mockGetArtifactById.mockReset().mockResolvedValue(validReviewArtifact());
  mockListProjectArtifactsByType
    .mockReset()
    .mockResolvedValue([validReviewArtifact()]);
});

describe("loadRfpHldDesignModelReviewList - input + project gates", () => {
  it("throws on a blank projectId before any store call", async () => {
    await expect(
      loadRfpHldDesignModelReviewList({ tenantId: TENANT, projectId: "  " })
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockListProjectArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns not_found when the project is absent", async () => {
    mockGetProjectById.mockResolvedValue(null);
    const result = await loadRfpHldDesignModelReviewList({
      tenantId: TENANT,
      projectId: PROJECT,
    });
    expect(result).toEqual({ status: "not_found" });
    expect(mockListProjectArtifactsByType).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with a lean summary that omits tenantId", async () => {
    mockGetProjectById.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await loadRfpHldDesignModelReviewList({
      tenantId: TENANT,
      projectId: PROJECT,
    });
    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
    expect(JSON.stringify(result)).not.toContain(TENANT);
    expect(mockListProjectArtifactsByType).not.toHaveBeenCalled();
  });
});

describe("loadRfpHldDesignModelReviewList - listing", () => {
  it("lists with listProjectArtifactsByType(..., hld_design_model_review)", async () => {
    await loadRfpHldDesignModelReviewList({ tenantId: TENANT, projectId: PROJECT });
    expect(mockListProjectArtifactsByType).toHaveBeenCalledWith(
      TENANT,
      PROJECT,
      "hld_design_model_review"
    );
  });

  it("filters out wrong project, wrong type, and wrong stage rows", async () => {
    mockListProjectArtifactsByType.mockResolvedValue([
      validReviewArtifact(),
      validReviewArtifact({ id: "x-proj", projectId: "other" }),
      validReviewArtifact({ id: "x-type", type: "hld_design_model" }),
      validReviewArtifact({ id: "x-stage", stageId: "compliance_matrix_review" }),
    ]);
    const result = await loadRfpHldDesignModelReviewList({
      tenantId: TENANT,
      projectId: PROJECT,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.artifactCount).toBe(1);
    expect(result.artifacts[0].id).toBe(REVIEW_ID);
  });

  it("returns counts-only payload summaries and never a raw payload body", async () => {
    const result = await loadRfpHldDesignModelReviewList({
      tenantId: TENANT,
      projectId: PROJECT,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    const summary = result.artifacts[0].payloadSummary;
    expect(summary).toEqual({
      payloadKind: RFP_HLD_DESIGN_MODEL_REVIEW_PAYLOAD_KIND,
      reviewedAt: CREATED_AT,
      reviewerType: "deterministic",
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
      findingCount: 2,
      findingCountsBySeverity: { blocking: 0, warning: 1, suggestion: 1 },
      recommendation: "rebuild_recommended",
      hasBoundedRebuildInstructions: true,
    });
    const json = JSON.stringify(result);
    // No leakage of finding bodies or rebuild text beyond the summary fields.
    expect(json).not.toContain("findings");
    expect(json).not.toContain("boundedRebuildInstructions");
    expect(json).not.toContain("sourceReferences");
    expect(json).not.toContain("Redraft the design model");
    expect(json).not.toContain("does not reference");
  });
});

describe("loadRfpHldDesignModelReviewDetail - gates", () => {
  it("throws on a blank projectId and a blank artifactId before any store call", async () => {
    await expect(
      loadRfpHldDesignModelReviewDetail({
        tenantId: TENANT,
        projectId: " ",
        artifactId: REVIEW_ID,
      })
    ).rejects.toThrow();
    await expect(
      loadRfpHldDesignModelReviewDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: " ",
      })
    ).rejects.toThrow();
    expect(mockGetProjectById).not.toHaveBeenCalled();
    expect(mockGetArtifactById).not.toHaveBeenCalled();
  });

  it("returns not_found / wrong_mode at the project gate", async () => {
    mockGetProjectById.mockResolvedValueOnce(null);
    expect(
      await loadRfpHldDesignModelReviewDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: REVIEW_ID,
      })
    ).toEqual({ status: "not_found" });

    mockGetProjectById.mockResolvedValueOnce(makeProject({ mode: "quick_bom" }));
    const wrong = await loadRfpHldDesignModelReviewDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: REVIEW_ID,
    });
    expect(wrong.status).toBe("wrong_mode");
  });

  it("returns artifact_not_found for a missing or foreign-project artifact", async () => {
    mockGetArtifactById.mockResolvedValueOnce(null);
    expect(
      await loadRfpHldDesignModelReviewDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: REVIEW_ID,
      })
    ).toEqual({ status: "artifact_not_found" });

    mockGetArtifactById.mockResolvedValueOnce(
      validReviewArtifact({ projectId: "other" })
    );
    expect(
      await loadRfpHldDesignModelReviewDetail({
        tenantId: TENANT,
        projectId: PROJECT,
        artifactId: REVIEW_ID,
      })
    ).toEqual({ status: "artifact_not_found" });
  });

  it("returns artifact_not_hld_design_model_review for the wrong type or stage", async () => {
    mockGetArtifactById.mockResolvedValueOnce(
      validReviewArtifact({ type: "hld_design_model" })
    );
    const wrongType = await loadRfpHldDesignModelReviewDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: REVIEW_ID,
    });
    expect(wrongType.status).toBe("artifact_not_hld_design_model_review");

    mockGetArtifactById.mockResolvedValueOnce(
      validReviewArtifact({ stageId: "compliance_matrix_review" })
    );
    const wrongStage = await loadRfpHldDesignModelReviewDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: REVIEW_ID,
    });
    expect(wrongStage.status).toBe("artifact_not_hld_design_model_review");
  });

  it("returns invalid_payload for a malformed persisted payload", async () => {
    mockGetArtifactById.mockResolvedValue(
      validReviewArtifact({ payload: { junk: true } })
    );
    const result = await loadRfpHldDesignModelReviewDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: REVIEW_ID,
    });
    expect(result.status).toBe("invalid_payload");
    if (result.status !== "invalid_payload") throw new Error("unreachable");
    expect("payload" in result.artifact).toBe(false);
  });
});

describe("loadRfpHldDesignModelReviewDetail - ok", () => {
  it("returns a sanitized whitelist copy, not the stored object", async () => {
    const row = validReviewArtifact();
    mockGetArtifactById.mockResolvedValue(row);
    const result = await loadRfpHldDesignModelReviewDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: REVIEW_ID,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.review).toEqual(validReviewPayload());
    // ...but a distinct copy of the stored payload and its nested arrays.
    expect(result.review).not.toBe(row.payload);
    expect(result.review.findings).not.toBe(
      (row.payload as unknown as RfpHldDesignModelReviewPayload).findings
    );
    result.review.findings.push({
      id: "x",
      severity: "warning",
      category: "other",
      message: "x",
      sourceReferenceIds: ["ref-model"],
    });
    expect(
      (row.payload as unknown as RfpHldDesignModelReviewPayload).findings
    ).toHaveLength(2);
  });

  it("returns only the whitelisted review contract keys, never extra stored keys", async () => {
    const result = await loadRfpHldDesignModelReviewDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: REVIEW_ID,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(Object.keys(result.review).sort()).toEqual(
      [
        "boundedRebuildInstructions",
        "findings",
        "payloadKind",
        "recommendation",
        "reviewedAt",
        "reviewer",
        "sourceArtifactIds",
        "sourceHldDesignModelArtifactId",
        "sourceHldSourceBundleArtifactId",
        "sourceReferences",
      ].sort()
    );
    expect("tenantId" in result.review).toBe(false);
  });

  it("leaks no tenantId or storagePath anywhere in the result", async () => {
    const result = await loadRfpHldDesignModelReviewDetail({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: REVIEW_ID,
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain(TENANT);
    expect(json).not.toContain("storagePath");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-review-inspection.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-design-model-review-inspection.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly the stores, the review contract, and canonical types", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/db/project-store",
      "@/lib/db/project-artifact-store",
      "@/lib/projects/project-rfp-hld-design-model-review",
      "@/types/project",
    ]);
  });

  it("performs no create/update/delete mutation", () => {
    const mutationTokens = source.match(/\b(?:create|update|delete)[A-Z]\w*/g) ?? [];
    expect(mutationTokens).toEqual([]);
  });

  it("imports no fs/path/raw-doc, AI/provider, pricing/sku/catalog/config, route/component, approval, or final-output", () => {
    for (const forbidden of [
      'from "node:fs',
      'from "node:path',
      'from "@/lib/db/project-file-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/project-rfp-hld-design-model-review-deterministic"',
      'from "@/lib/projects/approvals"',
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
