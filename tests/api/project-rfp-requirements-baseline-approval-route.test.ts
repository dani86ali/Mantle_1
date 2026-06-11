import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the requirements-baseline approval service so the route's
// auth-gate, body validation, tenant/user/param authority, body-ignoring, and
// result-mapping are tested independent of the DB.
const { mockRequireAuth, mockReview } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockReview: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-requirements-baseline-approval", () => ({
  reviewRfpRequirementsBaselineArtifact: mockReview,
}));

import { POST } from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/review/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/review/route";
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

const ARTIFACT_SUMMARY = {
  id: ARTIFACT_ID,
  projectId: PROJECT,
  stageId: "requirements_baseline_review",
  type: "requirements_baseline",
  status: "needs_review",
  version: 2,
  sourceFileIds: ["file-rfp-1"],
  sourceArtifactIds: ["art-input-package-3"],
  createdAt: "2026-06-10T12:00:00.000Z",
  updatedAt: "2026-06-10T12:00:00.000Z",
};

const OK_RESULT = {
  status: "ok",
  approval: { id: "appr-1", artifactId: ARTIFACT_ID, decision: "approved" },
  artifactStatus: "approved",
  stageStatus: "approved",
  artifact: ARTIFACT_SUMMARY,
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
  mockReview.mockReset().mockResolvedValue(OK_RESULT);
});

describe("POST .../rfp/artifacts/[artifactId]/requirements-baseline/review - auth", () => {
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

describe("POST .../requirements-baseline/review - body validation", () => {
  it("returns 400 invalid_rfp_requirements_baseline_review_request for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_requirements_baseline_review_request");
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
      expect(json.code).toBe("invalid_rfp_requirements_baseline_review_request");
      expect(json.error).toBe("decision is required.");
      expect(mockReview).not.toHaveBeenCalled();
    }
  });
});

describe("POST .../requirements-baseline/review - authority", () => {
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
      payload: { hack: true },
      approval: { decision: "approved" },
      type: "priced_boq",
      stage: "pricing_review",
      requirements: [{ id: "REQ-1", text: "attacker requirement text" }],
      evidence: ["ev-attacker-1"],
      evidenceIds: ["ev-attacker-2"],
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
      "payload",
      "approval",
      "type",
      "stage",
      "requirements",
      "evidence",
      "evidenceIds",
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
    await POST(req(validBody({ note: "baseline complete" })), PARAMS);

    const arg = mockReview.mock.calls[0][0];
    expect(arg.note).toBe("baseline complete");
  });

  it("ignores a non-string note rather than rejecting the request", async () => {
    await POST(req(validBody({ note: 999 })), PARAMS);

    expect(mockReview).toHaveBeenCalledTimes(1);
    const arg = mockReview.mock.calls[0][0];
    expect("note" in arg).toBe(false);
  });
});

describe("POST .../requirements-baseline/review - result mapping", () => {
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
      "requirements_baseline_artifact_not_found",
      "Requirements baseline artifact not found.",
    ],
    [
      { status: "approval_failed" },
      409,
      "requirements_baseline_review_failed",
      "Requirements baseline review could not be recorded.",
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

  it("maps artifact_not_requirements_baseline to 409 with the artifact summary", async () => {
    const artifact = { ...ARTIFACT_SUMMARY, type: "input_package" };
    mockReview.mockResolvedValue({
      status: "artifact_not_requirements_baseline",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("artifact_not_requirements_baseline");
    expect(body.error).toBe(
      "Artifact is not a reviewable requirements_baseline artifact."
    );
    expect(body.artifact).toEqual(artifact);
  });

  it("maps artifact_not_reviewable to 409 requirements_baseline_artifact_not_reviewable with the artifact summary", async () => {
    const artifact = { ...ARTIFACT_SUMMARY, status: "approved" };
    mockReview.mockResolvedValue({
      status: "artifact_not_reviewable",
      artifact,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("requirements_baseline_artifact_not_reviewable");
    expect(body.error).toBe(
      "Requirements baseline artifact is not reviewable."
    );
    expect(body.artifact).toEqual(artifact);
  });

  it("maps ok to 200 with { approval, artifactStatus, stageStatus, artifact } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      approval: OK_RESULT.approval,
      artifactStatus: OK_RESULT.artifactStatus,
      stageStatus: OK_RESULT.stageStatus,
      artifact: ARTIFACT_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });
});

describe("POST .../requirements-baseline/review - service failure", () => {
  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockReview.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("requirements_baseline_review_failed");
    expect(body.error).toBe("Unable to review requirements baseline.");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("POST .../requirements-baseline/review - route surface", () => {
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
    "src/app/api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/review/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-requirements-baseline-approval-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the requirements-baseline approval service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-requirements-baseline-approval",
    ]);
  });

  it("does not import DB, stores, the draft service, extraction, evidence, raw file loaders, pricing, SKU resolution, config expansion, export, runner, AI, catalog, coordinator, engine, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/project-rfp-requirements-baseline"',
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
