import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the evidence-package approval service so the route's
// auth-gate, body validation, tenant/user/param authority, body-ignoring, and
// result-mapping are tested independent of the DB.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-evidence-package-approval", () => ({
  reviewRfpEvidencePackageArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-evidence-package-3";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "evidence_package",
  status: "needs_review",
  version: 3,
  sourceFileIds: ["file-rfp-1", "file-rfp-2"],
  sourceArtifactIds: ["art-input-package-1", "art-extraction-delta-2"],
  createdAt: "2026-06-11T12:00:00.000Z",
  updatedAt: "2026-06-11T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_evidence_package",
  inputPackageArtifactId: "art-input-package-1",
  evidenceCount: 3,
  textChunkCount: 2,
  tableEvidenceCount: 1,
  sourceFileIds: ["file-rfp-1", "file-rfp-2"],
  sourceArtifactIds: ["art-input-package-1", "art-extraction-delta-2"],
  extractionDeltaSourceArtifactIds: ["art-extraction-delta-2"],
};

// Rejected decisions return ok WITHOUT payloadSummary (the service only
// validates and summarizes the payload for approvals); this is the default.
const OK_RESULT_NO_SUMMARY = {
  status: "ok",
  approval: { id: "appr-1", artifactId: ARTIFACT_ID, decision: "rejected" },
  artifactStatus: "rejected",
  stageStatus: "in_progress",
  artifact: ARTIFACT_SUMMARY,
};

const OK_RESULT_WITH_SUMMARY = {
  status: "ok",
  approval: { id: "appr-2", artifactId: ARTIFACT_ID, decision: "approved" },
  artifactStatus: "approved",
  stageStatus: "approved",
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

function validBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return { decision: "approved", ...overrides };
}

function req(
  body: unknown = validBody(),
  opts: { invalidJson?: boolean } = {}
): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(
      opts.invalidJson
        ? () => Promise.reject(new SyntaxError("bad json"))
        : () => Promise.resolve(body)
    ),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue(OK_RESULT_NO_SUMMARY);
});

describe("POST .../rfp/artifacts/[artifactId]/evidence-package/review - auth", () => {
  it("returns the requireAuth response and skips body parsing and the service when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(mockReview).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST .../evidence-package/review - body validation", () => {
  it("returns 400 invalid_rfp_evidence_package_review_request for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_evidence_package_review_request");
    expect(body.error).toBe("decision is required.");
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid bodies without calling the service", async () => {
    const badBodies: unknown[] = [
      null,
      "string-body",
      42,
      true,
      {},
      { note: "no decision" },
      { decision: "maybe" },
      { decision: "APPROVED" },
      { decision: true },
      { decision: null },
      [{ decision: "approved" }],
    ];
    for (const body of badBodies) {
      mockReview.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("invalid_rfp_evidence_package_review_request");
      expect(json.error).toBe("decision is required.");
      expect(mockReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST .../evidence-package/review - authority", () => {
  it("passes only session tenant/user, route params, and decision/note; decoy authority fields never reach the service", async () => {
    const body = {
      decision: "rejected",
      note: "n",
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      artifactVersion: 99,
      decidedBy: "attacker-user",
      decidedAt: "2000-01-01T00:00:00.000Z",
      status: "approved",
      sourceFileIds: ["attacker-file"],
      sourceArtifactIds: ["attacker-source-artifact"],
      inputPackageArtifactId: "attacker-input-package",
      payload: { hack: true },
      payloadSummary: { payloadKind: "rfp_evidence_package" },
      approval: { decision: "approved" },
      type: "priced_boq",
      stage: "pricing_review",
      evidence: ["ev-attacker-1"],
      evidenceIds: ["ev-attacker-2"],
      candidates: [{ id: "cand-attacker", reviewStatus: "accepted" }],
      proposedEvidence: { text: "attacker evidence" },
      pricing: { listPriceUsd: 1 },
      sku: "C9300X-12Y",
      skus: ["C9300X-12Y"],
      config: { expand: true },
      export: { format: "mantle" },
    };

    await POST(req(body), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual([
      "artifactId",
      "decidedBy",
      "decision",
      "note",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.artifactId).toBe(ARTIFACT_ID);
    expect(arg.decidedBy).toBe(SESSION.userId);
    expect(arg.decision).toBe("rejected");
    expect(arg.note).toBe("n");

    expect(arg.tenantId).not.toBe("attacker-tenant");
    expect(arg.projectId).not.toBe("attacker-project");
    expect(arg.artifactId).not.toBe("attacker-artifact");
    expect(arg.decidedBy).not.toBe("attacker-user");
    // No body-supplied authority/content field reaches the service.
    for (const leaked of [
      "artifactVersion",
      "decidedAt",
      "status",
      "sourceFileIds",
      "sourceArtifactIds",
      "inputPackageArtifactId",
      "payload",
      "payloadSummary",
      "approval",
      "type",
      "stage",
      "evidence",
      "evidenceIds",
      "candidates",
      "proposedEvidence",
      "pricing",
      "sku",
      "skus",
      "config",
      "export",
    ]) {
      expect(leaked in arg).toBe(false);
    }
  });

  it("preserves an optional string note", async () => {
    await POST(req(validBody({ note: "evidence package final" })), PARAMS);

    const arg = mockReview.mock.calls[0][0];
    expect(arg.note).toBe("evidence package final");
  });

  it("ignores a non-string note rather than rejecting the request", async () => {
    await POST(req(validBody({ note: 999 })), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect("note" in arg).toBe(false);
  });
});

describe("POST .../evidence-package/review - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string, string]> = [
    [
      { status: "not_found" },
      404,
      "project_not_found",
      "Project not found.",
    ],
    [
      { status: "artifact_not_found" },
      404,
      "evidence_package_artifact_not_found",
      "Evidence package artifact not found.",
    ],
    [
      { status: "approval_failed" },
      409,
      "evidence_package_review_failed",
      "Evidence package review could not be recorded.",
    ],
  ];

  it.each(SIMPLE)(
    "maps %o to the right HTTP status, code, and error",
    async (result, httpStatus, code, error) => {
      mockReview.mockResolvedValue(result);

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(httpStatus);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
    }
  );

  it("maps wrong_mode to 409 wrong_project_mode and includes the project summary", async () => {
    mockReview.mockResolvedValue({
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

  it("maps artifact_not_evidence_package to 409 with the artifact summary", async () => {
    const artifact = { ...ARTIFACT_SUMMARY, type: "input_package" };
    mockReview.mockResolvedValue({
      status: "artifact_not_evidence_package",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_evidence_package");
    expect(body.error).toBe(
      "Artifact is not a reviewable evidence_package artifact."
    );
    expect(body.artifact).toEqual(artifact);
  });

  it("maps artifact_not_reviewable to 409 evidence_package_artifact_not_reviewable with the artifact summary", async () => {
    const artifact = { ...ARTIFACT_SUMMARY, status: "approved" };
    mockReview.mockResolvedValue({
      status: "artifact_not_reviewable",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("evidence_package_artifact_not_reviewable");
    expect(body.error).toBe("Evidence package artifact is not reviewable.");
    expect(body.artifact).toEqual(artifact);
  });

  it("maps invalid_evidence_package_payload to 422 rfp_evidence_package_invalid_payload with the artifact summary", async () => {
    mockReview.mockResolvedValue({
      status: "invalid_evidence_package_payload",
      artifact: ARTIFACT_SUMMARY,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("rfp_evidence_package_invalid_payload");
    expect(body.error).toBe("Evidence package payload is not approvable.");
    expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
  });

  it("maps source_artifact_not_found to 409 with the missing source artifact ids", async () => {
    const missingSourceArtifactIds = ["art-missing-1", "art-missing-2"];
    mockReview.mockResolvedValue({
      status: "source_artifact_not_found",
      missingSourceArtifactIds,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("rfp_evidence_package_source_artifact_not_found");
    expect(body.error).toBe(
      "One or more evidence package source artifacts were not found."
    );
    expect(body.missingSourceArtifactIds).toEqual(missingSourceArtifactIds);
  });

  it("maps source_artifact_invalid to 409 with the offending artifact summaries", async () => {
    const artifacts = [
      {
        ...ARTIFACT_SUMMARY,
        id: "art-input-package-1",
        type: "input_package",
        status: "needs_review",
      },
    ];
    mockReview.mockResolvedValue({
      status: "source_artifact_invalid",
      artifacts,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("rfp_evidence_package_source_artifact_invalid");
    expect(body.error).toBe(
      "One or more evidence package source artifacts are invalid."
    );
    expect(body.artifacts).toEqual(artifacts);
  });

  it("maps extraction_delta_payload_invalid to 409 with the source locators", async () => {
    const sources = [
      { sourceArtifactId: "art-extraction-delta-2", sourceArtifactVersion: 1 },
    ];
    mockReview.mockResolvedValue({
      status: "extraction_delta_payload_invalid",
      sources,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_delta_payload_invalid");
    expect(body.error).toBe(
      "One or more extraction delta source payloads are invalid."
    );
    expect(body.sources).toEqual(sources);
  });

  it("maps extraction_delta_candidates_pending to 409 with the pending sources", async () => {
    const sources = [
      {
        sourceArtifactId: "art-extraction-delta-2",
        sourceArtifactVersion: 1,
        pendingCandidateIds: ["cand-1", "cand-9"],
      },
    ];
    mockReview.mockResolvedValue({
      status: "extraction_delta_candidates_pending",
      sources,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_delta_candidates_pending");
    expect(body.error).toBe(
      "One or more extraction delta candidates are still pending review."
    );
    expect(body.sources).toEqual(sources);
  });

  it("maps ok without payloadSummary to 200 with { approval, artifactStatus, stageStatus, artifact } only", async () => {
    const res = await POST(req(validBody({ decision: "rejected" })), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approval: OK_RESULT_NO_SUMMARY.approval,
      artifactStatus: OK_RESULT_NO_SUMMARY.artifactStatus,
      stageStatus: OK_RESULT_NO_SUMMARY.stageStatus,
      artifact: ARTIFACT_SUMMARY,
    });
    expect("status" in body).toBe(false);
    expect("payloadSummary" in body).toBe(false);
  });

  it("maps ok with payloadSummary to 200 and includes the payload summary", async () => {
    mockReview.mockResolvedValue(OK_RESULT_WITH_SUMMARY);

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approval: OK_RESULT_WITH_SUMMARY.approval,
      artifactStatus: OK_RESULT_WITH_SUMMARY.artifactStatus,
      stageStatus: OK_RESULT_WITH_SUMMARY.stageStatus,
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../evidence-package/review - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("evidence_package_review_failed");
    expect(body.error).toBe("Unable to review evidence package.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../evidence-package/review - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-evidence-package-approval-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the evidence-package approval service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-evidence-package-approval",
    ]);
  });

  it("does not import DB, stores, the evidence-package draft service, extraction delta services, evidence run/persistence/inspection, requirements, raw file loaders, pricing, SKU resolution, config expansion, export, runner, AI, catalog, coordinator, engine, adapter, or UI modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      // The draft service module is the exact-quoted prefix of the allowed
      // approval module - the closing quote keeps the allowed import legal.
      'from "@/lib/projects/project-rfp-evidence-package"',
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
