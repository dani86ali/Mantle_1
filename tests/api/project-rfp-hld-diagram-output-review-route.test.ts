import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the diagram-output review service so the route's auth gate, strict body
// parse, decision mapping, tenant/user/param authority, and result mapping are tested
// independent of the DB.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-diagram-output-approval", () => ({
  reviewRfpHldDiagramOutputArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram-output/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram-output/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-output-1";
const ARTIFACT = "hld-output-7";
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
  sourceFileIds: [], sourceArtifactIds: ["hld-diagram-1"],
  createdAt: "2026-06-20T12:00:00.000Z", updatedAt: "2026-06-20T12:00:00.000Z",
};
const APPROVAL = { id: "approval-1", artifactId: ARTIFACT, decision: "approved", decidedBy: SESSION.userId };
const OK_RESULT = {
  status: "ok", approval: APPROVAL, artifactStatus: "approved", stageStatus: "complete", artifact: ARTIFACT_SUMMARY,
};

function req(body: unknown = { decision: "approve" }): NextRequest {
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
  mockReview.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST hld-diagram-output/review - auth + invalid body", () => {
  it("returns the requireAuth response and never parses the body or calls the service", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await POST(request, PARAMS);
    expect(res).toBe(unauth);
    expect(mockReview).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });

  it("maps invalid JSON to 400 without calling the service", async () => {
    const res = await POST(reqBadJson(), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_diagram_output_review_request");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("rejects primitives, arrays, canonical decisions, extra keys, and non-string notes", async () => {
    for (const body of [
      null, "s", 123, true, [{ decision: "approve" }], {}, { note: "x" },
      { decision: "approved" }, { decision: "maybe" }, { decision: "approve", note: 5 },
      { decision: "approve", tenantId: "x" }, { decision: "approve", sku: "X" },
    ]) {
      mockReview.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_rfp_hld_diagram_output_review_request");
      expect(mockReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST hld-diagram-output/review - decision mapping", () => {
  it("approve maps to 'approved' with no note", async () => {
    const res = await POST(req({ decision: "approve" }), PARAMS);
    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["artifactId", "decidedBy", "decision", "projectId", "tenantId"]);
    expect(arg.decision).toBe("approved");
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.decidedBy).toBe(SESSION.userId);
    expect("note" in arg).toBe(false);
  });

  it("reject with a note maps to 'rejected' with the trimmed note", async () => {
    const res = await POST(req({ decision: "reject", note: "  Redraw topology.  " }), PARAMS);
    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.decision).toBe("rejected");
    expect(arg.note).toBe("Redraw topology.");
  });

  it("omits a blank/whitespace note", async () => {
    await POST(req({ decision: "approve", note: "   " }), PARAMS);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect("note" in arg).toBe(false);
  });
});

describe("POST hld-diagram-output/review - result mapping", () => {
  it("maps not_found -> 404, wrong_mode -> 409", async () => {
    mockReview.mockResolvedValue({ status: "not_found" });
    expect((await POST(req(), PARAMS)).status).toBe(404);
    mockReview.mockResolvedValue({ status: "wrong_mode", project: { ...RFP_PROJECT, mode: "quick_bom" } });
    expect((await POST(req(), PARAMS)).status).toBe(409);
  });

  it("maps artifact_not_found -> 404", async () => {
    mockReview.mockResolvedValue({ status: "artifact_not_found" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("hld_diagram_output_artifact_not_found");
  });

  it("maps artifact_not_hld_diagram_output and artifact_not_reviewable -> 409", async () => {
    mockReview.mockResolvedValue({ status: "artifact_not_hld_diagram_output", artifact: ARTIFACT_SUMMARY });
    expect((await POST(req(), PARAMS)).status).toBe(409);
    mockReview.mockResolvedValue({ status: "artifact_not_reviewable", artifact: ARTIFACT_SUMMARY });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("hld_diagram_output_artifact_not_reviewable");
  });

  it("maps invalid_hld_diagram_output_payload -> 409", async () => {
    mockReview.mockResolvedValue({ status: "invalid_hld_diagram_output_payload", artifact: ARTIFACT_SUMMARY });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("hld_diagram_output_payload_invalid");
  });

  it("maps stale_hld_diagram_output_source_chain -> 409 with staleCode and no raw messages", async () => {
    const secret = "internal-source-chain-detail-do-not-leak";
    mockReview.mockResolvedValue({
      status: "stale_hld_diagram_output_source_chain",
      artifact: ARTIFACT_SUMMARY,
      staleCode: "source_diagram_unavailable",
      messages: [secret],
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_output_source_chain_stale");
    expect(body.staleCode).toBe("source_diagram_unavailable");
    expect("messages" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("maps approval_failed -> 409 and ok -> 200", async () => {
    mockReview.mockResolvedValue({ status: "approval_failed" });
    expect((await POST(req(), PARAMS)).status).toBe(409);
    mockReview.mockResolvedValue(OK_RESULT);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approval: APPROVAL, artifactStatus: "approved", stageStatus: "complete", artifact: ARTIFACT_SUMMARY,
    });
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });
});

describe("hld-diagram-output/review - route surface + purity (static)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram-output/review/route.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("exports POST only", () => {
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["GET", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });

  it("imports exactly next/server, requireAuth, and the diagram-output approval service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-diagram-output-approval",
    ]);
  });

  it("touches no store/approval directly, never reads form data, and stays ASCII-only", () => {
    for (const forbidden of ['from "@/lib/db', "createProjectApproval", "formData"]) {
      expect(source).not.toContain(forbidden);
    }
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
