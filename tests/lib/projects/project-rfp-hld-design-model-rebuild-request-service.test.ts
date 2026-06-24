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
import { createRfpHldDesignModelRebuildRequest } from "@/lib/projects/project-rfp-hld-design-model-rebuild-request-service";
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
