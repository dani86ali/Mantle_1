import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the requirements-baseline service so the route's auth gate,
// tenant/project/createdBy authority, body sanitization, and result mapping
// are tested independent of the DB. The factory also provides the category
// and priority lists the route imports for its 400 gate; the literals mirror
// the service's exported RFP_REQUIREMENT_CATEGORIES /
// RFP_REQUIREMENT_PRIORITIES values (the real service module is never loaded
// here because it would pull the DB stores into the test).
const { mockRequireAuth, mockCreateDraft } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreateDraft: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-requirements-baseline", () => ({
  createRfpRequirementsBaselineDraft: mockCreateDraft,
  RFP_REQUIREMENT_CATEGORIES: [
    "technical",
    "commercial",
    "compliance",
    "delivery",
    "security",
    "support",
    "legal",
    "other",
  ],
  RFP_REQUIREMENT_PRIORITIES: [
    "mandatory",
    "preferred",
    "optional",
    "informational",
    "unknown",
  ],
}));

import { POST } from "@/app/api/projects/[id]/rfp/requirements-baseline/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/requirements-baseline/route";
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
  "candidates must be a non-empty array; each candidate needs nonblank text, at least one nonblank evidence id, and a valid category/priority when provided.";

const VALID_BODY = {
  candidates: [
    {
      text: "Provide 48-port access switches.",
      category: "technical",
      priority: "mandatory",
      evidenceIds: ["evidence-text-1", "evidence-table-1"],
      title: "Access switches",
      notes: "From section 3.1.",
    },
    {
      text: "Submit a compliance statement.",
      evidenceIds: ["evidence-text-1"],
    },
  ],
};

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
  mockCreateDraft.mockReset().mockResolvedValue({
    status: "ok",
    artifact: ARTIFACT_SUMMARY,
    payloadSummary: PAYLOAD_SUMMARY,
  });
});

describe("POST .../rfp/requirements-baseline - auth", () => {
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

describe("POST .../rfp/requirements-baseline - authority and body sanitization", () => {
  it("passes session.tenantId, the route param, and session.userId; decoy authority fields never reach the service", async () => {
    const request = req({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      createdBy: "attacker-user",
      status: "approved",
      sourceFileIds: ["attacker-file"],
      sourceArtifactIds: ["attacker-artifact"],
      artifactId: "attacker-artifact-id",
      version: 99,
      stageId: "export_review",
      type: "priced_boq",
      approval: { decision: "approved" },
      payload: { hack: true },
      candidates: [
        {
          text: "Provide 48-port access switches.",
          category: "technical",
          priority: "mandatory",
          evidenceIds: ["evidence-text-1", "evidence-table-1"],
          title: "Access switches",
          notes: "From section 3.1.",
          tenantId: "attacker-tenant",
          projectId: "attacker-project",
          createdBy: "attacker-user",
          status: "approved",
          sourceFileIds: ["attacker-file"],
          sourceArtifactIds: ["attacker-artifact"],
          id: "RFP-REQ-999",
          version: 7,
          rawText: "raw rfp text dump",
          rows: [["sku", "qty"]],
          unitPrice: 100,
          sku: "C9300-48T",
          configuration: { expand: true },
          exportFormat: "xlsx",
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    expect(request.json).toHaveBeenCalledTimes(1);
    expect(request.formData).not.toHaveBeenCalled();
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);

    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "candidates",
      "createdBy",
      "projectId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.createdBy).toBe(SESSION.userId);

    // Candidates are the only body-derived value, reduced to the whitelist.
    expect(arg.candidates).toEqual([
      {
        text: "Provide 48-port access switches.",
        category: "technical",
        priority: "mandatory",
        evidenceIds: ["evidence-text-1", "evidence-table-1"],
        title: "Access switches",
        notes: "From section 3.1.",
      },
    ]);
    const candidate = (arg.candidates as Array<Record<string, unknown>>)[0];
    expect(Object.keys(candidate).sort()).toEqual([
      "category",
      "evidenceIds",
      "notes",
      "priority",
      "text",
      "title",
    ]);

    const json = JSON.stringify(arg);
    expect(json).not.toContain("attacker");
    expect(json).not.toContain("raw rfp text dump");
    expect(json).not.toContain("unitPrice");
    expect(json).not.toContain("C9300-48T");
  });

  it("keeps a minimal candidate minimal: null category/priority and non-string title/notes/evidence entries are dropped", async () => {
    const request = req({
      candidates: [
        {
          text: "Submit a compliance statement.",
          evidenceIds: [" evidence-text-1 ", 42, null, "", "evidence-text-1"],
          category: null,
          priority: null,
          title: 7,
          notes: { rich: true },
        },
      ],
    });

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(201);
    const arg = mockCreateDraft.mock.calls[0][0] as Record<string, unknown>;
    // Only string evidence entries pass through; the service trims, drops
    // blanks, and deduplicates. Null category/priority mean "absent" exactly
    // as the service's defaulting treats them.
    expect(arg.candidates).toEqual([
      {
        text: "Submit a compliance statement.",
        evidenceIds: [" evidence-text-1 ", "", "evidence-text-1"],
      },
    ]);
    const candidate = (arg.candidates as Array<Record<string, unknown>>)[0];
    expect(Object.keys(candidate).sort()).toEqual(["evidenceIds", "text"]);
  });
});

describe("POST .../rfp/requirements-baseline - malformed body", () => {
  it("rejects unparseable JSON with a controlled 400 without calling the service", async () => {
    const request = reqWithBrokenJson();

    const res = await POST(request, PARAMS);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "invalid_rfp_requirements_baseline_request",
      error: INVALID_REQUEST_ERROR,
    });
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  const INVALID_BODIES: Array<[string, unknown]> = [
    ["a null body", null],
    ["a string body", "candidates"],
    ["an array body", [{ text: "x", evidenceIds: ["e-1"] }]],
    ["a body without candidates", {}],
    ["non-array candidates", { candidates: { text: "x" } }],
    ["an empty candidates array", { candidates: [] }],
    ["a null candidate entry", { candidates: [null] }],
    ["a string candidate entry", { candidates: ["text"] }],
    ["a candidate without text", { candidates: [{ evidenceIds: ["e-1"] }] }],
    [
      "a candidate with blank text",
      { candidates: [{ text: "   ", evidenceIds: ["e-1"] }] },
    ],
    [
      "a candidate with non-string text",
      { candidates: [{ text: 42, evidenceIds: ["e-1"] }] },
    ],
    [
      "a candidate with an unknown category",
      { candidates: [{ text: "ok", evidenceIds: ["e-1"], category: "bogus" }] },
    ],
    [
      "a candidate with a non-string category",
      { candidates: [{ text: "ok", evidenceIds: ["e-1"], category: 7 }] },
    ],
    [
      "a candidate with an unknown priority",
      { candidates: [{ text: "ok", evidenceIds: ["e-1"], priority: "urgent" }] },
    ],
    ["a candidate without evidenceIds", { candidates: [{ text: "ok" }] }],
    [
      "a candidate with non-array evidenceIds",
      { candidates: [{ text: "ok", evidenceIds: "e-1" }] },
    ],
    [
      "a candidate with an empty evidenceIds array",
      { candidates: [{ text: "ok", evidenceIds: [] }] },
    ],
    [
      "a candidate with only blank evidence ids",
      { candidates: [{ text: "ok", evidenceIds: ["", "   "] }] },
    ],
    [
      "a candidate with only non-string evidence ids",
      { candidates: [{ text: "ok", evidenceIds: [42, null] }] },
    ],
    [
      "a later invalid candidate",
      {
        candidates: [
          { text: "ok", evidenceIds: ["e-1"] },
          { text: "", evidenceIds: ["e-2"] },
        ],
      },
    ],
  ];

  it.each(INVALID_BODIES)(
    "rejects %s with a controlled 400 without calling the service",
    async (_label, body) => {
      const res = await POST(req(body), PARAMS);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        code: "invalid_rfp_requirements_baseline_request",
        error: INVALID_REQUEST_ERROR,
      });
      expect(mockCreateDraft).not.toHaveBeenCalled();
    }
  );
});

describe("POST .../rfp/requirements-baseline - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreateDraft.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      code: "project_not_found",
      error: "Project not found.",
    });
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "wrong_project_mode",
      error: "Project is not an RFP project.",
      project: WRONG_MODE_PROJECT,
    });
  });

  it("maps evidence_not_found to 409 with missingEvidenceIds", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "evidence_not_found",
      missingEvidenceIds: ["evidence-missing-1", "evidence-missing-2"],
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_baseline_evidence_not_found",
      error: "One or more cited evidence items were not found.",
      missingEvidenceIds: ["evidence-missing-1", "evidence-missing-2"],
    });
  });

  it("maps evidence_not_rfp_extraction to 409 with the lean evidence summaries", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "evidence_not_rfp_extraction",
      evidence: EVIDENCE_SUMMARIES,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_baseline_evidence_not_rfp_extraction",
      error: "One or more cited evidence items are not RFP extraction evidence.",
      evidence: EVIDENCE_SUMMARIES,
    });
  });

  it("maps evidence_missing_input_package to 409 with the lean evidence summaries", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "evidence_missing_input_package",
      evidence: EVIDENCE_SUMMARIES,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_baseline_evidence_missing_input_package",
      error:
        "One or more cited evidence items do not name their input package artifact.",
      evidence: EVIDENCE_SUMMARIES,
    });
  });

  it("maps input_package_artifact_not_found to 409 with missingArtifactIds", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "input_package_artifact_not_found",
      missingArtifactIds: ["art-input-package-9"],
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_baseline_input_package_not_found",
      error: "One or more cited input package artifacts were not found.",
      missingArtifactIds: ["art-input-package-9"],
    });
  });

  it("maps artifact_not_input_package to 409 with the lean artifact summaries", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "artifact_not_input_package",
      artifacts: ARTIFACT_SUMMARIES,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_baseline_artifact_not_input_package",
      error: "One or more cited artifacts are not input package artifacts.",
      artifacts: ARTIFACT_SUMMARIES,
    });
  });

  it("maps input_package_not_approved to 409 with the lean artifact summaries", async () => {
    mockCreateDraft.mockResolvedValue({
      status: "input_package_not_approved",
      artifacts: ARTIFACT_SUMMARIES,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "rfp_requirements_baseline_input_package_not_approved",
      error: "One or more cited input package artifacts are not approved.",
      artifacts: ARTIFACT_SUMMARIES,
    });
  });

  it("maps ok to 201 with { artifact, payloadSummary }, no status discriminator, and no tenantId", async () => {
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
  });
});

describe("POST .../rfp/requirements-baseline - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateDraft.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      code: "rfp_requirements_baseline_failed",
      error: "Unable to create RFP requirements baseline draft.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../rfp/requirements-baseline - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/requirements-baseline/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-requirements-baseline-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the requirements-baseline service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-requirements-baseline",
    ]);
  });

  it("does not import DB, stores, extraction, persistence, raw file loaders, pricing, config expansion, export, runner, AI, catalog, intake, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      'from "@/lib/projects/project-rfp-evidence-persistence"',
      'from "@/lib/projects/project-rfp-evidence-run"',
      'from "@/lib/projects/project-rfp-evidence-inspection"',
      'from "@/lib/projects/project-rfp-extraction-run"',
      'from "@/lib/projects/rfp-document-extraction"',
      'from "@/lib/projects/project-rfp-input-package',
      'from "@/lib/projects/approvals"',
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/boq-formats"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
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

  it("never reads multipart form data", () => {
    expect(source).not.toContain("formData");
  });

  it("keeps the route source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
