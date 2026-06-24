import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the rebuild execution service so the route's auth gate, body
// minimization, tenant/user/param authority, and result mapping are tested
// without a DB or any drafting implementation. The route reads no request body,
// so the request's json/formData are spies asserted never to be called.
const { mockRequireAuth, mockExecute } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-design-model-rebuild-executor", () => ({
  executeRfpHldDesignModelRebuild: mockExecute,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model-rebuild-request/execute/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model-rebuild-request/execute/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-7";
const ARTIFACT_ID = "art-rebuild-request-9";
const SESSION = {
  userId: "u-engineer",
  tenantId: "44444444-4444-4444-4444-444444444444",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

// The rebuild-request artifact summary returned by the artifact-shape and
// not-active gates (no tenant id - lean summary).
const REQUEST_ARTIFACT = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_design_model_rebuild_request",
  status: "stale",
  version: 2,
  sourceFileIds: [],
  sourceArtifactIds: ["model-7", "review-7"],
  createdAt: "2026-06-24T12:00:00.000Z",
  updatedAt: "2026-06-24T12:05:00.000Z",
};

// ok summaries. artifact (the new candidate model) and consumedRequest (the
// retired request) are deliberately distinct so a field swap is caught.
const NEW_MODEL_ARTIFACT = {
  id: "art-hld-model-12",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_design_model",
  status: "needs_review",
  version: 4,
  sourceFileIds: [],
  sourceArtifactIds: ["bundle-3"],
  createdAt: "2026-06-24T12:10:00.000Z",
  updatedAt: "2026-06-24T12:10:00.000Z",
};

const CONSUMED_REQUEST = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_design_model_rebuild_request",
  status: "stale",
  version: 2,
  sourceFileIds: [],
  sourceArtifactIds: ["model-7", "review-7"],
  createdAt: "2026-06-24T12:00:00.000Z",
  updatedAt: "2026-06-24T12:10:00.000Z",
};

const SOURCE_BUNDLE = {
  artifactId: "bundle-3",
  version: 3,
  status: "approved",
  sourceArtifactIds: ["src-a", "src-b"],
  coveredDomains: ["campus_lan", "wan_edge"],
  excludedDomains: ["voice"],
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_design_model",
  createdBy: SESSION.userId,
  createdAt: "2026-06-24T12:10:00.000Z",
  sourceHldSourceBundleArtifactId: "bundle-3",
  sourceBundleVersion: 3,
  sourceArtifactCount: 2,
  coveredDomainCount: 2,
  excludedDomainCount: 1,
  sourceReferenceCount: 5,
  designSectionCount: 7,
  topologyNodeCount: 9,
  topologyLinkCount: 11,
  topologyZoneCount: 3,
  diagramIntentCount: 4,
  validationFindingCount: 0,
};

const EXECUTION_OK = {
  status: "ok",
  artifact: NEW_MODEL_ARTIFACT,
  consumedRequest: CONSUMED_REQUEST,
  sourceBundle: SOURCE_BUNDLE,
  payloadSummary: PAYLOAD_SUMMARY,
};

// Every non-ok service status with the exact code/HTTP/body the route must emit:
// [label, service result, expected HTTP status, expected response body].
const BLOCKED_CASES: Array<
  [string, Record<string, unknown>, number, Record<string, unknown>]
> = [
  [
    "not_found",
    { status: "not_found" },
    404,
    { code: "project_not_found", error: "Project not found." },
  ],
  [
    "wrong_mode",
    { status: "wrong_mode", project: WRONG_MODE_PROJECT },
    409,
    {
      code: "wrong_project_mode",
      error: "Project is not an RFP project.",
      project: WRONG_MODE_PROJECT,
    },
  ],
  [
    "request_not_found",
    { status: "request_not_found" },
    404,
    {
      code: "hld_design_model_rebuild_request_not_found",
      error: "HLD design model rebuild request artifact not found.",
    },
  ],
  [
    "artifact_not_rebuild_request",
    { status: "artifact_not_rebuild_request", artifact: REQUEST_ARTIFACT },
    409,
    {
      code: "artifact_not_hld_design_model_rebuild_request",
      error: "Artifact is not an HLD design model rebuild request.",
      artifact: REQUEST_ARTIFACT,
    },
  ],
  [
    "request_not_active",
    { status: "request_not_active", artifact: REQUEST_ARTIFACT },
    409,
    {
      code: "hld_design_model_rebuild_request_not_active",
      error: "HLD design model rebuild request is not active.",
      artifact: REQUEST_ARTIFACT,
    },
  ],
  [
    "request_payload_invalid",
    {
      status: "request_payload_invalid",
      errors: ["instructions: authorizes new scope"],
    },
    409,
    {
      code: "hld_design_model_rebuild_request_payload_invalid",
      error: "HLD design model rebuild request payload is invalid.",
      errors: ["instructions: authorizes new scope"],
    },
  ],
  [
    "source_model_unavailable",
    { status: "source_model_unavailable" },
    409,
    {
      code: "hld_design_model_rebuild_source_model_unavailable",
      error: "The source HLD design model is unavailable or no longer reviewable.",
    },
  ],
  [
    "source_review_unavailable",
    { status: "source_review_unavailable" },
    409,
    {
      code: "hld_design_model_rebuild_source_review_unavailable",
      error: "The source HLD design model review is unavailable.",
    },
  ],
  [
    "source_review_does_not_justify_rebuild",
    { status: "source_review_does_not_justify_rebuild" },
    409,
    {
      code: "hld_design_model_rebuild_not_justified",
      error: "The advisory review does not justify a rebuild.",
    },
  ],
  [
    "stale_source_bundle",
    { status: "stale_source_bundle" },
    409,
    {
      code: "hld_design_model_rebuild_source_bundle_stale",
      error:
        "The approved HLD source bundle has changed; the rebuild basis is stale.",
    },
  ],
  [
    "invalid_source_bundle_payload",
    {
      status: "invalid_source_bundle_payload",
      errors: ["payload.kind invalid"],
    },
    409,
    {
      code: "hld_design_model_rebuild_source_bundle_invalid",
      error: "The approved HLD source bundle payload is invalid.",
      errors: ["payload.kind invalid"],
    },
  ],
  [
    "candidate_input_blocked",
    { status: "candidate_input_blocked", reason: "invalid_model_payload" },
    409,
    {
      code: "hld_design_model_rebuild_candidate_input_blocked",
      error: "The deterministic rebuild candidate input could not be built.",
      reason: "invalid_model_payload",
    },
  ],
  [
    "drafting_unavailable",
    { status: "drafting_unavailable" },
    503,
    {
      code: "hld_design_model_rebuild_drafting_unavailable",
      error:
        "No HLD design model drafting executor is configured; rebuild is unavailable.",
    },
  ],
  [
    "request_retire_failed (stale)",
    { status: "request_retire_failed", intendedStatus: "stale" },
    409,
    {
      code: "hld_design_model_rebuild_request_retire_failed",
      error: "The rebuild request could not be claimed or retired.",
      intendedStatus: "stale",
    },
  ],
  [
    "request_retire_failed (failed)",
    { status: "request_retire_failed", intendedStatus: "failed" },
    409,
    {
      code: "hld_design_model_rebuild_request_retire_failed",
      error: "The rebuild request could not be claimed or retired.",
      intendedStatus: "failed",
    },
  ],
  [
    "drafting_failed",
    { status: "drafting_failed", error: "hld_design_model_rebuild_drafting_failed" },
    502,
    {
      code: "hld_design_model_rebuild_drafting_failed",
      error: "HLD design model rebuild drafting failed.",
    },
  ],
  [
    "invalid_draft_payload",
    { status: "invalid_draft_payload", errors: ["topology.nodes[0] unknown"] },
    409,
    {
      code: "hld_design_model_rebuild_invalid_draft_payload",
      error: "The rebuilt HLD design model draft failed deterministic validation.",
      errors: ["topology.nodes[0] unknown"],
    },
  ],
];

function req(body: unknown = {}): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockExecute.mockReset().mockResolvedValue(EXECUTION_OK);
});

describe("POST .../hld-design-model-rebuild-request/execute - auth", () => {
  it("returns the requireAuth response and never reads the body or calls the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("POST .../hld-design-model-rebuild-request/execute - body minimization + authority", () => {
  it("ignores the body entirely and calls the service with only session tenant/user and params project/artifact", async () => {
    // A body packed with authority/model/review/pricing/catalog/config decoys
    // plus an executor decoy. None may be read or reach the service.
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      rebuildRequestArtifactId: "attacker-request",
      executedBy: "attacker-user",
      requestedBy: "attacker-user",
      userId: "attacker-user",
      status: "approved",
      payload: { hack: true },
      sourceHldDesignModelArtifactId: "attacker-model",
      sourceReviewArtifactId: "attacker-review",
      model: { sku: "ATTACKER-SKU" },
      review: { recommendation: "approve" },
      sku: "ATTACKER-SKU",
      price: 999999,
      pricing: { currency: "USD" },
      catalog: "attacker-catalog",
      configuration: { expand: true },
      executor: "ATTACKER-EXECUTOR",
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledTimes(1);

    const arg = mockExecute.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "executedBy",
      "projectId",
      "rebuildRequestArtifactId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.rebuildRequestArtifactId).toBe(ARTIFACT_ID);
    expect(arg.executedBy).toBe(SESSION.userId);
    // No body field crosses the seam: the route accepts no executor and no
    // caller-supplied createdAt, and no decoy value appears.
    expect("executor" in arg).toBe(false);
    expect("createdAt" in arg).toBe(false);
    expect(JSON.stringify(arg)).not.toContain("attacker");
    expect(JSON.stringify(arg)).not.toContain("ATTACKER");
  });
});

describe("POST .../hld-design-model-rebuild-request/execute - status mapping", () => {
  it.each(BLOCKED_CASES)(
    "maps the %s service result to its stable code and HTTP status",
    async (_label, result, expectedStatus, expectedBody) => {
      mockExecute.mockResolvedValue(result);

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(expectedStatus);
      expect(await res.json()).toEqual(expectedBody);
    }
  );

  it("maps ok to 201 with lean summaries only, no status discriminator, and no tenant id", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: NEW_MODEL_ARTIFACT,
      consumedRequest: CONSUMED_REQUEST,
      sourceBundle: SOURCE_BUNDLE,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
  });
});

describe("POST .../hld-design-model-rebuild-request/execute - leak safety", () => {
  it("maps drafting_failed to 502 and never surfaces the swallowed executor/provider detail", async () => {
    const secret = "provider-stack-trace-and-prompt-xyz";
    mockExecute.mockResolvedValue({
      status: "drafting_failed",
      error: secret,
      providerResponse: { prompt: secret, apiKey: "sk-secret" },
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      code: "hld_design_model_rebuild_drafting_failed",
      error: "HLD design model rebuild drafting failed.",
    });
    const json = JSON.stringify(body);
    expect(json).not.toContain(secret);
    expect(json).not.toContain("sk-secret");
    expect(json).not.toContain("providerResponse");
  });

  it("maps invalid_draft_payload to 409 with deterministic errors only and no raw draft JSON", async () => {
    const errors = [
      "topology.nodes[0] references unknown zone",
      "designSections[2] cites a non-source artifact",
    ];
    mockExecute.mockResolvedValue({
      status: "invalid_draft_payload",
      errors,
      draft: {
        payload: {
          secretSku: "ATTACKER-SKU-9300",
          price: 123456,
          raw: "untrusted-draft-body",
        },
      },
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      code: "hld_design_model_rebuild_invalid_draft_payload",
      error: "The rebuilt HLD design model draft failed deterministic validation.",
      errors,
    });
    const json = JSON.stringify(body);
    expect(json).not.toContain("ATTACKER-SKU-9300");
    expect(json).not.toContain("secretSku");
    expect(json).not.toContain("untrusted-draft-body");
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockExecute.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "hld_design_model_rebuild_execution_failed",
      error: "Unable to execute HLD design model rebuild.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe(".../hld-design-model-rebuild-request/execute - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-design-model-rebuild-request/execute/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-design-model-rebuild-execute-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the rebuild execution service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-design-model-rebuild-executor",
    ]);
  });

  it("reads no request body (neither json nor formData)", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("touches no DB/store and imports no provider/AI/catalog/pricing/legacy/raw-parser module", () => {
    // require( / fetch( use the open paren so requireAuth and request stay clear;
    // the drafting executor and readiness/candidate/review modules use a closing
    // quote so the legitimately imported -rebuild-executor service still passes.
    for (const forbidden of [
      "process.env",
      "fetch(",
      "require(",
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "retireProjectArtifactVersion",
      "getProjectArtifactById",
      "listProjectArtifacts",
      "getProjectById",
      'from "@/lib/projects/project-rfp-hld-design-model-drafting-executor"',
      'from "@/lib/projects/project-rfp-hld-design-model-readiness"',
      'from "@/lib/projects/project-rfp-hld-design-model-candidate-input"',
      'from "@/lib/projects/project-rfp-hld-design-model-rebuild-candidate-input"',
      'from "@/lib/projects/project-rfp-hld-design-model-review"',
      'from "@/lib/projects/approvals"',
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
      'from "@/app/',
      'from "react"',
      "pdf-parse",
      "mammoth",
      'from "xlsx"',
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
