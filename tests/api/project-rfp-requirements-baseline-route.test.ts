import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the read-only inspection list service so the route's auth
// gate, the disabled-POST gate, GET tenant/project authority, and GET result
// mapping are tested independent of the DB. The direct-create service is NOT
// mocked because the route no longer imports or calls it: requirements
// baseline creation happens only through the /generate path.
const { mockRequireAuth, mockLoadList } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-requirements-baseline-inspection", () => ({
  loadRfpRequirementsBaselineList: mockLoadList,
}));

import {
  GET,
  POST,
} from "@/app/api/projects/[id]/rfp/requirements-baseline/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/requirements-baseline/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT } };

const DISABLED_ERROR =
  "Create requirements baselines through approved final evidence package generation.";

const ARTIFACT_SUMMARY = {
  id: "artifact-baseline-1",
  projectId: PROJECT,
  stageId: "requirements_baseline_review",
  type: "requirements_baseline",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: ["art-input-package-1"],
  createdAt: "2026-06-10T12:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const RFP_PROJECT = {
  id: PROJECT,
  name: "STC RFP Bid",
  customerName: "STC",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

// Inspection list items carry the lean identifier/count payload summary
// (requirement ids only - never requirement text or evidence references).
const LIST_ITEMS = [
  {
    ...ARTIFACT_SUMMARY,
    payloadSummary: {
      payloadKind: "rfp_requirements_baseline",
      createdBy: SESSION.userId,
      createdAt: "2026-06-10T12:00:00.000Z",
      requirementCount: 2,
      evidenceCount: 2,
      requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
    },
  },
];

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifacts: LIST_ITEMS,
  artifactCount: 1,
};

const VALID_BODY = {
  candidates: [
    {
      text: "Provide 48-port access switches.",
      category: "technical",
      priority: "mandatory",
      evidenceIds: ["evidence-text-1", "evidence-table-1"],
      title: "Access switches",
      notes: "From section 3.1.",
    },
  ],
};

function req(body: unknown = VALID_BODY): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
});

describe("POST .../rfp/requirements-baseline - disabled direct create", () => {
  it("returns the requireAuth response and never reads the body or calls the list service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadList).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("returns 405 with the disabled code without reading the body or calling any service", async () => {
    const request = req();

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_baseline_direct_create_disabled",
      error: DISABLED_ERROR,
    });
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadList).not.toHaveBeenCalled();
  });

  it("returns 405 even when the body carries raw evidenceIds or candidates; the raw ids never reach a service argument", async () => {
    const request = req({
      candidates: [
        {
          text: "Provide 48-port access switches.",
          evidenceIds: ["evidence-text-1", "evidence-table-1"],
        },
      ],
      evidenceIds: ["evidence-text-1", "evidence-table-1"],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_baseline_direct_create_disabled",
      error: DISABLED_ERROR,
    });
    // The body is never parsed, so candidates/evidenceIds cannot be forwarded.
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadList).not.toHaveBeenCalled();
  });
});

describe("GET .../rfp/requirements-baseline - auth", () => {
  it("returns the requireAuth response and never calls the inspection service or reads the body when unauthenticated", async () => {
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

describe("GET .../rfp/requirements-baseline - authority", () => {
  it("passes only the session tenant and the route project; a decoy request body is never read", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      candidates: [{ text: "attacker text", evidenceIds: ["e-1"] }],
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

describe("GET .../rfp/requirements-baseline - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadList.mockResolvedValue({ status: "not_found" });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "project_not_found",
      error: "Project not found.",
    });
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadList.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "wrong_project_mode",
      error: "Project is not an RFP project.",
      project: WRONG_MODE_PROJECT,
    });
  });

  it("maps ok to 200 with { project, artifactCount, artifacts }, no status discriminator, and no tenantId", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifactCount: 1,
      artifacts: LIST_ITEMS,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected inspection error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_requirements_baseline_inspection_failed",
      error: "Unable to inspect requirements baseline.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe(".../rfp/requirements-baseline - route surface", () => {
  it("exports GET and POST only", () => {
    expect(typeof routeModule.POST).toBe("function");
    expect(typeof routeModule.GET).toBe("function");
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/requirements-baseline/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-requirements-baseline-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the read-only requirements-baseline inspection service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-requirements-baseline-inspection",
    ]);
  });

  it("does not import or reference the direct-create service, candidate category/priority lists, the candidate input type, or candidate parsing helpers", () => {
    for (const forbidden of [
      "createRfpRequirementsBaselineDraft",
      "RFP_REQUIREMENT_CATEGORIES",
      "RFP_REQUIREMENT_PRIORITIES",
      "RfpRequirementsBaselineCandidateInput",
      "parseCandidate",
      "parseCandidates",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("does not import DB, stores, the approval service, extraction, persistence, raw file loaders, pricing, SKU resolution, config expansion, export, runner, AI, catalog, intake, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      'from "@/lib/projects/project-rfp-requirements-baseline"',
      'from "@/lib/projects/project-rfp-requirements-baseline-generation"',
      'from "@/lib/projects/project-rfp-requirements-baseline-approval"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/boq-formats"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
      "@google/generative-ai",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("never reads request body (json or multipart form data) in any handler", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("keeps the route source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
