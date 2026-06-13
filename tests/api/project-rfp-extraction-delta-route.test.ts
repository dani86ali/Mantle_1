import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the extraction-delta draft service so the route's auth gate,
// tenant/user/param authority, body sanitization, throw handling, and result
// mapping are tested independent of the DB, AI, and persisted stores.
const { mockRequireAuth, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-extraction-delta", () => ({
  createRfpExtractionDeltaDraft: mockCreateDraft,
  RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES: ["deterministic", "ai", "engineer"],
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/route";
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
  id: "art-extraction-delta-1",
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "extraction_delta",
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
  payloadKind: "rfp_extraction_delta",
  createdBy: SESSION.userId,
  createdAt: "2026-06-12T12:00:00.000Z",
  proposalSource: "ai",
  inputPackageArtifactId: ARTIFACT_ID,
  candidateCount: 2,
  evidenceReferenceCount: 3,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: [ARTIFACT_ID],
};

const EVIDENCE_SUMMARIES = [
  {
    id: "ev-1",
    projectId: PROJECT,
    sourceFileId: "file-rfp-1",
    kind: "rfp_document_text_chunk",
    extractedAt: "2026-06-11T09:00:00.000Z",
    retainUntil: "2026-12-11T09:00:00.000Z",
  },
];

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

function req(
  body: unknown = { proposalSource: "ai", candidates: [] }
): NextRequest {
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
  mockCreateDraft.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST .../extraction-delta - auth", () => {
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
    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST .../extraction-delta - invalid request", () => {
  it("returns 400 without calling the service when the JSON body is malformed", async () => {
    const request = reqBadJson();
    const res = await POST(request, PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_extraction_delta_request");
    expect(body.error).toBe(
      "proposalSource must be deterministic, ai, or engineer, and candidates must be an array."
    );
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  const INVALID: Array<[string, unknown]> = [
    ["a non-object body", 42],
    ["a null body", null],
    ["an array body", [{ proposalSource: "ai", candidates: [] }]],
    ["a missing proposalSource", { candidates: [] }],
    ["an unknown proposalSource", { proposalSource: "vendor", candidates: [] }],
    ["a non-string proposalSource", { proposalSource: 7, candidates: [] }],
    ["a missing candidates field", { proposalSource: "ai" }],
    [
      "a non-array candidates field",
      { proposalSource: "ai", candidates: { kind: "missing_evidence" } },
    ],
    [
      "a null candidates field",
      { proposalSource: "engineer", candidates: null },
    ],
  ];

  it.each(INVALID)(
    "returns 400 without calling the service for %s",
    async (_label, body) => {
      const res = await POST(req(body), PARAMS);

      expect(res.status).toBe(400);
      const parsed = await res.json();
      expect(parsed.code).toBe("invalid_rfp_extraction_delta_request");
      expect(parsed.error).toBe(
        "proposalSource must be deterministic, ai, or engineer, and candidates must be an array."
      );
      expect(mockCreateDraft).not.toHaveBeenCalled();
    }
  );

  it("accepts each known proposalSource and an empty candidates array", async () => {
    for (const proposalSource of ["deterministic", "ai", "engineer"]) {
      mockCreateDraft.mockClear();
      const res = await POST(req({ proposalSource, candidates: [] }), PARAMS);

      expect(res.status).toBe(201);
      expect(mockCreateDraft).toHaveBeenCalledTimes(1);
      const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.proposalSource).toBe(proposalSource);
      expect(arg.candidates).toEqual([]);
    }
  });
});

describe("POST .../extraction-delta - authority and sanitization", () => {
  it("passes only session tenant/user and route params, never body-supplied authority fields", async () => {
    const request = req({
      proposalSource: "engineer",
      candidates: [],
      // decoy authority/content fields on the request body itself
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      artifactId: "attacker-artifact",
      inputPackageArtifactId: "attacker-package",
      createdBy: "attacker-user",
      status: "approved",
      reviewStatus: "accepted",
      reviewHistory: [{ action: "accept" }],
      sourceFileIds: ["attacker-file"],
      sourceArtifactIds: ["attacker-source"],
      payload: { hack: true },
      evidence: [{ text: "attacker evidence" }],
      approval: { decision: "approved" },
      pricing: { listPriceUsd: 1 },
      sku: "C9300-48T",
      config: { expand: true },
      export: { format: "xlsx" },
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).toHaveBeenCalledTimes(1);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);

    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "candidates",
      "createdBy",
      "inputPackageArtifactId",
      "projectId",
      "proposalSource",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.inputPackageArtifactId).toBe(ARTIFACT_ID);
    expect(arg.createdBy).toBe(SESSION.userId);
    expect(arg.proposalSource).toBe("engineer");
    expect(arg.candidates).toEqual([]);

    const json = JSON.stringify(arg);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("C9300-48T");
    expect(json).not.toContain("listPriceUsd");
  });

  it("sanitizes each candidate to only the explicit candidate input fields", async () => {
    const request = req({
      proposalSource: "ai",
      candidates: [
        {
          kind: "missing_evidence",
          sourceFileId: "file-rfp-1",
          title: "Missing pricing table",
          description: "The pricing table was not extracted.",
          severity: "blocking",
          confidence: 0.92,
          rationale: "Row count mismatch.",
          evidenceIds: ["ev-1", "ev-2"],
          proposedEvidence: {
            evidenceKind: "rfp_document_text_chunk",
            text: "proposed",
          },
          // decoy authority/content fields on the candidate itself
          id: "RFP-DELTA-001",
          reviewStatus: "accepted",
          reviewHistory: [{ action: "accept" }],
          evidenceReferences: [{ evidenceId: "ev-1" }],
          tenantId: "attacker-tenant",
          projectId: "attacker-project",
          inputPackageArtifactId: "attacker-package",
          status: "approved",
          sourceArtifactIds: ["attacker-source"],
          payload: { hack: true },
          pricing: { listPriceUsd: 9 },
          sku: "C9300-24T",
          config: { expand: true },
          export: { format: "xlsx" },
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    const arg = mockCreateDraft.mock.calls[0][0] as {
      candidates: Array<Record<string, unknown>>;
    };
    expect(arg.candidates).toHaveLength(1);
    expect(Object.keys(arg.candidates[0]).sort()).toEqual([
      "confidence",
      "description",
      "evidenceIds",
      "kind",
      "proposedEvidence",
      "rationale",
      "severity",
      "sourceFileId",
      "title",
    ]);
    expect(arg.candidates[0].kind).toBe("missing_evidence");
    expect(arg.candidates[0].sourceFileId).toBe("file-rfp-1");
    expect(arg.candidates[0].title).toBe("Missing pricing table");
    expect(arg.candidates[0].description).toBe(
      "The pricing table was not extracted."
    );
    expect(arg.candidates[0].severity).toBe("blocking");
    expect(arg.candidates[0].confidence).toBe(0.92);
    expect(arg.candidates[0].rationale).toBe("Row count mismatch.");
    expect(arg.candidates[0].evidenceIds).toEqual(["ev-1", "ev-2"]);

    const json = JSON.stringify(arg.candidates);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("RFP-DELTA-001");
    expect(json).not.toContain("reviewStatus");
    expect(json).not.toContain("reviewHistory");
    expect(json).not.toContain("evidenceReferences");
    expect(json).not.toContain("listPriceUsd");
    expect(json).not.toContain("C9300-24T");
  });

  it("omits non-string optional fields, omits a non-array evidenceIds, and filters evidenceIds to strings only", async () => {
    const request = req({
      proposalSource: "deterministic",
      candidates: [
        {
          kind: 3,
          sourceFileId: null,
          title: {},
          description: [],
          severity: 5,
          confidence: "high",
          rationale: 6,
          evidenceIds: "ev-1",
          proposedEvidence: "not-an-object",
        },
        {
          kind: "suspicious_item",
          sourceFileId: "file-rfp-1",
          title: "Suspicious quantity",
          description: "Quantity looks wrong.",
          evidenceIds: ["a", 1, "b", null, "c", {}, true],
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    const arg = mockCreateDraft.mock.calls[0][0] as {
      candidates: Array<Record<string, unknown>>;
    };
    expect(arg.candidates[0]).toEqual({});
    expect(Object.keys(arg.candidates[1]).sort()).toEqual([
      "description",
      "evidenceIds",
      "kind",
      "sourceFileId",
      "title",
    ]);
    expect(arg.candidates[1].evidenceIds).toEqual(["a", "b", "c"]);
  });

  it("forwards proposedEvidence whole when an object (inner keys untouched) and drops it otherwise", async () => {
    const proposedEvidence = {
      evidenceKind: "rfp_document_table",
      tableId: "tbl-1",
      rows: [["sku", "qty"]],
      arbitraryInnerKey: "kept-verbatim",
      nested: { deep: true },
    };
    const request = req({
      proposalSource: "ai",
      candidates: [
        {
          kind: "table_reconstruction",
          sourceFileId: "file-rfp-1",
          title: "Rebuild table",
          description: "Reconstruct the BoQ table.",
          proposedEvidence,
        },
        {
          kind: "missing_evidence",
          sourceFileId: "file-rfp-1",
          title: "String proposal",
          description: "Proposal is a string.",
          proposedEvidence: "not-an-object",
        },
        {
          kind: "missing_evidence",
          sourceFileId: "file-rfp-1",
          title: "Array proposal",
          description: "Proposal is an array.",
          proposedEvidence: ["nope"],
        },
        {
          kind: "missing_evidence",
          sourceFileId: "file-rfp-1",
          title: "Null proposal",
          description: "Proposal is null.",
          proposedEvidence: null,
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    const arg = mockCreateDraft.mock.calls[0][0] as {
      candidates: Array<Record<string, unknown>>;
    };
    expect(arg.candidates[0].proposedEvidence).toEqual(proposedEvidence);
    expect(arg.candidates[1].proposedEvidence).toBeUndefined();
    expect(arg.candidates[2].proposedEvidence).toBeUndefined();
    expect(arg.candidates[3].proposedEvidence).toBeUndefined();
    // The route never inspects or strips inner proposal keys.
    expect(JSON.stringify(arg.candidates[0])).toContain("arbitraryInnerKey");
  });

  it("maps a non-object candidate to {} so the service reports the missing fields", async () => {
    const request = req({
      proposalSource: "ai",
      candidates: ["not-an-object", 42, null, ["a"]],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    const arg = mockCreateDraft.mock.calls[0][0] as {
      candidates: Array<Record<string, unknown>>;
    };
    expect(arg.candidates).toEqual([{}, {}, {}, {}]);
  });
});

describe("POST .../extraction-delta - service validation throw", () => {
  const THROWS: string[] = [
    "candidates[0].kind must be one of missing_evidence | incorrect_extraction | table_reconstruction | suspicious_item.",
    "candidates[1].sourceFileId is required.",
    "candidates[2] must be an object.",
    "candidates[0].confidence must be a finite number between 0 and 1 inclusive.",
    "proposalSource must be one of deterministic | ai | engineer.",
    "candidates must be an array.",
  ];

  it.each(THROWS)(
    "maps a deterministic request validation throw (%s) to 400 with the thrown message",
    async (message) => {
      mockCreateDraft.mockRejectedValue(new Error(message));

      const res = await POST(
        req({
          proposalSource: "ai",
          candidates: [{ kind: "missing_evidence" }],
        }),
        PARAMS
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("invalid_rfp_extraction_delta_request");
      expect(body.error).toBe(message);
      expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    }
  );

  it("maps an authority-guard throw (createdBy is required.) to a controlled 500, not a 400", async () => {
    mockCreateDraft.mockRejectedValue(new Error("createdBy is required."));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_delta_failed");
    expect(body.error).toBe("Unable to create extraction delta draft.");
    expect(JSON.stringify(body)).not.toContain("createdBy is required.");
  });
});

describe("POST .../extraction-delta - result mapping", () => {
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

  it("maps candidate_source_file_not_in_package to 422 with the sourceFileIds", async () => {
    const sourceFileIds = ["file-stray-1", "file-stray-2"];
    mockCreateDraft.mockResolvedValue({
      status: "candidate_source_file_not_in_package",
      sourceFileIds,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe(
      "rfp_extraction_delta_candidate_source_file_not_in_package"
    );
    expect(body.error).toBe(
      "One or more candidate source files are not in the input package."
    );
    expect(body.sourceFileIds).toEqual(sourceFileIds);
  });

  it("maps evidence_not_found to 409 with the missingEvidenceIds", async () => {
    const missingEvidenceIds = ["ev-missing-1", "ev-missing-2"];
    mockCreateDraft.mockResolvedValue({
      status: "evidence_not_found",
      missingEvidenceIds,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_delta_evidence_not_found");
    expect(body.error).toBe("One or more cited evidence rows were not found.");
    expect(body.missingEvidenceIds).toEqual(missingEvidenceIds);
  });

  const EVIDENCE_CASES: Array<[string, string, string]> = [
    [
      "evidence_not_rfp_extraction",
      "rfp_extraction_delta_evidence_not_rfp_extraction",
      "One or more cited evidence rows are not RFP extraction evidence.",
    ],
    [
      "evidence_not_for_input_package",
      "rfp_extraction_delta_evidence_not_for_input_package",
      "One or more cited evidence rows are not stored for this input package.",
    ],
  ];

  it.each(EVIDENCE_CASES)(
    "maps %s to 409 %s with the evidence summaries",
    async (status, code, error) => {
      mockCreateDraft.mockResolvedValue({ status, evidence: EVIDENCE_SUMMARIES });

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
      expect(body.evidence).toEqual(EVIDENCE_SUMMARIES);
    }
  );

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
    expect(json).not.toContain('"candidates"');
    expect(json).not.toContain("proposedEvidence");
  });
});

describe("POST .../extraction-delta - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_extraction_delta_failed");
    expect(body.error).toBe("Unable to create extraction delta draft.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../extraction-delta - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-extraction-delta-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the extraction-delta draft service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-extraction-delta",
    ]);
  });

  it("does not invoke the candidate-drafting executor or import the candidate-drafting contract/adapter, the delta-review service, DB, stores, evidence/approval/requirements/input-package services, pricing, SKU, config expansion, export, runner, AI, catalog, coordinator, engine, adapter, React, or UI modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "draftRfpExtractionDeltaCandidates",
      'from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting',
      'from "@/lib/projects/project-rfp-extraction-delta-review"',
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
      'from "react"',
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
