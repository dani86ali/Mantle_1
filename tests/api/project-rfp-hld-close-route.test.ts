import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the close-status service so the route's auth gate, tenant/param
// authority, body/query-ignoring, and result mapping are tested independent of the DB,
// the selector, and the real filesystem.
const { mockRequireAuth, mockCloseStatus } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCloseStatus: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-close-status", () => ({
  getRfpHldCloseStatus: mockCloseStatus,
}));

import { GET } from "@/app/api/projects/[id]/rfp/hld-close/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-close/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-hld-1";
const SESSION = {
  userId: "u-se",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "se@bomatic.ai",
  name: "SE",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT } };

const ARTIFACT_SUMMARY = {
  id: "art-doc-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_document",
  status: "approved",
  version: 4,
  sourceFileIds: [],
  sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdocm-1"],
  createdAt: "2026-06-30T12:00:00.000Z",
  updatedAt: "2026-06-30T18:45:00.000Z",
};

const FINAL_AUTHORITY = {
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: { title: "Final HLD", uploadedFileName: "acme.drawio" },
  finalAuthorityStatus: "approved_manual_drawio_upload",
};

const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "Acme RFP",
  mode: "rfp",
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Acme Quick BoM",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const CLOSED_RESULT = {
  status: "closed",
  project: PROJECT_SUMMARY,
  closeStatus: "hld_closed_on_final_authority",
  closeKind: "approved_manual_drawio_upload_final",
  closedAt: ARTIFACT_SUMMARY.updatedAt,
  finalAuthority: FINAL_AUTHORITY,
};

// The route ignores the body and the query string; the mock seeds json/formData/text/
// arrayBuffer spies with decoy authority so a test can prove none is read.
function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() =>
      Promise.resolve({
        tenantId: "attacker-tenant",
        projectId: "attacker-project",
        artifactId: "attacker-artifact",
        status: "closed",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
    text: vi.fn(() => Promise.resolve("tenantId=attacker-tenant")),
    arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCloseStatus.mockReset().mockResolvedValue(CLOSED_RESULT);
});

describe("GET hld-close - auth", () => {
  it("returns the requireAuth response and skips the service and body reads when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await GET(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCloseStatus).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
    expect(request.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("GET hld-close - tenant/param authority", () => {
  it("uses session.tenantId + route project id only and never reads the body/query", async () => {
    const request = req();

    await GET(request, PARAMS);

    expect(mockCloseStatus).toHaveBeenCalledTimes(1);
    expect(mockCloseStatus).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
    });

    const arg = mockCloseStatus.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect("artifactId" in arg).toBe(false);
    expect("status" in arg).toBe(false);

    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
    expect(request.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("GET hld-close - closed", () => {
  it("maps closed -> 200 with project, closeStatus, closeKind, closedAt, and finalAuthority", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project).toEqual(PROJECT_SUMMARY);
    expect(body.closeStatus).toBe("hld_closed_on_final_authority");
    expect(body.closeKind).toBe("approved_manual_drawio_upload_final");
    expect(body.closedAt).toBe(ARTIFACT_SUMMARY.updatedAt);
    expect(body.finalAuthority).toEqual(FINAL_AUTHORITY);
  });
});

describe("GET hld-close - result mapping", () => {
  it("maps not_found -> 404 project_not_found", async () => {
    mockCloseStatus.mockResolvedValue({ status: "not_found" });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("project_not_found");
    expect("status" in body).toBe(false);
  });

  it("maps wrong_mode -> 409 wrong_project_mode with the project summary", async () => {
    mockCloseStatus.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps blocked/not_closed -> 409 hld_not_closed with blockerCode and any pending latestArtifact", async () => {
    mockCloseStatus.mockResolvedValueOnce({
      status: "blocked",
      blocker: "not_closed",
      project: PROJECT_SUMMARY,
      blockerCode: "no_final_hld_document",
    });
    const none = await GET(req(), PARAMS);
    expect(none.status).toBe(409);
    const noneJson = await none.json();
    expect(noneJson.code).toBe("hld_not_closed");
    expect(noneJson.blockerCode).toBe("no_final_hld_document");
    expect("latestArtifact" in noneJson).toBe(false);

    mockCloseStatus.mockResolvedValueOnce({
      status: "blocked",
      blocker: "not_closed",
      project: PROJECT_SUMMARY,
      blockerCode: "manual_upload_pending_review",
      latestArtifact: ARTIFACT_SUMMARY,
    });
    const pending = await GET(req(), PARAMS);
    expect(pending.status).toBe(409);
    const pendingJson = await pending.json();
    expect(pendingJson.blockerCode).toBe("manual_upload_pending_review");
    expect(pendingJson.latestArtifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps blocked/stale_final_authority -> 409 hld_close_final_authority_stale with staleCode/blockerCode + artifact", async () => {
    mockCloseStatus.mockResolvedValue({
      status: "blocked",
      blocker: "stale_final_authority",
      project: PROJECT_SUMMARY,
      blockerCode: "source_diagram_unavailable",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("hld_close_final_authority_stale");
    expect(json.staleCode).toBe("source_diagram_unavailable");
    expect(json.blockerCode).toBe("source_diagram_unavailable");
    expect(json.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("no response body carries drawioXml or a payload", async () => {
    for (const result of [
      CLOSED_RESULT,
      {
        status: "blocked",
        blocker: "stale_final_authority",
        project: PROJECT_SUMMARY,
        blockerCode: "source_diagram_unavailable",
        artifact: ARTIFACT_SUMMARY,
      },
    ]) {
      mockCloseStatus.mockResolvedValue(result);
      const res = await GET(req(), PARAMS);
      const raw = JSON.stringify(await res.json());
      expect(raw).not.toContain("drawioXml");
      expect(raw).not.toContain("\"payload\"");
    }
  });
});

describe("GET hld-close - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCloseStatus.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_close_status_failed");
    expect(body.error).toBe("Unable to compute the RFP HLD close status.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET hld-close - route surface", () => {
  it("exports GET only", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/hld-close/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-close-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only next/server, requireAuth, and the close-status service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-close-status",
    ]);
  });

  it("touches no store/mutation/provider/raw-doc/pricing/SKU/catalog/config module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "getProjectById",
      "getProjectArtifactById",
      "createProjectArtifact",
      "createProjectApproval",
      "@/lib/projects/project-rfp-hld-document-manual-upload",
      "@/lib/projects/project-rfp-hld-document-approval",
      "@/lib/projects/project-rfp-hld-document-download",
      "@/lib/catalog",
      "@/lib/adapters",
      "@/lib/ai",
      "@/lib/llm",
      "@anthropic-ai",
      "openai",
      '@/lib/projects/pricing"',
      "@/lib/projects/config-expansion",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("does not read the request body or query (no json/formData/text/arrayBuffer/query)", () => {
    for (const forbidden of [
      "request.json",
      "request.formData",
      "request.text",
      "request.arrayBuffer",
      ".json()",
      ".formData()",
      ".text()",
      ".arrayBuffer()",
      "request.url",
      "nextUrl",
      "searchParams",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
