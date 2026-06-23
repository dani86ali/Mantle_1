import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and both HLD readiness snapshot services (read-only list + create
// draft) so the route's auth gate, body-ignoring on both GET and POST,
// tenant/user/param authority, and result mapping are tested independent of DB.
const { mockRequireAuth, mockLoadList, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-readiness-snapshot-inspection", () => ({
  loadRfpHldReadinessSnapshotList: mockLoadList,
}));
vi.mock("@/lib/projects/project-rfp-hld-readiness-snapshot", () => ({
  createRfpHldReadinessSnapshotDraft: mockCreateDraft,
}));

import { GET, POST } from "@/app/api/projects/[id]/rfp/hld-readiness-snapshot/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-readiness-snapshot/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-hld-snap-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "22222222-2222-2222-2222-222222222222",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT } };

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
  id: "art-hld-snap-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_readiness_snapshot",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: ["art-ep-1", "art-rb-1"],
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_readiness_snapshot",
  createdBy: SESSION.userId,
  createdAt: "2026-06-20T12:00:00.000Z",
  readinessStatus: "ready",
  sourceArtifactCount: 2,
  assumptionCount: 3,
};

const READINESS = {
  status: "ready",
  canCreateReadinessSnapshot: true,
  sourceArtifactIds: ["art-ep-1", "art-rb-1"],
  coveredDomains: ["campus_switching"],
  excludedDomains: [],
  domainReadiness: {
    claimedDomains: ["campus_switching"],
    coveredDomains: ["campus_switching"],
    excludedDomains: [],
    requiredKnowledgePackDomains: ["campus_switching"],
    missingKnowledgePackDomains: [],
  },
  assumptions: [],
  missingInputs: [],
  validationMessages: [],
};

const BLOCKED_READINESS = {
  status: "blocked",
  canCreateReadinessSnapshot: false,
  sourceArtifactIds: [],
  coveredDomains: [],
  excludedDomains: [],
  domainReadiness: {
    claimedDomains: [],
    coveredDomains: [],
    excludedDomains: [],
    requiredKnowledgePackDomains: [],
    missingKnowledgePackDomains: [],
  },
  assumptions: [],
  missingInputs: ["hld_intake"],
  validationMessages: ["HLD intake artifact not approved."],
};

const LIST_ITEM = {
  ...ARTIFACT_SUMMARY,
  payloadSummary: {
    ...PAYLOAD_SUMMARY,
    coveredDomainCount: 1,
    excludedDomainCount: 0,
    missingInputCount: 0,
    validationMessageCount: 0,
  },
};

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifacts: [LIST_ITEM],
  artifactCount: 1,
  readiness: READINESS,
};

const CREATE_OK = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: PAYLOAD_SUMMARY,
  readiness: READINESS,
};

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

describe("GET /api/projects/[id]/rfp/hld-readiness-snapshot - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await GET(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadList).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/[id]/rfp/hld-readiness-snapshot - authority", () => {
  it("passes only session tenant and the route project id; a decoy body is never read", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
    });

    const res = await GET(request, PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadList).toHaveBeenCalledTimes(1);
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("GET /api/projects/[id]/rfp/hld-readiness-snapshot - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadList.mockResolvedValue({ status: "not_found" });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadList.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps ok to 200 with { project, artifactCount, artifacts, readiness } and no status discriminator", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifactCount: 1,
      artifacts: [LIST_ITEM],
      readiness: READINESS,
    });
    expect("status" in body).toBe(false);
  });

  it("GET returns current readiness report and never reads request.json or formData", async () => {
    const request = req();
    const res = await GET(request, PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readiness).toEqual(READINESS);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_readiness_snapshot_inspection_failed");
    expect(body.error).toBe("Unable to inspect HLD readiness snapshots.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/hld-readiness-snapshot - auth", () => {
  it("returns the requireAuth response and skips the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/rfp/hld-readiness-snapshot - authority", () => {
  it("passes only session tenant, route project id, and session userId; decoy fields never reach the service and request.json is never called", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      createdBy: "attacker-user",
      createdAt: "2000-01-01T00:00:00.000Z",
      status: "approved",
      id: "attacker-artifact",
      payload: { hack: true },
      price: 999,
      sku: "ATTACKER-SKU",
      sourceArtifactIds: ["fake-art"],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).not.toHaveBeenCalled();
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["createdBy", "projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.createdBy).toBe(SESSION.userId);
    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.createdBy).not.toBe("attacker-user");
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("POST /api/projects/[id]/rfp/hld-readiness-snapshot - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps blocked to 409 hld_readiness_snapshot_blocked with the readiness report", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "blocked",
      readiness: BLOCKED_READINESS,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_readiness_snapshot_blocked");
    expect(body.readiness).toEqual(BLOCKED_READINESS);
  });

  it("maps ok to 201 with { artifact, payloadSummary, readiness } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
      readiness: READINESS,
    });
    expect("status" in body).toBe(false);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_readiness_snapshot_failed");
    expect(body.error).toBe("Unable to create RFP HLD readiness snapshot draft.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("/api/projects/[id]/rfp/hld-readiness-snapshot - route surface", () => {
  it("exports GET and POST only", () => {
    expect(typeof routeModule.GET).toBe("function");
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/hld-readiness-snapshot/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-readiness-snapshot-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the HLD readiness snapshot services", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-readiness-snapshot-inspection",
      "@/lib/projects/project-rfp-hld-readiness-snapshot",
    ]);
  });

  it("does not create artifact versions or approvals, and reads no file/evidence/pricing/sku/config/catalog/AI stores", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/boq-file-loader"',
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
      'from "@/app/(',
      "@anthropic-ai",
      "@google/generative-ai",
      "pdf-parse",
      "mammoth",
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
