import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the knowledge-pack approval service so the route's auth gate, body
// validation, session/route authority, caller-authority stripping, and result
// mapping are tested independent of the DB.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock(
  "@/lib/projects/project-rfp-hld-design-knowledge-pack-approval",
  () => ({ reviewRfpHldDesignKnowledgePackArtifact: mockReview })
);

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-knowledge-pack/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-knowledge-pack/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT = "art-pack-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT } };

const RFP_PROJECT = {
  id: PROJECT,
  name: "STC RFP Bid",
  customerName: "STC",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const WRONG_MODE_PROJECT = { ...RFP_PROJECT, mode: "quick_bom" };

const ARTIFACT_SUMMARY = {
  id: ARTIFACT,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "design_knowledge_pack",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: [],
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const REVIEW_OK = {
  status: "ok",
  approval: {
    id: "appr-1",
    decision: "approved",
    decidedBy: SESSION.userId,
  },
  artifactStatus: "approved",
  stageStatus: "approved",
  artifact: ARTIFACT_SUMMARY,
};

function reviewBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return { decision: "approved", ...overrides };
}

function req(
  body: unknown = reviewBody(),
  opts: { invalidJson?: boolean } = {}
): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(
      opts.invalidJson
        ? () => Promise.reject(new SyntaxError("bad json"))
        : () => Promise.resolve(body)
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue(REVIEW_OK);
});

describe("POST .../hld-knowledge-pack/review - auth", () => {
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

describe("POST .../hld-knowledge-pack/review - body validation", () => {
  it("returns 400 invalid_rfp_hld_knowledge_pack_review_request for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(
      "invalid_rfp_hld_knowledge_pack_review_request"
    );
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid bodies and decisions without calling the service", async () => {
    const badBodies: unknown[] = [
      null,
      "string-body",
      42,
      {},
      { decision: "maybe" },
      { decision: "" },
      { decision: "APPROVED" },
      { note: "no decision" },
    ];
    for (const body of badBodies) {
      mockReview.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe(
        "invalid_rfp_hld_knowledge_pack_review_request"
      );
      expect(mockReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST .../hld-knowledge-pack/review - authority", () => {
  it("passes only session tenant/user, the route ids, and the parsed decision/note; decoy fields never reach the service", async () => {
    const body = reviewBody({
      note: "looks good",
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      decidedBy: "attacker-user",
      status: "approved",
      payload: { hack: true },
    });

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
    expect(arg.artifactId).toBe(ARTIFACT);
    expect(arg.decidedBy).toBe(SESSION.userId);
    expect(arg.decision).toBe("approved");
    expect(arg.note).toBe("looks good");

    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.artifactId).not.toBe("attacker-artifact");
    expect(arg.decidedBy).not.toBe("attacker-user");
    for (const leaked of ["status", "payload"]) {
      expect(leaked in arg).toBe(false);
    }
  });

  it("omits note when the body supplies a non-string note", async () => {
    await POST(req(reviewBody({ note: 42 })), PARAMS);

    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect("note" in arg).toBe(false);
  });
});

describe("POST .../hld-knowledge-pack/review - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockReview.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
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

  it("maps artifact_not_found to 404 hld_knowledge_pack_artifact_not_found", async () => {
    mockReview.mockResolvedValue({ status: "artifact_not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe(
      "hld_knowledge_pack_artifact_not_found"
    );
  });

  it("maps artifact_not_design_knowledge_pack to 409 artifact_not_hld_knowledge_pack", async () => {
    mockReview.mockResolvedValue({
      status: "artifact_not_design_knowledge_pack",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_hld_knowledge_pack");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps artifact_not_reviewable to 409 hld_knowledge_pack_artifact_not_reviewable", async () => {
    mockReview.mockResolvedValue({
      status: "artifact_not_reviewable",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_knowledge_pack_artifact_not_reviewable");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps invalid_design_knowledge_pack_payload to 409 hld_knowledge_pack_payload_invalid", async () => {
    mockReview.mockResolvedValue({
      status: "invalid_design_knowledge_pack_payload",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_knowledge_pack_payload_invalid");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps approval_failed to 409 hld_knowledge_pack_review_failed", async () => {
    mockReview.mockResolvedValue({ status: "approval_failed" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("hld_knowledge_pack_review_failed");
  });

  it("maps ok to 200 with { approval, artifactStatus, stageStatus, artifact } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approval: REVIEW_OK.approval,
      artifactStatus: REVIEW_OK.artifactStatus,
      stageStatus: REVIEW_OK.stageStatus,
      artifact: ARTIFACT_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("hld_knowledge_pack_review_failed");
    expect(body.error).toBe("Unable to review HLD knowledge pack.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe(".../hld-knowledge-pack/review - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-knowledge-pack/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-knowledge-pack-approval-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the approval service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-design-knowledge-pack-approval",
    ]);
  });

  it("creates no artifact versions, reads no file/evidence stores, and runs no AI/pricing/catalog", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/export',
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
