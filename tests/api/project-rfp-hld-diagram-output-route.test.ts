import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth, the read-only list inspection service, and the generation service so the
// route's auth gate, strict empty-body parse on POST, tenant/user/param authority, and
// result mapping are tested independent of the DB.
const { mockRequireAuth, mockLoadList, mockCreate } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-diagram-output-inspection", () => ({
  loadRfpHldDiagramOutputList: mockLoadList,
}));
vi.mock("@/lib/projects/project-rfp-hld-diagram-output-generation", () => ({
  createRfpHldDiagramOutputDraft: mockCreate,
}));

import { GET, POST } from "@/app/api/projects/[id]/rfp/hld-diagram-output/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-diagram-output/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-output-1";
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
  id: "hld-output-1", projectId: PROJECT, stageId: "hld_design_delta_review",
  type: "hld_diagram_output", status: "needs_review", version: 1,
  sourceFileIds: [], sourceArtifactIds: ["hld-diagram-1"],
  createdAt: "2026-06-20T12:00:00.000Z", updatedAt: "2026-06-20T12:00:00.000Z",
};
const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_diagram_output", outputFormat: "drawio_compatible_v1", diagramType: "topology",
  title: "HLD Topology Diagram Output", nodeCount: 2, linkCount: 1, zoneCount: 1,
  validationFindingCount: 0, sourceArtifactIds: ["hld-diagram-1"],
  sourceHldDiagramArtifactId: "hld-diagram-1", sourceDiagramVersion: 1, canvasWidth: 840, canvasHeight: 220,
};
const LIST_ITEM = {
  id: ARTIFACT_SUMMARY.id, projectId: PROJECT, stageId: "hld_design_delta_review",
  type: "hld_diagram_output", status: "needs_review", version: 1,
  createdAt: "2026-06-20T12:00:00.000Z", updatedAt: "2026-06-20T12:00:00.000Z",
  payloadSummary: PAYLOAD_SUMMARY,
};
const LIST_OK = { status: "ok", project: RFP_PROJECT, artifacts: [LIST_ITEM], artifactCount: 1 };
const CREATE_OK = { status: "ok", artifact: ARTIFACT_SUMMARY, payloadSummary: PAYLOAD_SUMMARY };

function req(text = ""): NextRequest {
  return {
    headers: { get: () => null },
    text: vi.fn(() => Promise.resolve(text)),
    json: vi.fn(() => Promise.resolve({})),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
  mockCreate.mockReset().mockResolvedValue(CREATE_OK);
});

describe("GET /api/projects/[id]/rfp/hld-diagram-output", () => {
  it("returns the requireAuth response and never calls the service", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const res = await GET(req(), PARAMS);
    expect(res).toBe(unauth);
    expect(mockLoadList).not.toHaveBeenCalled();
  });

  it("passes only session tenant and route project id", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
  });

  it("maps not_found and wrong_mode", async () => {
    mockLoadList.mockResolvedValue({ status: "not_found" });
    expect((await GET(req(), PARAMS)).status).toBe(404);
    mockLoadList.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    expect((await GET(req(), PARAMS)).status).toBe(409);
  });

  it("maps ok to 200 with { project, artifactCount, artifacts } and no tenantId", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ project: RFP_PROJECT, artifactCount: 1, artifacts: [LIST_ITEM] });
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/hld-diagram-output - body parsing", () => {
  it("accepts an empty body, whitespace, and {} and passes only tenant/project/createdBy", async () => {
    for (const text of ["", "   ", "{}"]) {
      mockCreate.mockClear();
      const res = await POST(req(text), PARAMS);
      expect(res.status).toBe(201);
      const arg = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(arg).sort()).toEqual(["createdBy", "projectId", "tenantId"]);
      expect(arg.tenantId).toBe(SESSION.tenantId);
      expect(arg.projectId).toBe(PROJECT);
      expect(arg.createdBy).toBe(SESSION.userId);
    }
  });

  it("rejects any non-empty body with 400 and never calls the service", async () => {
    for (const text of ['{"sku":"X"}', '{"sourceArtifactIds":["a"]}', "not json", "[]", "123", "null"]) {
      mockCreate.mockClear();
      const res = await POST(req(text), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_rfp_hld_diagram_output_request");
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });
});

describe("POST /api/projects/[id]/rfp/hld-diagram-output - result mapping", () => {
  it("maps not_found and wrong_mode", async () => {
    mockCreate.mockResolvedValue({ status: "not_found" });
    expect((await POST(req(), PARAMS)).status).toBe(404);
    mockCreate.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    expect((await POST(req(), PARAMS)).status).toBe(409);
  });

  it("maps final_hld_already_approved to 409 with sanitized finalAuthority", async () => {
    const finalAuthority = { artifact: { id: "hdoc-1" }, finalAuthorityStatus: "approved_manual_drawio_upload" };
    mockCreate.mockResolvedValue({ status: "final_hld_already_approved", finalAuthority });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("hld_diagram_output_final_authority_exists");
  });

  it("maps readiness_blocked to 409 with nextAction", async () => {
    mockCreate.mockResolvedValue({ status: "readiness_blocked", readinessStatus: "blocked", nextAction: "Run a fresh review." });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_output_not_ready");
    expect(body.nextAction).toBe("Run a fresh review.");
  });

  it("maps precondition_failed to 409 with blockerCode", async () => {
    mockCreate.mockResolvedValue({ status: "precondition_failed", code: "approved_diagram_unavailable" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_output_precondition_failed");
    expect(body.blockerCode).toBe("approved_diagram_unavailable");
  });

  it("maps invalid_payload to 409 with errors", async () => {
    mockCreate.mockResolvedValue({ status: "invalid_payload", errors: ["payload: blank title"] });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_output_payload_invalid");
    expect(body.errors).toEqual(["payload: blank title"]);
  });

  it("maps ok to 201 with { artifact, payloadSummary } and no tenantId", async () => {
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ artifact: ARTIFACT_SUMMARY, payloadSummary: PAYLOAD_SUMMARY });
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreate.mockRejectedValue(new Error(secret));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

describe("/api/projects/[id]/rfp/hld-diagram-output - route surface + purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/app/api/projects/[id]/rfp/hld-diagram-output/route.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("exports GET and POST only", () => {
    expect(typeof routeModule.GET).toBe("function");
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });

  it("imports only Next.js server primitives, requireAuth, and the two output services", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-diagram-output-inspection",
      "@/lib/projects/project-rfp-hld-diagram-output-generation",
    ]);
  });

  it("touches no store or approval directly and stays ASCII-only", () => {
    for (const forbidden of ['from "@/lib/db', "createProjectArtifactVersion", "createProjectApproval"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
