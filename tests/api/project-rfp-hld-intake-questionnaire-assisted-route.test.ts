import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock auth and the questionnaire-assisted HLD intake service so the route's auth
// gate, body validation, tenant/user/param authority, sourceMode-decoy rejection,
// and result mapping are tested independent of the DB.
const { mockRequireAuth, mockCreateFromQuestionnaire } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockCreateFromQuestionnaire: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/projects/project-rfp-hld-intake", () => ({
  createRfpHldIntakeFromQuestionnaireDraft: mockCreateFromQuestionnaire,
  isRfpHldIntakeValidationError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    (error as { isRfpHldIntakeValidationError?: unknown })
      .isRfpHldIntakeValidationError === true,
}));

function validationError(message: string): Error {
  return Object.assign(new Error(message), {
    isRfpHldIntakeValidationError: true as const,
  });
}

import { POST } from "@/app/api/projects/[id]/rfp/hld-intake/questionnaire-assisted/route";
import * as routeModule from "@/app/api/projects/[id]/rfp/hld-intake/questionnaire-assisted/route";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROJECT = "proj-rfp-1";
const SOURCE_ID = "art-questionnaire-1";
const SESSION = {
  userId: "u-engineer",
  tenantId: "11111111-1111-1111-1111-111111111111",
  email: "eng@bomatic.ai",
  name: "Engineer",
  role: "engineer" as const,
};
const PARAMS = { params: { id: PROJECT } };

const ARTIFACT_SUMMARY = {
  id: "art-hld-intake-1",
  projectId: PROJECT,
  stageId: "hld_design_delta_review",
  type: "hld_intake",
  status: "needs_review",
  version: 1,
  sourceFileIds: [],
  sourceArtifactIds: [SOURCE_ID],
  createdAt: "2026-06-20T12:00:00.000Z",
  updatedAt: "2026-06-20T12:00:00.000Z",
};

const PAYLOAD_SUMMARY = {
  payloadKind: "rfp_hld_intake",
  createdBy: SESSION.userId,
  createdAt: "2026-06-20T12:00:00.000Z",
  sourceMode: "questionnaire_assisted",
  sourceQuestionnaireArtifactId: SOURCE_ID,
  answerCount: 3,
  statusCounts: { answered: 1, unknown: 1, not_applicable: 1 },
  fieldIds: ["sq-1", "sq-2", "added-1"],
};

const CREATE_OK = {
  status: "ok",
  artifact: ARTIFACT_SUMMARY,
  payloadSummary: PAYLOAD_SUMMARY,
};

const REVIEWED_QUESTIONS = [
  { questionId: "sq-1", action: "accepted", sourceQuestionId: "sq-1", order: 1, questionText: "Existing core?", whyAsked: "context", answerType: "free_text", required: true, sourceRefIds: ["ref-1"] },
];
const ANSWERS = [{ questionId: "sq-1", status: "answered", value: "x" }];

const WRONG_MODE_PROJECT = {
  id: PROJECT,
  name: "Honeywell Quick BoM",
  customerName: "Honeywell",
  mode: "quick_bom",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T11:30:00.000Z",
};

function createBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    sourceQuestionnaireArtifactId: SOURCE_ID,
    reviewedQuestions: REVIEWED_QUESTIONS,
    answers: ANSWERS,
    ...overrides,
  };
}

function req(
  body: unknown = createBody(),
  opts: { invalidJson?: boolean } = {}
): NextRequest {
  return {
    headers: { get: () => null },
    json: vi.fn(
      opts.invalidJson
        ? () => Promise.reject(new SyntaxError("bad json"))
        : () => Promise.resolve(body)
    ),
    formData: vi.fn(() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockReturnValue(SESSION);
  mockCreateFromQuestionnaire.mockReset().mockResolvedValue(CREATE_OK);
});

describe("POST /rfp/hld-intake/questionnaire-assisted - auth", () => {
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
    expect(mockCreateFromQuestionnaire).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
  });
});

describe("POST /rfp/hld-intake/questionnaire-assisted - body validation", () => {
  it("returns 400 for invalid JSON without calling the service", async () => {
    const res = await POST(req(undefined, { invalidJson: true }), PARAMS);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_rfp_hld_intake_request");
    expect(mockCreateFromQuestionnaire).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed bodies without calling the service", async () => {
    const badBodies: unknown[] = [
      null,
      "string-body",
      42,
      true,
      [],
      {},
      { reviewedQuestions: REVIEWED_QUESTIONS, answers: ANSWERS },
      { sourceQuestionnaireArtifactId: "   ", reviewedQuestions: REVIEWED_QUESTIONS, answers: ANSWERS },
      { sourceQuestionnaireArtifactId: 42, reviewedQuestions: REVIEWED_QUESTIONS, answers: ANSWERS },
      { sourceQuestionnaireArtifactId: SOURCE_ID, reviewedQuestions: "nope", answers: ANSWERS },
      { sourceQuestionnaireArtifactId: SOURCE_ID, reviewedQuestions: REVIEWED_QUESTIONS, answers: "nope" },
      { sourceQuestionnaireArtifactId: SOURCE_ID, reviewedQuestions: REVIEWED_QUESTIONS },
    ];
    for (const body of badBodies) {
      mockCreateFromQuestionnaire.mockClear();
      const res = await POST(req(body), PARAMS);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_rfp_hld_intake_request");
      expect(mockCreateFromQuestionnaire).not.toHaveBeenCalled();
    }
  });
});

describe("POST /rfp/hld-intake/questionnaire-assisted - authority", () => {
  it("passes only session tenant/user, route project id, source id, reviewed questions, and answers; decoy authority fields (including sourceMode) never reach the service", async () => {
    const body = createBody({
      tenantId: "attacker-tenant",
      projectId: "attacker-project",
      createdBy: "attacker-user",
      createdAt: "2000-01-01T00:00:00.000Z",
      status: "approved",
      id: "attacker-artifact",
      payload: { hack: true },
      price: 999,
      sku: "ATTACKER-SKU",
      sourceMode: "manual_override",
      manualOverrideReason: "attacker override",
    });

    await POST(req(body), PARAMS);

    expect(mockCreateFromQuestionnaire).toHaveBeenCalledTimes(1);
    const arg = mockCreateFromQuestionnaire.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual([
      "answers",
      "createdBy",
      "projectId",
      "reviewedQuestions",
      "sourceQuestionnaireArtifactId",
      "tenantId",
    ]);
    expect(arg.tenantId).toBe(SESSION.tenantId);
    expect(arg.projectId).toBe(PROJECT);
    expect(arg.createdBy).toBe(SESSION.userId);
    expect(arg.sourceQuestionnaireArtifactId).toBe(SOURCE_ID);

    for (const leaked of [
      "createdAt",
      "status",
      "id",
      "payload",
      "price",
      "sku",
      "sourceMode",
      "manualOverrideReason",
    ]) {
      expect(leaked in arg).toBe(false);
    }
    expect(JSON.stringify(arg)).not.toContain("attacker");
  });
});

describe("POST /rfp/hld-intake/questionnaire-assisted - result mapping", () => {
  it("maps not_found to 404 project_not_found", async () => {
    mockCreateFromQuestionnaire.mockResolvedValue({ status: "not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("project_not_found");
  });

  it("maps source_not_found to 404 source_questionnaire_not_found", async () => {
    mockCreateFromQuestionnaire.mockResolvedValue({ status: "source_not_found" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("source_questionnaire_not_found");
  });

  it("maps wrong_mode to 409 wrong_project_mode with the project summary", async () => {
    mockCreateFromQuestionnaire.mockResolvedValue({
      status: "wrong_mode",
      project: WRONG_MODE_PROJECT,
    });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("wrong_project_mode");
    expect(body.project).toEqual(WRONG_MODE_PROJECT);
  });

  it("maps source_not_usable to 409 source_questionnaire_not_usable", async () => {
    mockCreateFromQuestionnaire.mockResolvedValue({ status: "source_not_usable" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("source_questionnaire_not_usable");
  });

  it("maps invalid_source_payload to 409 source_questionnaire_invalid", async () => {
    mockCreateFromQuestionnaire.mockResolvedValue({ status: "invalid_source_payload" });

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("source_questionnaire_invalid");
  });

  it("maps ok to 201 with { artifact, payloadSummary } and no status discriminator", async () => {
    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      artifact: ARTIFACT_SUMMARY,
      payloadSummary: PAYLOAD_SUMMARY,
    });
    expect("status" in body).toBe(false);
  });

  it("maps a known semantic validation error to 400 without leaking the message", async () => {
    const secret = "Waived question requires a waiverReason: sq-4.";
    mockCreateFromQuestionnaire.mockRejectedValue(validationError(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_rfp_hld_intake_request");
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("maps an unexpected service error to a controlled 500 without exposing the thrown error", async () => {
    const secret = "boom-internal-stack-detail";
    mockCreateFromQuestionnaire.mockRejectedValue(new Error(secret));

    const res = await POST(req(), PARAMS);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("rfp_hld_intake_failed");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});

describe("questionnaire-assisted route surface", () => {
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
    "src/app/api/projects/[id]/rfp/hld-intake/questionnaire-assisted/route.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/api/project-rfp-hld-intake-questionnaire-assisted-route.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only Next.js server primitives, requireAuth, and the HLD intake service", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "next/server",
      "@/lib/middleware/auth",
      "@/lib/projects/project-rfp-hld-intake",
    ]);
  });

  it("touches no DB store, file/evidence, pricing/sku/catalog/config, AI, or UI module", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/evidence"',
      'from "@/lib/projects/files"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
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
      "pdf-parse",
      "mammoth",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("keeps the route source and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
