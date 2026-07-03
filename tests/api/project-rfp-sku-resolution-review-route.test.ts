import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { mockRequireAuth, mockReview, mockLoader } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
  mockLoader: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-sku-resolution-review", () => ({
  reviewProjectRfpSkuResolutionLines: mockReview,
}));
vi.mock("@/lib/projects/project-rfp-sku-resolution-review-workspace", () => ({
  loadRfpSkuResolutionReviewWorkspace: mockLoader,
}));

import {
  GET,
  POST,
} from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/sku-resolution/review/route";

const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-sku-1";
const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "user-engineer";
const SESSION = {
  userId: USER,
  tenantId: TENANT,
  email: "eng@example.com",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT } };

const ARTIFACT_SUMMARY = {
  id: "art-sku-reviewed-1",
  projectId: PROJECT,
  stageId: "sku_resolution",
  type: "sku_resolution",
  status: "generated",
  version: 2,
  sourceFileIds: ["file-boq-1"],
  sourceArtifactIds: [ARTIFACT],
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T10:30:00.000Z",
};

function req(body: unknown): NextRequest {
  return {
    json: vi.fn(() => Promise.resolve(body)),
  } as unknown as NextRequest;
}

function badJsonReq(): NextRequest {
  return {
    json: vi.fn(() => Promise.reject(new SyntaxError("bad json"))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue({
    status: "ok",
    artifact: ARTIFACT_SUMMARY,
    payloadSummary: {
      sourceNormalizedBoqArtifactId: "art-normalized-1",
      sourceNormalizedBoqArtifactVersion: 1,
      sourceFileIds: ["file-boq-1"],
      lineCount: 2,
      summary: { totalLines: 2 },
    },
    reviewSummary: {
      appliedCount: 2,
      needsReviewCount: 0,
      acceptedCount: 1,
      rejectedCount: 0,
      unresolvedCount: 0,
      manualCount: 1,
      outOfScopeCount: 0,
    },
  });
  mockLoader.mockReset().mockResolvedValue({
    status: "ok",
    review: {
      reviewSummary: {
        totalLineCount: 1,
        needsReviewCount: 1,
        acceptedCount: 0,
        rejectedCount: 0,
        unresolvedCount: 0,
        manualCount: 0,
        outOfScopeCount: 0,
      },
      lines: [
        {
          sourceFileId: "file-boq-1",
          sourceRowNumber: 2,
          originalLineNumber: "1",
          originalSku: "C9300-48P-A?",
          status: "needs_review",
          suggestions: [
            { suggestedSku: "C9300-48P-A", source: "exact" },
          ],
        },
      ],
    },
  });
});

describe("POST RFP SKU resolution review route", () => {
  it("returns the auth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "auth" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(req({ actions: [] }), PARAMS);

    expect(res).toBe(unauth);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies and non-accept actions carrying acceptedSku", async () => {
    expect((await POST(badJsonReq(), PARAMS)).status).toBe(400);
    expect((await POST(req({ actions: [] }), PARAMS)).status).toBe(400);
    expect(
      (
        await POST(
          req({
            actions: [
              {
                decision: "reject",
                sourceFileId: "file-boq-1",
                sourceRowNumber: 2,
                acceptedSku: "C9300-48P-A",
              },
            ],
          }),
          PARAMS
        )
      ).status
    ).toBe(400);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("uses session and route params as authority and accepts only sanitized actions", async () => {
    const res = await POST(
      req({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        decidedBy: "attacker",
        actions: [
          {
            decision: "accept",
            sourceFileId: "file-boq-1",
            sourceRowNumber: 2,
            acceptedSku: "C9300-48P-A",
            decidedBy: "attacker",
            note: "Matched approved suggestion.",
          },
          {
            decision: "manual",
            sourceFileId: "file-boq-1",
            sourceRowNumber: 3,
          },
        ],
      }),
      PARAMS
    );

    expect(res.status).toBe(200);
    expect(mockReview).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      skuResolutionArtifactId: ARTIFACT,
      decidedBy: USER,
      actions: [
        {
          decision: "accept",
          sourceFileId: "file-boq-1",
          sourceRowNumber: 2,
          acceptedSku: "C9300-48P-A",
          note: "Matched approved suggestion.",
        },
        {
          decision: "manual",
          sourceFileId: "file-boq-1",
          sourceRowNumber: 3,
        },
      ],
    });
  });

  it("maps accepted_sku_not_suggested to a controlled conflict", async () => {
    mockReview.mockResolvedValue({ status: "accepted_sku_not_suggested" });

    const res = await POST(
      req({
        actions: [
          {
            decision: "accept",
            sourceFileId: "file-boq-1",
            sourceRowNumber: 2,
            acceptedSku: "UNLISTED-SKU",
          },
        ],
      }),
      PARAMS
    );

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("accepted_sku_not_suggested");
  });
});

describe("GET RFP SKU resolution review route", () => {
  it("loads the review workspace using session tenant and route params", async () => {
    const res = await GET(req(null), PARAMS);

    expect(res.status).toBe(200);
    expect(mockLoader).toHaveBeenCalledWith(TENANT, PROJECT, ARTIFACT);
    expect(await res.json()).toEqual({
      review: {
        reviewSummary: {
          totalLineCount: 1,
          needsReviewCount: 1,
          acceptedCount: 0,
          rejectedCount: 0,
          unresolvedCount: 0,
          manualCount: 0,
          outOfScopeCount: 0,
        },
        lines: [
          {
            sourceFileId: "file-boq-1",
            sourceRowNumber: 2,
            originalLineNumber: "1",
            originalSku: "C9300-48P-A?",
            status: "needs_review",
            suggestions: [{ suggestedSku: "C9300-48P-A", source: "exact" }],
          },
        ],
      },
    });
  });

  it("maps loader failures without exposing thrown detail", async () => {
    mockLoader.mockResolvedValue({ status: "invalid_sku_resolution_payload" });

    const res = await GET(req(null), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invalid_sku_resolution_payload");
  });
});
