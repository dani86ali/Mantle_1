import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and both HLD knowledge-pack services (read-only list + create draft)
// so the route's auth gate, body validation, tenant/user/param authority,
// body-ignoring on GET, caller-authority stripping, and result mapping are tested
// independent of the DB. The create module also exposes the validation-error
// predicate the route uses to split 400 from 500.
const { mockRequireAuth, mockLoadList, mockCreate } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock(
  "@/lib/projects/project-rfp-hld-design-knowledge-pack-inspection",
  () => ({ loadRfpHldDesignKnowledgePackList: mockLoadList })
);
vi.mock("@/lib/projects/project-rfp-hld-design-knowledge-pack", () => ({
  createRfpHldDesignKnowledgePack: mockCreate,
  isRfpHldDesignKnowledgePackValidationError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    (error as { isRfpHldDesignKnowledgePackValidationError?: unknown })
      .isRfpHldDesignKnowledgePackValidationError === true,
}));

import { GET, POST } from "@/app/api/projects/[id]/rfp/hld-knowledge-packs/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-knowledge-packs/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT } };

const RFP_PROJECT = {
  id: PROJECT,
  name: "STC RFP Bid",
  customerName: "STC",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const ARTIFACT_SUMMARY = {
  id: "art-pack-1",
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

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_design_knowledge_pack",
  source: "manual_operator_entry",
  createdBy: SESSION.userId,
  createdAt: "2026-06-20T12:00:00.000Z",
  domain: "campus_switching",
  title: "Campus switching guidance",
  entryCount: 2,
  sectionCounts: {
    designPrinciples: 1,
    topologyGuidance: 1,
    constraints: 0,
    assumptions: 0,
    exclusions: 0,
    validationNotes: 0,
  },
};

const LIST_ITEM = { ...ARTIFACT_SUMMARY, payloadSummary: PAYLOAD_SUMMARY };

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifacts: [LIST_ITEM],
  artifactCount: 1,
};

const CREATE_OK = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: PAYLOAD_SUMMARY,
};

const VALID_BODY = {
  domain: "campus_switching",
  title: "Campus switching guidance",
  designPrinciples: ["redundant core"],
  topologyGuidance: ["two-tier"],
  constraints: [],
  assumptions: [],
  exclusions: [],
  validationNotes: [],
};

function createBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return { ...VALID_BODY, ...overrides };
}

function req(
  body: unknown = createBody(),
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

function validationError(message: string): Error {
  return Object.assign(new Error(message), {
    isRfpHldDesignKnowledgePackValidationError: true as const,
  });
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
  mockCreate.mockReset().mockResolvedValue(CREATE_OK);
});

describe("GET /api/projects/[id]/rfp/hld-knowledge-packs - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await GET(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadList).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/[id]/rfp/hld-knowledge-packs - authority", () => {
  it("passes only session tenant and the route project id; a decoy body is never read", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
    });

    const res = await GET(request, PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadList).toHaveBeenCalledTimes(1);
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("GET /api/projects/[id]/rfp/hld-knowledge-packs - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadList.mockResolvedValue({ status: "not_found" });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadList.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps ok to 200 with { project, artifactCount, artifacts } and no status discriminator", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifactCount: 1,
      artifacts: [LIST_ITEM],
    });
    expect("status" in body).toBe(false);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_knowledge_pack_inspection_failed");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/hld-knowledge-packs - auth", () => {
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
    expect(mockCreate).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/rfp/hld-knowledge-packs - body validation", () => {
  it("returns 400 invalid_rfp_hld_knowledge_pack_request for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_knowledge_pack_request");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for non-object bodies without calling the service", async () => {
    const badBodies: unknown[] = [null, "string-body", 42, true, [], [VALID_BODY]];
    for (const body of badBodies) {
      mockCreate.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe(
        "invalid_rfp_hld_knowledge_pack_request"
      );
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });
});

describe("POST /api/projects/[id]/rfp/hld-knowledge-packs - authority", () => {
  it("passes only session tenant/user, the route project id, and whitelisted content; decoy authority fields never reach the service", async () => {
    const body = createBody({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      createdBy: "attacker-user",
      createdAt: "2000-01-01T00:00:00.000Z",
      status: "approved",
      stageId: "boq_pricing_review",
      type: "priced_boq",
      payloadKind: "evil",
      source: "raw_document",
      payload: { hack: true },
      id: "attacker-artifact",
      price: 999,
      sku: "ATTACKER-SKU",
    });

    await POST(req(body), PARAMS);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "assumptions",
      "constraints",
      "createdBy",
      "designPrinciples",
      "domain",
      "exclusions",
      "projectId",
      "tenantId",
      "title",
      "topologyGuidance",
      "validationNotes",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.createdBy).toBe(SESSION.userId);
    expect(arg.domain).toBe(VALID_BODY.domain);
    expect(arg.title).toBe(VALID_BODY.title);

    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.createdBy).not.toBe("attacker-user");
    for (const leaked of [
      "createdAt",
      "status",
      "stageId",
      "type",
      "payloadKind",
      "source",
      "payload",
      "id",
      "price",
      "sku",
    ]) {
      expect(leaked in arg).toBe(false);
    }
  });

  it("coerces a non-string domain/title to an empty string rather than forwarding junk", async () => {
    const body = createBody({ domain: { evil: true }, title: 42 });

    await POST(req(body), PARAMS);

    const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.domain).toBe("");
    expect(arg.title).toBe("");
  });
});

describe("POST /api/projects/[id]/rfp/hld-knowledge-packs - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreate.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockCreate.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps ok to 201 with { artifact, payloadSummary } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });

  it("maps a known validation error to 400 invalid_rfp_hld_knowledge_pack_request without leaking the message", async () => {
    const secret = "Unknown design domain: (blank).";
    mockCreate.mockRejectedValue(validationError(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_hld_knowledge_pack_request");
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreate.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_knowledge_pack_failed");
    expect(body.error).toBe("Unable to create RFP HLD knowledge pack.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("/api/projects/[id]/rfp/hld-knowledge-packs - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/hld-knowledge-packs/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-knowledge-pack-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the HLD knowledge-pack services", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-design-knowledge-pack-inspection",
      "@/lib/projects/project-rfp-hld-design-knowledge-pack",
    ]);
  });

  it("does not create artifact versions or approvals, and reads no file/evidence stores", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
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
      'from "@/app/(',
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
