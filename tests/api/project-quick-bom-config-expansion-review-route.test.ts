import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the Quick BoM configuration-expansion review wrapper service so the
// route's auth-gate, body validation, tenant/user/param authority, body-ignoring,
// and result-mapping are tested independent of the DB and the lower-level services.
const { mockRequireAuth, mockReview, mockLoadWorkspace } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
  mockLoadWorkspace: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-quick-bom-config-expansion-review", () => ({
  reviewProjectQuickBomConfigurationExpansionDraft: mockReview,
}));
vi.mock("@/lib/projects/project-quick-bom-config-expansion-review-workspace", () => ({
  loadQuickBomConfigurationExpansionReviewWorkspace: mockLoadWorkspace,
}));

import { POST, GET } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/review/route";
import * as routeModule from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
const ARTIFACT_ID = "art-ce-draft-1";
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
  stageId: "configuration_expansion_review",
  type: "configuration_expansion",
  status: "needs_review",
  version: 4,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: ["art-nb-7", "art-skur-3"],
  createdAt: "2026-05-21T08:00:00.000Z",
  updatedAt: "2026-05-21T08:30:00.000Z",
};

const OK_ARTIFACT = {
  ...ARTIFACT_SUMMARY,
  id: "art-ce-rev-9",
  sourceArtifactIds: ["art-nb-7", "art-skur-3", ARTIFACT_ID],
};

const PAYLOAD_SUMMARY = {
  sourceNormalizedBoqArtifactId: "art-nb-7",
  sourceNormalizedBoqArtifactVersion: 5,
  sourceSkuResolutionArtifactId: "art-skur-3",
  sourceSkuResolutionArtifactVersion: 2,
  sourceConfigurationExpansionDraftArtifactId: ARTIFACT_ID,
  sourceConfigurationExpansionDraftArtifactVersion: 4,
  sourceFileIds: ["file-1"],
  rulePackId: "honeywell-scope-rules",
  rulePackVersion: "1.0.0",
  rulePackStatus: "approved",
  lineCount: 2,
  summary: {
    customerLineCount: 1,
    acceptedExpansionLineCount: 1,
    rejectedExpansionLineCount: 1,
    totalAcceptedLineCount: 2,
    reviewedExpansionLineCount: 2,
  },
};

const REVIEW_SUMMARY = {
  customerLineCount: 1,
  acceptedExpansionLineCount: 1,
  rejectedExpansionLineCount: 1,
  totalAcceptedLineCount: 2,
  reviewedExpansionLineCount: 2,
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
    decisions: [
      { lineId: "line-1-x1", action: "accept", note: "ok" },
      { lineId: "line-1-x2", action: "reject" },
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

const OK_REVIEW = {
  project: { id: PROJECT, tenantId: SESSION.tenantId, name: "Test", mode: "quick_bom", createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z" },
  artifact: { id: ARTIFACT_ID, projectId: PROJECT, stageId: "configuration_expansion_review", type: "configuration_expansion", status: "needs_review", version: 2, sourceFileIds: [], sourceArtifactIds: [], createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z" },
  payloadSummary: { sourceNormalizedBoqArtifactId: "art-nb-7", sourceNormalizedBoqArtifactVersion: 1, sourceSkuResolutionArtifactId: "art-skur-3", sourceSkuResolutionArtifactVersion: 2, sourceFileIds: [], rulePackId: "rules-1", rulePackVersion: "1.0.0", rulePackStatus: "approved", rulePackSourceScope: "demo", lineCount: 2, summary: {} },
  reviewSummary: { totalLineCount: 2, customerLineCount: 1, expansionLineCount: 1, requiresDecisionCount: 1, includedItemCount: 0 },
  lines: [],
};

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue({
    status: "ok",
    artifact: OK_ARTIFACT,
    payloadSummary: PAYLOAD_SUMMARY,
    reviewSummary: REVIEW_SUMMARY,
  });
  mockLoadWorkspace.mockReset().mockResolvedValue({ status: "ok", review: OK_REVIEW });
});

describe("POST .../configuration-expansion/review - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST .../configuration-expansion/review - request validation", () => {
  it("returns 400 invalid_configuration_expansion_review_request when the body is not valid JSON", async () => {
    const res = await POST(reqWithBadJson(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_configuration_expansion_review_request");
    expect(mockReview).not.toHaveBeenCalled();
  });

  const BAD_BODIES: Array<[string, unknown]> = [
    ["non-object body", 42],
    ["null body", null],
    ["array body", [{ lineId: "line-1-x1", action: "accept" }]],
    ["missing decisions", { foo: 1 }],
    ["decisions not an array", { decisions: "nope" }],
    ["decision not an object", { decisions: [42] }],
    ["unknown action", { decisions: [{ lineId: "line-1-x1", action: "maybe" }] }],
    ["blank lineId", { decisions: [{ lineId: "   ", action: "accept" }] }],
    ["non-string lineId", { decisions: [{ lineId: 5, action: "accept" }] }],
    ["missing lineId", { decisions: [{ action: "accept" }] }],
    ["missing action", { decisions: [{ lineId: "line-1-x1" }] }],
    ["non-string note", { decisions: [{ lineId: "line-1-x1", action: "accept", note: 5 }] }],
    ["null note", { decisions: [{ lineId: "line-1-x1", action: "accept", note: null }] }],
  ];

  it.each(BAD_BODIES)("returns 400 and skips the service for %s", async (_label, body) => {
    const res = await POST(req(body), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_configuration_expansion_review_request");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("allows an empty decisions array and forwards it to the service", async () => {
    await POST(req({ decisions: [] }), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    expect(mockReview.mock.calls[0][0].decisions).toEqual([]);
  });
});

describe("POST .../configuration-expansion/review - authority", () => {
  it("uses session tenant/user plus route params and ignores body authority fields", async () => {
    const body = {
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      configurationExpansionDraftArtifactId: "attacker-artifact",
      reviewedBy: "attacker-user",
      reviewedAt: "2000-01-01T00:00:00.000Z",
      decisions: [
        {
          lineId: "line-1-x1",
          action: "accept",
          note: "ok",
          reviewedBy: "attacker-user",
          reviewedAt: "2000-01-01T00:00:00.000Z",
          tenantId: "attacker-tenant",
        },
      ],
    };

    await POST(req(body), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.reviewedBy).toBe(SESSION.userId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.configurationExpansionDraftArtifactId).toBe(ARTIFACT_ID);
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.configurationExpansionDraftArtifactId).not.toBe("attacker-artifact");
    expect(arg.reviewedBy).not.toBe("attacker-user");
    expect("reviewedAt" in arg).toBe(false);

    // Each decision is sanitized to lineId/action/note only; no authority leaks.
    expect(arg.decisions).toEqual([{ lineId: "line-1-x1", action: "accept", note: "ok" }]);
    expect("reviewedBy" in arg.decisions[0]).toBe(false);
    expect("reviewedAt" in arg.decisions[0]).toBe(false);
    expect("tenantId" in arg.decisions[0]).toBe(false);
  });

  it("forwards a valid accept+reject batch with an optional note preserved", async () => {
    await POST(req(), PARAMS);

    const arg = mockReview.mock.calls[0][0];
    expect(arg.decisions).toEqual([
      { lineId: "line-1-x1", action: "accept", note: "ok" },
      { lineId: "line-1-x2", action: "reject" },
    ]);
  });
});

describe("POST .../configuration-expansion/review - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string]> = [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "configuration_expansion_draft_not_found" }, 404, "configuration_expansion_draft_not_found"],
    [{ status: "invalid_configuration_expansion_draft_payload" }, 409, "invalid_configuration_expansion_draft_payload"],
    [{ status: "normalized_boq_not_found" }, 404, "normalized_boq_artifact_not_found"],
    [{ status: "artifact_not_normalized_boq" }, 409, "artifact_not_normalized_boq"],
    [{ status: "sku_resolution_not_found" }, 404, "sku_resolution_artifact_not_found"],
    [{ status: "artifact_not_sku_resolution" }, 409, "artifact_not_sku_resolution"],
    [{ status: "invalid_sku_resolution_payload" }, 409, "invalid_sku_resolution_payload"],
    [{ status: "sku_resolution_normalized_boq_mismatch" }, 409, "sku_resolution_normalized_boq_mismatch"],
    [{ status: "sku_resolution_not_approved" }, 409, "sku_resolution_artifact_not_approved"],
    [{ status: "rule_pack_not_approved" }, 409, "configuration_expansion_rule_pack_not_approved"],
    [{ status: "duplicate_decision" }, 400, "duplicate_configuration_expansion_review_decision"],
    [{ status: "decision_target_not_found" }, 404, "configuration_expansion_review_decision_target_not_found"],
    [{ status: "customer_line_decision" }, 400, "configuration_expansion_review_customer_line_decision"],
    [{ status: "missing_expansion_decision" }, 400, "missing_configuration_expansion_review_decision"],
    [{ status: "invalid_decision_action" }, 400, "invalid_configuration_expansion_review_decision_action"],
    [{ status: "accepted_line_not_traceable" }, 409, "accepted_configuration_expansion_line_not_traceable"],
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

  const ARTIFACT_BEARING: Array<[string, string]> = [
    ["artifact_not_configuration_expansion", "artifact_not_configuration_expansion"],
    ["configuration_expansion_not_draft", "configuration_expansion_not_draft"],
    ["configuration_expansion_draft_not_reviewable", "configuration_expansion_draft_not_reviewable"],
  ];

  it.each(ARTIFACT_BEARING)("maps %s to 409 with the artifact summary", async (status, code) => {
    mockReview.mockResolvedValue({ status, artifact: ARTIFACT_SUMMARY });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe(code);
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps ok to 200 with { artifact, payloadSummary, reviewSummary } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      artifact: OK_ARTIFACT,
      payloadSummary: PAYLOAD_SUMMARY,
      reviewSummary: REVIEW_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../configuration-expansion/review - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("quick_bom_configuration_expansion_review_failed");
    expect(body.error).toBe("Unable to review Quick BoM configuration expansion draft.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

function getReq(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new Error("should not parse body on GET"))),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

describe("GET .../configuration-expansion/review - auth", () => {
  it("returns the requireAuth response and skips the loader when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const res = await GET(getReq(), PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadWorkspace).not.toHaveBeenCalled();
  });
});

describe("GET .../configuration-expansion/review - authority", () => {
  it("passes session tenantId and route params to the loader, ignores query string", async () => {
    await GET(getReq(), PARAMS);

    expect(mockLoadWorkspace).toHaveBeenCalledTimes(1);
    const [tenantId, projectId, artifactId] = mockLoadWorkspace.mock.calls[0] as [string, string, string];
    expect(tenantId).toBe(SESSION.tenantId);
    expect(projectId).toBe(PROJECT);
    expect(artifactId).toBe(ARTIFACT_ID);
  });
});

describe("GET .../configuration-expansion/review - result mapping", () => {
  const SIMPLE_GET: Array<[Record<string, unknown>, number, string]> = [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "wrong_mode" }, 409, "wrong_project_mode"],
    [{ status: "configuration_expansion_draft_not_found" }, 404, "configuration_expansion_draft_not_found"],
    [{ status: "artifact_not_configuration_expansion" }, 409, "artifact_not_configuration_expansion"],
    [{ status: "configuration_expansion_not_draft" }, 409, "configuration_expansion_not_draft"],
    [{ status: "configuration_expansion_draft_not_reviewable" }, 409, "configuration_expansion_draft_not_reviewable"],
    [{ status: "invalid_configuration_expansion_draft_payload" }, 409, "invalid_configuration_expansion_draft_payload"],
  ];

  it.each(SIMPLE_GET)("maps %o to the right HTTP status and code", async (result, httpStatus, code) => {
    mockLoadWorkspace.mockResolvedValue(result);

    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(httpStatus);
    expect((await res.json()).code).toBe(code);
  });

  it("maps ok to 200 with { review } and no status discriminator", async () => {
    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ review: OK_REVIEW });
    expect("status" in body).toBe(false);
  });
});

describe("GET .../configuration-expansion/review - loader failure", () => {
  it("maps an unexpected loader error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-loader-internal-stack";
    mockLoadWorkspace.mockRejectedValue(new Error(secret));

    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("quick_bom_configuration_expansion_review_load_failed");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../configuration-expansion/review - route surface", () => {
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
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/configuration-expansion/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-quick-bom-config-expansion-review-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, the wrapper service, and the review workspace loader", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-quick-bom-config-expansion-review",
      "@/lib/projects/project-quick-bom-config-expansion-review-workspace",
    ]);
  });

  it("does not import DB, stores, the lower-level helpers, pricing, export, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/config-expansion-artifact"',
      'from "@/lib/projects/config-expansion-review"',
      'from "@/lib/projects/project-quick-bom-config-expansion-draft"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
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
