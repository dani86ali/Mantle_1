import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the rebuild-request service so the route's auth gate, scoped body
// parse, tenant/user/param authority, and result mapping are tested without a DB.
const { mockRequireAuth, mockCreate, mockList } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreate: vi.fn(),
  mockList: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock(
  "@/lib/projects/project-rfp-hld-design-model-rebuild-request-service",
  () => ({
    createRfpHldDesignModelRebuildRequest: mockCreate,
    listRfpHldDesignModelRebuildRequests: mockList,
  })
);

import { POST, GET } from "@/app/api/projects/[id]/rfp/hld-design-model-rebuild-request/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-design-model-rebuild-request/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const MODEL_ID = "model-7";
const REVIEW_ID = "review-7";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT } };

const VALID_BODY = {
  sourceHldDesignModelArtifactId: MODEL_ID,
  sourceReviewArtifactId: REVIEW_ID,
  reason: "The advisory review flagged findings to resolve.",
  instructions: "Redraft from the same approved source artifacts only.",
};

const ARTIFACT_SUMMARY = {
  id: "req-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_design_model_rebuild_request",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: [MODEL_ID, REVIEW_ID],
  createdAt: "2026-06-24T12:00:00.000Z",
  updatedAt: "2026-06-24T12:00:00.000Z",
};

const LISTED_ARTIFACT = {
  ...ARTIFACT_SUMMARY,
  payloadSummary: {
    payloadKind: "rfp_hld_design_model_rebuild_request",
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceReviewArtifactId: REVIEW_ID,
    requestedAt: "2026-06-24T10:00:00.000Z",
    status: "active",
  },
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

function req(body: unknown = VALID_BODY): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

function reqBadJson(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new SyntaxError("bad"))),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreate.mockReset().mockResolvedValue({ status: "ok", artifact: ARTIFACT_SUMMARY });
  mockList
    .mockReset()
    .mockResolvedValue({ status: "ok", artifactCount: 1, artifacts: [LISTED_ARTIFACT] });
});

describe("POST hld-design-model-rebuild-request - auth", () => {
  it("returns the requireAuth response and skips body parse and service", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await POST(request, PARAMS);
    expect(res).toBe(unauth);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST hld-design-model-rebuild-request - invalid body", () => {
  it("maps invalid JSON to 400 without calling the service", async () => {
    const res = await POST(reqBadJson(), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_design_model_rebuild_request");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maps a missing/blank/non-string field to 400 without calling the service", async () => {
    for (const body of [
      {},
      { ...VALID_BODY, reason: "" },
      { ...VALID_BODY, instructions: "   " },
      { ...VALID_BODY, sourceReviewArtifactId: 123 },
      { ...VALID_BODY, sourceHldDesignModelArtifactId: null },
      [MODEL_ID],
      "string body",
    ]) {
      mockCreate.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });
});

describe("POST hld-design-model-rebuild-request - authority", () => {
  it("passes only session tenant/user, route project id, and the four parsed fields", async () => {
    const request = req({
      ...VALID_BODY,
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      requestedBy: "attacker-user",
      status: "approved",
      payload: { hack: true },
      sku: "ATTACKER-SKU",
    });
    const res = await POST(request, PARAMS);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "instructions",
      "projectId",
      "reason",
      "requestedBy",
      "sourceHldDesignModelArtifactId",
      "sourceReviewArtifactId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.requestedBy).toBe(SESSION.userId);
    expect(JSON.stringify(arg)).not.toContain("attacker");
    expect(JSON.stringify(arg)).not.toContain("ATTACKER-SKU");
  });
});

describe("POST hld-design-model-rebuild-request - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreate.mockResolvedValue({ status: "not_found" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 with the project summary", async () => {
    mockCreate.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps invalid_source_model to 409", async () => {
    mockCreate.mockResolvedValue({ status: "invalid_source_model" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe(
      "hld_design_model_rebuild_request_invalid_source_model"
    );
  });

  it("maps invalid_review to 409", async () => {
    mockCreate.mockResolvedValue({ status: "invalid_review" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe(
      "hld_design_model_rebuild_request_invalid_review"
    );
  });

  it("maps active_request_exists to 409 with the existing artifact", async () => {
    mockCreate.mockResolvedValue({
      status: "active_request_exists",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_rebuild_request_already_active");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps redo_limit_exhausted to 409 with phase, maxRedoAttempts, and attemptCount", async () => {
    mockCreate.mockResolvedValue({
      status: "redo_limit_exhausted",
      phase: "initial_openai_gate",
      maxRedoAttempts: 1,
      attemptCount: 1,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_rebuild_request_redo_limit_exhausted");
    expect(body.phase).toBe("initial_openai_gate");
    expect(body.maxRedoAttempts).toBe(1);
    expect(body.attemptCount).toBe(1);
  });

  it("maps a se_directed redo_limit_exhausted to 409 with phase, max 2, and attemptCount", async () => {
    mockCreate.mockResolvedValue({
      status: "redo_limit_exhausted",
      phase: "se_directed_openai_gate",
      maxRedoAttempts: 2,
      attemptCount: 2,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_rebuild_request_redo_limit_exhausted");
    expect(body.phase).toBe("se_directed_openai_gate");
    expect(body.maxRedoAttempts).toBe(2);
    expect(body.attemptCount).toBe(2);
  });

  it("maps invalid_request_payload to 409 with errors", async () => {
    mockCreate.mockResolvedValue({
      status: "invalid_request_payload",
      errors: ["instructions: authorizes new scope"],
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_rebuild_request_payload_invalid");
    expect(body.errors).toEqual(["instructions: authorizes new scope"]);
  });

  it("maps ok to 201 with { artifact } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ artifact: ARTIFACT_SUMMARY });
    expect("status" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain("tenantId");
  });

  it("maps an unexpected service error to a controlled 500", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreate.mockRejectedValue(new Error(secret));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_design_model_rebuild_request_failed");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET hld-design-model-rebuild-request - auth", () => {
  it("returns the requireAuth response and never parses a body or calls the service", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await GET(request, PARAMS);
    expect(res).toBe(unauth);
    expect(mockList).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET hld-design-model-rebuild-request - authority", () => {
  it("passes only session tenant and route project id, and reads no body", async () => {
    const request = req();
    const res = await GET(request, PARAMS);
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledTimes(1);
    const arg = mockList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET hld-design-model-rebuild-request - result mapping", () => {
  it("maps ok to 200 with { artifactCount, artifacts } and no status or tenant id", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ artifactCount: 1, artifacts: [LISTED_ARTIFACT] });
    expect("status" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain("tenantId");
  });

  it("maps not_found to 404 project_not_found", async () => {
    mockList.mockResolvedValue({ status: "not_found" });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockList.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps an unexpected service error to a controlled 500 with no thrown detail", async () => {
    const secret = "boom-list-internal-stack-detail";
    mockList.mockRejectedValue(new Error(secret));
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_design_model_rebuild_request_list_failed");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("hld-design-model-rebuild-request - route surface", () => {
  it("exports GET and POST only", () => {
    expect(typeof routeModule.POST).toBe("function");
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/hld-design-model-rebuild-request/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-design-model-rebuild-request-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the rebuild-request service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-design-model-rebuild-request-service",
    ]);
  });

  it("never reads multipart form data", () => {
    expect(source).not.toContain("formData");
  });

  it("touches no store directly and reads no file/AI/pricing/catalog modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
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
