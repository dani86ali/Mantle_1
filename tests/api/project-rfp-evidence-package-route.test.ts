import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the evidence-package draft service so the route's auth gate,
// tenant/user/param authority, body-ignoring, and result mapping are tested
// independent of the DB and persisted evidence stores.
const { mockRequireAuth, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-evidence-package", () => ({
  createRfpEvidencePackageDraft: mockCreateDraft,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-input-package-3";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: "art-evidence-package-1",
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "evidence_package",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: [ARTIFACT_ID],
  createdAt: "2026-06-12T12:00:00.000Z",
  updatedAt: "2026-06-12T12:00:00.000Z",
};

const INPUT_PACKAGE_ARTIFACT = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "input_package",
  status: "approved",
  version: 3,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: [],
  createdAt: "2026-06-11T12:00:00.000Z",
  updatedAt: "2026-06-11T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_evidence_package",
  createdBy: SESSION.userId,
  createdAt: "2026-06-12T12:00:00.000Z",
  inputPackageArtifactId: ARTIFACT_ID,
  evidenceCount: 3,
  textChunkCount: 2,
  tableEvidenceCount: 1,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: [ARTIFACT_ID],
};

const OK_RESULT = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
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

function req(body: unknown = { decoy: true }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(null)),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreateDraft.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST .../rfp/artifacts/[artifactId]/evidence-package - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
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
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("POST .../evidence-package - authority", () => {
  it("passes only session tenant/user and route params; the body is never read and decoy fields never reach the service", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      inputPackageArtifactId: "attacker-package",
      createdBy: "attacker-user",
      status: "approved",
      sourceFileIds: ["attacker-file"],
      sourceArtifactIds: ["attacker-source"],
      payload: { hack: true },
      evidence: [{ text: "attacker evidence", rows: [["sku", "qty"]] }],
      candidates: [{ id: "candidate-attacker" }],
      pricing: { listPriceUsd: 1 },
      sku: "C9300-48T",
      config: { expand: true },
      export: { format: "xlsx" },
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "createdBy",
      "inputPackageArtifactId",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.inputPackageArtifactId).toBe(ARTIFACT_ID);
    expect(arg.createdBy).toBe(SESSION.userId);

    const json = JSON.stringify(arg);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("C9300-48T");
  });
});

describe("POST .../evidence-package - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string, string]> = [
    [{ status: "not_found" }, 404, "project_not_found", "Project not found."],
    [
      { status: "input_package_not_found" },
      404,
      "input_package_artifact_not_found",
      "Input package artifact not found.",
    ],
  ];

  it.each(SIMPLE)(
    "maps %o to the right HTTP status, code, and error",
    async (result, httpStatus, code, error) => {
      mockCreateDraft.mockResolvedValue(result);

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(httpStatus);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
    }
  );

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  const ARTIFACT_CASES: Array<[string, string, string]> = [
    [
      "artifact_not_input_package",
      "artifact_not_input_package",
      "Artifact is not an approved input_package artifact.",
    ],
    [
      "input_package_not_approved",
      "input_package_not_approved",
      "Input package artifact is not approved.",
    ],
    [
      "input_package_has_no_source_files",
      "input_package_has_no_source_files",
      "Input package has no source files.",
    ],
  ];

  it.each(ARTIFACT_CASES)(
    "maps %s to 409 %s with the artifact summary",
    async (status, code, error) => {
      mockCreateDraft.mockResolvedValue({
        status,
        artifact: INPUT_PACKAGE_ARTIFACT,
      });

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
      expect(body.artifact).toEqual(INPUT_PACKAGE_ARTIFACT);
    }
  );

  it("maps extraction_evidence_not_found to 409 with the input package artifact id", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "extraction_evidence_not_found",
      inputPackageArtifactId: ARTIFACT_ID,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_evidence_not_found");
    expect(body.error).toBe(
      "No persisted RFP extraction evidence was found for this input package."
    );
    expect(body.inputPackageArtifactId).toBe(ARTIFACT_ID);
  });

  it("maps source_file_evidence_missing to 422 with the missing source file ids", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "source_file_evidence_missing",
      missingSourceFileIds: ["file-sow-1", "file-rfp-9"],
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("rfp_evidence_package_source_file_evidence_missing");
    expect(body.error).toBe(
      "One or more package source files have no extraction evidence."
    );
    expect(body.missingSourceFileIds).toEqual(["file-sow-1", "file-rfp-9"]);
  });

  it("maps ok to 201 with artifact and payloadSummary only", async () => {
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
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain('"evidence"');
    expect(json).not.toContain('"text"');
    expect(json).not.toContain('"rows"');
  });
});

describe("POST .../evidence-package - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_evidence_package_failed");
    expect(body.error).toBe("Unable to create RFP evidence package draft.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../evidence-package - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-evidence-package-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the evidence-package draft service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-evidence-package",
    ]);
  });

  it("never reads the request body", () => {
    expect(source).not.toContain("request.json");
    expect(source).not.toContain("formData");
  });

  it("does not import DB, stores, approval/review services, extraction delta services, evidence run/persistence/inspection, requirements, raw file loaders, pricing, SKU resolution, config expansion, export, runner, AI, catalog, coordinator, engine, adapter, or UI modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/project-rfp-evidence-package-approval"',
      'from "@/lib/projects/project-rfp-extraction-delta',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/project-rfp-requirements',
      'from "@/lib/projects/project-rfp-upload"',
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
      'from "@/lib/projects/project-quick-bom',
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
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
