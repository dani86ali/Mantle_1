import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the read-only extraction_delta inspection service so the
// routes' auth gates, tenant/param authority, body-ignoring, and result
// mapping are tested independent of the DB and the extraction-delta layers.
const { mockRequireAuth, mockLoadList, mockLoadDetail } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockLoadList: vi.fn(),
  mockLoadDetail: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-extraction-delta-inspection", () => ({
  loadRfpExtractionDeltaList: mockLoadList,
  loadRfpExtractionDeltaDetail: mockLoadDetail,
}));

import { GET as listGET } from "@/app/api/projects/[id]/rfp/extraction-delta/route";
import * as listRouteModule from "@/app/api/projects/[id]/rfp/extraction-delta/route";
import { GET as detailGET } from "@/app/api/projects/[id]/rfp/extraction-delta/[artifactId]/route";
import * as detailRouteModule from "@/app/api/projects/[id]/rfp/extraction-delta/[artifactId]/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-extraction-delta-1";
const INPUT_PACKAGE_ID = "art-input-package-3";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
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
  stageId: "intake_package_review",
  type: "extraction_delta",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: [INPUT_PACKAGE_ID],
  createdAt: "2026-06-12T12:00:00.000Z",
  updatedAt: "2026-06-12T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_extraction_delta",
  createdBy: SESSION.userId,
  createdAt: "2026-06-12T12:00:00.000Z",
  proposalSource: "ai",
  inputPackageArtifactId: INPUT_PACKAGE_ID,
  candidateCount: 1,
  evidenceReferenceCount: 1,
  pendingCount: 1,
  acceptedCount: 0,
  rejectedCount: 0,
  waivedCount: 0,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: [INPUT_PACKAGE_ID],
};

const LIST_ITEM = { ...ARTIFACT_SUMMARY, payloadSummary: PAYLOAD_SUMMARY };

const LIST_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifacts: [LIST_ITEM],
  artifactCount: 1,
};

// A candidate that carries proposedEvidence and locator-only evidence
// references, so the detail mapping is proven to pass the review read model
// through verbatim (proposedEvidence kept, raw evidence text never present).
const DELTA_DETAIL = {
  payloadKind: "rfp_extraction_delta",
  createdBy: SESSION.userId,
  createdAt: "2026-06-12T12:00:00.000Z",
  proposalSource: "ai",
  inputPackageArtifactId: INPUT_PACKAGE_ID,
  candidateCount: 1,
  evidenceReferenceCount: 1,
  pendingCount: 1,
  acceptedCount: 0,
  rejectedCount: 0,
  waivedCount: 0,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: [INPUT_PACKAGE_ID],
  candidates: [
    {
      id: "cand-1",
      kind: "requirement",
      sourceFileId: "file-rfp-1",
      title: "48-port access switches",
      description: "Provide 48-port access switches.",
      severity: "must",
      reviewStatus: "pending_review",
      confidence: 0.9,
      rationale: "Stated in section 3.2.",
      evidenceReferences: [
        {
          evidenceId: "ev-text-1",
          sourceFileId: "file-rfp-1",
          inputPackageArtifactId: INPUT_PACKAGE_ID,
          evidenceKind: "rfp_document_text_chunk",
          chunkIndex: 1,
          chunkCount: 2,
          charCount: 32,
        },
      ],
      proposedEvidence: {
        evidenceKind: "rfp_document_text_chunk",
        text: "Provide 48-port access switches.",
        sourceFileName: "file-rfp-1.pdf",
        sourceFileRole: "rfp",
        chunkIndex: 1,
        chunkCount: 2,
        charCount: 32,
      },
      reviewHistory: [],
    },
  ],
};

const DETAIL_OK = {
  status: "ok",
  project: RFP_PROJECT,
  artifact: ARTIFACT_SUMMARY,
  delta: DELTA_DETAIL,
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

describe("GET .../rfp/extraction-delta - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await listGET(request, LIST_PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadList).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET .../rfp/extraction-delta - authority", () => {
  it("passes only the session tenant and route project; the body is never read", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
    });

    const res = await listGET(request, LIST_PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockLoadList).toHaveBeenCalledTimes(1);
    const arg = mockLoadList.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(["projectId", "tenantId"]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
  });
});

describe("GET .../rfp/extraction-delta - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadList.mockResolvedValue({ status: "not_found" });

    const res = await listGET(req(), LIST_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      code: "project_not_found",
      error: "Project not found.",
    });
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadList.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await listGET(req(), LIST_PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps ok to 200 with { project, artifactCount, artifacts }, no status, and no tenant", async () => {
    const res = await listGET(req(), LIST_PARAMS);

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
    expect(json).not.toContain("storagePath");
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadList.mockRejectedValue(new Error(secret));

    const res = await listGET(req(), LIST_PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_extraction_delta_inspection_failed",
      error: "Unable to inspect extraction deltas.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("GET .../rfp/extraction-delta/[artifactId] - auth", () => {
  it("returns the requireAuth response and never calls the service or reads the body when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await detailGET(request, DETAIL_PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockLoadDetail).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });
});

describe("GET .../rfp/extraction-delta/[artifactId] - authority", () => {
  it("passes only the session tenant and route project/artifact ids; the body is never read", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
    });

    const res = await detailGET(request, DETAIL_PARAMS);

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
  });
});

describe("GET .../rfp/extraction-delta/[artifactId] - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "not_found" });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      code: "project_not_found",
      error: "Project not found.",
    });
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.error).toBe("Project is not an RFP project.");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps artifact_not_found to 404 extraction_delta_artifact_not_found", async () => {
    mockLoadDetail.mockResolvedValue({ status: "artifact_not_found" });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      code: "extraction_delta_artifact_not_found",
      error: "Extraction delta artifact not found.",
    });
  });

  it("maps artifact_not_extraction_delta to 409 with the artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "artifact_not_extraction_delta",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_extraction_delta");
    expect(body.error).toBe("Artifact is not an extraction_delta artifact.");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps invalid_payload to 409 extraction_delta_invalid_payload with the artifact summary", async () => {
    mockLoadDetail.mockResolvedValue({
      status: "invalid_payload",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("extraction_delta_invalid_payload");
    expect(body.error).toBe("Extraction delta payload is invalid.");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps ok to 200 with { project, artifact, delta }; proposedEvidence kept, tenant never", async () => {
    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      project: RFP_PROJECT,
      artifact: ARTIFACT_SUMMARY,
      delta: DELTA_DETAIL,
    });
    expect("status" in body).toBe(false);
    // The review read model keeps the candidate's proposedEvidence verbatim;
    // the route adds or strips nothing.
    expect(body.delta.candidates[0].proposedEvidence).toEqual(
      DELTA_DETAIL.candidates[0].proposedEvidence
    );
    const json = JSON.stringify(body);
    expect(json).toContain("proposedEvidence");
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain("storagePath");
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockLoadDetail.mockRejectedValue(new Error(secret));

    const res = await detailGET(req(), DETAIL_PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_extraction_delta_inspection_failed",
      error: "Unable to inspect extraction delta.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("route surface", () => {
  it("the list route exports GET only", () => {
    expect(typeof listRouteModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(
        (listRouteModule as Record<string, unknown>)[method]
      ).toBeUndefined();
    }
  });

  it("the detail route exports GET only", () => {
    expect(typeof detailRouteModule.GET).toBe("function");
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(
        (detailRouteModule as Record<string, unknown>)[method]
      ).toBeUndefined();
    }
  });
});

describe("route module purity (static source check)", () => {
  const LIST_SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/extraction-delta/route.ts"
  );
  const DETAIL_SRC_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/extraction-delta/[artifactId]/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-extraction-delta-inspection-route.test.ts"
  );
  const sources: Array<[string, string]> = [
    ["list", readFileSync(LIST_SRC_PATH, "utf8")],
    ["detail", readFileSync(DETAIL_SRC_PATH, "utf8")],
  ];

  it.each(sources)(
    "the %s route imports only Next.js server primitives, requireAuth, and the inspection service",
    (_label, source) => {
      const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
      expect(froms).toEqual([
        "next/server",
        "@/lib/middleware/auth",
        "@/lib/projects/project-rfp-extraction-delta-inspection",
      ]);
    }
  );

  it.each(sources)(
    "the %s route never reads the request body and uses no env/fetch/require",
    (_label, source) => {
      expect(source).not.toContain("request.json");
      expect(source).not.toContain("formData");
      expect(source).not.toContain("process.env");
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("require(");
    }
  );

  it.each(sources)(
    "the %s route imports no DB/store, no extraction-delta write/review/generation/candidate-drafting/executor service, and no evidence/requirements/boq/pricing/SKU/config/export/catalog/runner/AI/agent/coordinator/engine/UI/app module",
    (_label, source) => {
      // require( and fetch( use the open paren so requireAuth and request are
      // not false positives; the extraction-delta write/review/generation
      // modules use a closing quote and the candidate-drafting family uses a
      // path prefix, so the legitimately imported -inspection service passes.
      for (const forbidden of [
        "@anthropic-ai",
        "@google/generative-ai",
        'from "openai',
        'from "@/lib/db',
        "createProjectArtifactVersion",
        "createProjectApproval",
        "createProjectEvidenceItem",
        "createRfpExtractionDeltaDraft",
        "reviewRfpExtractionDeltaArtifact",
        "generateRfpExtractionDeltaDraft",
        "draftRfpExtractionDeltaCandidates",
        "getConfiguredRfpExtractionDeltaCandidateDraftingExecutor",
        'from "@/lib/projects/project-rfp-extraction-delta"',
        'from "@/lib/projects/project-rfp-extraction-delta-review"',
        'from "@/lib/projects/project-rfp-extraction-delta-generation"',
        'from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting',
        'from "@/lib/projects/project-rfp-evidence-package',
        'from "@/lib/projects/project-rfp-evidence-run"',
        'from "@/lib/projects/project-rfp-evidence-persistence"',
        'from "@/lib/projects/project-rfp-evidence-inspection"',
        'from "@/lib/projects/rfp-document-extraction"',
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
        'from "@/lib/projects/project-quick-bom',
        'from "@/lib/projects/quick-bom-runner"',
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
        'from "react"',
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  );

  it("keeps both route sources and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    for (const [, source] of sources) {
      expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    }
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
