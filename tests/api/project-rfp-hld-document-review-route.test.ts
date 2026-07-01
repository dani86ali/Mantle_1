import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the document approval service so the route's auth gate, strict body
// parse, decision mapping, tenant/user/param authority, and result mapping are tested
// independent of the DB and any store.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-document-approval", () => ({
  reviewRfpHldDocumentArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-doc-1";
const ARTIFACT = "art-doc-7";
const SESSION = {
  userId: "u-approver",
  tenantId: "12121212-1212-1212-1212-121212121212",
  email: "app@bomatic.ai",
  name: "Approver",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT } };

const ARTIFACT_SUMMARY = {
  id: ARTIFACT,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_document",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: ["hsb-1", "hdm-1", "hdg-1", "hdocm-1"],
  createdAt: "2026-06-30T12:00:00.000Z",
  updatedAt: "2026-06-30T12:00:00.000Z",
};

const OK_RESULT = {
  status: "ok",
  approval: { id: "appr-1", artifactId: ARTIFACT, decision: "approved", decidedBy: SESSION.userId },
  artifactStatus: "approved",
  stageStatus: "approved",
  artifact: ARTIFACT_SUMMARY,
};

function req(body: unknown = { decision: "approve" }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
  } as unknown as NextRequest;
}

function reqBadJson(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new SyntaxError("bad"))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST hld-document/review - auth + strict body", () => {
  it("returns the requireAuth response and never calls the service", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and invalid/extra body shapes with 400", async () => {
    const res = await POST(reqBadJson(), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_document_review_request");

    for (const body of [
      null, "s", 5, true, [{ decision: "approve" }], {}, { note: "x" },
      { decision: "approved" }, { decision: "maybe" }, { decision: 1 },
      { decision: "approve", note: 5 }, { decision: "approve", extra: "x" },
    ]) {
      mockReview.mockClear();
      const bad = await POST(req(body), PARAMS);
      expect(bad.status).toBe(400);
      expect(mockReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST hld-document/review - decision mapping + results", () => {
  it("maps approve -> approved with session decidedBy and no note", async () => {
    const res = await POST(req({ decision: "approve" }), PARAMS);
    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT);
    expect(arg.decidedBy).toBe(SESSION.userId);
    expect(arg.decision).toBe("approved");
    expect("note" in arg).toBe(false);
  });

  it("maps reject with a trimmed note and omits a blank note", async () => {
    await POST(req({ decision: "reject", note: "  redo layout  " }), PARAMS);
    expect((mockReview.mock.calls[0][0] as Record<string, unknown>).decision).toBe("rejected");
    expect((mockReview.mock.calls[0][0] as Record<string, unknown>).note).toBe("redo layout");

    mockReview.mockClear();
    await POST(req({ decision: "approve", note: "   " }), PARAMS);
    expect("note" in (mockReview.mock.calls[0][0] as Record<string, unknown>)).toBe(false);
  });

  it("maps the controlled result statuses to HTTP", async () => {
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ status: "not_found" }, 404, "project_not_found"],
      [{ status: "wrong_mode", project: { id: PROJECT, name: "x", mode: "quick_bom", createdAt: "", updatedAt: "" } }, 409, "wrong_project_mode"],
      [{ status: "artifact_not_found" }, 404, "hld_document_artifact_not_found"],
      [{ status: "artifact_not_hld_document", artifact: ARTIFACT_SUMMARY }, 409, "artifact_not_hld_document"],
      [{ status: "artifact_not_reviewable", artifact: ARTIFACT_SUMMARY }, 409, "hld_document_artifact_not_reviewable"],
      [{ status: "invalid_hld_document_payload", artifact: ARTIFACT_SUMMARY }, 409, "hld_document_payload_invalid"],
      [{ status: "stale_hld_document_source_chain", artifact: ARTIFACT_SUMMARY, staleCode: "source_version_mismatch" }, 409, "hld_document_source_chain_stale"],
      [{ status: "approval_failed" }, 409, "hld_document_review_failed"],
    ];
    for (const [result, status, code] of cases) {
      mockReview.mockResolvedValueOnce(result);
      const res = await POST(req(), PARAMS);
      expect(res.status, code).toBe(status);
      expect((await res.json()).code, code).toBe(code);
    }
  });

  it("surfaces the stale staleCode but never a raw payload or drawio XML", async () => {
    mockReview.mockResolvedValueOnce({
      status: "stale_hld_document_source_chain",
      artifact: ARTIFACT_SUMMARY,
      staleCode: "source_chain_mismatch",
    });
    const res = await POST(req(), PARAMS);
    const json = await res.json();
    expect(json.staleCode).toBe("source_chain_mismatch");
    expect(JSON.stringify(json)).not.toContain("drawioXml");
  });

  it("maps an unexpected service throw to a controlled 500", async () => {
    mockReview.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("hld_document_review_failed");
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-document/review/route.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only next/server, requireAuth, and the approval service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-document-approval",
    ]);
  });

  it("touches no store/AI/catalog/pricing module", () => {
    for (const forbidden of [
      "@/lib/db/", "@/lib/catalog", "@/lib/adapters", "@/lib/ai", "@anthropic-ai", "openai",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("is ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
