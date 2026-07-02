import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the read-only detail inspection service so the route's auth gate,
// tenant/param authority, and result mapping are tested independent of the DB.
const { mockRequireAuth, mockLoadDetail } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadDetail: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-diagram-output-inspection", () => ({
  loadRfpHldDiagramOutputDetail: mockLoadDetail,
}));

import { GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram-output/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram-output/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-output-1";
const ARTIFACT = "hld-output-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT } };

const RFP_PROJECT = {
  id: PROJECT, name: "STC RFP Bid", customerName: "STC", mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-02T11:30:00.000Z",
};
const ARTIFACT_SUMMARY = {
  id: ARTIFACT, projectId: PROJECT, stageId: "hld_design_delta_review",
  type: "hld_diagram_output", status: "needs_review", version: 1,
  createdAt: "2026-06-20T12:00:00.000Z", updatedAt: "2026-06-20T12:00:00.000Z",
};
const DIAGRAM_OUTPUT = {
  payloadKind: "rfp_hld_diagram_output", diagramType: "topology", title: "HLD Topology Diagram Output",
  nodes: [], links: [], zones: [],
};
const OK = { status: "ok", project: RFP_PROJECT, artifact: ARTIFACT_SUMMARY, diagramOutput: DIAGRAM_OUTPUT };

function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve({})),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadDetail.mockReset().mockResolvedValue(OK);
});

describe("GET /api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram-output", () => {
  it("returns the requireAuth response and never calls the service or reads the body", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await GET(request, PARAMS);
    expect(res).toBe(unauth);
    expect(mockLoadDetail).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });

  it("passes only session tenant, route project id, and artifact id", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const arg = mockLoadDetail.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["artifactId", "projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT);
  });

  it("maps not_found -> 404, wrong_mode -> 409", async () => {
    mockLoadDetail.mockResolvedValue({ status: "not_found" });
    expect((await GET(req(), PARAMS)).status).toBe(404);
    mockLoadDetail.mockResolvedValue({ status: "wrong_mode", project: { ...RFP_PROJECT, mode: "quick_bom" } });
    expect((await GET(req(), PARAMS)).status).toBe(409);
  });

  it("maps artifact_not_found -> 404 hld_diagram_output_artifact_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "artifact_not_found" });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("hld_diagram_output_artifact_not_found");
  });

  it("maps artifact_not_hld_diagram_output -> 409 with the artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({ status: "artifact_not_hld_diagram_output", artifact: ARTIFACT_SUMMARY });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_hld_diagram_output");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps invalid_payload -> 409 hld_diagram_output_invalid_payload", async () => {
    mockLoadDetail.mockResolvedValue({ status: "invalid_payload", artifact: ARTIFACT_SUMMARY });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("hld_diagram_output_invalid_payload");
  });

  it("maps ok -> 200 with { project, artifact, diagramOutput } and no tenantId", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ project: RFP_PROJECT, artifact: ARTIFACT_SUMMARY, diagramOutput: DIAGRAM_OUTPUT });
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadDetail.mockRejectedValue(new Error(secret));
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

describe("hld-diagram-output detail - route surface + purity (static)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram-output/route.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("exports GET only", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });

  it("imports exactly next/server, requireAuth, and the inspection service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-diagram-output-inspection",
    ]);
  });

  it("touches no store/approval directly and stays ASCII-only", () => {
    for (const forbidden of ['from "@/lib/db', "createProjectApproval", "formData"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
