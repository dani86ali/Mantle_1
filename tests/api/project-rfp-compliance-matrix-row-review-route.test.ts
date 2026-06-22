import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the compliance-matrix row-review persistence service so the
// route's auth gate, tenant/user/param authority, body sanitization, throw
// handling, and result mapping are tested independent of the DB and stores.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-compliance-matrix-row-review", () => ({
  reviewRfpComplianceMatrixRows: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/rows/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/rows/review/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const ARTIFACT_ID = "art-compliance-matrix-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};

const PARAMS = { params: { id: PROJECT, artifactId: ARTIFACT_ID } };

const ARTIFACT_SUMMARY = {
  id: "art-compliance-matrix-2",
  projectId: PROJECT,
  stageId: "compliance_matrix_review",
  type: "compliance_matrix",
  status: "needs_review",
  version: 3,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [
    "art-requirements-baseline-1",
    "art-evidence-package-1",
    ARTIFACT_ID,
  ],
  createdAt: "2026-06-14T09:05:00.000Z",
  updatedAt: "2026-06-14T09:05:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_compliance_matrix",
  sourceRequirementsBaselineArtifactId: "art-requirements-baseline-1",
  sourceEvidencePackageArtifactId: "art-evidence-package-1",
  sourceConfigurationExpansionArtifactId: "art-config-expansion-1",
  createdBy: "u-drafter",
  createdAt: "2026-06-10T09:30:00.000Z",
  rowCount: 3,
  rowIds: ["RFP-COMP-001", "RFP-COMP-002", "RFP-COMP-003"],
  requirementIds: ["RFP-REQ-001", "RFP-REQ-002", "RFP-REQ-003"],
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: [
    "art-requirements-baseline-1",
    "art-evidence-package-1",
    ARTIFACT_ID,
  ],
  statusCounts: {
    compliant: 1,
    partially_compliant: 0,
    non_compliant: 0,
    not_applicable: 1,
    needs_review: 1,
  },
  reviewedBy: SESSION.userId,
  reviewedAt: "2026-06-14T09:00:00.000Z",
  reviewedDecisionCount: 2,
  activeRowCount: 3,
  removedRowCount: 0,
  sourceComplianceMatrixArtifactId: ARTIFACT_ID,
  sourceComplianceMatrixArtifactVersion: 2,
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

function validDecisions(): unknown[] {
  return [
    {
      rowId: "RFP-COMP-001",
      action: "edit",
      editedFields: { response: "Updated response." },
    },
  ];
}

function req(body: unknown = { decisions: validDecisions() }): NextRequest {
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

describe("POST .../compliance-matrix/rows/review - auth", () => {
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

describe("POST .../compliance-matrix/rows/review - invalid request", () => {
  it("returns 400 without calling the service when the JSON body is malformed", async () => {
    const res = await POST(reqBadJson(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_compliance_matrix_row_review_request");
    expect(body.error).toBe("decisions must be a nonempty array.");
    expect(mockReview).not.toHaveBeenCalled();
  });

  const INVALID: Array<[string, unknown]> = [
    ["a non-object body", 42],
    ["a null body", null],
    ["an array body", [{ rowId: "RFP-COMP-001", action: "edit" }]],
    ["a missing decisions field", { note: "no decisions here" }],
    ["a non-array decisions field", { decisions: { rowId: "RFP-COMP-001" } }],
    ["an empty decisions array", { decisions: [] }],
  ];

  it.each(INVALID)(
    "returns 400 without calling the service for %s",
    async (_label, body) => {
      const res = await POST(req(body), PARAMS);

      expect(res.status).toBe(400);
      const parsed = await res.json();
      expect(parsed.code).toBe(
        "invalid_rfp_compliance_matrix_row_review_request"
      );
      expect(parsed.error).toBe("decisions must be a nonempty array.");
      expect(mockReview).not.toHaveBeenCalled();
    }
  );
});

describe("POST .../compliance-matrix/rows/review - authority and sanitization", () => {
  it("passes only session tenant/user and route params, never body-supplied authority fields", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      complianceMatrixArtifactId: "attacker-compliance-matrix",
      reviewedBy: "attacker-user",
      reviewedAt: "2000-01-01T00:00:00.000Z",
      status: "approved",
      sourceFileIds: ["attacker-file"],
      sourceArtifactIds: ["attacker-source"],
      payload: { hack: true },
      rows: [{ id: "row-attacker" }],
      approval: { decision: "approved" },
      pricing: { listPriceUsd: 1 },
      sku: "C9300-48T",
      catalog: { lookup: true },
      config: { expand: true },
      export: { format: "xlsx" },
      decisions: validDecisions(),
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(200);
    expect(request.json).toHaveBeenCalledTimes(1);
    expect(mockReview).toHaveBeenCalledTimes(1);

    const arg = mockReview.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "complianceMatrixArtifactId",
      "decisions",
      "projectId",
      "reviewedBy",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.complianceMatrixArtifactId).toBe(ARTIFACT_ID);
    expect(arg.reviewedBy).toBe(SESSION.userId);
    // reviewedAt is never read from the body; the service defaults it.
    expect("reviewedAt" in arg).toBe(false);

    const json = JSON.stringify(arg);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("C9300-48T");
    expect(json).not.toContain("listPriceUsd");
  });

  it("sanitizes each decision to only rowId, action, reason, note, and editedFields", async () => {
    const request = req({
      decisions: [
        {
          rowId: "RFP-COMP-001",
          action: "edit",
          reason: "tightened",
          note: "looks good",
          editedFields: { response: "Edited response." },
          // decoy authority/content fields on the decision itself
          tenantId: "attacker-tenant",
          projectId: "attacker-project",
          id: "row-attacker",
          requirementId: "REQ-attacker",
          rowReviewStatus: "removed",
          notApplicableReason: "attacker",
          removedReason: "attacker",
          reviewHistory: [{ action: "removed" }],
          evidenceReferences: [{ evidenceId: "ev-attacker" }],
          configurationReferences: [{ lineId: "cfg-attacker" }],
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
      "editedFields",
      "note",
      "reason",
      "rowId",
    ]);
    expect(arg.decisions[0].rowId).toBe("RFP-COMP-001");
    expect(arg.decisions[0].action).toBe("edit");
    expect(arg.decisions[0].reason).toBe("tightened");
    expect(arg.decisions[0].note).toBe("looks good");
    expect(arg.decisions[0].editedFields).toEqual({
      response: "Edited response.",
    });

    const json = JSON.stringify(arg.decisions);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("rowReviewStatus");
    expect(json).not.toContain("reviewHistory");
    expect(json).not.toContain("evidenceReferences");
    expect(json).not.toContain("listPriceUsd");
    expect(json).not.toContain("C9300-24T");
  });

  it("narrows editedFields to the editable whitelist and drops forbidden edit keys", async () => {
    const request = req({
      decisions: [
        {
          rowId: "RFP-COMP-001",
          action: "edit",
          editedFields: {
            response: "Compliant.",
            rationale: "Datasheet confirms.",
            notes: "Reviewed.",
            complianceStatus: "compliant",
            sectionReference: "RFP-3.2.1",
            responseLane: "technical",
            ownerLane: "security",
            hldImpact: "required",
            tpImpact: "potential",
            boqConfigImpact: "owner_review_required",
            requiresOwnerReview: true,
            // forbidden editedFields keys
            id: "HACK-ID",
            requirementId: "HACK-REQ",
            rowReviewStatus: "removed",
            notApplicableReason: "HACK",
            removedReason: "HACK",
            reviewHistory: [{ action: "removed" }],
            evidenceReferences: [{ evidenceId: "HACK-EV" }],
            configurationReferences: [{ lineId: "HACK-CFG" }],
            unitPrice: 1234.5,
            acceptedSku: "SKU-HACK",
          },
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as {
      decisions: Array<{ editedFields: Record<string, unknown> }>;
    };
    expect(Object.keys(arg.decisions[0].editedFields).sort()).toEqual([
      "boqConfigImpact",
      "complianceStatus",
      "hldImpact",
      "notes",
      "ownerLane",
      "rationale",
      "requiresOwnerReview",
      "response",
      "responseLane",
      "sectionReference",
      "tpImpact",
    ]);
    expect(arg.decisions[0].editedFields).toEqual({
      response: "Compliant.",
      rationale: "Datasheet confirms.",
      notes: "Reviewed.",
      complianceStatus: "compliant",
      sectionReference: "RFP-3.2.1",
      responseLane: "technical",
      ownerLane: "security",
      hldImpact: "required",
      tpImpact: "potential",
      boqConfigImpact: "owner_review_required",
      requiresOwnerReview: true,
    });

    const json = JSON.stringify(arg.decisions[0].editedFields);
    for (const leak of [
      "HACK-ID",
      "HACK-REQ",
      "rowReviewStatus",
      "notApplicableReason",
      "removedReason",
      "reviewHistory",
      "evidenceReferences",
      "configurationReferences",
      "unitPrice",
      "acceptedSku",
      "SKU-HACK",
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it("forwards editedFields as {} when every editedFields key is forbidden so the service reports invalid_edit", async () => {
    const request = req({
      decisions: [
        {
          rowId: "RFP-COMP-001",
          action: "edit",
          editedFields: {
            id: "HACK-ID",
            rowReviewStatus: "removed",
            unitPrice: 1234.5,
            acceptedSku: "SKU-HACK",
          },
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as {
      decisions: Array<Record<string, unknown>>;
    };
    expect(arg.decisions[0]).toHaveProperty("editedFields");
    expect(arg.decisions[0].editedFields).toEqual({});
    expect(JSON.stringify(arg.decisions)).not.toContain("HACK");
  });

  it("sanitizes non-object decisions and non-string decision fields to service-owned validation shapes", async () => {
    const request = req({
      decisions: [
        {
          rowId: "RFP-COMP-001",
          action: "edit",
          reason: 123,
          note: 456,
          editedFields: "x",
        },
        { rowId: "RFP-COMP-002", action: "remove", note: "ok", editedFields: ["a"] },
        { rowId: "RFP-COMP-003", action: "restore", editedFields: null },
        { rowId: 42, action: 7, note: "kept" },
        "not-an-object",
        null,
        [{ rowId: "RFP-COMP-009" }],
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(200);
    const arg = mockReview.mock.calls[0][0] as {
      decisions: Array<Record<string, unknown>>;
    };
    expect(arg.decisions.map((d) => Object.keys(d).sort())).toEqual([
      ["action", "rowId"],
      ["action", "note", "rowId"],
      ["action", "rowId"],
      ["note"],
      [],
      [],
      [],
    ]);
    expect(JSON.stringify(arg.decisions)).not.toContain("RFP-COMP-009");
  });
});

describe("POST .../compliance-matrix/rows/review - service validation throw", () => {
  const THROWS: string[] = [
    "decisions[0].rowId is required.",
    "decisions[1].action must be one of edit | mark_not_applicable | remove | restore.",
    "decisions[2] must be an object.",
  ];

  it.each(THROWS)(
    "maps a deterministic per-decision validation throw (%s) to 400 with the thrown message",
    async (message) => {
      mockReview.mockRejectedValue(new Error(message));

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("invalid_rfp_compliance_matrix_row_review_request");
      expect(body.error).toBe(message);
      expect(mockReview).toHaveBeenCalledTimes(1);
    }
  );

  it("maps a defensive empty-decisions service throw to 400 as a backstop", async () => {
    mockReview.mockRejectedValue(
      new Error("decisions must be a nonempty array.")
    );

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_compliance_matrix_row_review_request");
    expect(body.error).toBe("decisions must be a nonempty array.");
  });
});

describe("POST .../compliance-matrix/rows/review - result mapping", () => {
  const SIMPLE: Array<[Record<string, unknown>, number, string, string]> = [
    [{ status: "not_found" }, 404, "project_not_found", "Project not found."],
    [
      { status: "compliance_matrix_not_found" },
      404,
      "compliance_matrix_artifact_not_found",
      "Compliance matrix artifact not found.",
    ],
  ];

  it.each(SIMPLE)(
    "maps a simple result to the right HTTP status, code, and error",
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
      "artifact_not_compliance_matrix",
      409,
      "artifact_not_compliance_matrix",
      "Artifact is not a reviewable compliance_matrix artifact.",
    ],
    [
      "compliance_matrix_not_reviewable",
      409,
      "compliance_matrix_artifact_not_reviewable",
      "Compliance matrix artifact is not reviewable.",
    ],
    [
      "invalid_compliance_matrix_payload",
      422,
      "rfp_compliance_matrix_invalid_payload",
      "Compliance matrix payload is invalid.",
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

  const ROW_ID_CASES: Array<[string, number, string, string]> = [
    [
      "duplicate_decision",
      409,
      "rfp_compliance_matrix_duplicate_decision",
      "Compliance matrix row review has a duplicate decision for a rowId.",
    ],
    [
      "decision_target_not_found",
      409,
      "rfp_compliance_matrix_decision_target_not_found",
      "Compliance matrix row review decision references an unknown rowId.",
    ],
    [
      "row_already_removed",
      409,
      "rfp_compliance_matrix_row_already_removed",
      "One or more compliance matrix rows are already removed.",
    ],
    [
      "row_not_removed",
      409,
      "rfp_compliance_matrix_row_not_removed",
      "One or more compliance matrix rows are not removed.",
    ],
    [
      "reason_required",
      400,
      "rfp_compliance_matrix_reason_required",
      "A mark_not_applicable or remove decision requires a reason.",
    ],
  ];

  it.each(ROW_ID_CASES)(
    "maps %s to %i %s with the rowIds",
    async (status, httpStatus, code, error) => {
      const rowIds = ["RFP-COMP-001", "RFP-COMP-002"];
      mockReview.mockResolvedValue({ status, rowIds });

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(httpStatus);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
      expect(body.rowIds).toEqual(rowIds);
    }
  );

  it("maps invalid_edit to 400 rfp_compliance_matrix_invalid_edit with the edits", async () => {
    const edits = [
      { rowId: "RFP-COMP-001", reason: "editedFields must be an object." },
    ];
    mockReview.mockResolvedValue({ status: "invalid_edit", edits });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("rfp_compliance_matrix_invalid_edit");
    expect(body.error).toBe(
      "One or more compliance matrix edit decisions are invalid."
    );
    expect(body.edits).toEqual(edits);
  });

  it("maps ok to 200 with artifact and payloadSummary only, leaking no tenant/row/approval data", async () => {
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
    expect(json).not.toContain('"rows"');
    expect(json).not.toContain('"approval"');
    expect(json).not.toContain("evidenceReferences");
  });
});

describe("POST .../compliance-matrix/rows/review - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_compliance_matrix_row_review_failed");
    expect(body.error).toBe("Unable to review compliance matrix rows.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../compliance-matrix/rows/review - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/rows/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-compliance-matrix-row-review-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the compliance-matrix row-review service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-compliance-matrix-row-review",
    ]);
  });

  it("does not import the approval service/store, project/artifact stores, sibling compliance-matrix modules, AI/provider, document readers/parsers, pricing/SKU/catalog/config/HLD/TP/export, or React/page modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "getProjectArtifactById",
      "getProjectById",
      'from "@/lib/projects/project-rfp-compliance-matrix"',
      'from "@/lib/projects/project-rfp-compliance-matrix-approval"',
      'from "@/lib/projects/project-rfp-compliance-matrix-drafting',
      'from "@/lib/projects/project-rfp-compliance-matrix-row-review-workspace',
      'from "@/lib/projects/project-rfp-requirements',
      'from "@/lib/projects/project-rfp-evidence',
      'from "@/lib/projects/project-rfp-extraction',
      'from "@/lib/projects/project-rfp-config-expansion',
      'from "@/lib/projects/project-rfp-hld',
      'from "@/lib/projects/project-rfp-tp',
      'from "@/lib/projects/project-boq',
      'from "@/lib/projects/boq-',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/sku-',
      'from "@/lib/projects/approvals"',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/catalog',
      'from "@/lib/validation',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "react',
      "@anthropic-ai",
      "@google/generative-ai",
      "openai",
      "generateText",
      "generateObject",
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "xlsx",
      "benchmark",
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
