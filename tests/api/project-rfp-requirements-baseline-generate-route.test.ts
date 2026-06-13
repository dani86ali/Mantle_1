import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock auth, the configured-executor factory, and the generation orchestrator
// so the route's auth gate, tenant/project/requestedBy authority, body
// sanitization, executor-availability gate, and result mapping are tested
// independent of the DB and of any drafting implementation. The real
// orchestrator module is never loaded here (it would pull the DB stores into
// the test); the real factory module IS loaded via vi.importActual in the
// factory describe below, which is safe because the factory only builds the
// drafting executor (it never invokes it, so no network is reached) and
// reads exactly the approved environment variables, which that describe
// saves and restores around every test.
const { mockRequireAuth, mockGetExecutor, mockGenerate } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetExecutor: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock(
  "@/lib/projects/project-rfp-requirements-candidate-drafting-executor",
  () => ({
    getConfiguredRfpRequirementCandidateDraftingExecutor: mockGetExecutor,
  })
);
vi.mock("@/lib/projects/project-rfp-requirements-baseline-generation", () => ({
  generateRfpRequirementsBaselineDraftFromEvidencePackage: mockGenerate,
}));

import {
  POST,
} from "@/app/api/projects/[id]/rfp/requirements-baseline/generate/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/requirements-baseline/generate/route";
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

const INVALID_REQUEST_ERROR =
  "evidencePackageArtifactId must be a nonblank string naming one approved final evidence package artifact.";

const EVIDENCE_PACKAGE_ARTIFACT_ID = "art-evidence-package-approved-1";

const VALID_BODY = {
  evidencePackageArtifactId: EVIDENCE_PACKAGE_ARTIFACT_ID,
};

// The injected drafting executor the mocked factory hands out. The route
// must pass this exact function through to the orchestrator untouched and
// must never invoke it itself.
const EXECUTOR = vi.fn(() => Promise.resolve({ candidates: [] }));

const ARTIFACT_SUMMARY = {
  id: "artifact-baseline-1",
  projectId: PROJECT,
  stageId: "requirements_baseline_review",
  type: "requirements_baseline",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: ["art-input-package-1"],
  createdAt: "2026-06-10T12:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_requirements_baseline",
  createdBy: SESSION.userId,
  createdAt: "2026-06-10T12:00:00.000Z",
  requirementCount: 2,
  evidenceCount: 2,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: ["art-input-package-1"],
  requirementIds: ["RFP-REQ-001", "RFP-REQ-002"],
};

const GENERATION_OK = {
  status: "ok",
  candidateCount: 2,
  evidenceCount: 2,
  evidencePackageArtifactId: EVIDENCE_PACKAGE_ARTIFACT_ID,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: ["art-input-package-1"],
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

const EVIDENCE_SUMMARIES = [
  {
    id: "evidence-wrong-kind-1",
    projectId: PROJECT,
    sourceFileId: "file-boq-1",
    kind: "boq_line_item",
    extractedAt: "2026-06-03T08:15:00.000Z",
    retainUntil: "2027-06-03T08:15:00.000Z",
  },
];

const ARTIFACT_SUMMARIES = [
  {
    id: "art-not-package-1",
    projectId: PROJECT,
    stageId: "intake_package_review",
    type: "input_package",
    status: "needs_review",
    version: 2,
    sourceFileIds: ["file-rfp-1"],
    sourceArtifactIds: [],
    createdAt: "2026-06-05T09:00:00.000Z",
    updatedAt: "2026-06-05T09:30:00.000Z",
  },
];

// Lean artifact summary echoed by the package-drafting provenance gates that
// carry the offending artifact (not_evidence_package / not_approved /
// invalid_payload / empty).
const PACKAGE_ARTIFACT_SUMMARY = {
  id: EVIDENCE_PACKAGE_ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "intake_package_review",
  type: "evidence_package",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-rfp-1", "file-boq-1"],
  sourceArtifactIds: ["art-input-package-1"],
  createdAt: "2026-06-05T09:00:00.000Z",
  updatedAt: "2026-06-05T09:30:00.000Z",
};

// The eight evidence/provenance gate statuses the BASELINE CREATION phase can
// return, with the existing create-route mapping each must reuse:
// [status, result extras, expected HTTP status, expected body].
const CREATION_GATE_CASES: Array<
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
    "evidence_not_found",
    { missingEvidenceIds: ["evidence-missing-1", "evidence-missing-2"] },
    409,
    {
      code: "rfp_requirements_baseline_evidence_not_found",
      error: "One or more cited evidence items were not found.",
      missingEvidenceIds: ["evidence-missing-1", "evidence-missing-2"],
    },
  ],
  [
    "evidence_not_rfp_extraction",
    { evidence: EVIDENCE_SUMMARIES },
    409,
    {
      code: "rfp_requirements_baseline_evidence_not_rfp_extraction",
      error:
        "One or more cited evidence items are not RFP extraction evidence.",
      evidence: EVIDENCE_SUMMARIES,
    },
  ],
  [
    "evidence_missing_input_package",
    { evidence: EVIDENCE_SUMMARIES },
    409,
    {
      code: "rfp_requirements_baseline_evidence_missing_input_package",
      error:
        "One or more cited evidence items do not name their input package artifact.",
      evidence: EVIDENCE_SUMMARIES,
    },
  ],
  [
    "input_package_artifact_not_found",
    { missingArtifactIds: ["art-input-package-9"] },
    409,
    {
      code: "rfp_requirements_baseline_input_package_not_found",
      error: "One or more cited input package artifacts were not found.",
      missingArtifactIds: ["art-input-package-9"],
    },
  ],
  [
    "artifact_not_input_package",
    { artifacts: ARTIFACT_SUMMARIES },
    409,
    {
      code: "rfp_requirements_baseline_artifact_not_input_package",
      error: "One or more cited artifacts are not input package artifacts.",
      artifacts: ARTIFACT_SUMMARIES,
    },
  ],
  [
    "input_package_not_approved",
    { artifacts: ARTIFACT_SUMMARIES },
    409,
    {
      code: "rfp_requirements_baseline_input_package_not_approved",
      error: "One or more cited input package artifacts are not approved.",
      artifacts: ARTIFACT_SUMMARIES,
    },
  ],
];

// The approved-evidence_package provenance gate statuses the CANDIDATE DRAFTING
// phase can return, with the package-specific mapping each must use:
// [status, result extras, expected HTTP status, expected body].
const PACKAGE_DRAFTING_GATE_CASES: Array<
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
    "evidence_package_artifact_not_found",
    {},
    409,
    {
      code: "rfp_requirements_baseline_evidence_package_not_found",
      error: "The cited evidence package artifact was not found.",
    },
  ],
  [
    "artifact_not_evidence_package",
    { artifact: PACKAGE_ARTIFACT_SUMMARY },
    409,
    {
      code: "rfp_requirements_baseline_artifact_not_evidence_package",
      error: "The cited artifact is not an evidence package artifact.",
      artifact: PACKAGE_ARTIFACT_SUMMARY,
    },
  ],
  [
    "evidence_package_not_approved",
    { artifact: PACKAGE_ARTIFACT_SUMMARY },
    409,
    {
      code: "rfp_requirements_baseline_evidence_package_not_approved",
      error: "The cited evidence package artifact is not approved.",
      artifact: PACKAGE_ARTIFACT_SUMMARY,
    },
  ],
  [
    "invalid_evidence_package_payload",
    { artifact: PACKAGE_ARTIFACT_SUMMARY },
    409,
    {
      code: "rfp_requirements_baseline_invalid_evidence_package_payload",
      error: "The cited evidence package artifact payload is invalid.",
      artifact: PACKAGE_ARTIFACT_SUMMARY,
    },
  ],
  [
    "evidence_package_empty",
    { artifact: PACKAGE_ARTIFACT_SUMMARY },
    409,
    {
      code: "rfp_requirements_baseline_evidence_package_empty",
      error: "The cited evidence package artifact has no evidence.",
      artifact: PACKAGE_ARTIFACT_SUMMARY,
    },
  ],
];

function draftingBlocked(drafting: Record<string, unknown>) {
  return { status: "blocked", phase: "candidate_drafting", drafting };
}

function creationBlocked(creation: Record<string, unknown>) {
  return { status: "blocked", phase: "baseline_creation", creation };
}

function req(body: unknown = VALID_BODY): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.resolve(body)),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

function reqWithBrokenJson(): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(() => Promise.reject(new SyntaxError("Unexpected token"))),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockGetExecutor.mockReset().mockReturnValue(EXECUTOR);
  mockGenerate.mockReset().mockResolvedValue(GENERATION_OK);
  EXECUTOR.mockClear();
});

describe("POST .../rfp/requirements-baseline/generate - auth", () => {
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

describe("POST .../rfp/requirements-baseline/generate - authority and body sanitization", () => {
  it("passes session.tenantId, the route param, session.userId, the evidencePackageArtifactId, and the configured executor; evidenceIds and every other decoy field never reach the orchestrator", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      requestedBy: "attacker-user",
      createdBy: "attacker-user",
      status: "approved",
      stageId: "export_review",
      type: "priced_boq",
      artifactId: "attacker-artifact-id",
      artifact: { id: "attacker-artifact" },
      sourceFileIds: ["attacker-file"],
      sourceArtifactIds: ["attacker-artifact"],
      approval: { decision: "approved" },
      payload: { hack: true },
      candidates: [{ text: "attacker candidate", evidenceIds: ["e-x"] }],
      executor: "attacker-executor",
      rawText: "raw rfp text dump",
      rows: [["sku", "qty"]],
      unitPrice: 100,
      sku: "C9300-48T",
      configuration: { expand: true },
      exportFormat: "xlsx",
      // Raw persisted evidence ids are no longer accepted and must be dropped.
      evidenceIds: ["evidence-text-1", "evidence-table-1"],
      evidencePackageArtifactId: EVIDENCE_PACKAGE_ARTIFACT_ID,
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).toHaveBeenCalledTimes(1);
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockGetExecutor).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    // The factory is consulted before the orchestrator runs.
    expect(mockGetExecutor.mock.invocationCallOrder[0]).toBeLessThan(
      mockGenerate.mock.invocationCallOrder[0]
    );

    const arg = mockGenerate.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "evidencePackageArtifactId",
      "executor",
      "projectId",
      "requestedBy",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.requestedBy).toBe(SESSION.userId);
    expect(arg.executor).toBe(EXECUTOR);
    expect(arg.evidencePackageArtifactId).toBe(EVIDENCE_PACKAGE_ARTIFACT_ID);
    expect(EXECUTOR).not.toHaveBeenCalled();

    // evidenceIds is the rejected raw-evidence path and never passes through.
    expect("evidenceIds" in arg).toBe(false);

    // JSON.stringify drops the executor function; every serializable field
    // must be free of body-supplied authority, raw evidence ids, or content.
    const json = JSON.stringify(arg);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("raw rfp text dump");
    expect(json).not.toContain("unitPrice");
    expect(json).not.toContain("C9300-48T");
    expect(json).not.toContain("evidence-text-1");
    expect(json).not.toContain("evidence-table-1");
  });
});

describe("POST .../rfp/requirements-baseline/generate - malformed body", () => {
  it("rejects unparseable JSON with a controlled 400 without calling the factory or orchestrator", async () => {
    const request = reqWithBrokenJson();

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "invalid_rfp_requirements_baseline_generation_request",
      error: INVALID_REQUEST_ERROR,
    });
    expect(mockGetExecutor).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  const INVALID_BODIES: Array<[string, unknown]> = [
    ["a null body", null],
    ["a number body", 42],
    ["a string body", "art-evidence-package-1"],
    ["an array body", ["art-evidence-package-1"]],
    ["a body without evidencePackageArtifactId", {}],
    // The raw-evidence path is gone: an evidenceIds body must be rejected even
    // when it holds well-formed ids.
    ["an evidenceIds body", { evidenceIds: ["evidence-text-1", "evidence-table-1"] }],
    [
      "an evidenceIds body without evidencePackageArtifactId",
      { evidenceIds: ["evidence-text-1"], note: "ignore" },
    ],
    ["an array evidencePackageArtifactId", { evidencePackageArtifactId: ["art-1"] }],
    ["a number evidencePackageArtifactId", { evidencePackageArtifactId: 42 }],
    ["a null evidencePackageArtifactId", { evidencePackageArtifactId: null }],
    [
      "an object evidencePackageArtifactId",
      { evidencePackageArtifactId: { id: "art-1" } },
    ],
    ["an empty evidencePackageArtifactId", { evidencePackageArtifactId: "" }],
    ["a blank evidencePackageArtifactId", { evidencePackageArtifactId: "   " }],
  ];

  it.each(INVALID_BODIES)(
    "rejects %s with a controlled 400 without calling the factory or orchestrator",
    async (_label, body) => {
      const res = await POST(req(body), PARAMS);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        code: "invalid_rfp_requirements_baseline_generation_request",
        error: INVALID_REQUEST_ERROR,
      });
      expect(mockGetExecutor).not.toHaveBeenCalled();
      expect(mockGenerate).not.toHaveBeenCalled();
    }
  );
});

describe("POST .../rfp/requirements-baseline/generate - executor availability", () => {
  it("maps a null configured executor to 503 without calling the orchestrator", async () => {
    mockGetExecutor.mockReturnValue(null);

    const request = req();
    const res = await POST(request, PARAMS);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_candidate_drafting_unavailable",
      error:
        "No candidate drafting executor is configured; requirements baseline generation is unavailable.",
    });
    expect(request.json).toHaveBeenCalledTimes(1);
    expect(mockGetExecutor).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe("POST .../rfp/requirements-baseline/generate - ok mapping", () => {
  it("maps ok to 201 with { artifact, payloadSummary, candidateSummary } carrying evidencePackageArtifactId, no status discriminator, and no tenantId", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
      candidateSummary: {
        candidateCount: 2,
        evidenceCount: 2,
        evidencePackageArtifactId: EVIDENCE_PACKAGE_ARTIFACT_ID,
        sourceFileIds: ["file-rfp-1", "file-boq-1"],
        sourceArtifactIds: ["art-input-package-1"],
      },
    });
    expect("status" in body).toBe(false);
    const json = JSON.stringify(body);
    expect(json).not.toContain("tenantId");
    expect(json).not.toContain(SESSION.tenantId);
    // Candidate text never leaves the orchestrator boundary on this route.
    expect(json).not.toContain('"candidates"');
  });
});

describe("POST .../rfp/requirements-baseline/generate - candidate drafting blocked mapping", () => {
  it.each(PACKAGE_DRAFTING_GATE_CASES)(
    "maps a drafting-phase %s block to its evidence-package response",
    async (status, extras, expectedStatus, expectedBody) => {
      mockGenerate.mockResolvedValue(
        draftingBlocked({ status, ...extras })
      );

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(expectedStatus);
      expect(await res.json()).toEqual(expectedBody);
    }
  );

  it("maps drafting_failed to 502 rfp_requirements_candidate_drafting_failed without internal detail", async () => {
    mockGenerate.mockResolvedValue(
      draftingBlocked({
        status: "drafting_failed",
        error: "candidate_drafting_failed",
      })
    );

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_candidate_drafting_failed",
      error: "Candidate drafting failed.",
    });
  });

  it("maps invalid_candidate_output to 502 with the deterministic sanitizer violations", async () => {
    const violations = [
      "candidates[0].text is required.",
      "candidates[1] cites unknown evidence ID: evidence-bogus-1.",
    ];
    mockGenerate.mockResolvedValue(
      draftingBlocked({ status: "invalid_candidate_output", errors: violations })
    );

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_candidate_drafting_invalid_output",
      error: "Candidate drafting returned invalid candidate output.",
      errors: violations,
    });
  });
});

describe("POST .../rfp/requirements-baseline/generate - baseline creation blocked mapping", () => {
  it.each(CREATION_GATE_CASES)(
    "maps a creation-phase %s block to the existing create-route response",
    async (status, extras, expectedStatus, expectedBody) => {
      mockGenerate.mockResolvedValue(
        creationBlocked({ status, ...extras })
      );

      const res = await POST(req(), PARAMS);

      expect(res.status).toBe(expectedStatus);
      expect(await res.json()).toEqual(expectedBody);
    }
  );
});

describe("POST .../rfp/requirements-baseline/generate - orchestrator failure", () => {
  it("maps an unexpected orchestrator error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockGenerate.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_requirements_baseline_generation_failed",
      error: "Unable to generate RFP requirements baseline draft.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe(".../rfp/requirements-baseline/generate - route surface", () => {
  it("exports POST only", () => {
    expect(typeof routeModule.POST).toBe("function");
    for (const method of ["GET", "PATCH", "PUT", "DELETE"]) {
      expect((routeModule as Record<string, unknown>)[method]).toBeUndefined();
    }
  });
});

describe("configured drafting executor factory (real module)", () => {
  const FACTORY_ENV_KEYS = [
    "ANTHROPIC_API_KEY",
    "BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MODEL",
    "BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MAX_TOKENS",
  ];
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv = {};
    for (const key of FACTORY_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of FACTORY_ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function loadRealFactory() {
    return vi.importActual<{
      getConfiguredRfpRequirementCandidateDraftingExecutor: () => unknown;
    }>("@/lib/projects/project-rfp-requirements-candidate-drafting-executor");
  }

  it("returns null when ANTHROPIC_API_KEY is missing", async () => {
    const factory = await loadRealFactory();

    expect(
      factory.getConfiguredRfpRequirementCandidateDraftingExecutor()
    ).toBeNull();
  });

  it("returns null when ANTHROPIC_API_KEY is blank", async () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    const factory = await loadRealFactory();

    expect(
      factory.getConfiguredRfpRequirementCandidateDraftingExecutor()
    ).toBeNull();
  });

  it("returns an executor function without invoking it when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    const factory = await loadRealFactory();

    const executor =
      factory.getConfiguredRfpRequirementCandidateDraftingExecutor();

    expect(typeof executor).toBe("function");
  });

  it.each([
    ["a valid integer", "2048"],
    ["a non-integer", "12.5"],
    ["a non-numeric", "lots"],
    ["zero", "0"],
    ["a negative integer", "-5"],
  ])(
    "returns an executor function with a model override and %s max-tokens override, still without invoking it",
    async (_label, rawMaxTokens) => {
      process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
      process.env.BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MODEL =
        "model-override-1";
      process.env.BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MAX_TOKENS =
        rawMaxTokens;
      const factory = await loadRealFactory();

      expect(
        typeof factory.getConfiguredRfpRequirementCandidateDraftingExecutor()
      ).toBe("function");
    }
  );
});

describe("route and factory module purity (static source check)", () => {
  const ROUTE_PATH = join(
    process.cwd(),
    "src/app/api/projects/[id]/rfp/requirements-baseline/generate/route.ts"
  );
  const FACTORY_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-requirements-candidate-drafting-executor.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-requirements-baseline-generate-route.test.ts"
  );
  const routeSource = readFileSync(ROUTE_PATH, "utf8");
  const factorySource = readFileSync(FACTORY_PATH, "utf8");

  it("route imports only Next.js server primitives, requireAuth, the generation orchestrator, and the executor factory", () => {
    const froms = Array.from(
      routeSource.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-requirements-baseline-generation",
      "@/lib/projects/project-rfp-requirements-candidate-drafting-executor",
    ]);
  });

  it("route does not import DB, stores, direct drafting/baseline services, approval, extraction, persistence, raw file loaders, pricing, SKU resolution, config expansion, export, AI, LLM, provider SDKs, agent, coordinator, or UI modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      'from "@/lib/projects/project-rfp-requirements-baseline"',
      'from "@/lib/projects/project-rfp-requirements-candidate-drafting"',
      'from "@/lib/projects/project-rfp-requirements-baseline-approval"',
      'from "@/lib/projects/project-rfp-requirements-baseline-inspection"',
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/evidence"',
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
      'from "@/components',
      'from "@/app/',
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      "tesseract",
      "pdf-parse",
      "mammoth",
      "papaparse",
      "process.env",
      "fetch(",
    ]) {
      expect(routeSource).not.toContain(forbidden);
    }
  });

  it("factory imports only the executor type from the drafting contract and the Anthropic adapter factory", () => {
    const importLines = factorySource
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toHaveLength(2);
    expect(importLines[0]).toMatch(/^import type \{/);
    expect(importLines[1]).toMatch(/^import \{/);
    const froms = Array.from(
      factorySource.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-requirements-candidate-drafting",
      "@/lib/projects/project-rfp-requirements-candidate-drafting-anthropic",
    ]);
    expect(factorySource).toContain(
      "createAnthropicRfpRequirementCandidateDraftingExecutor"
    );
  });

  it("factory reads only the approved configuration variables and stays free of network calls and provider, legacy AI, DB, or engine modules", () => {
    for (const forbidden of [
      "fetch(",
      "require(",
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/db',
      'from "@/coordinator',
      'from "@/engines',
    ]) {
      expect(factorySource).not.toContain(forbidden);
    }
    // Every environment read is dot-access on an approved variable; bracket
    // access is forbidden so the dot-access scan below is complete.
    expect(factorySource).not.toContain("process.env[");
    const envReads = Array.from(
      factorySource.matchAll(/process\.env\.([A-Za-z0-9_]+)/g),
      (m) => m[1]
    );
    expect(envReads.length).toBeGreaterThan(0);
    const approved = [
      "ANTHROPIC_API_KEY",
      "BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MODEL",
      "BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MAX_TOKENS",
    ];
    for (const name of envReads) {
      expect(approved).toContain(name);
    }
  });

  it("route never reads multipart form data", () => {
    expect(routeSource).not.toContain("formData");
  });

  it("keeps the route, factory, and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(routeSource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(factorySource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
