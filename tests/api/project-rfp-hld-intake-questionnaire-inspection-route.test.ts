import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the read-only inspection services so both routes' auth gate,
// tenant/param authority, body-ignoring, GET-only surface, and result mapping are
// tested independent of the DB and stores.
const { mockRequireAuth, mockLoadList, mockLoadDetail } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockLoadDetail: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock(
  "@/lib/projects/project-rfp-hld-intake-questionnaire-inspection",
  () => ({
    loadRfpHldIntakeQuestionnaireList: mockLoadList,
    loadRfpHldIntakeQuestionnaireDetail: mockLoadDetail,
  })
);

import { GET as LIST_GET } from "@/app/api/projects/[id]/rfp/hld-intake-questionnaires/route";
import * as listRouteModule from "@/app/api/projects/[id]/rfp/hld-intake-questionnaires/route";
import { GET as DETAIL_GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-intake-questionnaire/route";
import * as detailRouteModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-intake-questionnaire/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-hld-intake-questionnaire-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "66666666-6666-6666-6666-666666666666",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const LIST_PARAMS = { params: { id: PROJECT } };
const DETAIL_PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const RFP_PROJECT = {
  id: PROJECT,
  name: "STC RFP Bid",
  customerName: "STC",
  mode: "rfp",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const WRONG_MODE_PROJECT = { ...RFP_PROJECT, mode: "quick_bom" };

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_intake_questionnaire",
  status: "needs_review",
  version: 1,
  sourceArtifactIds: ["art-req-1"],
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifactCount: 1,
  artifacts: [
    {
      ...ARTIFACT_SUMMARY,
      payloadSummary: {
        payloadKind: "rfp_hld_intake_questionnaire",
        createdBy: SESSION.userId,
        createdAt: "2026-06-20T12:00:00.000Z",
        questionCount: 2,
        sourceArtifactCount: 1,
        validationStatus: "passed",
        validationFindingCount: 0,
        payloadValid: true,
      },
    },
  ],
};

const QUESTIONNAIRE = {
  payloadKind: "rfp_hld_intake_questionnaire",
  createdBy: SESSION.userId,
  createdAt: "2026-06-20T12:00:00.000Z",
  sourceArtifactIds: ["art-req-1"],
  questions: [
    {
      questionId: "q-1",
      order: 1,
      domain: "campus_switching",
      questionText: "What is the access footprint?",
      whyAsked: "Sizes the campus design.",
      answerType: "free_text",
      required: true,
      sourceRefIds: ["art-req-1"],
    },
  ],
  validation: { status: "passed", checkedAt: "2026-06-20T12:00:00.000Z", findingCount: 0, findings: [] },
};

const DETAIL_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifact: ARTIFACT_SUMMARY,
  questionnaire: QUESTIONNAIRE,
};

function req(body: unknown = { decoy: true }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(null)),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
  mockLoadDetail.mockReset().mockResolvedValue(DETAIL_OK);
});

// ---------------------------------------------------------------------------
// list route
// ---------------------------------------------------------------------------

describe("GET .../rfp/hld-intake-questionnaires (list)", () => {
  it("returns the requireAuth response and never calls the service or reads the body", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await LIST_GET(request, LIST_PARAMS);
    expect(res).toBe(unauth);
    expect(mockLoadList).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("passes only the session tenant and route project id; a decoy body is never read", async () => {
    const request = req({ tenantId: "attacker-tenant", projectId: "attacker-project" });
    const res = await LIST_GET(request, LIST_PARAMS);
    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });

  it("maps not_found to 404 and wrong_mode to 409, and ok to 200 with the list body", async () => {
    mockLoadList.mockResolvedValue({ status: "not_found" });
    let res = await LIST_GET(req(), LIST_PARAMS);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "project_not_found", error: "Project not found." });

    mockLoadList.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    res = await LIST_GET(req(), LIST_PARAMS);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "wrong_project_mode",
      error: "Project is not an RFP project.",
      project: WRONG_MODE_PROJECT,
    });

    mockLoadList.mockResolvedValue(LIST_OK);
    res = await LIST_GET(req(), LIST_PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifactCount: 1,
      artifacts: LIST_OK.artifacts,
    });
    expect("status" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack";
    mockLoadList.mockRejectedValue(new Error(secret));
    const res = await LIST_GET(req(), LIST_PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });

  it("exports GET only", () => {
    expect(typeof listRouteModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((listRouteModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// detail route
// ---------------------------------------------------------------------------

describe("GET .../hld-intake-questionnaire (detail)", () => {
  it("returns the requireAuth response and never calls the service or reads the body", async () => {
    const unauth = NextResponse.json({ error: "Authentication required" }, { status: 401 });
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();
    const res = await DETAIL_GET(request, DETAIL_PARAMS);
    expect(res).toBe(unauth);
    expect(mockLoadDetail).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });

  it("passes only the session tenant and route project/artifact ids; a decoy body is never read", async () => {
    const request = req({ tenantId: "attacker", artifactId: "attacker-artifact" });
    const res = await DETAIL_GET(request, DETAIL_PARAMS);
    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    const arg = mockLoadDetail.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["artifactId", "projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT_ID);
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });

  it("maps not_found to 404 project_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "not_found" });
    const res = await DETAIL_GET(req(), DETAIL_PARAMS);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "project_not_found", error: "Project not found." });
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadDetail.mockResolvedValue({ status: "wrong_mode", project: WRONG_MODE_PROJECT });
    const res = await DETAIL_GET(req(), DETAIL_PARAMS);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "wrong_project_mode",
      error: "Project is not an RFP project.",
      project: WRONG_MODE_PROJECT,
    });
  });

  it("maps artifact_not_found to 404 hld_intake_questionnaire_artifact_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "artifact_not_found" });
    const res = await DETAIL_GET(req(), DETAIL_PARAMS);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "hld_intake_questionnaire_artifact_not_found",
      error: "HLD intake questionnaire artifact not found.",
    });
  });

  it("maps artifact_not_questionnaire to 409 with the lean artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "artifact_not_questionnaire",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await DETAIL_GET(req(), DETAIL_PARAMS);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "artifact_not_hld_intake_questionnaire",
      error: "Artifact is not an hld_intake_questionnaire artifact.",
      artifact: ARTIFACT_SUMMARY,
    });
  });

  it("maps invalid_questionnaire_payload to 409 with the lean artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "invalid_questionnaire_payload",
      artifact: ARTIFACT_SUMMARY,
    });
    const res = await DETAIL_GET(req(), DETAIL_PARAMS);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "hld_intake_questionnaire_invalid_payload",
      error: "HLD intake questionnaire payload is invalid.",
      artifact: ARTIFACT_SUMMARY,
    });
  });

  it("maps ok to 200 with { project, artifact, questionnaire } and no tenantId leak", async () => {
    const res = await DETAIL_GET(req(), DETAIL_PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifact: ARTIFACT_SUMMARY,
      questionnaire: QUESTIONNAIRE,
    });
    expect("status" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-detail-stack";
    mockLoadDetail.mockRejectedValue(new Error(secret));
    const res = await DETAIL_GET(req(), DETAIL_PARAMS);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(secret);
  });

  it("exports GET only", () => {
    expect(typeof detailRouteModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect((detailRouteModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Static route module purity
// ---------------------------------------------------------------------------

describe("route module purity (static source check)", () => {
  const LIST_SRC = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/hld-intake-questionnaires/route.ts"
  );
  const DETAIL_SRC = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/hld-intake-questionnaire/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-intake-questionnaire-inspection-route.test.ts"
  );
  const listSource = readFileSync(LIST_SRC, "utf8");
  const detailSource = readFileSync(DETAIL_SRC, "utf8");

  it("each route imports only Next.js server primitives, requireAuth, and the inspection service", () => {
    for (const source of [listSource, detailSource]) {
      const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
      expect(froms).toEqual([
        "next/server",
        "@/lib/middleware/auth",
        "@/lib/projects/project-rfp-hld-intake-questionnaire-inspection",
      ]);
    }
  });

  it("neither route reads the request body or multipart form data", () => {
    for (const source of [listSource, detailSource]) {
      expect(source).not.toContain("request.json");
      expect(source).not.toContain("formData");
    }
  });

  it("neither route imports a store, draft, provider/AI, raw parser, pricing, sku, catalog, config, or approval module", () => {
    for (const source of [listSource, detailSource]) {
      for (const forbidden of [
        'from "@/lib/db',
        "createProjectArtifactVersion",
        "createProjectApproval",
        'from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting',
        'from "@/lib/projects/pricing"',
        'from "@/lib/projects/sku-resolution',
        'from "@/lib/projects/config-expansion',
        "approval-store",
        'from "@/lib/adapters',
        'from "@/lib/ai',
        'from "@/lib/llm',
        'from "@/lib/catalog',
        'from "@/components',
        "@anthropic-ai",
        "@google/generative-ai",
        "openai",
        "pdf-parse",
        "mammoth",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("keeps the route sources and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(listSource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(detailSource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
