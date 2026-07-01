import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the HLD design-model approval service so the route's auth gate,
// body validation, tenant/user/param authority, body-ignoring, and result mapping
// are tested independent of the DB and the project/artifact/approval stores.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-design-model-approval", () => ({
  reviewRfpHldDesignModelArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-hld-design-model-9";
const SESSION = {
  userId: "u-engineer",
  tenantId: "55555555-5555-5555-5555-555555555555",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_design_model",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: ["bundle-1"],
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const OK_RESULT = {
  status: "ok",
  approval: { id: "appr-1", artifactId: ARTIFACT_ID, decision: "approved" },
  artifactStatus: "approved",
  stageStatus: "approved",
  artifact: ARTIFACT_SUMMARY,
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

function validBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
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

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST .../rfp/artifacts/[artifactId]/hld-design-model/review - auth", () => {
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

describe("POST .../hld-design-model/review - body validation", () => {
  it("returns 400 invalid_rfp_hld_design_model_review_request for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_hld_design_model_review_request");
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
      expect(json.code).toBe("invalid_rfp_hld_design_model_review_request");
      expect(mockReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST .../hld-design-model/review - authority", () => {
  it("passes only session tenant/user, route params, and decision/note; decoy authority fields never reach the service", async () => {
    const body = {
      decision: "rejected",
      note: "not current",
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      decidedBy: "attacker-user",
      decidedAt: "2000-01-01T00:00:00.000Z",
      status: "approved",
      payload: { hack: true },
      sourceArtifactIds: ["attacker"],
    };

    await POST(req(body), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "artifactId",
      "decidedBy",
      "decision",
      "note",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT_ID);
    expect(arg.decidedBy).toBe(SESSION.userId);
    expect(arg.decision).toBe("rejected");
    expect(arg.note).toBe("not current");

    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.artifactId).not.toBe("attacker-artifact");
    expect(arg.decidedBy).not.toBe("attacker-user");
    for (const leaked of ["decidedAt", "status", "payload", "sourceArtifactIds"]) {
      expect(leaked in arg).toBe(false);
    }
  });

  it("preserves an optional string note", async () => {
    await POST(req(validBody({ note: "looks current" })), PARAMS);

    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.note).toBe("looks current");
  });

  it("ignores a non-string note rather than rejecting the request", async () => {
    await POST(req(validBody({ note: 999 })), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect("note" in arg).toBe(false);
  });
});

describe("POST .../hld-design-model/review - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string]> = [
    [{ status: "not_found" }, 404, "project_not_found"],
    [{ status: "artifact_not_found" }, 404, "hld_design_model_artifact_not_found"],
    [{ status: "approval_failed" }, 409, "hld_design_model_review_failed"],
  ];

  it.each(SIMPLE)(
    "maps %o to the right HTTP status and code",
    async (result, httpStatus, code) => {
      mockReview.mockResolvedValue(result);

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(httpStatus);
      expect((await res.json()).code).toBe(code);
    }
  );

  it("maps wrong_mode to 409 wrong_project_mode and includes the project summary", async () => {
    mockReview.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps artifact_not_hld_design_model to 409 with the artifact summary", async () => {
    const artifact = { ...ARTIFACT_SUMMARY, type: "hld_source_bundle" };
    mockReview.mockResolvedValue({
      status: "artifact_not_hld_design_model",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_hld_design_model");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps artifact_not_reviewable to 409 hld_design_model_artifact_not_reviewable with the artifact summary", async () => {
    const artifact = { ...ARTIFACT_SUMMARY, status: "approved" };
    mockReview.mockResolvedValue({
      status: "artifact_not_reviewable",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_artifact_not_reviewable");
    expect(body.error).toBe("HLD design model artifact is not reviewable.");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps invalid_hld_design_model_payload to 409 hld_design_model_payload_invalid with the artifact summary", async () => {
    mockReview.mockResolvedValue({
      status: "invalid_hld_design_model_payload",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_payload_invalid");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps stale_hld_design_model_payload to 409 hld_design_model_payload_stale with staleCode, messages, and errors", async () => {
    mockReview.mockResolvedValue({
      status: "stale_hld_design_model_payload",
      artifact: ARTIFACT_SUMMARY,
      staleCode: "source_artifact_ids_mismatch",
      messages: ["The artifact sourceArtifactIds no longer equals the current source bundle id."],
      errors: ["e1", "e2"],
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_payload_stale");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
    expect(body.staleCode).toBe("source_artifact_ids_mismatch");
    expect(body.messages).toEqual([
      "The artifact sourceArtifactIds no longer equals the current source bundle id.",
    ]);
    expect(body.errors).toEqual(["e1", "e2"]);
  });

  it("maps stale_hld_design_model_payload with no messages/errors to a clean 409 (omits both keys)", async () => {
    mockReview.mockResolvedValue({
      status: "stale_hld_design_model_payload",
      artifact: ARTIFACT_SUMMARY,
      staleCode: "source_compatibility_mismatch",
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_payload_stale");
    expect(body.staleCode).toBe("source_compatibility_mismatch");
    expect("messages" in body).toBe(false);
    expect("errors" in body).toBe(false);
  });

  it("maps hld_design_model_review_required to 409 with the model artifact summary", async () => {
    mockReview.mockResolvedValue({
      status: "hld_design_model_review_required",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_review_required");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
    expect(body.error).toContain("OpenAI advisory");
    expect(body.error).not.toContain("deterministic");
  });

  it("maps invalid_hld_design_model_review_payload to 409 with both summaries and errors", async () => {
    const reviewArtifact = { ...ARTIFACT_SUMMARY, id: "rev-1", type: "hld_design_model_review" };
    mockReview.mockResolvedValue({
      status: "invalid_hld_design_model_review_payload",
      artifact: ARTIFACT_SUMMARY,
      reviewArtifact,
      errors: ["payload: must be an object"],
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_review_payload_invalid");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
    expect(body.reviewArtifact).toEqual(reviewArtifact);
    expect(body.errors).toEqual(["payload: must be an object"]);
  });

  it("maps blocking_hld_design_model_review_findings to 409 with recommendation and counts", async () => {
    const reviewArtifact = { ...ARTIFACT_SUMMARY, id: "rev-1", type: "hld_design_model_review" };
    mockReview.mockResolvedValue({
      status: "blocking_hld_design_model_review_findings",
      artifact: ARTIFACT_SUMMARY,
      reviewArtifact,
      recommendation: "reject_required",
      findingCounts: { blocking: 2, warning: 1, suggestion: 0 },
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_review_findings_blocking");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
    expect(body.reviewArtifact).toEqual(reviewArtifact);
    expect(body.recommendation).toBe("reject_required");
    expect(body.findingCounts).toEqual({ blocking: 2, warning: 1, suggestion: 0 });
  });

  it("maps ok to 200 with { approval, artifactStatus, stageStatus, artifact } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approval: OK_RESULT.approval,
      artifactStatus: OK_RESULT.artifactStatus,
      stageStatus: OK_RESULT.stageStatus,
      artifact: ARTIFACT_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../hld-design-model/review - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-model-review";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_review_failed");
    expect(body.error).toBe("Unable to review HLD design model.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../hld-design-model/review - route surface", () => {
  it("exports POST only", () => {
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["GET", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-design-model-approval-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the HLD design-model approval service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-design-model-approval",
    ]);
  });

  it("creates no artifact versions, calls no store directly, and pulls in no sibling/legacy modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      'from "@/lib/projects/project-rfp-hld-design-model"',
      'from "@/lib/projects/project-rfp-hld-design-model-draft"',
      'from "@/lib/projects/project-rfp-hld-design-model-inspection"',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      "@anthropic-ai",
      "@google/generative-ai",
      "pdf-parse",
      "mammoth",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the route source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
