import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth, the read-only list inspection service, and the create-draft service
// so the route's auth gate, body handling on both GET and POST, tenant/user/param
// authority, and result mapping are tested independent of the DB and stores.
const { mockRequireAuth, mockLoadList, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-document-model-inspection", () => ({
  loadRfpHldDocumentModelList: mockLoadList,
}));
vi.mock("@/lib/projects/project-rfp-hld-document-model-draft", () => ({
  createRfpHldDocumentModelDraft: mockCreateDraft,
}));

import { GET, POST } from "@/app/api/projects/[id]/rfp/hld-document-model/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-document-model/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-docmodel-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "33333333-3333-3333-3333-333333333333",
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

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_document_model",
  title: "HLD Document Model",
  coveredDomainCount: 1,
  excludedDomainCount: 1,
  assumptionCount: 2,
  designSummaryCount: 2,
  topologySummaryCount: 1,
  siteOrScopeSummaryCount: 1,
  implementationNoteCount: 1,
  dependencyCount: 0,
  riskCount: 1,
  complianceTraceCount: 2,
  boqTraceCount: 1,
  diagramReferenceCount: 1,
  validationFindingCount: 1,
  sourceHldSourceBundleArtifactId: "bundle-1",
  sourceHldDesignModelArtifactId: "model-1",
  sourceHldDiagramArtifactId: "diagram-1",
  sourceModelVersion: 1,
  sourceDiagramVersion: 1,
};

const ARTIFACT_SUMMARY = {
  id: "art-docmodel-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_document_model",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: ["bundle-1", "model-1", "diagram-1"],
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const LIST_ITEM = {
  id: ARTIFACT_SUMMARY.id,
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_document_model",
  status: "needs_review",
  version: 1,
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
  payloadSummary: PAYLOAD_SUMMARY,
};

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifacts: [LIST_ITEM],
  artifactCount: 1,
};

const CREATE_OK = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: PAYLOAD_SUMMARY,
};

// The route reads the raw body via request.text() and parses it itself. The json
// mock is wired to reject so any accidental request.json() call would fail loudly.
function reqText(text: string): NextRequest {
  return {
    headers: { get: () => null },
    text: vi.fn(() => Promise.resolve(text)),
    json: vi.fn(() =>
      Promise.reject(new Error("route must not call request.json"))
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

function req(body: unknown = {}): NextRequest {
  return reqText(JSON.stringify(body));
}

function reqUnreadable(): NextRequest {
  return {
    headers: { get: () => null },
    text: vi.fn(() =>
      Promise.reject(new TypeError("body stream already read"))
    ),
    json: vi.fn(() =>
      Promise.reject(new Error("route must not call request.json"))
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockLoadList.mockReset().mockResolvedValue(LIST_OK);
  mockCreateDraft.mockReset().mockResolvedValue(CREATE_OK);
});

describe("GET /api/projects/[id]/rfp/hld-document-model - auth", () => {
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
    expect(request.text).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/[id]/rfp/hld-document-model - authority", () => {
  it("passes only session tenant and the route project id; a decoy body is never read", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
    });

    const res = await GET(request, PARAMS);

    expect(res.status).toBe(200);
    expect(request.text).not.toHaveBeenCalled();
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

describe("GET /api/projects/[id]/rfp/hld-document-model - result mapping", () => {
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

  it("maps ok to 200 with { project, artifactCount, artifacts }, no status discriminator, and no tenantId leakage", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifactCount: 1,
      artifacts: [LIST_ITEM],
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_document_model_inspection_failed");
    expect(body.error).toBe("Unable to inspect HLD document models.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST /api/projects/[id]/rfp/hld-document-model - auth", () => {
  it("returns the requireAuth response and skips the service and body when unauthenticated", async () => {
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
    expect(request.text).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects/[id]/rfp/hld-document-model - body acceptance", () => {
  it("accepts the empty JSON object {} and calls the service with only session authority", async () => {
    const request = reqText("{}");

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.formData).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "createdBy",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.createdBy).toBe(SESSION.userId);
  });

  it("accepts an absent/empty body and calls the service with only session authority", async () => {
    const request = reqText("");

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "createdBy",
      "projectId",
      "tenantId",
    ]);
  });

  it("accepts a whitespace-only body", async () => {
    const res = await POST(reqText("  \n\t  "), PARAMS);

    expect(res.status).toBe(201);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
  });

  it("accepts a body whose stream cannot be read and still calls the service", async () => {
    const res = await POST(reqUnreadable(), PARAMS);

    expect(res.status).toBe(201);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "createdBy",
      "projectId",
      "tenantId",
    ]);
  });

  it("rejects a non-empty malformed JSON body with 400 before the service is called", async () => {
    const res = await POST(reqText('{"unterminated":'), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_document_model_request");
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("rejects a non-empty object body (no client field carries authority) with 400 before the service is called", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      createdBy: "attacker-user",
      status: "approved",
      authority: "client",
      pricing: { unitPrice: 1 },
      price: 999,
      sku: "ATTACKER-SKU",
      catalog: "cisco",
      config: { expand: true },
      payload: { hack: true },
      sourceArtifactIds: ["fake-art"],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_document_model_request");
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("rejects null, arrays, strings, numbers, and booleans with 400 and never calls the service", async () => {
    for (const body of [null, [], ["x"], "draft", 7, 0, true, false]) {
      mockCreateDraft.mockClear();
      const res = await POST(req(body), PARAMS);

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe(
        "invalid_rfp_hld_document_model_request"
      );
      expect(mockCreateDraft).not.toHaveBeenCalled();
    }
  });
});

describe("POST /api/projects/[id]/rfp/hld-document-model - result mapping", () => {
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

  it("maps readiness_blocked to 409 hld_document_model_not_ready with nextAction", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "readiness_blocked",
      readinessStatus: "blocked",
      nextAction: "Approve the HLD design model and diagram first.",
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_document_model_not_ready");
    expect(body.nextAction).toBe(
      "Approve the HLD design model and diagram first."
    );
    expect("readinessStatus" in body).toBe(false);
  });

  it("maps precondition_failed to 409 hld_document_model_precondition_failed with blockerCode", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "precondition_failed",
      code: "approved_diagram_unavailable",
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_document_model_precondition_failed");
    expect(body.blockerCode).toBe("approved_diagram_unavailable");
  });

  it("maps invalid_payload to 409 hld_document_model_payload_invalid with errors", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "invalid_payload",
      errors: ["payload: blank title"],
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("hld_document_model_payload_invalid");
    expect(body.errors).toEqual(["payload: blank title"]);
  });

  it("maps ok to 201 with { artifact, payloadSummary }, no status discriminator, and no tenantId leakage", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_document_model_failed");
    expect(body.error).toBe("Unable to draft RFP HLD document model.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("/api/projects/[id]/rfp/hld-document-model - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/hld-document-model/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-document-model-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  // Source with comments and the ES module `export` keyword removed, so the
  // forbidden-behavior scans match real executable code only.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\bexport\b/g, "");

  it("imports only Next.js server primitives, requireAuth, and the document-model services", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-document-model-inspection",
      "@/lib/projects/project-rfp-hld-document-model-draft",
    ]);
  });

  it("never reads multipart form data and only the POST handler parses JSON", () => {
    expect(source).not.toContain("formData");
    // GET must not parse a body; request.json appears only inside POST.
    const getBody = source.slice(
      source.indexOf("export async function GET"),
      source.indexOf("export async function POST")
    );
    expect(getBody).not.toContain("request.json");
  });

  it("touches no store directly and reads no file/evidence/pricing/sku/config/catalog/AI modules", () => {
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

  it("carries no final-output / approval behavior in executable code", () => {
    for (const forbidden of [
      "createProjectApproval",
      "approval-store",
      "/review",
      "download",
      "upload",
      "render",
      "final",
      "<html",
      "<svg",
      "<mxfile",
      "<?xml",
      "mermaid",
      "Mermaid",
      "draw.io",
      "technical proposal",
      "proposal",
      "export package",
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it("uses no output-stage terms in comments or string literals (the export keyword aside)", () => {
    const noExport = source.replace(/\bexport\b/g, "");
    const lower = noExport.toLowerCase();
    for (const term of [
      "final",
      "render",
      "rendered",
      "download",
      "upload",
      "proposal",
      "technical proposal",
      "customer deliverable",
      "<html",
      "<svg",
      "<mxfile",
      "mermaid",
      "draw.io",
      "export package",
      ".pdf",
      ".docx",
    ]) {
      expect(lower).not.toContain(term.toLowerCase());
    }
  });

  it("uses the concrete payload kind string in fixtures", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(testSource).toContain("rfp_hld_document_model");
  });

  it("keeps the route source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
