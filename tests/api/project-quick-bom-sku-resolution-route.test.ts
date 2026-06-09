import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the SKU-resolution wrapper service so the route's auth-gate,
// tenant/param authority, body-ignoring, and result-mapping are tested
// independent of the DB and the lower-level service.
const { mockRequireAuth, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-quick-bom-sku-resolution", () => ({
  createProjectQuickBomSkuResolutionDraft: mockCreateDraft,
}));

import { POST } from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/route";
import * as routeModule from "@/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-1";
const ARTIFACT_ID = "art-nb-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const ARTIFACT_SUMMARY = {
  id: "art-skur-1",
  projectId: PROJECT,
  stageId: "sku_resolution",
  type: "sku_resolution",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: [ARTIFACT_ID],
  createdAt: "2026-05-21T09:00:00.000Z",
  updatedAt: "2026-05-21T09:30:00.000Z",
};

const PAYLOAD_SUMMARY = {
  sourceNormalizedBoqArtifactId: ARTIFACT_ID,
  sourceNormalizedBoqArtifactVersion: 3,
  sourceFileIds: ["file-1"],
  lineCount: 2,
  summary: {
    totalLines: 2,
    needsReviewCount: 1,
    unresolvedCount: 1,
    acceptedCount: 0,
    rejectedCount: 0,
    exactSuggestionCount: 1,
    normalizedSuggestionCount: 0,
    ambiguousCount: 0,
    zeroPriceSuggestionCount: 0,
    catalogSource: "local_stc_historical_mock",
  },
};

const SOURCE_ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "boq_format_validation",
  type: "normalized_boq",
  status: "stale",
  version: 3,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: [],
  createdAt: "2026-05-21T08:00:00.000Z",
  updatedAt: "2026-05-21T08:30:00.000Z",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "RFP Bid",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

// req() simulates a non-JSON request (no content-type header); json spy is
// seeded with decoy tenant/project/artifact fields so tests can prove they
// are never read when no JSON content-type is present.
function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        normalizedBoqArtifactId: "attacker-artifact",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

// jsonReq() simulates a JSON request with the given body.
function jsonReq(body: unknown): NextRequest {
  return {
    headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

function mixedCaseJsonReq(body: unknown): NextRequest {
  return {
    headers: { get: (h: string) => (h === "content-type" ? "Application/JSON; charset=utf-8" : null) },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

// badJsonReq() simulates a JSON request where parsing fails.
function badJsonReq(): NextRequest {
  return {
    headers: { get: (h: string) => (h === "content-type" ? "application/json" : null) },
    json: vi.fn(() => Promise.reject(new SyntaxError("Unexpected token"))),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreateDraft.mockReset().mockResolvedValue({
    status: "ok",
    artifact: ARTIFACT_SUMMARY,
    payloadSummary: PAYLOAD_SUMMARY,
  });
});

describe("POST .../quick-bom/artifacts/[artifactId]/sku-resolution - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const res = await POST(req(), PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });
});

describe("POST .../quick-bom/artifacts/[artifactId]/sku-resolution - tenant/param authority", () => {
  it("uses session.tenantId plus route params only and never reads json when no JSON content-type", async () => {
    const request = req();

    await POST(request, PARAMS);

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockCreateDraft).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      normalizedBoqArtifactId: ARTIFACT_ID,
    });

    const arg = mockCreateDraft.mock.calls[0][0];
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.normalizedBoqArtifactId).not.toBe("attacker-artifact");

    // No JSON content-type: json() is never called.
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("JSON body with decoy tenant/project/artifact fields does not override route authority", async () => {
    const request = jsonReq({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      normalizedBoqArtifactId: "attacker-artifact",
    });

    await POST(request, PARAMS);

    const arg = mockCreateDraft.mock.calls[0][0];
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.normalizedBoqArtifactId).toBe(ARTIFACT_ID);
  });
});

describe("POST .../quick-bom/artifacts/[artifactId]/sku-resolution - catalog profile removed", () => {
  it("empty JSON body is accepted and creates SKU resolution with no catalog profile", async () => {
    await POST(jsonReq({}), PARAMS);

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    const arg = mockCreateDraft.mock.calls[0][0];
    expect(arg).toEqual({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
      normalizedBoqArtifactId: ARTIFACT_ID,
    });
    expect("catalogProfile" in arg).toBe(false);
  });

  it("JSON body { catalogProfile: 'default' } fails closed with 400 catalog_profile_not_supported", async () => {
    const res = await POST(jsonReq({ catalogProfile: "default" }), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("catalog_profile_not_supported");
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("JSON body { catalogProfile: 'honeywell_mvp_demo' } fails closed with 400 catalog_profile_not_supported", async () => {
    const res = await POST(jsonReq({ catalogProfile: "honeywell_mvp_demo" }), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("catalog_profile_not_supported");
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("rejects catalogProfile case-insensitively on the JSON content-type", async () => {
    const res = await POST(mixedCaseJsonReq({ catalogProfile: "honeywell_mvp_demo" }), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("catalog_profile_not_supported");
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("invalid JSON returns 400 invalid_request_body and skips the service", async () => {
    const res = await POST(badJsonReq(), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_request_body");
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });
});

describe("POST .../quick-bom/artifacts/[artifactId]/sku-resolution - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode and includes the project summary", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps normalized_boq_not_found to 404 normalized_boq_artifact_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "normalized_boq_not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("normalized_boq_artifact_not_found");
  });

  it("maps artifact_not_normalized_boq to 409 with the artifact when the service supplies one", async () => {
    const artifact = { ...SOURCE_ARTIFACT_SUMMARY, type: "priced_boq" };
    mockCreateDraft.mockResolvedValue({
      status: "artifact_not_normalized_boq",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_normalized_boq");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps artifact_not_normalized_boq without an artifact to 409 and omits artifact", async () => {
    mockCreateDraft.mockResolvedValue({ status: "artifact_not_normalized_boq" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_normalized_boq");
    expect("artifact" in body).toBe(false);
  });

  it("maps normalized_boq_not_ready to 409 normalized_boq_artifact_not_ready with the source artifact", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "normalized_boq_not_ready",
      artifact: SOURCE_ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("normalized_boq_artifact_not_ready");
    expect(body.artifact).toEqual(SOURCE_ARTIFACT_SUMMARY);
  });

  it("maps invalid_normalized_boq_payload to 409 invalid_normalized_boq_payload", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "invalid_normalized_boq_payload",
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invalid_normalized_boq_payload");
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
});

describe("POST .../quick-bom/artifacts/[artifactId]/sku-resolution - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("quick_bom_sku_resolution_failed");
    expect(body.error).toBe("Unable to create Quick BoM SKU resolution draft.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../quick-bom/artifacts/[artifactId]/sku-resolution - route surface", () => {
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
    "src/app/api/projects/[id]/quick-bom/artifacts/[artifactId]/sku-resolution/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-quick-bom-sku-resolution-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the SKU-resolution wrapper service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-quick-bom-sku-resolution",
    ]);
  });

  it("does not import DB, stores, raw BoQ loader/parser, artifact/approval/evidence stores, the lower-level SKU/catalog helpers, pricing, config expansion, mantle/export, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/sku-resolution"',
      'from "@/lib/projects/sku-resolution-artifact"',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
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
