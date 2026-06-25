import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockLoadReadiness } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadReadiness: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-generation-readiness", () => ({
  loadRfpHldGenerationReadiness: mockLoadReadiness,
}));

import { GET } from "@/app/api/projects/[id]/rfp/hld-generation-readiness/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-generation-readiness/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-6f";
const SESSION = {
  userId: "u-engineer",
  tenantId: "55555555-5555-5555-5555-555555555555",
  email: "eng@example.com",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT } };

function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve({ shouldNotRead: true })),
  } as unknown as NextRequest;
}

const PROJECT_SUMMARY = {
  id: PROJECT,
  name: "Acme RFP",
  customerName: "Acme",
  mode: "rfp",
  createdAt: "2026-06-25T00:00:00.000Z",
  updatedAt: "2026-06-25T00:00:00.000Z",
};

const READY_RESULT = {
  status: "ready",
  ready: true,
  project: PROJECT_SUMMARY,
  approvedModel: {
    id: "model-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "approved",
    version: 2,
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    sourceHldSourceBundleArtifactId: "bundle-1",
    sourceBundleVersion: 1,
    coveredDomainCount: 1,
    excludedDomainCount: 1,
    designSectionCount: 1,
    topologyNodeCount: 2,
    topologyLinkCount: 1,
    diagramIntentCount: 1,
  },
  sourceBundle: {
    id: "bundle-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_source_bundle",
    status: "approved",
    version: 1,
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    sourceArtifactCount: 7,
    coveredDomainCount: 1,
    excludedDomainCount: 1,
    designKnowledgePackCount: 1,
    assumptionCount: 1,
    warningCount: 0,
    blockerCount: 0,
  },
  review: {
    id: "review-1",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "generated",
    version: 1,
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
    reviewedAt: "2026-06-25T00:00:00.000Z",
    reviewerType: "deterministic",
    sourceHldDesignModelArtifactId: "model-1",
    sourceHldSourceBundleArtifactId: "bundle-1",
    recommendation: "proceed_to_engineer_review",
    findingCount: 0,
    findingCounts: { blocking: 0, warning: 0, suggestion: 0 },
  },
  blockers: [],
  warnings: [],
  nextAction: "Approved HLD design model is ready for future HLD generation.",
  technicalAudit: {
    approvedModelArtifactId: "model-1",
    sourceBundleArtifactId: "bundle-1",
    reviewArtifactId: "review-1",
    approvedModelSourceArtifactIds: ["bundle-1"],
    sourceBundleSourceArtifactIds: ["evp-1"],
    reviewSourceArtifactIds: ["model-1", "bundle-1"],
  },
};

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadReadiness.mockReset().mockResolvedValue(READY_RESULT);
});

describe("GET /api/projects/[id]/rfp/hld-generation-readiness", () => {
  it("returns the requireAuth response and does not inspect readiness when unauthenticated", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const response = await GET(request, PARAMS);

    expect(response).toBe(unauth);
    expect(mockLoadReadiness).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });

  it("passes only session tenant and route project authority to the service", async () => {
    await GET(req(), PARAMS);

    expect(mockLoadReadiness).toHaveBeenCalledTimes(1);
    expect(mockLoadReadiness).toHaveBeenCalledWith({
      tenantId: SESSION.tenantId,
      projectId: PROJECT,
    });
  });

  it("maps ready to 200 and returns the lean readiness body", async () => {
    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.ready).toBe(true);
    expect(body.approvedModel.id).toBe("model-1");
    expect(body.sourceBundle.id).toBe("bundle-1");
    expect(body.review.id).toBe("review-1");
    expect(body.blockers).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
    expect(JSON.stringify(body)).not.toContain("payloadKind");
    expect(JSON.stringify(body)).not.toContain("rawText");
    expect(JSON.stringify(body)).not.toContain("providerOutput");
  });

  it("maps blocked to 200 with stable blocker codes", async () => {
    mockLoadReadiness.mockResolvedValue({
      status: "blocked",
      ready: false,
      project: PROJECT_SUMMARY,
      blockers: [
        {
          code: "matching_review_missing",
          message: "No current deterministic advisory review exists for the approved HLD design model.",
        },
      ],
      warnings: [],
      nextAction: "Run a fresh deterministic HLD design-model review for the approved model.",
    });

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("blocked");
    expect(body.ready).toBe(false);
    expect(body.blockers[0].code).toBe("matching_review_missing");
  });

  it("maps not_found to 404 with status not_found", async () => {
    mockLoadReadiness.mockResolvedValue({
      status: "not_found",
      ready: false,
      blockers: [{ code: "no_approved_hld_design_model", message: "Project not found." }],
      warnings: [],
      nextAction: "Open an existing RFP project before checking HLD generation readiness.",
    });

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.status).toBe("not_found");
    expect(body.code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 with status wrong_mode", async () => {
    mockLoadReadiness.mockResolvedValue({
      status: "wrong_mode",
      ready: false,
      project: { ...PROJECT_SUMMARY, mode: "quick_bom" },
      blockers: [
        {
          code: "no_approved_hld_design_model",
          message: "HLD generation readiness is available only for RFP projects.",
        },
      ],
      warnings: [],
      nextAction: "Open an RFP project before checking HLD generation readiness.",
    });

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.status).toBe("wrong_mode");
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project.mode).toBe("quick_bom");
  });

  it("maps unexpected service errors to a controlled 500 without leaking the thrown error", async () => {
    mockLoadReadiness.mockRejectedValue(new Error("secret-db-stack"));

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("rfp_hld_generation_readiness_failed");
    expect(JSON.stringify(body)).not.toContain("secret-db-stack");
  });
});

describe("route surface", () => {
  it("exports GET only", () => {
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route static guards", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/hld-generation-readiness/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-generation-readiness-route.test.ts"
  );

  it("imports only Next.js, auth, and the read-only readiness service", () => {
    const src = readFileSync(SRC_PATH, "utf8");
    const froms = Array.from(src.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-generation-readiness",
    ]);
  });

  it("does not import stores, providers, raw readers, or generation surfaces", () => {
    const src = readFileSync(SRC_PATH, "utf8");
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "pdf-parse",
      "mammoth",
      "xlsx",
      "@anthropic-ai",
      "@google/generative-ai",
      "@/lib/ai",
      "@/lib/llm",
      "from \"@/lib/projects/pricing",
      "from \"@/lib/catalog",
      "draw.io",
      "mermaid",
      "technical_proposal",
      "export_package",
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("keeps the route source and test file ASCII-only", () => {
    const src = readFileSync(SRC_PATH, "utf8");
    const test = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(src)).toBe(false);
    expect(/[^\x00-\x7F]/.test(test)).toBe(false);
  });
});
