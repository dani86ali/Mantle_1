import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
}));

import { loadRfpSkuResolutionReviewWorkspace } from "@/lib/projects/project-rfp-sku-resolution-review-workspace";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-sku-1";
const FILE = "file-boq-1";
const CREATED = new Date("2026-06-01T10:00:00.000Z");
const UPDATED = new Date("2026-06-01T10:30:00.000Z");

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "RFP Bid",
    customerName: "Acme",
    mode: "rfp",
    pricingConfig: {
      currency: "SAR",
      mode: "margin",
      ratePercent: 10,
      vatRatePercent: 15,
      roundingDecimals: 2,
    },
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

function payload(): Record<string, unknown> {
  return {
    sourceNormalizedBoqArtifactId: "art-normalized-1",
    sourceNormalizedBoqArtifactVersion: 1,
    sourceFileIds: [FILE],
    lineCount: 2,
    summary: {
      totalLines: 2,
      needsReviewCount: 1,
      acceptedCount: 0,
      rejectedCount: 0,
      unresolvedCount: 1,
      manualCount: 0,
      outOfScopeCount: 0,
      exactSuggestionCount: 1,
      normalizedSuggestionCount: 0,
      ambiguousCount: 0,
      zeroPriceSuggestionCount: 88,
      catalogSource: "CATALOG-SOURCE-CANARY",
      workbookPath: "C:/secret/customer.xlsx",
    },
    decisions: [
      {
        sourceFileId: FILE,
        sourceRowNumber: 2,
        originalLineNumber: "1",
        originalSku: "C9300-48P-A?",
        status: "needs_review",
        rawWorkbookCells: ["RAW-CELL-CANARY"],
        price: 1234,
        suggestions: [
          {
            suggestedSku: "C9300-48P-A",
            description: "Access switch",
            source: "exact",
            confidence: 0.98,
            rationale: "Normalized match.",
            filePath: "C:/secret/customer.xlsx",
            price: 1234,
          },
        ],
      },
      {
        sourceFileId: FILE,
        sourceRowNumber: 3,
        originalLineNumber: "2",
        originalSku: "THIRD-PARTY-LINE",
        status: "unresolved",
        suggestions: [],
      },
    ],
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
    payload: payload(),
    createdAt: CREATED,
    updatedAt: UPDATED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(project());
  getArtifactMock.mockResolvedValue(artifact());
});

describe("loadRfpSkuResolutionReviewWorkspace", () => {
  it("returns wrong_mode for non-RFP projects without loading the artifact", async () => {
    getProjectMock.mockResolvedValue(project({ mode: "quick_bom" }));

    const result = await loadRfpSkuResolutionReviewWorkspace(
      TENANT,
      PROJECT,
      ARTIFACT
    );

    expect(result).toEqual({ status: "wrong_mode" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT, {
      includeArchived: true,
    });
    expect(getArtifactMock).not.toHaveBeenCalled();
  });

  it("projects only safe review line fields and strips pricing/catalog/path canaries", async () => {
    const result = await loadRfpSkuResolutionReviewWorkspace(
      TENANT,
      PROJECT,
      ARTIFACT
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.review.project).toEqual({
      id: PROJECT,
      name: "RFP Bid",
      customerName: "Acme",
      mode: "rfp",
      createdAt: CREATED.toISOString(),
      updatedAt: UPDATED.toISOString(),
    });
    expect(result.review.reviewSummary).toEqual({
      totalLineCount: 2,
      needsReviewCount: 1,
      acceptedCount: 0,
      rejectedCount: 0,
      unresolvedCount: 1,
      manualCount: 0,
      outOfScopeCount: 0,
    });
    expect(result.review.lines[0]).toEqual({
      sourceFileId: FILE,
      sourceRowNumber: 2,
      originalLineNumber: "1",
      originalSku: "C9300-48P-A?",
      status: "needs_review",
      suggestions: [
        {
          suggestedSku: "C9300-48P-A",
          description: "Access switch",
          source: "exact",
          confidence: 0.98,
          rationale: "Normalized match.",
        },
      ],
    });
    const serialized = JSON.stringify(result.review);
    for (const forbidden of [
      "pricingConfig",
      "CATALOG-SOURCE-CANARY",
      "zeroPriceSuggestionCount",
      "workbookPath",
      "rawWorkbookCells",
      "RAW-CELL-CANARY",
      "filePath",
      "price",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("fails closed on invalid sku_resolution payloads", async () => {
    getArtifactMock.mockResolvedValue(artifact({ payload: { decisions: [] } }));

    const result = await loadRfpSkuResolutionReviewWorkspace(
      TENANT,
      PROJECT,
      ARTIFACT
    );

    expect(result).toEqual({ status: "invalid_sku_resolution_payload" });
  });
});
