import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the read-only inspection detail service so the route's auth
// gate, tenant/param authority, body-ignoring, and result mapping are tested
// independent of the DB and the project/artifact stores.
const { mockRequireAuth, mockLoadDetail } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadDetail: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-requirements-baseline-inspection", () => ({
  loadRfpRequirementsBaselineDetail: mockLoadDetail,
}));

import { GET } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-requirements-baseline-2";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

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
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "requirements_baseline_review",
  type: "requirements_baseline",
  status: "needs_review",
  version: 2,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: ["art-input-package-3"],
  createdAt: "2026-06-10T12:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
};

// The sanitized whitelist copy of the stored baseline payload: requirement
// text is allowed, but evidence references are locator-only (identifiers,
// counts, positions - never an evidence text body, never table rows).
const BASELINE = {
  payloadKind: "rfp_requirements_baseline",
  createdBy: SESSION.userId,
  createdAt: "2026-06-10T12:00:00.000Z",
  requirementCount: 2,
  evidenceCount: 2,
  requirements: [
    {
      id: "RFP-REQ-001",
      text: "Provide 48-port access switches.",
      category: "technical",
      priority: "mandatory",
      title: "Access switches",
      notes: "From section 3.1.",
      evidenceReferences: [
        {
          evidenceId: "evidence-text-1",
          sourceFileId: "file-rfp-1",
          inputPackageArtifactId: "art-input-package-3",
          evidenceKind: "rfp_document_text_chunk",
          chunkIndex: 1,
          chunkCount: 2,
          charCount: 32,
        },
        {
          evidenceId: "evidence-table-1",
          sourceFileId: "file-boq-1",
          inputPackageArtifactId: "art-input-package-3",
          evidenceKind: "rfp_document_table",
          tableId: "file-boq-1:table:1",
          sheetName: "BoQ Sheet",
          rowCount: 2,
          columnCount: 2,
        },
      ],
    },
    {
      id: "RFP-REQ-002",
      text: "Submit a compliance statement.",
      category: "compliance",
      priority: "unknown",
      evidenceReferences: [
        {
          evidenceId: "evidence-text-1",
          sourceFileId: "file-rfp-1",
          inputPackageArtifactId: "art-input-package-3",
          evidenceKind: "rfp_document_text_chunk",
          chunkIndex: 1,
          chunkCount: 2,
          charCount: 32,
        },
      ],
    },
  ],
};

const DETAIL_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifact: ARTIFACT_SUMMARY,
  baseline: BASELINE,
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
  mockLoadDetail.mockReset().mockResolvedValue(DETAIL_OK);
});

describe("GET .../rfp/artifacts/[artifactId]/requirements-baseline - auth", () => {
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
    expect(mockLoadDetail).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET .../requirements-baseline (detail) - authority", () => {
  it("passes only the session tenant and the route project/artifact ids; a decoy request body is never read", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      payload: { hack: true },
      requirements: [{ id: "REQ-1", text: "attacker requirement text" }],
    });

    const res = await GET(request, PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadDetail).toHaveBeenCalledTimes(1);
    const arg = mockLoadDetail.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "artifactId",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT_ID);
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("GET .../requirements-baseline (detail) - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "not_found" });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "project_not_found",
      error: "Project not found.",
    });
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadDetail.mockResolvedValue({
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

  it("maps artifact_not_found to 404 requirements_baseline_artifact_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "artifact_not_found" });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "requirements_baseline_artifact_not_found",
      error: "Requirements baseline artifact not found.",
    });
  });

  it("maps artifact_not_requirements_baseline to 409 with the lean artifact summary", async () => {
    const artifact = {
      ...ARTIFACT_SUMMARY,
      id: "art-input-package-3",
      stageId: "intake_package_review",
      type: "input_package",
      status: "approved",
    };
    mockLoadDetail.mockResolvedValue({
      status: "artifact_not_requirements_baseline",
      artifact,
    });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "artifact_not_requirements_baseline",
      error: "Artifact is not a requirements_baseline artifact.",
      artifact,
    });
  });

  it("maps invalid_payload to 409 requirements_baseline_invalid_payload with the lean artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "invalid_payload",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "requirements_baseline_invalid_payload",
      error: "Requirements baseline payload is invalid.",
      artifact: ARTIFACT_SUMMARY,
    });
  });

  it("maps ok to 200 with { project, artifact, baseline }, no status discriminator, and no tenantId/storagePath/table-rows leakage", async () => {
    const res = await GET(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifact: ARTIFACT_SUMMARY,
      baseline: BASELINE,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    // Sanitized requirement text is allowed in the detail...
    expect(json).toContain("Provide 48-port access switches.");
    // ...but tenant, storage, and raw table-row leakage never is.
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain('"rows"');
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadDetail.mockRejectedValue(new Error(secret));

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

describe("GET .../requirements-baseline (detail) - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-requirements-baseline-detail-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the read-only inspection service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-requirements-baseline-inspection",
    ]);
  });

  it("never reads the request body or multipart form data", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("does not import DB, stores, the draft or approval services, evidence, extraction, raw file loaders, parsers/OCR, pricing, SKU resolution, config expansion, export, runner, AI, catalog, intake, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      'from "@/lib/projects/project-rfp-requirements-baseline"',
      'from "@/lib/projects/project-rfp-requirements-baseline-approval"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/approvals"',
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

  it("keeps the route source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
