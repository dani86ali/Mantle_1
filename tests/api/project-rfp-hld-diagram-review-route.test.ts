import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the deterministic diagram-review service so the route's auth gate,
// strict body parse, decision mapping, tenant/user/param authority, and result
// mapping are tested independent of the DB.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-diagram-approval", () => ({
  reviewRfpHldDiagramArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-diagram-1";
const ARTIFACT = "art-diagram-7";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT } };

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
  id: ARTIFACT,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_diagram",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: ["model-1", "bundle-1", "review-1"],
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const APPROVAL = {
  id: "approval-1",
  artifactId: ARTIFACT,
  decision: "approved",
  decidedBy: SESSION.userId,
  decidedAt: "2026-06-21T09:00:00.000Z",
};

const OK_RESULT = {
  status: "ok",
  approval: APPROVAL,
  artifactStatus: "approved",
  stageStatus: "complete",
  artifact: ARTIFACT_SUMMARY,
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

describe("POST hld-diagram/review - auth", () => {
  it("returns the requireAuth response and never parses the body or calls the service", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST hld-diagram/review - invalid body", () => {
  it("maps invalid JSON to 400 without calling the service", async () => {
    const res = await POST(reqBadJson(), PARAMS);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_diagram_review_request");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("rejects null, primitives, arrays, empty, missing/invalid decision, and non-string note", async () => {
    for (const body of [
      null,
      "a string body",
      123,
      true,
      [{ decision: "approve" }],
      {},
      { note: "x" },
      { decision: "approved" },
      { decision: "rejected" },
      { decision: "maybe" },
      { decision: 1 },
      { decision: null },
      { decision: "approve", note: 5 },
      { decision: "approve", note: null },
    ]) {
      mockReview.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_rfp_hld_diagram_review_request");
      expect(mockReview).not.toHaveBeenCalled();
    }
  });

  it("rejects any forbidden/extra body field and never calls the service", async () => {
    for (const extra of [
      "tenantId",
      "projectId",
      "artifactId",
      "decidedBy",
      "decidedAt",
      "status",
      "stage",
      "type",
      "payload",
      "sourceArtifactIds",
      "sourceFileIds",
      "authority",
      "sku",
      "price",
      "pricing",
      "catalogDecision",
      "configurationDecision",
      "provider",
      "finalOutput",
      "documentUrl",
    ]) {
      mockReview.mockClear();
      const res = await POST(req({ decision: "approve", [extra]: "x" }), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_rfp_hld_diagram_review_request");
      expect(mockReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST hld-diagram/review - authority and decision mapping", () => {
  it("approve with exactly { decision: 'approve' } calls service with mapped 'approved' and no note", async () => {
    const res = await POST(req({ decision: "approve" }), PARAMS);

    expect(res.status).toBe(200);
    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "artifactId",
      "decidedBy",
      "decision",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT);
    expect(arg.decidedBy).toBe(SESSION.userId);
    expect(arg.decision).toBe("approved");
    expect("note" in arg).toBe(false);
  });

  it("reject with a note calls service with mapped 'rejected' and the trimmed note", async () => {
    const res = await POST(
      req({ decision: "reject", note: "  Needs updated topology.  " }),
      PARAMS
    );

    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.decision).toBe("rejected");
    expect(arg.note).toBe("Needs updated topology.");
  });

  it("omits a blank/whitespace note", async () => {
    const res = await POST(req({ decision: "approve", note: "   " }), PARAMS);
    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect("note" in arg).toBe(false);
  });
});

describe("POST hld-diagram/review - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockReview.mockResolvedValue({ status: "not_found" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockReview.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps artifact_not_found to 404 hld_diagram_artifact_not_found", async () => {
    mockReview.mockResolvedValue({ status: "artifact_not_found" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("hld_diagram_artifact_not_found");
  });

  it("maps artifact_not_hld_diagram to 409 with the artifact summary", async () => {
    mockReview.mockResolvedValue({
      status: "artifact_not_hld_diagram",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_hld_diagram");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps artifact_not_reviewable to 409 hld_diagram_artifact_not_reviewable with the artifact summary", async () => {
    mockReview.mockResolvedValue({
      status: "artifact_not_reviewable",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_artifact_not_reviewable");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps invalid_hld_diagram_payload to 409 hld_diagram_payload_invalid with the artifact summary", async () => {
    mockReview.mockResolvedValue({
      status: "invalid_hld_diagram_payload",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_payload_invalid");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps stale_hld_diagram_source_chain to 409 with staleCode and no raw messages/payload", async () => {
    const secret = "internal-source-chain-detail-do-not-leak";
    mockReview.mockResolvedValue({
      status: "stale_hld_diagram_source_chain",
      artifact: ARTIFACT_SUMMARY,
      staleCode: "source_model_unavailable",
      messages: [secret],
    });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_source_chain_stale");
    expect(body.staleCode).toBe("source_model_unavailable");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
    expect("messages" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("maps approval_failed to 409 hld_diagram_review_failed", async () => {
    mockReview.mockResolvedValue({ status: "approval_failed" });
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("hld_diagram_review_failed");
  });

  it("maps ok to 200 with { approval, artifactStatus, stageStatus, artifact } and no status/tenantId", async () => {
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approval: APPROVAL,
      artifactStatus: "approved",
      stageStatus: "complete",
      artifact: ARTIFACT_SUMMARY,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));
    const res = await POST(req(), PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("hld_diagram_review_failed");
    expect(body.error).toBe("Unable to review HLD diagram draft.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("hld-diagram/review - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-diagram/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-diagram-review-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly next/server, requireAuth, and the diagram approval service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-diagram-approval",
    ]);
  });

  it("never reads multipart form data", () => {
    expect(source).not.toContain("formData");
  });

  it("touches no store/version/approval/draft/parser/AI/pricing/sku/catalog/config/output module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      "project-rfp-hld-diagram-draft",
      "project-rfp-hld-diagram-inspection",
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
      "@anthropic-ai",
      "@google/generative-ai",
      "openai",
      "drawio",
      "mermaid",
      "pdf-parse",
      "mammoth",
      "Cisco-certified",
      "CVD-certified",
      "BOMATIC-certified",
      "AI-certified",
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
