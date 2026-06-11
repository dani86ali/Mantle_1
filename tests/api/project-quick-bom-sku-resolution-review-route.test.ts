import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the Quick BoM SKU review wrapper service so the route's auth-gate,
// body validation, tenant/user/param authority, body-ignoring, and result-mapping
// are tested independent of the DB and the lower-level review services.
const { mockRequireAuth, mockReview, mockLoader } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
  mockLoader: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-quick-bom-sku-resolution-review", () => ({
  reviewProjectQuickBomSkuResolutionLines: mockReview,
}));
vi.mock("@/lib/projects/project-quick-bom-sku-resolution-review-workspace", () => ({
  loadQuickBomSkuResolutionReviewWorkspace: mockLoader,
}));

import { POST, GET } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review/route";
import * as routeModule from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
const ARTIFACT_ID = "art-skur-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: "art-skur-2",
  projectId: PROJECT,
  stageId: "sku_resolution",
  type: "sku_resolution",
  status: "generated",
  version: 3,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: [ARTIFACT_ID],
  createdAt: "2026-05-21T09:00:00.000Z",
  updatedAt: "2026-05-21T09:30:00.000Z",
};

const PAYLOAD_SUMMARY = {
  sourceNormalizedBoqArtifactId: "art-nb-7",
  sourceNormalizedBoqArtifactVersion: 5,
  sourceFileIds: ["file-1"],
  lineCount: 2,
  summary: {
    totalLines: 2,
    needsReviewCount: 0,
    unresolvedCount: 0,
    acceptedCount: 1,
    rejectedCount: 1,
    exactSuggestionCount: 1,
    normalizedSuggestionCount: 0,
    ambiguousCount: 0,
    zeroPriceSuggestionCount: 0,
    catalogSource: "local_stc_historical_mock",
  },
};

const REVIEW_SUMMARY = {
  appliedCount: 2,
  needsReviewCount: 0,
  acceptedCount: 1,
  rejectedCount: 1,
  unresolvedCount: 0,
};

const NOT_REVIEWABLE_ARTIFACT = {
  ...ARTIFACT_SUMMARY,
  id: ARTIFACT_ID,
  status: "approved",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "RFP Bid",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

function validBody() {
  return {
    actions: [
      {
        decision: "accept",
        sourceFileId: "file-1",
        sourceRowNumber: 2,
        acceptedSku: "SKU-A",
        note: "ok",
      },
      { decision: "reject", sourceFileId: "file-1", sourceRowNumber: 3 },
    ],
  };
}

function req(body: unknown = validBody()): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

function reqWithBadJson(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new SyntaxError("Unexpected token"))),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

const REVIEW_WORKSPACE = {
  project: {
    id: PROJECT,
    tenantId: SESSION.tenantId,
    name: "Honeywell Quick BoM",
    mode: "quick_bom",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
  },
  artifact: {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    version: 2,
    sourceFileIds: ["file-1"],
    sourceArtifactIds: [],
    createdAt: "2026-05-21T08:00:00.000Z",
    updatedAt: "2026-05-21T08:30:00.000Z",
  },
  payloadSummary: {
    sourceNormalizedBoqArtifactId: "art-nb-7",
    sourceNormalizedBoqArtifactVersion: 5,
    sourceFileIds: ["file-1"],
    lineCount: 1,
    summary: {},
  },
  reviewSummary: {
    totalLineCount: 1,
    needsReviewCount: 1,
    acceptedCount: 0,
    rejectedCount: 0,
    unresolvedCount: 0,
  },
  lines: [
    {
      sourceFileId: "file-1",
      sourceRowNumber: 2,
      originalLineNumber: "L-002",
      originalSku: "WS-C3650-48FD-E",
      status: "needs_review",
      suggestions: [{ suggestedSku: "C9300-48P-A", source: "exact" }],
    },
  ],
};

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue({
    status: "ok",
    artifact: ARTIFACT_SUMMARY,
    payloadSummary: PAYLOAD_SUMMARY,
    reviewSummary: REVIEW_SUMMARY,
  });
  mockLoader.mockReset().mockResolvedValue({ status: "ok", review: REVIEW_WORKSPACE });
});

describe("POST .../sku-resolution/review - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST .../sku-resolution/review - request validation", () => {
  it("returns 400 invalid_sku_resolution_review_request when the body is not valid JSON", async () => {
    const res = await POST(reqWithBadJson(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_sku_resolution_review_request");
    expect(body.error).toBe("A non-empty actions array is required.");
    expect(mockReview).not.toHaveBeenCalled();
  });

  const BAD_BODIES: Array<[string, unknown]> = [
    ["non-object body", 42],
    ["null body", null],
    ["array body", [{ decision: "reject", sourceFileId: "f", sourceRowNumber: 1 }]],
    ["missing actions", { foo: 1 }],
    ["actions not an array", { actions: "nope" }],
    ["empty actions", { actions: [] }],
    ["action not an object", { actions: [42] }],
    ["unknown decision", { actions: [{ decision: "maybe", sourceFileId: "f", sourceRowNumber: 1 }] }],
    ["blank sourceFileId", { actions: [{ decision: "reject", sourceFileId: "   ", sourceRowNumber: 1 }] }],
    ["non-string sourceFileId", { actions: [{ decision: "reject", sourceFileId: 5, sourceRowNumber: 1 }] }],
    ["zero sourceRowNumber", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: 0 }] }],
    ["negative sourceRowNumber", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: -1 }] }],
    ["fractional sourceRowNumber", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: 1.5 }] }],
    ["non-finite sourceRowNumber", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: Infinity }] }],
    ["string sourceRowNumber", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: "1" }] }],
    ["accept missing acceptedSku", { actions: [{ decision: "accept", sourceFileId: "f", sourceRowNumber: 1 }] }],
    ["accept blank acceptedSku", { actions: [{ decision: "accept", sourceFileId: "f", sourceRowNumber: 1, acceptedSku: "  " }] }],
    ["accept non-string acceptedSku", { actions: [{ decision: "accept", sourceFileId: "f", sourceRowNumber: 1, acceptedSku: 7 }] }],
    ["reject carrying acceptedSku", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: 1, acceptedSku: "S" }] }],
    ["reject carrying null acceptedSku", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: 1, acceptedSku: null }] }],
    ["non-string note", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: 1, note: 5 }] }],
    ["null note", { actions: [{ decision: "reject", sourceFileId: "f", sourceRowNumber: 1, note: null }] }],
  ];

  it.each(BAD_BODIES)("returns 400 and skips the service for %s", async (_label, body) => {
    const res = await POST(req(body), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_sku_resolution_review_request");
    expect(mockReview).not.toHaveBeenCalled();
  });
});

describe("POST .../sku-resolution/review - authority", () => {
  it("uses session tenant/user plus route params and ignores body authority fields", async () => {
    const body = {
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      skuResolutionArtifactId: "attacker-artifact",
      decidedBy: "attacker-user",
      decidedAt: "2000-01-01T00:00:00.000Z",
      actions: [
        {
          decision: "accept",
          sourceFileId: "file-1",
          sourceRowNumber: 2,
          acceptedSku: "SKU-A",
          decidedBy: "attacker-user",
          decidedAt: "2000-01-01T00:00:00.000Z",
        },
      ],
    };

    await POST(req(body), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.decidedBy).toBe(SESSION.userId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.skuResolutionArtifactId).toBe(ARTIFACT_ID);
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.skuResolutionArtifactId).not.toBe("attacker-artifact");
    expect(arg.decidedBy).not.toBe("attacker-user");

    // Each action is sanitized to the allowed fields; no decidedBy/decidedAt leak.
    expect(arg.actions).toEqual([
      { decision: "accept", sourceFileId: "file-1", sourceRowNumber: 2, acceptedSku: "SKU-A" },
    ]);
    expect("decidedBy" in arg.actions[0]).toBe(false);
    expect("decidedAt" in arg.actions[0]).toBe(false);
  });

  it("forwards a valid accept+reject batch with an optional note preserved", async () => {
    await POST(req(), PARAMS);

    const arg = mockReview.mock.calls[0][0];
    expect(arg.actions).toEqual([
      { decision: "accept", sourceFileId: "file-1", sourceRowNumber: 2, acceptedSku: "SKU-A", note: "ok" },
      { decision: "reject", sourceFileId: "file-1", sourceRowNumber: 3 },
    ]);
  });
});

describe("POST .../sku-resolution/review - result mapping", () => {
  it("maps invalid_actions to 400 and includes the reason", async () => {
    mockReview.mockResolvedValue({ status: "invalid_actions", reason: "accepted_sku_required" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_sku_resolution_review_request");
    expect(body.reason).toBe("accepted_sku_required");
  });

  it("maps not_found to 404 project_not_found", async () => {
    mockReview.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode and includes the project summary", async () => {
    mockReview.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps sku_resolution_not_found to 404 sku_resolution_artifact_not_found", async () => {
    mockReview.mockResolvedValue({ status: "sku_resolution_not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("sku_resolution_artifact_not_found");
  });

  it("maps artifact_not_sku_resolution to 409 with the artifact when supplied", async () => {
    const artifact = { ...NOT_REVIEWABLE_ARTIFACT, type: "priced_boq" };
    mockReview.mockResolvedValue({ status: "artifact_not_sku_resolution", artifact });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_sku_resolution");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps artifact_not_sku_resolution without an artifact to 409 and omits artifact", async () => {
    mockReview.mockResolvedValue({ status: "artifact_not_sku_resolution" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_sku_resolution");
    expect("artifact" in body).toBe(false);
  });

  it("maps sku_resolution_not_reviewable to 409 with the artifact and the exact error", async () => {
    mockReview.mockResolvedValue({
      status: "sku_resolution_not_reviewable",
      artifact: NOT_REVIEWABLE_ARTIFACT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("sku_resolution_artifact_not_reviewable");
    expect(body.error).toBe("SKU resolution artifact is not reviewable.");
    expect(body.artifact).toEqual(NOT_REVIEWABLE_ARTIFACT);
  });

  it("maps invalid_sku_resolution_payload to 409", async () => {
    mockReview.mockResolvedValue({ status: "invalid_sku_resolution_payload" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invalid_sku_resolution_payload");
  });

  it("maps review_action_not_reviewable to 409 with the exact error", async () => {
    mockReview.mockResolvedValue({ status: "review_action_not_reviewable" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("sku_resolution_review_action_not_reviewable");
    expect(body.error).toBe("SKU resolution decision is not reviewable.");
  });

  it("maps accepted_sku_not_suggested to 409", async () => {
    mockReview.mockResolvedValue({ status: "accepted_sku_not_suggested" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("accepted_sku_not_suggested");
  });

  it("maps accept_deferred_not_allowed to 409 with the exact code", async () => {
    mockReview.mockResolvedValue({ status: "accept_deferred_not_allowed" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("sku_resolution_accept_deferred_not_allowed");
    expect(body.error).toBe(
      "Deferred non-priced SKU resolution row cannot be accepted."
    );
  });

  it("maps duplicate_action to 400 with the exact error", async () => {
    mockReview.mockResolvedValue({ status: "duplicate_action" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("duplicate_sku_resolution_review_action");
    expect(body.error).toBe("Duplicate SKU resolution action for decision.");
  });

  it("maps action_target_not_found to 404 with the exact error", async () => {
    mockReview.mockResolvedValue({ status: "action_target_not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("sku_resolution_review_action_target_not_found");
    expect(body.error).toBe("SKU resolution action target was not found.");
  });

  it("maps ok to 200 with { artifact, payloadSummary, reviewSummary } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
      reviewSummary: REVIEW_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../sku-resolution/review - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("quick_bom_sku_resolution_review_failed");
    expect(body.error).toBe("Unable to review Quick BoM SKU resolution lines.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

function getReq(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve({})),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

describe("GET .../sku-resolution/review - auth", () => {
  it("returns the requireAuth response and skips the loader when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await GET(getReq(), PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoader).not.toHaveBeenCalled();
  });
});

describe("GET .../sku-resolution/review - authority", () => {
  it("calls the loader with session tenantId plus route params id and artifactId", async () => {
    await GET(getReq(), PARAMS);

    expect(mockLoader).toHaveBeenCalledTimes(1);
    expect(mockLoader).toHaveBeenCalledWith(SESSION.tenantId, PROJECT, ARTIFACT_ID);
  });
});

describe("GET .../sku-resolution/review - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoader.mockResolvedValue({ status: "not_found" });
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode", async () => {
    mockLoader.mockResolvedValue({ status: "wrong_mode" });
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("wrong_project_mode");
  });

  it("maps sku_resolution_not_found to 404 sku_resolution_artifact_not_found", async () => {
    mockLoader.mockResolvedValue({ status: "sku_resolution_not_found" });
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("sku_resolution_artifact_not_found");
  });

  it("maps artifact_not_sku_resolution to 409", async () => {
    mockLoader.mockResolvedValue({ status: "artifact_not_sku_resolution" });
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("artifact_not_sku_resolution");
  });

  it("maps invalid_sku_resolution_payload to 409", async () => {
    mockLoader.mockResolvedValue({ status: "invalid_sku_resolution_payload" });
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invalid_sku_resolution_payload");
  });

  it("maps ok to 200 with { review } and no status discriminator", async () => {
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ review: REVIEW_WORKSPACE });
    expect("status" in body).toBe(false);
  });
});

describe("GET .../sku-resolution/review - loader failure", () => {
  it("maps an unexpected loader error to a controlled 500 without exposing the thrown detail", async () => {
    const secret = "get-loader-boom-internal-detail";
    mockLoader.mockRejectedValue(new Error(secret));

    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("quick_bom_sku_resolution_review_load_failed");
    expect(body.error).toBe("Unable to load Quick BoM SKU resolution review.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../sku-resolution/review - route surface", () => {
  it("exports GET and POST only", () => {
    expect(typeof routeModule.GET).toBe("function");
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-quick-bom-sku-resolution-review-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, the wrapper service, and the review workspace loader", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-quick-bom-sku-resolution-review",
      "@/lib/projects/project-quick-bom-sku-resolution-review-workspace",
    ]);
  });

  it("does not import DB, stores, the lower-level SKU/catalog helpers, pricing, config expansion, export, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/sku-resolution"',
      'from "@/lib/projects/sku-resolution-artifact"',
      'from "@/lib/projects/sku-resolution-review"',
      'from "@/lib/projects/sku-resolution-review-artifact"',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/export',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
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
