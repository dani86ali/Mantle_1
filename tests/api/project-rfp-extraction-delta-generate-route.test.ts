import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth, the configured-executor factory, and the generation orchestrator
// so the route's auth gate, tenant/project/artifact/requestedBy authority,
// executor-availability gate, executor pass-through, and result mapping are
// tested independent of the DB and of any drafting implementation. The route
// reads no request body, so the request's json/formData are spies asserted
// never to be called.
const { mockRequireAuth, mockGetExecutor, mockGenerate } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetExecutor: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock(
  "@/lib/projects/project-rfp-extraction-delta-candidate-drafting-executor",
  () => ({
    getConfiguredRfpExtractionDeltaCandidateDraftingExecutor: mockGetExecutor,
  })
);
vi.mock("@/lib/projects/project-rfp-extraction-delta-generation", () => ({
  generateRfpExtractionDeltaDraft: mockGenerate,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/generate/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/generate/route";
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

// The injected drafting executor the mocked factory hands out. The route must
// pass this exact function through to the orchestrator untouched and must never
// invoke it itself.
const EXECUTOR = vi.fn(() => Promise.resolve({ candidates: [] }));

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

// candidateCount and evidenceCount are deliberately different so a field-swap
// in the candidateSummary projection is caught.
const GENERATION_OK = {
  status: "ok",
  candidateCount: 2,
  evidenceCount: 5,
  sourceFileIds: ["file-rfp-1", "file-sow-1"],
  sourceArtifactIds: [ARTIFACT_ID],
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

const EVIDENCE_SUMMARIES = [
  {
    id: "ev-1",
    projectId: PROJECT,
    sourceFileId: "file-rfp-1",
    kind: "boq_line_item",
    extractedAt: "2026-06-11T09:00:00.000Z",
    retainUntil: "2026-12-11T09:00:00.000Z",
  },
];

// The six evidence/provenance gate statuses both phases share, with the single
// shared mapping each must reuse: [status, result extras, HTTP status, body].
const SHARED_GATE_CASES: Array<
  [string, Record<string, unknown>, number, Record<string, unknown>]
> = [
  [
    "not_found",
    {},
    404,
    { code: "project_not_found", error: "Project not found." },
  ],
  [
    "wrong_mode",
    { project: WRONG_MODE_PROJECT },
    409,
    {
      code: "wrong_project_mode",
      error: "Project is not an RFP project.",
      project: WRONG_MODE_PROJECT,
    },
  ],
  [
    "input_package_not_found",
    {},
    404,
    {
      code: "input_package_artifact_not_found",
      error: "Input package artifact not found.",
    },
  ],
  [
    "artifact_not_input_package",
    { artifact: INPUT_PACKAGE_ARTIFACT },
    409,
    {
      code: "artifact_not_input_package",
      error: "Artifact is not an approved input_package artifact.",
      artifact: INPUT_PACKAGE_ARTIFACT,
    },
  ],
  [
    "input_package_not_approved",
    { artifact: INPUT_PACKAGE_ARTIFACT },
    409,
    {
      code: "input_package_not_approved",
      error: "Input package artifact is not approved.",
      artifact: INPUT_PACKAGE_ARTIFACT,
    },
  ],
  [
    "input_package_has_no_source_files",
    { artifact: INPUT_PACKAGE_ARTIFACT },
    409,
    {
      code: "input_package_has_no_source_files",
      error: "Input package has no source files.",
      artifact: INPUT_PACKAGE_ARTIFACT,
    },
  ],
];

function draftingBlocked(drafting: Record<string, unknown>) {
  return { status: "blocked", phase: "candidate_drafting", drafting };
}

function deltaCreationBlocked(creation: Record<string, unknown>) {
  return { status: "blocked", phase: "delta_creation", creation };
}

function req(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve({})),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockGetExecutor.mockReset().mockReturnValue(EXECUTOR);
  mockGenerate.mockReset().mockResolvedValue(GENERATION_OK);
  EXECUTOR.mockClear();
});

describe("POST .../extraction-delta/generate - auth", () => {
  it("returns the requireAuth response and never reads the body or calls the factory or orchestrator when unauthenticated", async () => {
    const unauth = NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
    mockRequireAuth.mockReturnValue(unauth);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockGetExecutor).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("POST .../extraction-delta/generate - authority", () => {
  it("passes only session tenant/user and params project/artifact plus the configured executor; reads no body and never invokes the executor", async () => {
    const request = req();
    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockGetExecutor).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    const arg = mockGenerate.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "executor",
      "inputPackageArtifactId",
      "projectId",
      "requestedBy",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.inputPackageArtifactId).toBe(ARTIFACT_ID);
    expect(arg.requestedBy).toBe(SESSION.userId);
    // The configured executor crosses the seam by identity and is never called
    // by the route - only the orchestrator (here mocked) may invoke it.
    expect(arg.executor).toBe(EXECUTOR);
    expect(EXECUTOR).not.toHaveBeenCalled();
  });
});

describe("POST .../extraction-delta/generate - executor availability", () => {
  it("maps a null configured executor to 503 without calling the orchestrator", async () => {
    mockGetExecutor.mockReturnValue(null);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: "rfp_extraction_delta_candidate_drafting_unavailable",
      error:
        "No extraction-delta candidate drafting executor is configured; extraction delta generation is unavailable.",
    });
    expect(mockGetExecutor).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(request.formData).not.toHaveBeenCalled();
  });

  it("consults the factory before the orchestrator when an executor is configured", async () => {
    await POST(req(), PARAMS);

    expect(mockGetExecutor).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGetExecutor.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerate.mock.invocationCallOrder[0]
    );
  });
});

describe("POST .../extraction-delta/generate - ok mapping", () => {
  it("maps ok to 201 with { artifact, payloadSummary, candidateSummary } only, no status discriminator, and no candidate or tenant detail", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
      candidateSummary: {
        candidateCount: 2,
        evidenceCount: 5,
        sourceFileIds: ["file-rfp-1", "file-sow-1"],
        sourceArtifactIds: [ARTIFACT_ID],
      },
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    expect(json).not.toContain('"candidates"');
    expect(json).not.toContain("proposedEvidence");
  });
});

describe("POST .../extraction-delta/generate - candidate drafting blocked mapping", () => {
  it.each(SHARED_GATE_CASES)(
    "maps a drafting-phase %s block to the shared gate response",
    async (status, extras, expectedStatus, expectedBody) => {
      mockGenerate.mockResolvedValue(draftingBlocked({ status, ...extras }));

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(expectedStatus);
      expect(await res.json()).toEqual(expectedBody);
    }
  );

  it("maps extraction_evidence_not_found to 409 with the inputPackageArtifactId", async () => {
    mockGenerate.mockResolvedValue(
      draftingBlocked({
        status: "extraction_evidence_not_found",
        inputPackageArtifactId: ARTIFACT_ID,
      })
    );

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "rfp_extraction_delta_extraction_evidence_not_found",
      error:
        "No draftable RFP extraction evidence was found for the input package.",
      inputPackageArtifactId: ARTIFACT_ID,
    });
  });

  it("maps drafting_failed to 502 without leaking the swallowed executor detail", async () => {
    mockGenerate.mockResolvedValue(
      draftingBlocked({
        status: "drafting_failed",
        error: "extraction_delta_drafting_failed",
      })
    );

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_extraction_delta_candidate_drafting_failed",
      error: "Extraction-delta candidate drafting failed.",
    });
    // The orchestrator's lean error token never reaches the client body.
    expect(JSON.stringify(body)).not.toContain(
      "extraction_delta_drafting_failed"
    );
  });

  it("maps invalid_candidate_output to 502 with the deterministic sanitizer errors", async () => {
    const errors = [
      "candidates[0].title is required.",
      "candidates[1] cites unknown evidence ID: ev-bogus-1.",
    ];
    mockGenerate.mockResolvedValue(
      draftingBlocked({ status: "invalid_candidate_output", errors })
    );

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      code: "rfp_extraction_delta_candidate_drafting_invalid_output",
      error:
        "Extraction-delta candidate drafting returned invalid candidate output.",
      errors,
    });
  });
});

describe("POST .../extraction-delta/generate - delta creation blocked mapping", () => {
  it.each(SHARED_GATE_CASES)(
    "maps a delta-creation-phase %s block to the shared gate response",
    async (status, extras, expectedStatus, expectedBody) => {
      mockGenerate.mockResolvedValue(deltaCreationBlocked({ status, ...extras }));

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(expectedStatus);
      expect(await res.json()).toEqual(expectedBody);
    }
  );

  it("maps candidate_source_file_not_in_package to 422 with the sourceFileIds", async () => {
    const sourceFileIds = ["file-stray-1", "file-stray-2"];
    mockGenerate.mockResolvedValue(
      deltaCreationBlocked({
        status: "candidate_source_file_not_in_package",
        sourceFileIds,
      })
    );

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      code: "rfp_extraction_delta_candidate_source_file_not_in_package",
      error: "One or more candidate source files are not in the input package.",
      sourceFileIds,
    });
  });

  it("maps evidence_not_found to 409 with the missingEvidenceIds", async () => {
    const missingEvidenceIds = ["ev-missing-1", "ev-missing-2"];
    mockGenerate.mockResolvedValue(
      deltaCreationBlocked({ status: "evidence_not_found", missingEvidenceIds })
    );

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "rfp_extraction_delta_evidence_not_found",
      error: "One or more cited evidence rows were not found.",
      missingEvidenceIds,
    });
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
      mockGenerate.mockResolvedValue(
        deltaCreationBlocked({ status, evidence: EVIDENCE_SUMMARIES })
      );

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe(code);
      expect(body.error).toBe(error);
      expect(body.evidence).toEqual(EVIDENCE_SUMMARIES);
    }
  );
});

describe("POST .../extraction-delta/generate - orchestrator failure", () => {
  it("maps an unexpected orchestrator error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockGenerate.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_extraction_delta_generation_failed",
      error: "Unable to generate extraction delta draft.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe(".../extraction-delta/generate - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/extraction-delta/generate/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-extraction-delta-generate-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports exactly Next.js server primitives, requireAuth, the generation orchestrator, and the executor factory", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-extraction-delta-generation",
      "@/lib/projects/project-rfp-extraction-delta-candidate-drafting-executor",
    ]);
  });

  it("reads no request body and imports no provider, DB, store, direct drafting/draft/review service, evidence/package/approval/requirements/boq/pricing/SKU/config/export/catalog/runner/AI/agent/coordinator/engine/UI module", () => {
    // require( and fetch( use the open paren so requireAuth and request are not
    // false positives; the direct draft service, drafting contract, and the
    // Anthropic adapter use a closing quote so the legitimately imported
    // -generation orchestrator and -candidate-drafting-executor factory pass.
    for (const forbidden of [
      "request.json",
      "formData",
      "process.env",
      "fetch(",
      "require(",
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      "draftRfpExtractionDeltaCandidates",
      "createRfpExtractionDeltaDraft",
      "reviewRfpExtractionDeltaArtifact",
      'from "@/lib/projects/project-rfp-extraction-delta"',
      'from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting"',
      'from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic"',
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
      'from "@/app/',
      'from "react"',
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
