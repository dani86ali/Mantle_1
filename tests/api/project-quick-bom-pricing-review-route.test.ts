import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the shared exact-artifact approval service so the route's
// auth-gate, body validation, tenant/user/param authority, body-ignoring, the
// forced priced_boq allowlist, and result-mapping are tested independent of the DB.
const { mockRequireAuth, mockReview, mockLoadReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
  mockLoadReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-quick-bom-approval", () => ({
  reviewProjectQuickBomArtifact: mockReview,
}));
vi.mock("@/lib/projects/project-quick-bom-pricing-review-workspace", () => ({
  loadQuickBomPricedBoqReviewWorkspace: mockLoadReview,
}));

import { POST, GET } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/review/route";
import * as routeModule from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
const ARTIFACT_ID = "art-pb-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "boq_pricing_review",
  type: "priced_boq",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: ["art-ce-7"],
  createdAt: "2026-05-21T09:00:00.000Z",
  updatedAt: "2026-05-21T09:30:00.000Z",
};

const OK_RESULT = {
  status: "ok",
  approval: { id: "appr-1", artifactId: ARTIFACT_ID, decision: "approved" },
  artifactStatus: "approved",
  stageStatus: "approved",
  workspace: { status: "ok", workspace: { id: PROJECT } },
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "RFP Bid",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { decision: "approved", ...overrides };
}

function req(
  body: unknown = validBody(),
  opts: { invalidJson?: boolean } = {}
): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(
      opts.invalidJson
        ? () => Promise.reject(new SyntaxError("bad json"))
        : () => Promise.resolve(body)
    ),
  } as unknown as NextRequest;
}

const REVIEW_WORKSPACE = {
  project: { id: PROJECT, tenantId: SESSION.tenantId, name: "Honeywell", mode: "quick_bom", createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z" },
  artifact: { ...ARTIFACT_SUMMARY },
  payloadSummary: {
    sourceConfigurationExpansionArtifactId: "art-ce-7",
    sourceConfigurationExpansionArtifactVersion: 3,
    sourceNormalizedBoqArtifactId: "art-nb-2",
    sourceNormalizedBoqArtifactVersion: 1,
    sourceSkuResolutionArtifactId: "art-skur-5",
    sourceSkuResolutionArtifactVersion: 2,
    sourceFileIds: ["file-1"],
    pricingConfig: { currency: "SAR", mode: "margin", ratePercent: 30, vatRatePercent: 15, roundingDecimals: 2 },
    lineCount: 1,
    pricingSummary: {
      inputLineCount: 1, pricedLineCount: 1, unpricedLineCount: 0,
      missingDecisionCount: 0, notAcceptedCount: 0, missingPriceCount: 0,
      totals: { currency: "SAR", lineCount: 1, subtotalListPriceSar: 2000, subtotalSellPriceSar: 1400, vatAmountSar: 210, totalIncVatSar: 1610 },
    },
  },
  reviewSummary: { totalLineCount: 1, pricedLineCount: 1, unpricedLineCount: 0, missingPriceCount: 0, warningCount: 0 },
  lines: [],
};

const OK_LOAD_RESULT = { status: "ok" as const, review: REVIEW_WORKSPACE };

function getReq(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new Error("no body on GET"))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue(OK_RESULT);
  mockLoadReview.mockReset().mockResolvedValue(OK_LOAD_RESULT);
});

describe("POST .../priced-boq/review - auth", () => {
  it("returns the requireAuth response and skips body parsing and the service when unauthenticated", async () => {
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

describe("POST .../priced-boq/review - body validation", () => {
  it("returns 400 invalid_priced_boq_review_request for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_priced_boq_review_request");
    expect(body.error).toBe("decision is required.");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid bodies without calling the service", async () => {
    const badBodies: unknown[] = [
      null,
      "string-body",
      42,
      true,
      {},
      { note: "no decision" },
      { decision: "maybe" },
      { decision: true },
      { decision: null },
      [{ decision: "approved" }],
    ];
    for (const body of badBodies) {
      mockReview.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("invalid_priced_boq_review_request");
      expect(mockReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST .../priced-boq/review - authority", () => {
  it("uses session tenant/user plus route params, ignores body authority fields, and forces allowedArtifactTypes priced_boq", async () => {
    const body = {
      decision: "rejected",
      note: "n",
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      pricedBoqArtifactId: "attacker-artifact",
      decidedBy: "attacker-user",
      decidedAt: "2000-01-01T00:00:00.000Z",
      pricingConfig: { currency: "USD", mode: "margin", ratePercent: 99 },
      unitListPriceSarBySku: { HACK: { currency: "USD", unitListPriceSar: 1 } },
      exportPath: "/tmp/hack.xlsx",
      allowedArtifactTypes: ["export_package"],
    };

    await POST(req(body), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT_ID);
    expect(arg.decidedBy).toBe(SESSION.userId);
    expect(arg.decision).toBe("rejected");
    expect(arg.note).toBe("n");
    expect(arg.allowedArtifactTypes).toEqual(["priced_boq"]);

    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.artifactId).not.toBe("attacker-artifact");
    expect(arg.decidedBy).not.toBe("attacker-user");
    // No body-supplied authority or pricing/export field reaches the service.
    for (const leaked of [
      "decidedAt",
      "pricedBoqArtifactId",
      "pricingConfig",
      "unitListPriceSarBySku",
      "exportPath",
    ]) {
      expect(leaked in arg).toBe(false);
    }
    // A body-supplied allowedArtifactTypes never widens the route's fixed allowlist.
    expect(arg.allowedArtifactTypes).not.toContain("export_package");
  });

  it("preserves an optional string note", async () => {
    await POST(req(validBody({ note: "looks good" })), PARAMS);

    const arg = mockReview.mock.calls[0][0];
    expect(arg.note).toBe("looks good");
  });

  it("ignores a non-string note rather than rejecting the request", async () => {
    await POST(req(validBody({ note: 999 })), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect("note" in arg).toBe(false);
  });
});

describe("POST .../priced-boq/review - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string]> = [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "artifact_not_found" }, 404, "priced_boq_artifact_not_found"],
  ];

  it.each(SIMPLE)("maps %o to the right HTTP status and code", async (result, httpStatus, code) => {
    mockReview.mockResolvedValue(result);

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(httpStatus);
    expect((await res.json()).code).toBe(code);
  });

  it("maps wrong_mode to 409 wrong_project_mode and includes the project summary", async () => {
    mockReview.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps artifact_not_quick_bom to 409 artifact_not_priced_boq with the artifact summary", async () => {
    const artifact = { ...ARTIFACT_SUMMARY, type: "sku_resolution" };
    mockReview.mockResolvedValue({ status: "artifact_not_quick_bom", artifact });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_priced_boq");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps artifact_not_reviewable to 409 priced_boq_artifact_not_reviewable with the artifact and exact error", async () => {
    const artifact = { ...ARTIFACT_SUMMARY, status: "approved" };
    mockReview.mockResolvedValue({ status: "artifact_not_reviewable", artifact });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("priced_boq_artifact_not_reviewable");
    expect(body.error).toBe("Priced BoQ artifact is not reviewable.");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps approval_failed to 409 priced_boq_review_failed, distinct from the 500 only by status", async () => {
    mockReview.mockResolvedValue({ status: "approval_failed" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("priced_boq_review_failed");
    expect(body.error).toBe("Priced BoQ review could not be recorded.");
  });

  it("maps ok to 200 with { approval, artifactStatus, stageStatus, workspace } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approval: OK_RESULT.approval,
      artifactStatus: OK_RESULT.artifactStatus,
      stageStatus: OK_RESULT.stageStatus,
      workspace: OK_RESULT.workspace,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../priced-boq/review - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("priced_boq_review_failed");
    expect(body.error).toBe("Unable to review priced BoQ.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../priced-boq/review - route surface", () => {
  it("exports GET and POST; PATCH, PUT, DELETE are undefined", () => {
    expect(typeof routeModule.GET).toBe("function");
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("GET .../priced-boq/review - auth", () => {
  it("returns the requireAuth response and skips the loader when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const res = await GET(getReq(), PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadReview).not.toHaveBeenCalled();
  });
});

describe("GET .../priced-boq/review - authority", () => {
  it("calls loader with session tenantId and route params only", async () => {
    await GET(getReq(), PARAMS);

    expect(mockLoadReview).toHaveBeenCalledTimes(1);
    expect(mockLoadReview).toHaveBeenCalledWith(SESSION.tenantId, PROJECT, ARTIFACT_ID);
  });
});

describe("GET .../priced-boq/review - result mapping", () => {
  const LOADER_CASES: Array<[{ status: string }, number, string]> = [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "wrong_mode" }, 409, "wrong_project_mode"],
    [{ status: "priced_boq_not_found" }, 404, "priced_boq_artifact_not_found"],
    [{ status: "artifact_not_priced_boq" }, 409, "artifact_not_priced_boq"],
    [{ status: "priced_boq_not_reviewable" }, 409, "priced_boq_artifact_not_reviewable"],
    [{ status: "invalid_priced_boq_payload" }, 409, "invalid_priced_boq_payload"],
  ];

  it.each(LOADER_CASES)("maps loader %o to HTTP %i / code %s", async (loaderResult, httpStatus, code) => {
    mockLoadReview.mockResolvedValue(loaderResult);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(httpStatus);
    expect((await res.json()).code).toBe(code);
  });

  it("maps ok to 200 with { review } and no status discriminator", async () => {
    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ review: REVIEW_WORKSPACE });
    expect("status" in body).toBe(false);
  });
});

describe("GET .../priced-boq/review - loader failure", () => {
  it("maps an unexpected loader error to a safe 500 with code priced_boq_review_load_failed without exposing the thrown error", async () => {
    const secret = "get-loader-internal-boom";
    mockLoadReview.mockRejectedValue(new Error(secret));

    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("priced_boq_review_load_failed");
    expect(body.error).toBe("Unable to load priced BoQ review.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("GET 500 code is distinct from POST 500 code", async () => {
    mockReview.mockRejectedValue(new Error("post-boom"));
    mockLoadReview.mockRejectedValue(new Error("get-boom"));

    const postRes = await POST(req(), PARAMS);
    const getRes = await GET(getReq(), PARAMS);

    const postBody = await postRes.json();
    const getBody = await getRes.json();
    expect(postBody.code).toBe("priced_boq_review_failed");
    expect(getBody.code).toBe("priced_boq_review_load_failed");
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/priced-boq/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-quick-bom-pricing-review-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, the approval service, and the read-only review loader", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-quick-bom-approval",
      "@/lib/projects/project-quick-bom-pricing-review-workspace",
    ]);
  });

  it("does not import DB, stores, pricing, export, config-expansion, runner, AI, catalog, engine, coordinator, adapter, or artifact-creation modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/honeywell',
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
