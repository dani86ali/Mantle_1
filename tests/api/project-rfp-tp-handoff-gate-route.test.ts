import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the TP handoff gate service so the route's auth gate, tenant/param
// authority, body/query-ignoring, and result mapping are tested independent of the DB,
// the close-status service, and the real filesystem.
const { mockRequireAuth, mockHandoffGate } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockHandoffGate: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-tp-handoff-gate", () => ({
  getRfpTpHandoffGate: mockHandoffGate,
}));

import { GET } from "@/app/api/projects/[id]/rfp/tp-handoff-gate/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/tp-handoff-gate/route";
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

const HLD_CLOSE = {
  closeStatus: "hld_closed_on_final_authority",
  closeKind: "approved_manual_drawio_upload_final",
  closedAt: ARTIFACT_SUMMARY.updatedAt,
  finalAuthority: {
    artifact: ARTIFACT_SUMMARY,
    payloadSummary: { title: "Final HLD", uploadedFileName: "acme.drawio" },
    finalAuthorityStatus: "approved_manual_drawio_upload",
  },
};

const READY_RESULT = {
  status: "ready",
  gateStatus: "tp_handoff_ready",
  project: PROJECT_SUMMARY,
  hldClose: HLD_CLOSE,
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
        status: "ready",
      })
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
    text: vi.fn(() => Promise.resolve("tenantId=attacker-tenant")),
    arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockHandoffGate.mockReset().mockResolvedValue(READY_RESULT);
});

describe("GET tp-handoff-gate - auth", () => {
  it("returns the requireAuth response and skips the service and body reads when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await GET(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockHandoffGate).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.text).not.toHaveBeenCalled();
    expect(request.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("GET tp-handoff-gate - tenant/param authority", () => {
  it("uses session.tenantId + route project id only and never reads the body/query", async () => {
    const request = req();

    await GET(request, PARAMS);

    expect(mockHandoffGate).toHaveBeenCalledTimes(1);
    expect(mockHandoffGate).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
    });

    const arg = mockHandoffGate.mock.calls[0][0] as Record<string, unknown>;
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

describe("GET tp-handoff-gate - ready", () => {
  it("maps ready -> 200 with project, gateStatus, and hldClose", async () => {
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project).toEqual(PROJECT_SUMMARY);
    expect(body.gateStatus).toBe("tp_handoff_ready");
    expect(body.hldClose).toEqual(HLD_CLOSE);
  });
});

describe("GET tp-handoff-gate - result mapping", () => {
  it("maps not_found -> 404 project_not_found", async () => {
    mockHandoffGate.mockResolvedValue({ status: "not_found" });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("project_not_found");
    expect("status" in body).toBe(false);
  });

  it("maps wrong_mode -> 409 wrong_project_mode with the project summary", async () => {
    mockHandoffGate.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps blocked/not_closed -> 409 tp_handoff_blocked with gate/blocker codes and any latestArtifact", async () => {
    mockHandoffGate.mockResolvedValueOnce({
      status: "blocked",
      gateStatus: "tp_handoff_blocked",
      blockerCode: "hld_not_closed",
      hldCloseBlockerCode: "no_final_hld_document",
      project: PROJECT_SUMMARY,
    });
    const none = await GET(req(), PARAMS);
    expect(none.status).toBe(409);
    const noneJson = await none.json();
    expect(noneJson.code).toBe("tp_handoff_blocked");
    expect(noneJson.gateStatus).toBe("tp_handoff_blocked");
    expect(noneJson.blockerCode).toBe("hld_not_closed");
    expect(noneJson.hldCloseBlockerCode).toBe("no_final_hld_document");
    expect(noneJson.project).toEqual(PROJECT_SUMMARY);
    expect("latestArtifact" in noneJson).toBe(false);
    expect("artifact" in noneJson).toBe(false);

    mockHandoffGate.mockResolvedValueOnce({
      status: "blocked",
      gateStatus: "tp_handoff_blocked",
      blockerCode: "hld_manual_upload_pending_review",
      hldCloseBlockerCode: "manual_upload_pending_review",
      project: PROJECT_SUMMARY,
      latestArtifact: ARTIFACT_SUMMARY,
    });
    const pending = await GET(req(), PARAMS);
    expect(pending.status).toBe(409);
    const pendingJson = await pending.json();
    expect(pendingJson.blockerCode).toBe("hld_manual_upload_pending_review");
    expect(pendingJson.hldCloseBlockerCode).toBe("manual_upload_pending_review");
    expect(pendingJson.latestArtifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps blocked/stale -> 409 tp_handoff_blocked with hld_final_authority_stale + artifact", async () => {
    mockHandoffGate.mockResolvedValue({
      status: "blocked",
      gateStatus: "tp_handoff_blocked",
      blockerCode: "hld_final_authority_stale",
      hldCloseBlockerCode: "source_diagram_unavailable",
      project: PROJECT_SUMMARY,
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("tp_handoff_blocked");
    expect(json.blockerCode).toBe("hld_final_authority_stale");
    expect(json.hldCloseBlockerCode).toBe("source_diagram_unavailable");
    expect(json.artifact).toEqual(ARTIFACT_SUMMARY);
    expect("latestArtifact" in json).toBe(false);
  });

  it("no response body carries drawioXml or a payload", async () => {
    for (const result of [
      READY_RESULT,
      {
        status: "blocked",
        gateStatus: "tp_handoff_blocked",
        blockerCode: "hld_final_authority_stale",
        hldCloseBlockerCode: "source_diagram_unavailable",
        project: PROJECT_SUMMARY,
        artifact: ARTIFACT_SUMMARY,
      },
    ]) {
      mockHandoffGate.mockResolvedValue(result);
      const res = await GET(req(), PARAMS);
      const raw = JSON.stringify(await res.json());
      expect(raw).not.toContain("drawioXml");
      expect(raw).not.toContain("\"payload\"");
    }
  });
});

describe("GET tp-handoff-gate - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockHandoffGate.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_tp_handoff_gate_failed");
    expect(body.error).toBe("Unable to compute the RFP TP handoff gate.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET tp-handoff-gate - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/tp-handoff-gate/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-tp-handoff-gate-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only next/server, requireAuth, and the TP handoff gate service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-tp-handoff-gate",
    ]);
  });

  it("touches no store/mutation/provider/raw-doc/pricing/SKU/catalog/config module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "getProjectById",
      "getProjectArtifactById",
      "createProjectArtifact",
      "createProjectApproval",
      "@/lib/projects/project-rfp-hld-close-status",
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
