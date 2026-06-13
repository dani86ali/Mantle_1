import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the extraction-delta review persistence service so the route's
// auth gate, tenant/user/param authority, body sanitization, throw handling,
// and result mapping are tested independent of the DB and persisted stores.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-extraction-delta-review", () => ({
  reviewRfpExtractionDeltaArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-extraction-delta-2";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: "art-extraction-delta-3",
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "extraction_delta",
  status: "needs_review",
  version: 3,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: ["art-input-package-1", ARTIFACT_ID],
  createdAt: "2026-06-12T12:00:00.000Z",
  updatedAt: "2026-06-12T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_extraction_delta",
  createdBy: "u-drafter",
  createdAt: "2026-06-11T09:00:00.000Z",
  proposalSource: "ai",
  inputPackageArtifactId: "art-input-package-1",
  candidateCount: 3,
  evidenceReferenceCount: 5,
  reviewedBy: SESSION.userId,
  reviewedAt: "2026-06-12T12:00:00.000Z",
  reviewedDecisionCount: 2,
  pendingCount: 1,
  acceptedCount: 1,
  rejectedCount: 0,
  waivedCount: 1,
  sourceExtractionDeltaArtifactId: ARTIFACT_ID,
  sourceExtractionDeltaArtifactVersion: 2,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: ["art-input-package-1", ARTIFACT_ID],
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

function req(body: unknown = { decisions: [] }): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
  } as unknown as NextRequest;
}

function reqBadJson(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new Error("bad json"))),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockReview.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST .../extraction-delta/review - auth", () => {
  it("returns the requireAuth response and never reads the body or calls the service when unauthenticated", async () => {
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

describe("POST .../extraction-delta/review - invalid request", () => {
  it("returns 400 without calling the service when the JSON body is malformed", async () => {
    const request = reqBadJson();
    const res = await POST(request, PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_extraction_delta_review_request");
    expect(body.error).toBe("decisions must be an array.");
    expect(mockReview).not.toHaveBeenCalled();
  });

  const NON_ARRAY: Array<[string, unknown]> = [
    ["a non-object body", 42],
    ["a null body", null],
    ["an array body", [{ candidateId: "c1", action: "accept" }]],
    ["a missing decisions field", { note: "no decisions here" }],
    ["a non-array decisions field", { decisions: { candidateId: "c1" } }],
  ];

  it.each(NON_ARRAY)(
    "returns 400 without calling the service for %s",
    async (_label, body) => {
      const res = await POST(req(body), PARAMS);

      expect(res.status).toBe(400);
      const parsed = await res.json();
      expect(parsed.code).toBe("invalid_rfp_extraction_delta_review_request");
      expect(parsed.error).toBe("decisions must be an array.");
      expect(mockReview).not.toHaveBeenCalled();
    }
  );
});

describe("POST .../extraction-delta/review - authority and sanitization", () => {
  it("passes only session tenant/user and route params, never body-supplied authority fields", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      extractionDeltaArtifactId: "attacker-extraction-delta",
      reviewedBy: "attacker-user",
      decidedAt: "2000-01-01T00:00:00.000Z",
      status: "approved",
      sourceFileIds: ["attacker-file"],
      sourceArtifactIds: ["attacker-source"],
      payload: { hack: true },
      candidates: [{ id: "candidate-attacker" }],
      proposedEvidence: { evidenceId: "attacker-evidence" },
      evidence: [{ text: "attacker evidence" }],
      pricing: { listPriceUsd: 1 },
      sku: "C9300-48T",
      config: { expand: true },
      export: { format: "xlsx" },
      approval: { decision: "approved" },
      decisions: [],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).toHaveBeenCalledTimes(1);
    expect(mockReview).toHaveBeenCalledTimes(1);

    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "decisions",
      "extractionDeltaArtifactId",
      "projectId",
      "reviewedBy",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.extractionDeltaArtifactId).toBe(ARTIFACT_ID);
    expect(arg.reviewedBy).toBe(SESSION.userId);
    expect(arg.decisions).toEqual([]);

    const json = JSON.stringify(arg);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("C9300-48T");
    expect(json).not.toContain("listPriceUsd");
  });

  it("sanitizes each decision to only candidateId, action, note, and editedFields", async () => {
    const request = req({
      decisions: [
        {
          candidateId: "cand-1",
          action: "edit_accept",
          note: "looks good",
          editedFields: { title: "Edited title" },
          // decoy authority/content fields on the decision itself
          tenantId: "attacker-tenant",
          projectId: "attacker-project",
          reviewStatus: "accepted",
          reviewHistory: [{ action: "accept" }],
          proposedEvidence: { evidenceId: "attacker-evidence" },
          evidence: [{ text: "attacker" }],
          pricing: { listPriceUsd: 9 },
          sku: "C9300-24T",
          config: { expand: true },
          export: { format: "xlsx" },
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as {
      decisions: Array<Record<string, unknown>>;
    };
    expect(arg.decisions).toHaveLength(1);
    expect(Object.keys(arg.decisions[0]).sort()).toEqual([
      "action",
      "candidateId",
      "editedFields",
      "note",
    ]);
    expect(arg.decisions[0].candidateId).toBe("cand-1");
    expect(arg.decisions[0].action).toBe("edit_accept");
    expect(arg.decisions[0].note).toBe("looks good");
    expect(arg.decisions[0].editedFields).toEqual({ title: "Edited title" });

    const json = JSON.stringify(arg.decisions);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("reviewStatus");
    expect(json).not.toContain("reviewHistory");
    expect(json).not.toContain("listPriceUsd");
    expect(json).not.toContain("C9300-24T");
  });

  it("forwards editedFields whole so an in-edit proposedEvidence survives, but a top-level decision proposedEvidence is dropped", async () => {
    const editedFields = {
      title: "New title",
      proposedEvidence: {
        evidenceId: "ev-1",
        evidenceKind: "rfp_document_text_chunk",
      },
    };
    const request = req({
      decisions: [
        {
          candidateId: "cand-1",
          action: "edit_accept",
          editedFields,
          proposedEvidence: { evidenceId: "top-level-drop" },
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as {
      decisions: Array<Record<string, unknown>>;
    };
    expect(Object.keys(arg.decisions[0]).sort()).toEqual([
      "action",
      "candidateId",
      "editedFields",
    ]);
    expect(arg.decisions[0].editedFields).toEqual(editedFields);
    expect(JSON.stringify(arg.decisions)).not.toContain("top-level-drop");
  });

  it("omits a non-string note and a non-object editedFields, and drops non-string candidateId/action", async () => {
    const request = req({
      decisions: [
        { candidateId: "c1", action: "accept", note: 123, editedFields: "x" },
        { candidateId: "c2", action: "reject", note: "ok", editedFields: ["a"] },
        { candidateId: "c3", action: "waive", editedFields: null },
        { candidateId: 42, action: 7, note: "kept" },
        "not-an-object",
        null,
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as {
      decisions: Array<Record<string, unknown>>;
    };
    expect(arg.decisions.map((d) => Object.keys(d).sort())).toEqual([
      ["action", "candidateId"],
      ["action", "candidateId", "note"],
      ["action", "candidateId"],
      ["note"],
      [],
      [],
    ]);
  });
});

describe("POST .../extraction-delta/review - service validation throw", () => {
  const THROWS: string[] = [
    "decisions[0].candidateId is required.",
    "decisions[1].action must be one of accept | reject | edit_accept | waive.",
    "decisions[2] must be an object.",
  ];

  it.each(THROWS)(
    "maps a deterministic per-decision validation throw (%s) to 400 with the thrown message",
    async (message) => {
      mockReview.mockRejectedValue(new Error(message));

      const res = await POST(
        req({ decisions: [{ candidateId: "c1", action: "accept" }] }),
        PARAMS
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("invalid_rfp_extraction_delta_review_request");
      expect(body.error).toBe(message);
      expect(mockReview).toHaveBeenCalledTimes(1);
    }
  );
});

describe("POST .../extraction-delta/review - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string, string]> = [
    [{ status: "not_found" }, 404, "project_not_found", "Project not found."],
    [
      { status: "extraction_delta_not_found" },
      404,
      "extraction_delta_artifact_not_found",
      "Extraction delta artifact not found.",
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

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
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

  const ARTIFACT_CASES: Array<[string, number, string, string]> = [
    [
      "artifact_not_extraction_delta",
      409,
      "artifact_not_extraction_delta",
      "Artifact is not a reviewable extraction_delta artifact.",
    ],
    [
      "extraction_delta_not_reviewable",
      409,
      "extraction_delta_artifact_not_reviewable",
      "Extraction delta artifact is not reviewable.",
    ],
    [
      "invalid_extraction_delta_payload",
      422,
      "rfp_extraction_delta_invalid_payload",
      "Extraction delta payload is invalid.",
    ],
  ];

  it.each(ARTIFACT_CASES)(
    "maps %s to %i %s with the artifact summary",
    async (status, httpStatus, code, error) => {
      mockReview.mockResolvedValue({ status, artifact: ARTIFACT_SUMMARY });

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(httpStatus);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
      expect(body.artifact).toEqual(ARTIFACT_SUMMARY);
    }
  );

  const CANDIDATE_ID_CASES: Array<[string, number, string, string]> = [
    [
      "duplicate_decision",
      409,
      "rfp_extraction_delta_duplicate_decision",
      "Extraction delta review has a duplicate decision for a candidateId.",
    ],
    [
      "decision_target_not_found",
      409,
      "rfp_extraction_delta_decision_target_not_found",
      "Extraction delta review decision references an unknown candidateId.",
    ],
    [
      "candidate_not_pending",
      409,
      "rfp_extraction_delta_candidate_not_pending",
      "One or more extraction delta candidates are no longer pending review.",
    ],
    [
      "waiver_note_required",
      400,
      "rfp_extraction_delta_waiver_note_required",
      "A waive decision requires a nonblank note.",
    ],
  ];

  it.each(CANDIDATE_ID_CASES)(
    "maps %s to %i %s with the candidateIds",
    async (status, httpStatus, code, error) => {
      const candidateIds = ["cand-1", "cand-2"];
      mockReview.mockResolvedValue({ status, candidateIds });

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(httpStatus);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
      expect(body.candidateIds).toEqual(candidateIds);
    }
  );

  it("maps invalid_edit to 400 rfp_extraction_delta_invalid_edit with the edits", async () => {
    const edits = [
      { candidateId: "cand-1", reason: "editedFields must be an object." },
    ];
    mockReview.mockResolvedValue({ status: "invalid_edit", edits });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_delta_invalid_edit");
    expect(body.error).toBe(
      "One or more extraction delta edit decisions are invalid."
    );
    expect(body.edits).toEqual(edits);
  });

  it("maps ok to 200 with artifact and payloadSummary only", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain('"candidates"');
    expect(json).not.toContain("proposedEvidence");
  });
});

describe("POST .../extraction-delta/review - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_delta_review_failed");
    expect(body.error).toBe("Unable to review extraction delta.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../extraction-delta/review - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-extraction-delta-review-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the extraction-delta review service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-extraction-delta-review",
    ]);
  });

  it("does not import DB, stores, sibling extraction-delta drafting/types, evidence/approval/requirements/input-package services, pricing, SKU, config expansion, export, runner, AI, catalog, coordinator, engine, adapter, or UI modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/project-rfp-extraction-delta"',
      'from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting',
      'from "@/lib/projects/project-rfp-evidence-package"',
      'from "@/lib/projects/project-rfp-evidence-package-approval"',
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
