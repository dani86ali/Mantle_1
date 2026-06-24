import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth, the read-only list inspection service, and the create-draft service
// so the route's auth gate, body-ignoring on both GET and POST, tenant/user/param
// authority, and result mapping are tested independent of the DB.
const { mockRequireAuth, mockLoadList, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-source-bundle-inspection", () => ({
  loadRfpHldSourceBundleList: mockLoadList,
}));
vi.mock("@/lib/projects/project-rfp-hld-source-bundle-assembler", () => ({
  createRfpHldSourceBundleDraft: mockCreateDraft,
}));

import { GET, POST } from "@/app/api/projects/[id]/rfp/hld-source-bundle/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-source-bundle/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-bundle-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
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
  id: "art-bundle-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_source_bundle",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: ["evp-1", "req-1", "hrs-1"],
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_source_bundle",
  createdBy: SESSION.userId,
  createdAt: "2026-06-20T12:00:00.000Z",
  sourceArtifactCount: 7,
  coveredDomainCount: 1,
  excludedDomainCount: 1,
  designKnowledgePackCount: 1,
  assumptionCount: 1,
  warningCount: 0,
  blockerCount: 0,
};

const READINESS_READY = {
  status: "ready",
  summary: {
    compiledFromReadinessSnapshotArtifactId: "hrs-1",
    sourceArtifactCount: 7,
    designKnowledgePackCount: 1,
    coveredDomainCount: 1,
    missingDomainCount: 0,
    excludedDomainCount: 1,
    assumptionCount: 1,
    constraintCount: 1,
    warningCount: 0,
    blockerCount: 0,
  },
};

const LIST_ITEM = {
  id: ARTIFACT_SUMMARY.id,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_source_bundle",
  status: "needs_review",
  version: 1,
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
  payloadSummary: {
    payloadKind: "rfp_hld_source_bundle",
    createdBy: SESSION.userId,
    createdAt: "2026-06-20T12:00:00.000Z",
    sourceArtifactCount: 7,
    designKnowledgePackCount: 1,
    coveredDomainCount: 1,
    missingDomainCount: 0,
    excludedDomainCount: 1,
    assumptionCount: 1,
    constraintCount: 1,
    warningCount: 0,
    blockerCount: 0,
  },
};

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifacts: [LIST_ITEM],
  artifactCount: 1,
  sourceBundleReadiness: READINESS_READY,
};

const CREATE_OK = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: PAYLOAD_SUMMARY,
};

function req(body: unknown = {}): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
  mockCreateDraft.mockReset().mockResolvedValue(CREATE_OK);
});

describe("GET /api/projects/[id]/rfp/hld-source-bundle - auth", () => {
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

describe("GET /api/projects/[id]/rfp/hld-source-bundle - authority", () => {
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

describe("GET /api/projects/[id]/rfp/hld-source-bundle - result mapping", () => {
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

  it("maps ok to 200 with { project, artifactCount, artifacts, sourceBundleReadiness } and no status discriminator", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifactCount: 1,
      artifacts: [LIST_ITEM],
      sourceBundleReadiness: READINESS_READY,
    });
    expect("status" in body).toBe(false);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_source_bundle_inspection_failed");
    expect(body.error).toBe("Unable to inspect HLD source bundles.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/hld-source-bundle - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/rfp/hld-source-bundle - authority", () => {
  it("passes only session tenant, route project id, and session userId; decoy fields never reach the service and request.json is never called", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      createdBy: "attacker-user",
      createdAt: "2000-01-01T00:00:00.000Z",
      status: "approved",
      id: "attacker-artifact",
      payload: { hack: true },
      price: 999,
      sku: "ATTACKER-SKU",
      sourceArtifactIds: ["fake-art"],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["createdBy", "projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.createdBy).toBe(SESSION.userId);
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.createdBy).not.toBe("attacker-user");
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("POST /api/projects/[id]/rfp/hld-source-bundle - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
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

  it("maps blocked to 409 hld_source_bundle_blocked with blockerCode and messages", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "blocked",
      code: "stale_readiness_snapshot",
      messages: ["The approved readiness snapshot is stale."],
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_source_bundle_blocked");
    expect(body.blockerCode).toBe("stale_readiness_snapshot");
    expect(body.messages).toEqual(["The approved readiness snapshot is stale."]);
  });

  it("maps invalid_payload to 409 hld_source_bundle_invalid_payload with errors", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "invalid_payload",
      errors: ["payload: wrong payloadKind"],
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_source_bundle_invalid_payload");
    expect(body.errors).toEqual(["payload: wrong payloadKind"]);
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

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_source_bundle_failed");
    expect(body.error).toBe("Unable to compile RFP HLD source bundle draft.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("/api/projects/[id]/rfp/hld-source-bundle - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/hld-source-bundle/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-source-bundle-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the source-bundle services", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-source-bundle-inspection",
      "@/lib/projects/project-rfp-hld-source-bundle-assembler",
    ]);
  });

  it("never reads the request body or multipart form data", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("touches no store directly and reads no file/evidence/pricing/sku/config/catalog/AI modules", () => {
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
