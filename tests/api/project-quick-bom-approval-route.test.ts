import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the review service so the route's auth-gate, body validation,
// and result-mapping are tested deterministically, independent of the DB.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-quick-bom-approval", () => ({
  reviewProjectQuickBomArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/quick-bom/approvals/route";
import * as routeModule from "@/app/api/projects/[id]/quick-bom/approvals/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const OK_RESULT = {
  status: "ok",
  approval: { id: "appr-1", artifactId: "art-1", decision: "approved" },
  artifactStatus: "approved",
  stageStatus: "approved",
  workspace: { status: "ok", workspace: { id: PROJECT } },
};

function req(
  body: unknown,
  opts: { invalidJson?: boolean } = {}
): NextRequest {
  return {
    headers: { get: () => null },
    json: opts.invalidJson
      ? () => Promise.reject(new Error("bad json"))
      : () => Promise.resolve(body),
  } as unknown as NextRequest;
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { artifactId: "art-1", decision: "approved", ...overrides };
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST /api/projects/[id]/quick-bom/approvals - auth", () => {
  it("returns the requireAuth NextResponse directly and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(req(validBody()), { params: { id: PROJECT } });

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("uses session.userId as decidedBy and session.tenantId for tenant scope, never decidedBy from the body", async () => {
    await POST(
      req(validBody({ decision: "rejected", note: "n", decidedBy: "attacker" })),
      { params: { id: PROJECT } }
    );

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect(arg).toEqual({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      artifactId: "art-1",
      decision: "rejected",
      decidedBy: SESSION.userId,
      note: "n",
    });
    expect(arg.decidedBy).not.toBe("attacker");
  });
});

describe("POST /api/projects/[id]/quick-bom/approvals - body validation", () => {
  it("returns 400 for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), {
      params: { id: PROJECT },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_project_quick_bom_approval_request");
    expect(body.error).toBe("artifactId and decision are required.");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid bodies without calling the service", async () => {
    const badBodies: unknown[] = [
      null,
      "string-body",
      42,
      {},
      { decision: "approved" },
      { artifactId: "art-1" },
      { artifactId: "   ", decision: "approved" },
      { artifactId: 123, decision: "approved" },
      { artifactId: "art-1", decision: "maybe" },
      { artifactId: "art-1", decision: true },
    ];
    for (const body of badBodies) {
      mockReview.mockClear();
      const res = await POST(req(body), { params: { id: PROJECT } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("invalid_project_quick_bom_approval_request");
      expect(mockReview).not.toHaveBeenCalled();
    }
  });

  it("ignores a non-string note rather than rejecting the request", async () => {
    await POST(req(validBody({ note: 999 })), { params: { id: PROJECT } });

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect("note" in arg).toBe(false);
  });
});

describe("POST /api/projects/[id]/quick-bom/approvals - result mapping", () => {
  const cases: Array<{
    result: Record<string, unknown>;
    http: number;
    code: string;
    check?: (body: Record<string, unknown>) => void;
  }> = [
    { result: { status: "not_found" }, http: 404, code: "project_not_found" },
    {
      result: { status: "wrong_mode", project: { id: PROJECT, mode: "rfp" } },
      http: 409,
      code: "wrong_project_mode",
      check: (body) => expect(body.project).toEqual({ id: PROJECT, mode: "rfp" }),
    },
    {
      result: { status: "artifact_not_found" },
      http: 404,
      code: "artifact_not_found",
    },
    {
      result: {
        status: "artifact_not_quick_bom",
        artifact: { id: "art-1", type: "normalized_boq" },
      },
      http: 409,
      code: "artifact_not_quick_bom",
      check: (body) =>
        expect(body.artifact).toEqual({ id: "art-1", type: "normalized_boq" }),
    },
    {
      result: {
        status: "artifact_not_reviewable",
        artifact: { id: "art-1", status: "approved" },
      },
      http: 409,
      code: "artifact_not_reviewable",
      check: (body) =>
        expect(body.artifact).toEqual({ id: "art-1", status: "approved" }),
    },
    {
      result: { status: "approval_failed" },
      http: 409,
      code: "artifact_approval_failed",
    },
  ];

  for (const c of cases) {
    it(`maps ${c.result.status} to ${c.http} with code ${c.code}`, async () => {
      mockReview.mockResolvedValue(c.result);

      const res = await POST(req(validBody()), { params: { id: PROJECT } });

      expect(res.status).toBe(c.http);
      const body = await res.json();
      expect(body.code).toBe(c.code);
      if (c.check) c.check(body);
    });
  }

  it("maps ok to 200 with approval, artifactStatus, stageStatus, and workspace, leaking no status discriminator", async () => {
    mockReview.mockResolvedValue(OK_RESULT);

    const res = await POST(req(validBody()), { params: { id: PROJECT } });

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

describe("POST /api/projects/[id]/quick-bom/approvals - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown message", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(validBody()), { params: { id: PROJECT } });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("project_quick_bom_approval_failed");
    expect(body.error).toBe("Unable to record Quick BoM approval.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/quick-bom/approvals - route surface", () => {
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
    "src/app/api/projects/[id]/quick-bom/approvals/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-quick-bom-approval-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the review service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-quick-bom-approval",
    ]);
  });

  it("does not import DB, mutation, pricing, export, config-expansion, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/adapters',
      'from "@/lib/agent',
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
