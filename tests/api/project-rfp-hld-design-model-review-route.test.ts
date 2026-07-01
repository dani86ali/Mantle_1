import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth, the read-only review list inspection service, and the OpenAI
// advisory review-create service (create + configured executor factory) so the
// route's auth gate, body-ignoring on GET, scoped body parse on POST,
// tenant/user/param authority, configured-executor wiring, and result mapping are
// tested independent of the DB and any live provider.
const {
  mockRequireAuth,
  mockLoadList,
  mockCreateReview,
  mockGetExecutor,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockCreateReview: vi.fn(),
  mockGetExecutor: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-design-model-review-inspection", () => ({
  loadRfpHldDesignModelReviewList: mockLoadList,
}));
vi.mock("@/lib/projects/project-rfp-hld-design-model-openai-review-service", () => ({
  createRfpHldDesignModelOpenAiReview: mockCreateReview,
  getConfiguredRfpHldDesignModelOpenAiReviewExecutor: mockGetExecutor,
}));

import { GET, POST } from "@/app/api/projects/[id]/rfp/hld-design-model-review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-design-model-review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-review-1";
const SOURCE_MODEL_ID = "art-model-7";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

// A distinct sentinel proving the route forwards the CONFIGURED executor (whatever
// the factory returns), not an inline null. In production the factory is a null
// seam; here we assert the wiring, not the seam value.
const CONFIGURED_EXECUTOR = { __configuredOpenAiExecutor: true };

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
  id: "art-review-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_design_model_review",
  status: "needs_review",
  version: 1,
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const MODEL_ARTIFACT_SUMMARY = {
  id: SOURCE_MODEL_ID,
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

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_design_model_review",
  reviewedAt: "2026-06-20T12:00:00.000Z",
  reviewerType: "ai_advisory",
  sourceHldDesignModelArtifactId: SOURCE_MODEL_ID,
  sourceHldSourceBundleArtifactId: "bundle-1",
  findingCount: 2,
  findingCountsBySeverity: { blocking: 0, warning: 1, suggestion: 1 },
  recommendation: "rebuild_recommended",
  hasBoundedRebuildInstructions: true,
};

const LIST_ITEM = { ...ARTIFACT_SUMMARY, payloadSummary: PAYLOAD_SUMMARY };

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifacts: [LIST_ITEM],
  artifactCount: 1,
};

const COUNTS = { blocking: 0, warning: 1, suggestion: 1 };

const CREATE_OK = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
  recommendation: "rebuild_recommended",
  findingCount: 2,
  findingCountsBySeverity: COUNTS,
};

function req(body: unknown = { sourceHldDesignModelArtifactId: SOURCE_MODEL_ID }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

function reqBadJson(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new SyntaxError("Unexpected token"))),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
  mockCreateReview.mockReset().mockResolvedValue(CREATE_OK);
  mockGetExecutor.mockReset().mockReturnValue(CONFIGURED_EXECUTOR);
});

describe("GET /api/projects/[id]/rfp/hld-design-model-review - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
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

describe("GET /api/projects/[id]/rfp/hld-design-model-review - authority", () => {
  it("passes only session tenant and the route project id; a decoy body is never read", async () => {
    const request = req({ tenantId: "attacker-tenant", projectId: "attacker-project" });

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

describe("GET /api/projects/[id]/rfp/hld-design-model-review - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadList.mockResolvedValue({ status: "not_found" });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadList.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
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
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_design_model_review_inspection_failed");
    expect(body.error).toBe("Unable to inspect HLD design model reviews.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/hld-design-model-review - auth", () => {
  it("returns the requireAuth response and skips the body parse and service when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreateReview).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/rfp/hld-design-model-review - invalid body", () => {
  it("maps invalid JSON to 400 without calling the service", async () => {
    const res = await POST(reqBadJson(), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe(
      "invalid_rfp_hld_design_model_review_create_request"
    );
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it("maps a missing/blank/non-string source model id to 400 without calling the service", async () => {
    for (const body of [
      {},
      { sourceHldDesignModelArtifactId: "" },
      { sourceHldDesignModelArtifactId: "   " },
      { sourceHldDesignModelArtifactId: 123 },
      { sourceHldDesignModelArtifactId: null },
      [SOURCE_MODEL_ID],
      "a string body",
    ]) {
      mockCreateReview.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe(
        "invalid_rfp_hld_design_model_review_create_request"
      );
      expect(mockCreateReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST /api/projects/[id]/rfp/hld-design-model-review - authority", () => {
  it("passes only session tenant/user, route project id, parsed source model id, and the configured executor; decoys are ignored", async () => {
    const request = req({
      sourceHldDesignModelArtifactId: SOURCE_MODEL_ID,
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      reviewedBy: "attacker-user",
      executor: { attacker: "executor" },
      status: "approved",
      payload: { hack: true },
      provider: "attacker-openai",
      model: "attacker-gpt",
      sourceArtifactIds: ["fake-art"],
      decision: "reject_required",
      scope: "extra",
      sku: "ATTACKER-SKU",
      price: 999,
      pricing: { total: 1 },
      configurationDecision: "x",
      catalogDecision: "y",
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(mockCreateReview).toHaveBeenCalledTimes(1);
    const arg = mockCreateReview.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "artifactId",
      "executor",
      "projectId",
      "reviewedBy",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.reviewedBy).toBe(SESSION.userId);
    expect(arg.artifactId).toBe(SOURCE_MODEL_ID);
    // The executor is exactly what the configured factory returned, not the
    // attacker-supplied executor field.
    expect(mockGetExecutor).toHaveBeenCalledTimes(1);
    expect(arg.executor).toBe(CONFIGURED_EXECUTOR);
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.reviewedBy).not.toBe("attacker-user");
    expect(JSON.stringify(arg)).not.toContain("attacker");
    expect(JSON.stringify(arg)).not.toContain("ATTACKER-SKU");
  });
});

describe("POST /api/projects/[id]/rfp/hld-design-model-review - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreateReview.mockResolvedValue({ status: "not_found" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockCreateReview.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps artifact_not_found to 404 hld_design_model_artifact_not_found", async () => {
    mockCreateReview.mockResolvedValue({ status: "artifact_not_found" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("hld_design_model_artifact_not_found");
  });

  it("maps artifact_not_hld_design_model to 409 with the artifact summary", async () => {
    mockCreateReview.mockResolvedValue({
      status: "artifact_not_hld_design_model",
      artifact: MODEL_ARTIFACT_SUMMARY,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_hld_design_model");
    expect(body.artifact).toEqual(MODEL_ARTIFACT_SUMMARY);
  });

  it("maps artifact_not_reviewable to 409 hld_design_model_artifact_not_reviewable with the artifact summary", async () => {
    mockCreateReview.mockResolvedValue({
      status: "artifact_not_reviewable",
      artifact: MODEL_ARTIFACT_SUMMARY,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_artifact_not_reviewable");
    expect(body.artifact).toEqual(MODEL_ARTIFACT_SUMMARY);
  });

  it("maps invalid_hld_design_model_payload to 409 hld_design_model_payload_invalid with the artifact summary", async () => {
    mockCreateReview.mockResolvedValue({
      status: "invalid_hld_design_model_payload",
      artifact: MODEL_ARTIFACT_SUMMARY,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_payload_invalid");
    expect(body.artifact).toEqual(MODEL_ARTIFACT_SUMMARY);
  });

  it("maps stale_hld_design_model_payload to 409 with the staleCode and only supplied messages/errors", async () => {
    mockCreateReview.mockResolvedValue({
      status: "stale_hld_design_model_payload",
      artifact: MODEL_ARTIFACT_SUMMARY,
      staleCode: "source_compatibility_mismatch",
      errors: ["model: no longer matches the current source bundle"],
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_openai_review_source_stale");
    expect(body.staleCode).toBe("source_compatibility_mismatch");
    expect(body.errors).toEqual(["model: no longer matches the current source bundle"]);
    // Only the arrays the service supplied are surfaced.
    expect("messages" in body).toBe(false);
  });

  it("maps stale_hld_design_model_payload with messages (and no errors) surfacing only messages", async () => {
    mockCreateReview.mockResolvedValue({
      status: "stale_hld_design_model_payload",
      artifact: MODEL_ARTIFACT_SUMMARY,
      staleCode: "source_readiness_blocked",
      messages: ["The source bundle is not yet ready."],
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_openai_review_source_stale");
    expect(body.staleCode).toBe("source_readiness_blocked");
    expect(body.messages).toEqual(["The source bundle is not yet ready."]);
    expect("errors" in body).toBe(false);
  });

  it("maps unavailable to 503 hld_design_model_openai_review_unavailable", async () => {
    mockCreateReview.mockResolvedValue({ status: "unavailable" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("hld_design_model_openai_review_unavailable");
  });

  it("maps review_failed to 502 hld_design_model_openai_review_failed", async () => {
    mockCreateReview.mockResolvedValue({
      status: "review_failed",
      error: "hld_quality_review_failed",
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_openai_review_failed");
    // The internal executor error string is not surfaced verbatim.
    expect(JSON.stringify(body)).not.toContain("hld_quality_review_failed");
  });

  it("maps invalid_candidate_output to 409 hld_design_model_openai_review_candidate_invalid with errors", async () => {
    mockCreateReview.mockResolvedValue({
      status: "invalid_candidate_output",
      errors: ["candidate: wrong payloadKind"],
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_design_model_openai_review_candidate_invalid");
    expect(body.errors).toEqual(["candidate: wrong payloadKind"]);
  });

  it("maps ok to 201 with { artifact, recommendation, findingCount, findingCountsBySeverity } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      recommendation: "rebuild_recommended",
      findingCount: 2,
      findingCountsBySeverity: COUNTS,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain("storagePath");
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateReview.mockRejectedValue(new Error(secret));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_design_model_review_failed");
    expect(body.error).toBe("Unable to create RFP HLD design model review.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("/api/projects/[id]/rfp/hld-design-model-review - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/hld-design-model-review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-design-model-review-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, the inspection service, and the OpenAI review service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-design-model-review-inspection",
      "@/lib/projects/project-rfp-hld-design-model-openai-review-service",
    ]);
  });

  it("imports the OpenAI advisory review service", () => {
    expect(source).toContain(
      'from "@/lib/projects/project-rfp-hld-design-model-openai-review-service"'
    );
    expect(source).toContain("createRfpHldDesignModelOpenAiReview");
    expect(source).toContain("getConfiguredRfpHldDesignModelOpenAiReviewExecutor");
  });

  it("does not call the deterministic review service", () => {
    expect(source).not.toContain("project-rfp-hld-design-model-review-deterministic");
    expect(source).not.toContain("createRfpHldDesignModelDeterministicReview");
  });

  it("never reads multipart form data", () => {
    expect(source).not.toContain("formData");
  });

  it("reads no provider SDK, fetch, env/config, raw document parser, or pricing/sku/catalog/config/legacy-AI module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
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
      'from "@/app/(',
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai"',
      "process.env",
      "fetch(",
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
