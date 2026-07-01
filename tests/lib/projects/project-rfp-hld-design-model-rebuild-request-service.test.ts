import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Project, ProjectArtifact } from "@/types/project";

vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  createProjectArtifactVersion: vi.fn(),
  getProjectArtifactById: vi.fn(),
  listProjectArtifacts: vi.fn(),
}));
// The review-payload validator is exercised in its own contract tests; here we
// drive the service's review gate deterministically.
vi.mock("@/lib/projects/project-rfp-hld-design-model-review", () => ({
  validateRfpHldDesignModelReviewPayload: vi.fn(),
}));

import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifacts,
} from "@/lib/db/project-artifact-store";
import { validateRfpHldDesignModelReviewPayload } from "@/lib/projects/project-rfp-hld-design-model-review";
import {
  createRfpHldDesignModelRebuildRequest,
  listRfpHldDesignModelRebuildRequests,
} from "@/lib/projects/project-rfp-hld-design-model-rebuild-request-service";
import { RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model-rebuild-request";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const listMock = vi.mocked(listProjectArtifacts);
const createMock = vi.mocked(createProjectArtifactVersion);
const reviewValidatorMock = vi.mocked(validateRfpHldDesignModelReviewPayload);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const TS = new Date("2026-01-01T00:00:00.000Z");
const MODEL_ID = "model-1";
const REVIEW_ID = "review-1";
const REQUESTED_AT = new Date("2026-06-24T10:00:00.000Z");

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Acme RFP",
    customerName: "Acme",
    mode: "rfp",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: MODEL_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model",
    status: "needs_review",
    version: 1,
    payload: {},
    sourceFileIds: [],
    sourceArtifactIds: ["bundle-1"],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeReview(
  modelId = MODEL_ID,
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: REVIEW_ID,
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_review",
    status: "needs_review",
    version: 1,
    payload: { sourceHldDesignModelArtifactId: modelId },
    sourceFileIds: [],
    sourceArtifactIds: [modelId, "bundle-1"],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

/** A persisted, valid active rebuild request for MODEL_ID (passes the contract). */
function makeActiveRequest(): ProjectArtifact {
  return {
    id: "req-existing",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_rebuild_request",
    status: "needs_review",
    version: 1,
    payload: {
      payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
      sourceArtifactIds: [MODEL_ID, REVIEW_ID],
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceReviewArtifactId: REVIEW_ID,
      requestedBy: "eng-prev",
      requestedAt: "2026-06-23T00:00:00.000Z",
      reason: "Earlier review findings need a redraft.",
      instructions: "Redraft from the same approved source artifacts only.",
      status: "active",
    },
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, REVIEW_ID],
    createdAt: TS,
    updatedAt: TS,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    sourceHldDesignModelArtifactId: MODEL_ID,
    sourceReviewArtifactId: REVIEW_ID,
    requestedBy: "eng-1",
    reason: "The advisory review flagged source-alignment findings to resolve.",
    instructions:
      "Redraft from the same approved source artifacts. Fix only the listed findings.",
    requestedAt: REQUESTED_AT,
    ...overrides,
  };
}

function wireArtifacts(model: ProjectArtifact | null, review: ProjectArtifact | null): void {
  getArtifactMock.mockImplementation(async (_t, _p, id) => {
    if (id === MODEL_ID) return model;
    if (id === REVIEW_ID) return review;
    return null;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  reviewValidatorMock.mockReturnValue({ valid: true, errors: [] });
  listMock.mockResolvedValue([]);
  createMock.mockImplementation(async (req) => ({
    id: "req-new",
    projectId: req.projectId,
    stageId: req.stageId,
    type: req.type,
    status: req.status ?? "needs_review",
    version: 1,
    payload: req.payload ?? {},
    sourceFileIds: req.sourceFileIds ?? [],
    sourceArtifactIds: req.sourceArtifactIds ?? [],
    createdAt: TS,
    updatedAt: TS,
  }));
});

describe("createRfpHldDesignModelRebuildRequest - happy path", () => {
  it("persists a valid request linked to the model and review", async () => {
    wireArtifacts(makeModel(), makeReview());
    const result = await createRfpHldDesignModelRebuildRequest(input());
    expect(result.status).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0];
    expect(arg.type).toBe("hld_design_model_rebuild_request");
    expect(arg.status).toBe("needs_review");
    expect(arg.stageId).toBe("hld_design_delta_review");
    expect(arg.sourceArtifactIds).toEqual([MODEL_ID, REVIEW_ID]);
    const payload = arg.payload as Record<string, unknown>;
    expect(payload.payloadKind).toBe(RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND);
    expect(payload.status).toBe("active");
    expect(payload.requestedBy).toBe("eng-1");
    if (result.status === "ok") {
      expect(result.artifact.sourceArtifactIds).toEqual([MODEL_ID, REVIEW_ID]);
      expect(JSON.stringify(result.artifact)).not.toContain(TENANT);
    }
  });
});

describe("createRfpHldDesignModelRebuildRequest - gates", () => {
  it("returns not_found when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);
    expect((await createRfpHldDesignModelRebuildRequest(input())).status).toBe("not_found");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns wrong_mode for a non-RFP project", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await createRfpHldDesignModelRebuildRequest(input());
    expect(result.status).toBe("wrong_mode");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns invalid_source_model when the model is the wrong type/stage/status", async () => {
    wireArtifacts(makeModel({ type: "hld_diagram" }), makeReview());
    expect((await createRfpHldDesignModelRebuildRequest(input())).status).toBe(
      "invalid_source_model"
    );
    wireArtifacts(makeModel({ status: "approved" }), makeReview());
    expect((await createRfpHldDesignModelRebuildRequest(input())).status).toBe(
      "invalid_source_model"
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns invalid_review when the review payload points to a different model", async () => {
    wireArtifacts(makeModel(), makeReview("other-model"));
    expect((await createRfpHldDesignModelRebuildRequest(input())).status).toBe(
      "invalid_review"
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns invalid_review when the review payload does not validate", async () => {
    reviewValidatorMock.mockReturnValue({ valid: false, errors: ["bad"] });
    wireArtifacts(makeModel(), makeReview());
    expect((await createRfpHldDesignModelRebuildRequest(input())).status).toBe(
      "invalid_review"
    );
  });

  it("blocks a second active request for the same model", async () => {
    wireArtifacts(makeModel(), makeReview());
    listMock.mockResolvedValue([makeActiveRequest()]);
    const result = await createRfpHldDesignModelRebuildRequest(input());
    expect(result.status).toBe("active_request_exists");
    if (result.status === "active_request_exists") {
      expect(result.artifact.id).toBe("req-existing");
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("allows a new request when a prior request is stale", async () => {
    wireArtifacts(makeModel(), makeReview());
    listMock.mockResolvedValue([{ ...makeActiveRequest(), status: "stale" }]);
    expect((await createRfpHldDesignModelRebuildRequest(input())).status).toBe("ok");
  });

  it("rejects forbidden instructions before persistence", async () => {
    wireArtifacts(makeModel(), makeReview());
    const result = await createRfpHldDesignModelRebuildRequest(
      input({ instructions: "Select the C9300 SKU and set the pricing." })
    );
    expect(result.status).toBe("invalid_request_payload");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws on blank required input before any store call", async () => {
    await expect(
      createRfpHldDesignModelRebuildRequest(input({ reason: "  " }))
    ).rejects.toThrow();
    expect(getProjectMock).not.toHaveBeenCalled();
  });
});

const BUNDLE_ID = "bundle-1";
const BOUNDED_SUMMARY = "Redraft to resolve the blocking source-alignment findings.";
const BOUNDED_INSTRUCTIONS =
  "Redraft from the same approved source artifacts. Fix only the listed blocking " +
  "findings. Do not add scope.";

/** A blocking ai_advisory review that forces an initial OpenAI redo. */
function makeBlockingAiReview(): ProjectArtifact {
  return makeReview(MODEL_ID, {
    payload: {
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
      reviewer: { type: "ai_advisory" },
      findings: [
        { id: "f-1", severity: "blocking", category: "source_mismatch", message: "x" },
      ],
      recommendation: "rebuild_recommended",
      boundedRebuildInstructions: {
        summary: BOUNDED_SUMMARY,
        instructions: BOUNDED_INSTRUCTIONS,
      },
    },
  });
}

/** A prior, valid, non-rejected initial OpenAI-forced request for BUNDLE_ID. */
function makeOpenAiRequest(overrides: Partial<ProjectArtifact> = {}): ProjectArtifact {
  return {
    id: "req-openai-prev",
    projectId: PROJECT,
    stageId: "hld_design_delta_review",
    type: "hld_design_model_rebuild_request",
    status: "needs_review",
    version: 1,
    payload: {
      payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
      sourceArtifactIds: [MODEL_ID, REVIEW_ID],
      sourceHldDesignModelArtifactId: MODEL_ID,
      sourceReviewArtifactId: REVIEW_ID,
      requestedBy: "openai-gate",
      requestedAt: "2026-06-23T00:00:00.000Z",
      reason: "Redraft to resolve the blocking findings.",
      instructions: "Redraft from the same approved source artifacts only.",
      status: "active",
      requestSource: "openai_advisory",
      redoPhase: "initial_openai_gate",
      redoAttempt: 1,
      maxRedoAttempts: 1,
      sourceHldSourceBundleArtifactId: BUNDLE_ID,
    },
    sourceFileIds: [],
    sourceArtifactIds: [MODEL_ID, REVIEW_ID],
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe("createRfpHldDesignModelRebuildRequest - OpenAI-forced initial redo", () => {
  it("writes OpenAI policy metadata and persists the review's bounded text, not caller text", async () => {
    wireArtifacts(makeModel(), makeBlockingAiReview());
    const result = await createRfpHldDesignModelRebuildRequest(
      input({
        reason: "caller transport reason that must be ignored",
        instructions: "caller transport instructions that must be ignored",
      })
    );
    expect(result.status).toBe("ok");
    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.requestSource).toBe("openai_advisory");
    expect(payload.redoPhase).toBe("initial_openai_gate");
    expect(payload.redoAttempt).toBe(1);
    expect(payload.maxRedoAttempts).toBe(1);
    expect(payload.sourceHldSourceBundleArtifactId).toBe(BUNDLE_ID);
    expect(payload.reason).toBe(BOUNDED_SUMMARY);
    expect(payload.instructions).toBe(BOUNDED_INSTRUCTIONS);
    expect(JSON.stringify(payload)).not.toContain("caller transport");
  });

  it("returns redo_limit_exhausted and writes nothing on a second forced request", async () => {
    wireArtifacts(makeModel(), makeBlockingAiReview());
    listMock.mockResolvedValue([makeOpenAiRequest({ status: "stale" })]);
    const result = await createRfpHldDesignModelRebuildRequest(input());
    expect(result.status).toBe("redo_limit_exhausted");
    if (result.status === "redo_limit_exhausted") {
      expect(result.phase).toBe("initial_openai_gate");
      expect(result.maxRedoAttempts).toBe(1);
      expect(result.attemptCount).toBe(1);
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns active_request_exists before redo_limit_exhausted when a request is active", async () => {
    wireArtifacts(makeModel(), makeBlockingAiReview());
    listMock.mockResolvedValue([makeOpenAiRequest()]);
    const result = await createRfpHldDesignModelRebuildRequest(input());
    expect(result.status).toBe("active_request_exists");
    if (result.status === "active_request_exists") {
      expect(result.artifact.id).toBe("req-openai-prev");
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it("does not count a rejected prior forced request against the budget", async () => {
    wireArtifacts(makeModel(), makeBlockingAiReview());
    listMock.mockResolvedValue([makeOpenAiRequest({ status: "rejected" })]);
    expect((await createRfpHldDesignModelRebuildRequest(input())).status).toBe("ok");
  });

  it("marks the non-OpenAI path requestSource engineer with no OpenAI policy metadata", async () => {
    wireArtifacts(makeModel(), makeReview());
    const result = await createRfpHldDesignModelRebuildRequest(input());
    expect(result.status).toBe("ok");
    const payload = createMock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.requestSource).toBe("engineer");
    for (const key of [
      "redoPhase",
      "redoAttempt",
      "maxRedoAttempts",
      "sourceHldSourceBundleArtifactId",
    ]) {
      expect(key in payload, key).toBe(false);
    }
  });

  it("rejects >250-word engineer instructions before persistence", async () => {
    wireArtifacts(makeModel(), makeReview());
    const result = await createRfpHldDesignModelRebuildRequest(
      input({ instructions: "fix ".repeat(251).trim() })
    );
    expect(result.status).toBe("invalid_request_payload");
    if (result.status === "invalid_request_payload") {
      expect(result.errors.some((e) => e.includes("engineer exceeds 250 words"))).toBe(true);
    }
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("listRfpHldDesignModelRebuildRequests", () => {
  const LIST_INPUT = { tenantId: TENANT, projectId: PROJECT };

  it("returns not_found when the project is missing, without listing artifacts", async () => {
    getProjectMock.mockResolvedValue(null);
    const result = await listRfpHldDesignModelRebuildRequests(LIST_INPUT);
    expect(result.status).toBe("not_found");
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns wrong_mode with the project summary for a non-RFP project", async () => {
    getProjectMock.mockResolvedValue(makeProject({ mode: "quick_bom" }));
    const result = await listRfpHldDesignModelRebuildRequests(LIST_INPUT);
    expect(result.status).toBe("wrong_mode");
    if (result.status === "wrong_mode") {
      expect(result.project.id).toBe(PROJECT);
      expect(result.project.mode).toBe("quick_bom");
    }
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns only executable-active requests with a lean payload summary", async () => {
    const generated: ProjectArtifact = {
      ...makeActiveRequest(),
      id: "req-generated",
      status: "generated",
    };
    listMock.mockResolvedValue([makeActiveRequest(), generated]);
    const result = await listRfpHldDesignModelRebuildRequests(LIST_INPUT);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.artifactCount).toBe(2);
      expect(result.artifacts.map((a) => a.id)).toEqual(["req-existing", "req-generated"]);
      expect(result.artifacts[0].payloadSummary).toEqual({
        payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
        sourceHldDesignModelArtifactId: MODEL_ID,
        sourceReviewArtifactId: REVIEW_ID,
        requestedAt: "2026-06-23T00:00:00.000Z",
        status: "active",
      });
    }
    // Discovery only: it never re-loads the source model/review per request.
    expect(getArtifactMock).not.toHaveBeenCalled();
  });

  it("surfaces optional policy metadata in the listed summary without leaking body text", async () => {
    listMock.mockResolvedValue([makeOpenAiRequest()]);
    const result = await listRfpHldDesignModelRebuildRequests(LIST_INPUT);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.artifacts[0].payloadSummary).toEqual({
        payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
        sourceHldDesignModelArtifactId: MODEL_ID,
        sourceReviewArtifactId: REVIEW_ID,
        requestedAt: "2026-06-23T00:00:00.000Z",
        status: "active",
        requestSource: "openai_advisory",
        redoPhase: "initial_openai_gate",
        redoAttempt: 1,
        maxRedoAttempts: 1,
        sourceHldSourceBundleArtifactId: BUNDLE_ID,
      });
    }
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("openai-gate");
    expect(serialized).not.toContain("Redraft from the same approved source artifacts only.");
  });

  it("surfaces requestSource engineer without leaking body text", async () => {
    const engineerRequest: ProjectArtifact = {
      ...makeActiveRequest(),
      id: "req-engineer",
      payload: { ...makeActiveRequest().payload, requestSource: "engineer" },
    };
    listMock.mockResolvedValue([engineerRequest]);
    const result = await listRfpHldDesignModelRebuildRequests(LIST_INPUT);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.artifacts[0].payloadSummary).toEqual({
        payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND,
        sourceHldDesignModelArtifactId: MODEL_ID,
        sourceReviewArtifactId: REVIEW_ID,
        requestedAt: "2026-06-23T00:00:00.000Z",
        status: "active",
        requestSource: "engineer",
      });
    }
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("eng-prev");
    expect(serialized).not.toContain("Earlier review findings need a redraft.");
    expect(serialized).not.toContain("Redraft from the same approved source artifacts only.");
  });

  it("omits invalid, malformed, retired, wrong-type, wrong-stage, and non-executable requests", async () => {
    const omitted: ProjectArtifact[] = [
      { ...makeActiveRequest(), id: "wrong-type", type: "hld_design_model" },
      { ...makeActiveRequest(), id: "not-a-request", type: "hld_design_model_review" },
      { ...makeActiveRequest(), id: "wrong-stage", stageId: "boq_pricing_review" },
      { ...makeActiveRequest(), id: "row-stale", status: "stale" },
      { ...makeActiveRequest(), id: "row-rejected", status: "rejected" },
      { ...makeActiveRequest(), id: "row-failed", status: "failed" },
      { ...makeActiveRequest(), id: "row-approved", status: "approved" },
      {
        ...makeActiveRequest(),
        id: "malformed",
        payload: { payloadKind: RFP_HLD_DESIGN_MODEL_REBUILD_REQUEST_PAYLOAD_KIND },
      },
    ];
    listMock.mockResolvedValue([makeActiveRequest(), ...omitted]);
    const result = await listRfpHldDesignModelRebuildRequests(LIST_INPUT);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.artifactCount).toBe(1);
      expect(result.artifacts.map((a) => a.id)).toEqual(["req-existing"]);
    }
  });

  it("returns an empty ok list when nothing is executable-active", async () => {
    listMock.mockResolvedValue([{ ...makeActiveRequest(), status: "stale" }]);
    const result = await listRfpHldDesignModelRebuildRequests(LIST_INPUT);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.artifactCount).toBe(0);
      expect(result.artifacts).toEqual([]);
    }
  });

  it("leaks no tenant id and no raw payload body (reason/instructions/requestedBy)", async () => {
    listMock.mockResolvedValue([makeActiveRequest()]);
    const result = await listRfpHldDesignModelRebuildRequests(LIST_INPUT);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TENANT);
    expect(serialized).not.toContain("eng-prev");
    expect(serialized).not.toContain("Earlier review findings need a redraft.");
    expect(serialized).not.toContain("Redraft from the same approved source artifacts only.");
  });
});

describe("project-rfp-hld-design-model-rebuild-request-service - source purity", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-rebuild-request-service.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("reads no raw files, parsers, AI/provider, pricing, or catalog modules", () => {
    for (const forbidden of [
      "pdf-parse",
      "mammoth",
      "@anthropic-ai",
      "@google/generative-ai",
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "storagePath",
      "filePath",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("is ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
