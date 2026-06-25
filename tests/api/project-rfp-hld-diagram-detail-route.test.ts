import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the read-only inspection detail service so the route's auth gate,
// tenant/param authority, body-ignoring, and result mapping are tested
// independent of the DB and the project/artifact stores.
const { mockRequireAuth, mockLoadDetail } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadDetail: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-diagram-inspection", () => ({
  loadRfpHldDiagramDetail: mockLoadDetail,
}));

import { GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-diagram-1";
const ARTIFACT_ID = "hld-diagram-2";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const RFP_PROJECT = {
  id: PROJECT, name: "STC RFP Bid", customerName: "STC", mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-02T11:30:00.000Z",
};
const WRONG_MODE_PROJECT = { ...RFP_PROJECT, mode: "quick_bom" };

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID, projectId: PROJECT, stageId: "hld_design_delta_review",
  type: "hld_diagram", status: "needs_review", version: 1,
  createdAt: "2026-06-20T12:00:00.000Z", updatedAt: "2026-06-20T12:00:00.000Z",
};
const DIAGRAM = {
  payloadKind: "rfp_hld_diagram_draft", diagramType: "topology", title: "HLD Topology Diagram Draft",
  nodes: [{ id: "n1", label: "Core Switch", nodeType: "switch", sourceRefIds: ["ref-model"] }],
  links: [], zones: [], sourceReferences: [], validationFindings: [],
};
const DETAIL_OK = { status: "ok", project: RFP_PROJECT, artifact: ARTIFACT_SUMMARY, diagram: DIAGRAM };

function req(body: unknown = { decoy: true }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(null)),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadDetail.mockReset().mockResolvedValue(DETAIL_OK);
});

describe("GET .../rfp/artifacts/[artifactId]/hld-diagram - auth + authority", () => {
  it("returns the requireAuth response and never calls the service or reads the body", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await GET(request, PARAMS);
    expect(res).toBe(unauth);
    expect(mockLoadDetail).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("passes only the session tenant and route project/artifact ids; a decoy body is never read", async () => {
    const request = req({ tenantId: "attacker-tenant", artifactId: "attacker-artifact" });
    const res = await GET(request, PARAMS);
    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    const arg = mockLoadDetail.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["artifactId", "projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT_ID);
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("GET .../hld-diagram (detail) - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "not_found" });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "project_not_found", error: "Project not found." });
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadDetail.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps artifact_not_found to 404 hld_diagram_artifact_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "artifact_not_found" });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("hld_diagram_artifact_not_found");
  });

  it("maps artifact_not_hld_diagram to 409 with the lean artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({ status: "artifact_not_hld_diagram", artifact: ARTIFACT_SUMMARY });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_hld_diagram");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps invalid_payload to 409 hld_diagram_invalid_payload with the lean artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({ status: "invalid_payload", artifact: ARTIFACT_SUMMARY });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_invalid_payload");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps ok to 200 with { project, artifact, diagram }, no status discriminator, no tenantId", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ project: RFP_PROJECT, artifact: ARTIFACT_SUMMARY, diagram: DIAGRAM });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadDetail.mockRejectedValue(new Error(secret));
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

describe("GET .../hld-diagram (detail) - route surface + purity (static)", () => {
  const SRC_PATH = join(process.cwd(), "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram/route.ts");
  const TEST_PATH = join(process.cwd(), "tests/api/project-rfp-hld-diagram-detail-route.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("exports GET only", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });

  it("imports only Next.js server primitives, requireAuth, and the read-only inspection service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-diagram-inspection",
    ]);
  });

  it("never reads the request body or multipart form data", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("creates no artifact versions or approvals and reads no file/pricing/config/AI stores", () => {
    for (const forbidden of [
      'from "@/lib/db', "createProjectArtifactVersion", "createProjectApproval",
      'from "@/lib/projects/project-rfp-hld-diagram-draft"',
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
