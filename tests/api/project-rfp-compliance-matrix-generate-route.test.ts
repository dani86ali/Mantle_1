import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockRequireAuth, mockGetExecutor, mockGenerate } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetExecutor: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-compliance-matrix-drafting-executor", () => ({
  getConfiguredRfpComplianceMatrixDraftingExecutor: mockGetExecutor,
}));
vi.mock("@/lib/projects/project-rfp-compliance-matrix-generation", () => ({
  generateRfpComplianceMatrixDraft: mockGenerate,
}));

import {
  POST,
} from "@/app/api/projects/[id]/rfp/compliance-matrix/generate/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/compliance-matrix/generate/route";
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
const BASELINE = "art-requirements-baseline-1";
const EVIDENCE_PACKAGE = "art-evidence-package-1";
const CONFIG = "art-config-expansion-1";
const EXECUTOR = vi.fn(() => Promise.resolve({ rows: [] }));

const VALID_BODY = {
  requirementsBaselineArtifactId: BASELINE,
  evidencePackageArtifactId: EVIDENCE_PACKAGE,
  configurationExpansionArtifactId: CONFIG,
};

const ARTIFACT = {
  id: "art-compliance-matrix-1",
  projectId: PROJECT,
  stageId: "compliance_matrix_review",
  type: "compliance_matrix",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG],
  createdAt: "2026-06-10T12:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_compliance_matrix",
  sourceRequirementsBaselineArtifactId: BASELINE,
  sourceEvidencePackageArtifactId: EVIDENCE_PACKAGE,
  sourceConfigurationExpansionArtifactId: CONFIG,
  createdBy: SESSION.userId,
  createdAt: "2026-06-10T12:00:00.000Z",
  rowCount: 2,
  rowIds: ["RFP-COMP-001", "RFP-COMP-002"],
  requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG],
  statusCounts: {
    compliant: 0,
    partially_compliant: 0,
    non_compliant: 0,
    not_applicable: 0,
    needs_review: 2,
  },
};

const GENERATION_OK = {
  status: "ok",
  requirementsBaselineArtifactId: BASELINE,
  evidencePackageArtifactId: EVIDENCE_PACKAGE,
  configurationExpansionArtifactId: CONFIG,
  rowCount: 2,
  requirementCount: 2,
  evidenceCount: 3,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG],
  artifact: ARTIFACT,
  payloadSummary: PAYLOAD_SUMMARY,
};

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

const GATE_ARTIFACT = {
  id: BASELINE,
  projectId: PROJECT,
  stageId: "requirements_baseline_review",
  type: "requirements_baseline",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1"],
  sourceArtifactIds: ["art-evidence-package-1"],
  createdAt: "2026-06-10T12:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
};

function req(body: unknown = VALID_BODY): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

function brokenReq(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new SyntaxError("bad json"))),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

function draftingBlocked(drafting: Record<string, unknown>) {
  return { status: "blocked", phase: "compliance_drafting", drafting };
}

function creationBlocked(creation: Record<string, unknown>) {
  return { status: "blocked", phase: "compliance_matrix_creation", creation };
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockGetExecutor.mockReset().mockReturnValue(EXECUTOR);
  mockGenerate.mockReset().mockResolvedValue(GENERATION_OK);
  EXECUTOR.mockClear();
});

describe("POST .../rfp/compliance-matrix/generate - auth", () => {
  it("returns requireAuth response and reads nothing when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);
    const request = req();

    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockGetExecutor).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/compliance-matrix/generate - body and authority", () => {
  it("passes only session authority, route project, source artifact ids, and executor", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      requestedBy: "attacker-user",
      createdBy: "attacker-user",
      status: "approved",
      artifact: { id: "attacker-artifact" },
      rows: [{ response: "raw compliance row" }],
      evidenceReferences: [{ text: "raw evidence body" }],
      sourceFileIds: ["attacker-file"],
      sourceArtifactIds: ["attacker-artifact"],
      unitPrice: 1,
      sku: "C9300-48T",
      catalogLookup: {},
      requirementsBaselineArtifactId: BASELINE,
      evidencePackageArtifactId: EVIDENCE_PACKAGE,
      configurationExpansionArtifactId: CONFIG,
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).toHaveBeenCalledTimes(1);
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockGetExecutor).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGetExecutor.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerate.mock.invocationCallOrder[0]
    );

    const arg = mockGenerate.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "configurationExpansionArtifactId",
      "evidencePackageArtifactId",
      "executor",
      "projectId",
      "requestedBy",
      "requirementsBaselineArtifactId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.requestedBy).toBe(SESSION.userId);
    expect(arg.requirementsBaselineArtifactId).toBe(BASELINE);
    expect(arg.evidencePackageArtifactId).toBe(EVIDENCE_PACKAGE);
    expect(arg.configurationExpansionArtifactId).toBe(CONFIG);
    expect(arg.executor).toBe(EXECUTOR);
    expect(EXECUTOR).not.toHaveBeenCalled();

    const serialized = JSON.stringify(arg);
    expect(serialized).not.toContain("attacker");
    expect(serialized).not.toContain("raw compliance row");
    expect(serialized).not.toContain("raw evidence body");
    expect(serialized).not.toContain("unitPrice");
    expect(serialized).not.toContain("C9300-48T");
  });

  it("omits configurationExpansionArtifactId when not supplied", async () => {
    const res = await POST(
      req({
        requirementsBaselineArtifactId: BASELINE,
        evidencePackageArtifactId: EVIDENCE_PACKAGE,
      }),
      PARAMS
    );

    expect(res.status).toBe(201);
    const arg = mockGenerate.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty("configurationExpansionArtifactId");
  });
});

describe("POST .../rfp/compliance-matrix/generate - malformed body", () => {
  it("rejects unparseable JSON", async () => {
    const res = await POST(brokenReq(), PARAMS);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "invalid_rfp_compliance_matrix_generation_request",
      error:
        "requirementsBaselineArtifactId and evidencePackageArtifactId must be nonblank strings; configurationExpansionArtifactId is optional but must be nonblank when supplied.",
    });
    expect(mockGetExecutor).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["array", []],
    ["missing baseline", { evidencePackageArtifactId: EVIDENCE_PACKAGE }],
    ["missing package", { requirementsBaselineArtifactId: BASELINE }],
    ["blank baseline", { ...VALID_BODY, requirementsBaselineArtifactId: "   " }],
    ["blank package", { ...VALID_BODY, evidencePackageArtifactId: "" }],
    ["blank config", { ...VALID_BODY, configurationExpansionArtifactId: " " }],
    ["non-string baseline", { ...VALID_BODY, requirementsBaselineArtifactId: 42 }],
    ["non-string package", { ...VALID_BODY, evidencePackageArtifactId: {} }],
    ["non-string config", { ...VALID_BODY, configurationExpansionArtifactId: [] }],
  ])("rejects %s", async (_label, body) => {
    const res = await POST(req(body), PARAMS);

    expect(res.status).toBe(400);
    expect(mockGetExecutor).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/compliance-matrix/generate - executor availability", () => {
  it("maps null configured executor to 503 before generation", async () => {
    mockGetExecutor.mockReturnValue(null);

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: "rfp_compliance_matrix_drafting_unavailable",
      error:
        "No compliance matrix drafting executor is configured; compliance matrix generation is unavailable.",
    });
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/compliance-matrix/generate - ok mapping", () => {
  it("maps ok to 201 without rows, tenantId, or status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT,
      payloadSummary: PAYLOAD_SUMMARY,
      draftSummary: {
        rowCount: 2,
        requirementCount: 2,
        evidenceCount: 3,
        requirementsBaselineArtifactId: BASELINE,
        evidencePackageArtifactId: EVIDENCE_PACKAGE,
        configurationExpansionArtifactId: CONFIG,
        sourceFileIds: ["file-rfp-1", "file-boq-1"],
        sourceArtifactIds: [BASELINE, EVIDENCE_PACKAGE, CONFIG],
      },
    });
    expect("status" in body).toBe(false);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("tenantId");
    expect(serialized).not.toContain(SESSION.tenantId);
    expect(serialized).not.toContain('"rows"');
    expect(serialized).not.toContain("raw evidence body");
  });
});

describe("POST .../rfp/compliance-matrix/generate - blocked mapping", () => {
  it.each([
    [
      draftingBlocked({ status: "not_found" }),
      404,
      { code: "project_not_found", error: "Project not found." },
    ],
    [
      draftingBlocked({ status: "wrong_mode", project: WRONG_MODE_PROJECT }),
      409,
      {
        code: "wrong_project_mode",
        error: "Project is not an RFP project.",
        project: WRONG_MODE_PROJECT,
      },
    ],
    [
      draftingBlocked({ status: "requirements_baseline_not_found" }),
      409,
      {
        code: "rfp_compliance_matrix_requirements_baseline_not_found",
        error: "The cited requirements baseline artifact was not found.",
      },
    ],
    [
      draftingBlocked({
        status: "requirements_baseline_not_approved",
        artifact: GATE_ARTIFACT,
      }),
      409,
      {
        code: "rfp_compliance_matrix_requirements_baseline_not_approved",
        error: "The cited requirements baseline artifact is not approved.",
        artifact: GATE_ARTIFACT,
      },
    ],
    [
      draftingBlocked({ status: "evidence_package_not_found" }),
      409,
      {
        code: "rfp_compliance_matrix_evidence_package_not_found",
        error: "The cited evidence package artifact was not found.",
      },
    ],
    [
      draftingBlocked({ status: "configuration_expansion_not_found" }),
      409,
      {
        code: "rfp_compliance_matrix_configuration_expansion_not_found",
        error: "The cited configuration expansion artifact was not found.",
      },
    ],
    [
      draftingBlocked({
        status: "drafting_failed",
        error: "compliance_matrix_drafting_failed",
      }),
      502,
      {
        code: "rfp_compliance_matrix_drafting_failed",
        error: "Compliance matrix drafting failed.",
      },
    ],
    [
      draftingBlocked({
        status: "invalid_draft_output",
        errors: ["rows[0].response is required."],
      }),
      502,
      {
        code: "rfp_compliance_matrix_drafting_invalid_output",
        error: "Compliance matrix drafting returned invalid row output.",
        errors: ["rows[0].response is required."],
      },
    ],
    [
      creationBlocked({
        status: "invalid_compliance_matrix_rows",
        errors: ["rows[0].response is required."],
      }),
      502,
      {
        code: "rfp_compliance_matrix_invalid_draft_rows",
        error: "Compliance matrix draft rows failed creation validation.",
        errors: ["rows[0].response is required."],
      },
    ],
  ])("maps block %#", async (result, expectedStatus, expectedBody) => {
    mockGenerate.mockResolvedValue(result);

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(expectedStatus);
    expect(await res.json()).toEqual(expectedBody);
  });
});

describe("POST .../rfp/compliance-matrix/generate - unexpected failure", () => {
  it("maps orchestrator throw to controlled 500 without leaking detail", async () => {
    mockGenerate.mockRejectedValue(new Error("secret-stack-detail"));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_compliance_matrix_generation_failed",
      error: "Unable to generate RFP compliance matrix draft.",
    });
    expect(JSON.stringify(body)).not.toContain("secret-stack-detail");
  });
});

describe(".../rfp/compliance-matrix/generate - route surface", () => {
  it("exports POST only", () => {
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["GET", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("configured compliance executor factory (real module)", () => {
  it("returns null until a live provider adapter is explicitly approved", async () => {
    const factory = await vi.importActual<{
      getConfiguredRfpComplianceMatrixDraftingExecutor: () => unknown;
    }>("@/lib/projects/project-rfp-compliance-matrix-drafting-executor");

    expect(factory.getConfiguredRfpComplianceMatrixDraftingExecutor()).toBeNull();
  });
});

describe("route and factory module purity (static source check)", () => {
  const ROUTE_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/compliance-matrix/generate/route.ts"
  );
  const FACTORY_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-drafting-executor.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-compliance-matrix-generate-route.test.ts"
  );
  const routeSource = readFileSync(ROUTE_PATH, "utf8");
  const factorySource = readFileSync(FACTORY_PATH, "utf8");

  it("route imports only Next.js server primitives, requireAuth, the generation orchestrator, and the null executor factory", () => {
    const froms = Array.from(
      routeSource.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-compliance-matrix-generation",
      "@/lib/projects/project-rfp-compliance-matrix-drafting-executor",
    ]);
  });

  it("factory imports only the compliance drafting executor type and no provider module", () => {
    const froms = Array.from(
      factorySource.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-compliance-matrix-drafting",
    ]);
    expect(factorySource).not.toContain("process.env");
  });

  it("route/factory import no DB, stores, approval, evidence, raw files, pricing, SKU, catalog, config decision, export, AI, provider, engine, or UI modules", () => {
    const combined = `${routeSource}\n${factorySource}`;
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/project-rfp-compliance-matrix-draft"',
      'from "@/lib/projects/project-rfp-evidence',
      'from "@/lib/projects/project-rfp-extraction',
      'from "@/lib/projects/boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/catalog',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/mantle',
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
      'from "@/app/',
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      "generateText",
      "generateObject",
      "fetch(",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it("route never reads multipart form data", () => {
    expect(routeSource).not.toContain("formData");
  });

  it("keeps route, factory, and test sources ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(routeSource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(factorySource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
