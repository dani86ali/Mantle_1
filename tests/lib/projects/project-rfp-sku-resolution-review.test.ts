import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
}));
vi.mock("@/lib/projects/sku-resolution-review-artifact", () => ({
  createReviewedSkuResolutionArtifact: vi.fn(),
}));

import {
  reviewProjectRfpSkuResolutionLines,
  type ReviewProjectRfpSkuResolutionLinesInput,
} from "@/lib/projects/project-rfp-sku-resolution-review";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createReviewedSkuResolutionArtifact } from "@/lib/projects/sku-resolution-review-artifact";
import type { CreateReviewedSkuResolutionArtifactResult } from "@/lib/projects/sku-resolution-review-artifact";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const createReviewedMock = vi.mocked(createReviewedSkuResolutionArtifact);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-sku-1";
const FILE = "file-boq-1";
const USER = "user-engineer";
const CREATED = new Date("2026-06-01T10:00:00.000Z");
const UPDATED = new Date("2026-06-01T10:30:00.000Z");

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "RFP Bid",
    customerName: "Acme",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...overrides,
  };
}

function artifact(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: ARTIFACT,
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    version: 1,
    sourceFileIds: [FILE],
    sourceArtifactIds: ["art-normalized-1"],
    payload: {},
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...overrides,
  };
}

function reviewedResult(): CreateReviewedSkuResolutionArtifactResult {
  return {
    sourceArtifact: artifact(),
    artifact: artifact({
      id: "art-sku-reviewed-1",
      status: "generated",
      version: 2,
      sourceArtifactIds: [ARTIFACT],
    }),
    payload: {
      sourceNormalizedBoqArtifactId: "art-normalized-1",
      sourceNormalizedBoqArtifactVersion: 1,
      sourceFileIds: [FILE],
      lineCount: 2,
      decisions: [],
      summary: {
        totalLines: 2,
        needsReviewCount: 0,
        acceptedCount: 1,
        rejectedCount: 0,
        unresolvedCount: 0,
        manualCount: 1,
        outOfScopeCount: 0,
        exactSuggestionCount: 1,
        normalizedSuggestionCount: 0,
        ambiguousCount: 0,
        zeroPriceSuggestionCount: 99,
        catalogSource: "CATALOG-SOURCE-CANARY",
      },
    },
    reviewResult: {
      decisions: [],
      appliedCount: 2,
      needsReviewCount: 0,
      acceptedCount: 1,
      rejectedCount: 0,
      unresolvedCount: 0,
      manualCount: 1,
      outOfScopeCount: 0,
    },
  };
}

function input(): ReviewProjectRfpSkuResolutionLinesInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    skuResolutionArtifactId: ARTIFACT,
    decidedBy: USER,
    actions: [
      {
        decision: "accept",
        sourceFileId: FILE,
        sourceRowNumber: 2,
        acceptedSku: "C9300-48P-A",
      },
      {
        decision: "manual",
        sourceFileId: FILE,
        sourceRowNumber: 3,
        note: "Third-party line.",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(project());
  getArtifactMock.mockResolvedValue(artifact());
  createReviewedMock.mockResolvedValue(reviewedResult());
});

describe("reviewProjectRfpSkuResolutionLines", () => {
  it("scopes to RFP projects before loading or creating artifacts", async () => {
    getProjectMock.mockResolvedValue(project({ mode: "quick_bom" }));

    const result = await reviewProjectRfpSkuResolutionLines(input());

    expect(result.status).toBe("wrong_mode");
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createReviewedMock).not.toHaveBeenCalled();
  });

  it("refuses artifact-level review when the source SKU resolution is not line-reviewable", async () => {
    getArtifactMock.mockResolvedValue(artifact({ status: "generated" }));

    const result = await reviewProjectRfpSkuResolutionLines(input());

    expect(result.status).toBe("sku_resolution_not_reviewable");
    expect(createReviewedMock).not.toHaveBeenCalled();
  });

  it("stamps decidedBy from the service input and returns lean summaries only", async () => {
    const result = await reviewProjectRfpSkuResolutionLines(input());

    expect(result.status).toBe("ok");
    expect(createReviewedMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      skuResolutionArtifactId: ARTIFACT,
      actions: [
        {
          decision: "accept",
          sourceFileId: FILE,
          sourceRowNumber: 2,
          acceptedSku: "C9300-48P-A",
          decidedBy: USER,
        },
        {
          decision: "manual",
          sourceFileId: FILE,
          sourceRowNumber: 3,
          note: "Third-party line.",
          decidedBy: USER,
        },
      ],
    });
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact.status).toBe("generated");
    expect(result.reviewSummary).toEqual({
      appliedCount: 2,
      needsReviewCount: 0,
      acceptedCount: 1,
      rejectedCount: 0,
      unresolvedCount: 0,
      manualCount: 1,
      outOfScopeCount: 0,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("decisions");
    expect(serialized).not.toContain("CATALOG-SOURCE-CANARY");
    expect(serialized).not.toContain("zeroPriceSuggestionCount");
  });

  it("translates deterministic lower-level review failures", async () => {
    createReviewedMock.mockRejectedValue(
      new Error("Accepted SKU must match an existing suggestion.")
    );

    const result = await reviewProjectRfpSkuResolutionLines(input());

    expect(result).toEqual({ status: "accepted_sku_not_suggested" });
  });
});
