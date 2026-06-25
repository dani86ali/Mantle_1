import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth, the read-only list inspection service, and the create-draft service so
// the route's auth gate, body-ignoring on GET and POST, tenant/user/param
// authority, and result mapping are tested independent of the DB.
const { mockRequireAuth, mockLoadList, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-diagram-inspection", () => ({
  loadRfpHldDiagramList: mockLoadList,
}));
vi.mock("@/lib/projects/project-rfp-hld-diagram-draft", () => ({
  createRfpHldDiagramDraft: mockCreateDraft,
}));

import { GET, POST } from "@/app/api/projects/[id]/rfp/hld-diagram/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-diagram/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-diagram-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT } };

const RFP_PROJECT = {
  id: PROJECT, name: "STC RFP Bid", customerName: "STC", mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-02T11:30:00.000Z",
};
const WRONG_MODE_PROJECT = { ...RFP_PROJECT, mode: "quick_bom" };

const ARTIFACT_SUMMARY = {
  id: "hld-diagram-1", projectId: PROJECT, stageId: "hld_design_delta_review",
  type: "hld_diagram", status: "needs_review", version: 1,
  sourceFileIds: [], sourceArtifactIds: ["hdm-1", "hsb-1", "hdmr-1"],
  createdAt: "2026-06-20T12:00:00.000Z", updatedAt: "2026-06-20T12:00:00.000Z",
};
const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_diagram_draft", diagramType: "topology", title: "HLD Topology Diagram Draft",
  nodeCount: 2, linkCount: 1, zoneCount: 1, sourceReferenceCount: 3, validationFindingCount: 0,
  sourceHldDesignModelArtifactId: "hdm-1", sourceHldSourceBundleArtifactId: "hsb-1",
  sourceReviewArtifactId: "hdmr-1", sourceModelVersion: 2,
};
const LIST_ITEM = {
  id: ARTIFACT_SUMMARY.id, projectId: PROJECT, stageId: "hld_design_delta_review",
  type: "hld_diagram", status: "needs_review", version: 1,
  createdAt: "2026-06-20T12:00:00.000Z", updatedAt: "2026-06-20T12:00:00.000Z",
  payloadSummary: PAYLOAD_SUMMARY,
};
const LIST_OK = { status: "ok", project: RFP_PROJECT, artifacts: [LIST_ITEM], artifactCount: 1 };
const CREATE_OK = { status: "ok", artifact: ARTIFACT_SUMMARY, payloadSummary: PAYLOAD_SUMMARY };

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

describe("GET /api/projects/[id]/rfp/hld-diagram - auth + authority", () => {
  it("returns the requireAuth response and never calls the service or reads the body", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await GET(request, PARAMS);
    expect(res).toBe(unauth);
    expect(mockLoadList).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("passes only session tenant and the route project id; a decoy body is never read", async () => {
    const request = req({ tenantId: "attacker-tenant", projectId: "attacker-project" });
    const res = await GET(request, PARAMS);
    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("GET /api/projects/[id]/rfp/hld-diagram - result mapping", () => {
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

  it("maps ok to 200 with { project, artifactCount, artifacts } and no status discriminator or tenantId", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ project: RFP_PROJECT, artifactCount: 1, artifacts: [LIST_ITEM] });
    expect("status" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/hld-diagram - auth + authority", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await POST(request, PARAMS);
    expect(res).toBe(unauth);
    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });

  it("passes only session tenant, route project id, session userId, and diagramType topology; decoy body never read", async () => {
    const request = req({
      tenantId: "attacker-tenant", projectId: "attacker-project", createdBy: "attacker-user",
      diagramType: "logical", sku: "ATTACKER-SKU", price: 999,
    });
    const res = await POST(request, PARAMS);
    expect(res.status).toBe(201);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["createdBy", "diagramType", "projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.createdBy).toBe(SESSION.userId);
    expect(arg.diagramType).toBe("topology");
    expect(JSON.stringify(arg)).not.toContain("attacker");
    expect(JSON.stringify(arg)).not.toContain("ATTACKER-SKU");
  });
});

describe("POST /api/projects/[id]/rfp/hld-diagram - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "not_found" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockCreateDraft.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps readiness_blocked to 409 hld_diagram_generation_not_ready with nextAction", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "readiness_blocked", readinessStatus: "blocked", nextAction: "Run a fresh review.",
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_generation_not_ready");
    expect(body.nextAction).toBe("Run a fresh review.");
  });

  it("maps no_topology to 409 hld_diagram_no_topology with blockerCode", async () => {
    mockCreateDraft.mockResolvedValue({ status: "no_topology", code: "no_diagram_topology" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_no_topology");
    expect(body.blockerCode).toBe("no_diagram_topology");
  });

  it("maps precondition_failed to 409 hld_diagram_precondition_failed with blockerCode", async () => {
    mockCreateDraft.mockResolvedValue({ status: "precondition_failed", code: "source_ids_mismatch" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_precondition_failed");
    expect(body.blockerCode).toBe("source_ids_mismatch");
  });

  it("maps invalid_payload to 409 hld_diagram_payload_invalid with errors", async () => {
    mockCreateDraft.mockResolvedValue({ status: "invalid_payload", errors: ["payload: blank title"] });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_payload_invalid");
    expect(body.errors).toEqual(["payload: blank title"]);
  });

  it("maps ok to 201 with { artifact, payloadSummary }, no status discriminator, no tenantId", async () => {
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ artifact: ARTIFACT_SUMMARY, payloadSummary: PAYLOAD_SUMMARY });
    expect("status" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

describe("/api/projects/[id]/rfp/hld-diagram - route surface + purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/app/api/projects/[id]/rfp/hld-diagram/route.ts");
  const TEST_PATH = join(process.cwd(), "tests/api/project-rfp-hld-diagram-route.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("exports GET and POST only", () => {
    expect(typeof routeModule.GET).toBe("function");
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });

  it("imports only Next.js server primitives, requireAuth, and the two diagram services", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-diagram-inspection",
      "@/lib/projects/project-rfp-hld-diagram-draft",
    ]);
  });

  it("never reads the request body or multipart form data", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("touches no store directly and reads no file/pricing/sku/config/catalog/AI/approval modules", () => {
    for (const forbidden of [
      'from "@/lib/db', "createProjectArtifactVersion", "createProjectApproval",
      'from "@/lib/projects/pricing"', 'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution', 'from "@/lib/projects/config-expansion',
      'from "@/lib/export', 'from "@/lib/adapters', 'from "@/lib/ai', 'from "@/lib/llm',
      'from "@/lib/catalog', 'from "@/engines', 'from "@/components',
      "@anthropic-ai", "@google/generative-ai", "pdf-parse", "mammoth",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the route source and this test file ASCII-only", () => {
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
