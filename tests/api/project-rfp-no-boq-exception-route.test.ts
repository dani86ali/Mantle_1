import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the no-BoQ exception service so the route's auth-gate, body
// validation, authority stripping, and result-mapping are tested without the DB.
const { mockRequireAuth, mockCreate } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-no-boq-exception", () => ({
  createRfpNoBoqServiceOnlyException: mockCreate,
}));

import { POST } from "@/app/api/projects/[id]/rfp/boq/no-boq-exception/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/boq/no-boq-exception/route";
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
  artifact: { id: "art-exc-1", status: "needs_review" },
  payloadSummary: {
    payloadKind: "rfp_no_boq_service_only_exception",
    acceptedLineCount: 0,
  },
  workspace: { projectId: PROJECT, hasBoqFiles: false },
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

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreate.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST /api/projects/[id]/rfp/boq/no-boq-exception - auth", () => {
  it("returns the requireAuth NextResponse directly and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(req({ reason: "x" }), { params: { id: PROJECT } });

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("uses session tenant/user and route project id, ignoring caller-supplied authority fields", async () => {
    await POST(
      req({
        reason: "Service only.",
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        requestedBy: "attacker",
        requestedAt: "1999-01-01T00:00:00.000Z",
      }),
      { params: { id: PROJECT } }
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg).toEqual({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      reason: "Service only.",
      requestedBy: SESSION.userId,
    });
    expect(arg.requestedBy).not.toBe("attacker");
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect("requestedAt" in arg).toBe(false);
  });
});

describe("POST /api/projects/[id]/rfp/boq/no-boq-exception - body validation", () => {
  it("returns 400 for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), {
      params: { id: PROJECT },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_no_boq_exception_request");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid bodies without calling the service", async () => {
    const badBodies: unknown[] = [
      null,
      "string-body",
      42,
      {},
      { reason: "" },
      { reason: "   " },
      { reason: 123 },
      { reason: true },
    ];
    for (const body of badBodies) {
      mockCreate.mockClear();
      const res = await POST(req(body), { params: { id: PROJECT } });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("invalid_rfp_no_boq_exception_request");
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });
});

describe("POST /api/projects/[id]/rfp/boq/no-boq-exception - result mapping", () => {
  const cases: Array<{
    result: Record<string, unknown>;
    http: number;
    code: string;
    check?: (body: Record<string, unknown>) => void;
  }> = [
    { result: { status: "not_found" }, http: 404, code: "project_not_found" },
    {
      result: { status: "wrong_mode", project: { id: PROJECT, mode: "quick_bom" } },
      http: 409,
      code: "wrong_project_mode",
      check: (body) =>
        expect(body.project).toEqual({ id: PROJECT, mode: "quick_bom" }),
    },
    {
      result: { status: "boq_files_present" },
      http: 409,
      code: "rfp_boq_files_present",
    },
    {
      result: {
        status: "exception_already_exists",
        artifact: { id: "art-prior", status: "needs_review" },
      },
      http: 409,
      code: "rfp_no_boq_exception_already_exists",
      check: (body) =>
        expect(body.artifact).toEqual({ id: "art-prior", status: "needs_review" }),
    },
  ];

  for (const c of cases) {
    it(`maps ${c.result.status} to ${c.http} with code ${c.code}`, async () => {
      mockCreate.mockResolvedValue(c.result);

      const res = await POST(req({ reason: "x" }), { params: { id: PROJECT } });

      expect(res.status).toBe(c.http);
      const body = await res.json();
      expect(body.code).toBe(c.code);
      if (c.check) c.check(body);
    });
  }

  it("maps ok to 201 with artifact, payloadSummary, and workspace, leaking no status discriminator", async () => {
    mockCreate.mockResolvedValue(OK_RESULT);

    const res = await POST(req({ reason: "x" }), { params: { id: PROJECT } });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: OK_RESULT.artifact,
      payloadSummary: OK_RESULT.payloadSummary,
      workspace: OK_RESULT.workspace,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST /api/projects/[id]/rfp/boq/no-boq-exception - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown message", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreate.mockRejectedValue(new Error(secret));

    const res = await POST(req({ reason: "x" }), { params: { id: PROJECT } });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_no_boq_exception_failed");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/boq/no-boq-exception - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/boq/no-boq-exception/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-no-boq-exception-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the no-BoQ exception service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-no-boq-exception",
    ]);
  });

  it("does not contain a multipart form-data accessor", () => {
    expect(source).not.toContain("formData");
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
