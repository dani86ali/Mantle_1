import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  SkuResolutionDecision,
} from "@/types/project";

// Mock the three composed boundaries: the project store (verify the Project), the
// artifact read store (load + gate the source sku_resolution), and the existing
// deterministic reviewed-artifact service (apply actions + persist a version). No
// real DB and no real SKU review run here; the wrapper is exercised in isolation.
vi.mock("@/lib/db/project-store", () => ({ getProjectById: vi.fn() }));
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
}));
vi.mock("@/lib/projects/sku-resolution-review-artifact", () => ({
  createReviewedSkuResolutionArtifact: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-quick-bom-sku-resolution-review";
import {
  reviewProjectQuickBomSkuResolutionLines,
  type ReviewProjectQuickBomSkuResolutionLinesInput,
  type ReviewProjectQuickBomSkuResolutionLinesResult,
  type QuickBomSkuResolutionAcceptActionInput,
  type QuickBomSkuResolutionRejectActionInput,
  type QuickBomSkuResolutionManualActionInput,
  type QuickBomSkuResolutionOutOfScopeActionInput,
} from "@/lib/projects/project-quick-bom-sku-resolution-review";
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createReviewedSkuResolutionArtifact } from "@/lib/projects/sku-resolution-review-artifact";
import type {
  CreateReviewedSkuResolutionArtifactResult,
  ReviewedSkuResolutionArtifactPayload,
} from "@/lib/projects/sku-resolution-review-artifact";

const getProjectMock = vi.mocked(getProjectById);
const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createReviewedSkuResolutionArtifact);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const FILE_ID = "file-1";
const SOURCE_ID = "art-skur-1";
const CREATED_ID = "art-skur-2";
const DECIDED_BY = "engineer@stc.com";
const TS1 = new Date("2026-06-01T10:00:00.000Z");
const TS2 = new Date("2026-06-02T11:30:00.000Z");
const SRC_CREATED = new Date("2026-05-21T08:00:00.000Z");
const SRC_UPDATED = new Date("2026-05-21T08:30:00.000Z");
const CREATED_CREATED = new Date("2026-05-21T09:00:00.000Z");
const CREATED_UPDATED = new Date("2026-05-21T09:30:00.000Z");
// Decision-level fields planted in the lower-level payload; the lean payload
// summary drops decisions entirely, so these must never surface in the summary.
const SECRET_ACCEPTED_SKU = "LEAKED-ACCEPTED-SKU";
const SECRET_DECIDED_BY = "leaked-user-id";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT,
    tenantId: TENANT,
    name: "Honeywell Quick BoM",
    customerName: "Honeywell",
    mode: "quick_bom",
    files: [],
    evidence: [],
    stages: [],
    artifacts: [],
    approvals: [],
    createdAt: TS1,
    updatedAt: TS2,
    ...overrides,
  };
}

function makeSourceArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: SOURCE_ID,
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    // The full payload (with decisions) lives on the artifact; summaries exclude it.
    payload: { decisions: [], summary: {} },
    version: 2,
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: ["art-nb-7"],
    createdAt: SRC_CREATED,
    updatedAt: SRC_UPDATED,
    ...overrides,
  };
}

function makeCreatedArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  return {
    id: CREATED_ID,
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "generated",
    version: 3,
    payload: {},
    sourceFileIds: [FILE_ID],
    sourceArtifactIds: [SOURCE_ID],
    createdAt: CREATED_CREATED,
    updatedAt: CREATED_UPDATED,
    ...overrides,
  };
}

function makeSummary(): ReviewedSkuResolutionArtifactPayload["summary"] {
  return {
    totalLines: 2,
    needsReviewCount: 0,
    unresolvedCount: 0,
    acceptedCount: 1,
    rejectedCount: 1,
    manualCount: 0,
    outOfScopeCount: 0,
    exactSuggestionCount: 1,
    normalizedSuggestionCount: 0,
    ambiguousCount: 0,
    zeroPriceSuggestionCount: 0,
    catalogSource: "local_stc_historical_mock",
  };
}

function makeDecision(): SkuResolutionDecision {
  return {
    sourceFileId: FILE_ID,
    sourceRowNumber: 2,
    originalLineNumber: "1",
    originalSku: "SKU-A",
    status: "accepted",
    suggestions: [{ suggestedSku: "SKU-A", source: "exact", rationale: "x" }],
    acceptedSku: SECRET_ACCEPTED_SKU,
    decidedBy: SECRET_DECIDED_BY,
    decidedAt: new Date("2026-05-21T10:00:00.000Z"),
  };
}

function makePayload(
  overrides: Partial<ReviewedSkuResolutionArtifactPayload> = {}
): ReviewedSkuResolutionArtifactPayload {
  return {
    sourceNormalizedBoqArtifactId: "art-nb-7",
    sourceNormalizedBoqArtifactVersion: 5,
    sourceFileIds: [FILE_ID],
    lineCount: 2,
    decisions: [makeDecision()],
    summary: makeSummary(),
    ...overrides,
  };
}

function makeServiceResult(): CreateReviewedSkuResolutionArtifactResult {
  return {
    artifact: makeCreatedArtifact(),
    sourceArtifact: makeSourceArtifact(),
    payload: makePayload(),
    reviewResult: {
      decisions: [],
      appliedCount: 2,
      needsReviewCount: 0,
      acceptedCount: 1,
      rejectedCount: 1,
      unresolvedCount: 0,
      manualCount: 0,
      outOfScopeCount: 0,
    },
  };
}

const ACCEPT: QuickBomSkuResolutionAcceptActionInput = {
  decision: "accept",
  sourceFileId: FILE_ID,
  sourceRowNumber: 2,
  acceptedSku: "SKU-A",
  note: "looks right",
};
const REJECT: QuickBomSkuResolutionRejectActionInput = {
  decision: "reject",
  sourceFileId: FILE_ID,
  sourceRowNumber: 3,
};

function input(
  actions: ReviewProjectQuickBomSkuResolutionLinesInput["actions"] = [ACCEPT, REJECT]
): ReviewProjectQuickBomSkuResolutionLinesInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    skuResolutionArtifactId: SOURCE_ID,
    decidedBy: DECIDED_BY,
    actions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectMock.mockResolvedValue(makeProject());
  getArtifactMock.mockResolvedValue(makeSourceArtifact());
  createMock.mockResolvedValue(makeServiceResult());
});

describe("reviewProjectQuickBomSkuResolutionLines - action gates", () => {
  it("throws the exact decidedBy message before any store call when decidedBy is blank", async () => {
    await expect(
      reviewProjectQuickBomSkuResolutionLines({ ...input([ACCEPT]), decidedBy: "   " })
    ).rejects.toThrow("decidedBy is required.");
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws decidedBy required even for an empty decidedBy string", async () => {
    await expect(
      reviewProjectQuickBomSkuResolutionLines({ ...input([ACCEPT]), decidedBy: "" })
    ).rejects.toThrow("decidedBy is required.");
  });

  it("returns invalid_actions/actions_required before any store call when actions is empty", async () => {
    const result = await reviewProjectQuickBomSkuResolutionLines(input([]));

    expect(result).toEqual({ status: "invalid_actions", reason: "actions_required" });
    expect(getProjectMock).not.toHaveBeenCalled();
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("reviewProjectQuickBomSkuResolutionLines - project verification", () => {
  it("returns not_found and does not load the artifact or persist when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    expect(result).toEqual({ status: "not_found" });
    expect(getProjectMock).toHaveBeenCalledWith(TENANT, PROJECT);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a lean wrong_mode summary (no tenantId) and does not load the artifact for a non-quick_bom project", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", name: "RFP Bid", customerName: "Acme" })
    );

    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    expect(result.status).toBe("wrong_mode");
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect(result.project).toEqual({
      id: PROJECT,
      name: "RFP Bid",
      customerName: "Acme",
      mode: "rfp",
      createdAt: TS1.toISOString(),
      updatedAt: TS2.toISOString(),
    });
    expect("tenantId" in result.project).toBe(false);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("omits customerName from the wrong_mode summary when the project has none", async () => {
    getProjectMock.mockResolvedValue(
      makeProject({ mode: "rfp", customerName: undefined })
    );

    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("customerName" in result.project).toBe(false);
  });

  it("loads the project before loading the source artifact", async () => {
    await reviewProjectQuickBomSkuResolutionLines(input());

    expect(getProjectMock.mock.invocationCallOrder[0]).toBeLessThan(
      getArtifactMock.mock.invocationCallOrder[0]
    );
  });
});

describe("reviewProjectQuickBomSkuResolutionLines - artifact verification", () => {
  it("returns sku_resolution_not_found and does not persist when the artifact is missing", async () => {
    getArtifactMock.mockResolvedValue(null);

    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    expect(result).toEqual({ status: "sku_resolution_not_found" });
    expect(getArtifactMock).toHaveBeenCalledWith(TENANT, PROJECT, SOURCE_ID);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns artifact_not_sku_resolution with a payload-free summary for a wrong-type artifact", async () => {
    getArtifactMock.mockResolvedValue(
      makeSourceArtifact({ type: "priced_boq", stageId: "boq_pricing_review" })
    );

    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    expect(result.status).toBe("artifact_not_sku_resolution");
    if (result.status !== "artifact_not_sku_resolution") {
      throw new Error("unreachable");
    }
    expect(result.artifact?.id).toBe(SOURCE_ID);
    expect(result.artifact?.type).toBe("priced_boq");
    expect(result.artifact && "payload" in result.artifact).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  const NOT_REVIEWABLE: ProjectArtifactStatus[] = [
    "missing",
    "generated",
    "approved",
    "rejected",
    "stale",
    "failed",
    "not_applicable",
  ];

  it.each(NOT_REVIEWABLE)(
    "returns sku_resolution_not_reviewable for a %s sku_resolution artifact and does not persist",
    async (status) => {
      getArtifactMock.mockResolvedValue(makeSourceArtifact({ status }));

      const result = await reviewProjectQuickBomSkuResolutionLines(input());

      expect(result.status).toBe("sku_resolution_not_reviewable");
      if (result.status !== "sku_resolution_not_reviewable") {
        throw new Error("unreachable");
      }
      expect(result.artifact.id).toBe(SOURCE_ID);
      expect(result.artifact.status).toBe(status);
      expect("payload" in result.artifact).toBe(false);
      expect(createMock).not.toHaveBeenCalled();
    }
  );
});

describe("reviewProjectQuickBomSkuResolutionLines - exact lower-service call", () => {
  it("calls createReviewedSkuResolutionArtifact once with the ids and decidedBy-stamped actions", async () => {
    await reviewProjectQuickBomSkuResolutionLines(input());

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      skuResolutionArtifactId: SOURCE_ID,
      actions: [
        {
          decision: "accept",
          sourceFileId: FILE_ID,
          sourceRowNumber: 2,
          acceptedSku: "SKU-A",
          decidedBy: DECIDED_BY,
          note: "looks right",
        },
        {
          decision: "reject",
          sourceFileId: FILE_ID,
          sourceRowNumber: 3,
          decidedBy: DECIDED_BY,
        },
      ],
    });
  });

  it("maps manual and out_of_scope inputs to decidedBy-stamped lower actions with no acceptedSku", async () => {
    const manual: QuickBomSkuResolutionManualActionInput = {
      decision: "manual",
      sourceFileId: FILE_ID,
      sourceRowNumber: 4,
      note: "third-party commercial line",
    };
    const outOfScope: QuickBomSkuResolutionOutOfScopeActionInput = {
      decision: "out_of_scope",
      sourceFileId: FILE_ID,
      sourceRowNumber: 5,
    };

    await reviewProjectQuickBomSkuResolutionLines(input([manual, outOfScope]));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [
          {
            decision: "manual",
            sourceFileId: FILE_ID,
            sourceRowNumber: 4,
            decidedBy: DECIDED_BY,
            note: "third-party commercial line",
          },
          {
            decision: "out_of_scope",
            sourceFileId: FILE_ID,
            sourceRowNumber: 5,
            decidedBy: DECIDED_BY,
          },
        ],
      })
    );
    const passed = createMock.mock.calls[0][0].actions;
    expect("acceptedSku" in passed[0]).toBe(false);
    expect("acceptedSku" in passed[1]).toBe(false);
  });

  it("stamps decidedBy from the service input and never lets an action set decidedBy/decidedAt", async () => {
    const sneaky = {
      decision: "accept",
      sourceFileId: FILE_ID,
      sourceRowNumber: 2,
      acceptedSku: "SKU-A",
      decidedBy: "attacker",
      decidedAt: new Date("2000-01-01T00:00:00.000Z"),
    } as unknown as QuickBomSkuResolutionAcceptActionInput;

    await reviewProjectQuickBomSkuResolutionLines(input([sneaky]));

    const passed = createMock.mock.calls[0][0].actions[0];
    expect(passed.decidedBy).toBe(DECIDED_BY);
    expect("decidedAt" in passed).toBe(false);
  });

  it("passes fresh action objects in a fresh array, never aliasing the input actions", async () => {
    const inp = input();

    await reviewProjectQuickBomSkuResolutionLines(inp);

    const passed = createMock.mock.calls[0][0].actions;
    expect(passed).not.toBe(inp.actions);
    expect(passed[0]).not.toBe(inp.actions[0]);
    expect(passed[1]).not.toBe(inp.actions[1]);
  });
});

describe("reviewProjectQuickBomSkuResolutionLines - known lower-level error translation", () => {
  const CASES: Array<[string, ReviewProjectQuickBomSkuResolutionLinesResult]> = [
    ["SKU resolution artifact not found.", { status: "sku_resolution_not_found" }],
    ["Artifact is not a sku_resolution artifact.", { status: "artifact_not_sku_resolution" }],
    ["SKU resolution artifact payload is invalid.", { status: "invalid_sku_resolution_payload" }],
    ["SKU resolution decision is not reviewable.", { status: "review_action_not_reviewable" }],
    ["acceptedSku is required.", { status: "invalid_actions", reason: "accepted_sku_required" }],
    ["Accepted SKU must match an existing suggestion.", { status: "accepted_sku_not_suggested" }],
    [
      "Rejected SKU resolution cannot include acceptedSku.",
      { status: "invalid_actions", reason: "reject_has_accepted_sku" },
    ],
    [
      "Manual or out-of-scope SKU resolution cannot include acceptedSku.",
      { status: "invalid_actions", reason: "manual_or_out_of_scope_has_accepted_sku" },
    ],
    [
      "Deferred non-priced SKU resolution row cannot be accepted.",
      { status: "accept_deferred_not_allowed" },
    ],
    ["Duplicate SKU resolution action for decision.", { status: "duplicate_action" }],
    ["SKU resolution action target was not found.", { status: "action_target_not_found" }],
  ];

  it.each(CASES)("maps %s to the safe status", async (message, expected) => {
    createMock.mockRejectedValue(new Error(message));

    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    expect(result).toEqual(expected);
  });
});

describe("reviewProjectQuickBomSkuResolutionLines - unexpected errors", () => {
  it("re-throws an unexpected lower-level error unchanged", async () => {
    const boom = new Error("boom-internal-stack-detail");
    createMock.mockRejectedValue(boom);

    await expect(reviewProjectQuickBomSkuResolutionLines(input())).rejects.toBe(boom);
  });

  it("re-throws a non-Error rejection", async () => {
    createMock.mockRejectedValue("plain string failure");

    await expect(reviewProjectQuickBomSkuResolutionLines(input())).rejects.toBe(
      "plain string failure"
    );
  });
});

describe("reviewProjectQuickBomSkuResolutionLines - ok summaries", () => {
  it("returns a serializable created-artifact summary with ISO dates and no payload", async () => {
    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact).toEqual({
      id: CREATED_ID,
      projectId: PROJECT,
      stageId: "sku_resolution",
      type: "sku_resolution",
      status: "generated",
      version: 3,
      sourceFileIds: [FILE_ID],
      sourceArtifactIds: [SOURCE_ID],
      createdAt: CREATED_CREATED.toISOString(),
      updatedAt: CREATED_UPDATED.toISOString(),
    });
    expect("payload" in result.artifact).toBe(false);
  });

  it("returns a lean payloadSummary with no decisions, full payload, or pricing/decision fields", async () => {
    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.payloadSummary).toEqual({
      sourceNormalizedBoqArtifactId: "art-nb-7",
      sourceNormalizedBoqArtifactVersion: 5,
      sourceFileIds: [FILE_ID],
      lineCount: 2,
      summary: makeSummary(),
    });
    expect("decisions" in result.payloadSummary).toBe(false);
    expect(result.payloadSummary).not.toHaveProperty("currency");
    expect(result.payloadSummary).not.toHaveProperty("ratePercent");
    expect(result.payloadSummary).not.toHaveProperty("vatRatePercent");
    expect(result.payloadSummary).not.toHaveProperty("pricing");
    expect(result.payloadSummary).not.toHaveProperty("filePath");
    expect(result.payloadSummary).not.toHaveProperty("storagePath");

    const json = JSON.stringify(result.payloadSummary);
    expect(json).not.toContain(SECRET_ACCEPTED_SKU);
    expect(json).not.toContain(SECRET_DECIDED_BY);
  });

  it("returns the review counts as the reviewSummary", async () => {
    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.reviewSummary).toEqual({
      appliedCount: 2,
      needsReviewCount: 0,
      acceptedCount: 1,
      rejectedCount: 1,
      unresolvedCount: 0,
      manualCount: 0,
      outOfScopeCount: 0,
    });
  });
});

describe("reviewProjectQuickBomSkuResolutionLines - immutability and copies", () => {
  it("does not mutate the input object or its actions", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await reviewProjectQuickBomSkuResolutionLines(inp);

    expect(inp).toEqual(snapshot);
  });

  it("copies created-artifact and payload arrays/summary so the response cannot corrupt the service result", async () => {
    const serviceResult = makeServiceResult();
    createMock.mockResolvedValue(serviceResult);

    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.artifact.sourceFileIds).not.toBe(serviceResult.artifact.sourceFileIds);
    expect(result.artifact.sourceArtifactIds).not.toBe(
      serviceResult.artifact.sourceArtifactIds
    );
    expect(result.payloadSummary.sourceFileIds).not.toBe(
      serviceResult.payload.sourceFileIds
    );
    expect(result.payloadSummary.summary).not.toBe(serviceResult.payload.summary);

    result.artifact.sourceFileIds.push("injected");
    result.artifact.sourceArtifactIds.push("injected");
    result.payloadSummary.sourceFileIds.push("injected");
    result.payloadSummary.summary.totalLines = 999;
    result.reviewSummary.acceptedCount = 999;

    expect(serviceResult.artifact.sourceFileIds).toEqual([FILE_ID]);
    expect(serviceResult.artifact.sourceArtifactIds).toEqual([SOURCE_ID]);
    expect(serviceResult.payload.sourceFileIds).toEqual([FILE_ID]);
    expect(serviceResult.payload.summary.totalLines).toBe(2);
    expect(serviceResult.reviewResult.acceptedCount).toBe(1);
  });

  it("does not mutate the source artifact loaded for a not-reviewable response", async () => {
    const source = makeSourceArtifact({ status: "approved" });
    const snapshot = structuredClone(source);
    getArtifactMock.mockResolvedValue(source);

    const result = await reviewProjectQuickBomSkuResolutionLines(input());

    if (result.status !== "sku_resolution_not_reviewable") {
      throw new Error("unreachable");
    }
    result.artifact.sourceFileIds.push("injected");
    expect(source).toEqual(snapshot);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-sku-resolution-review.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-sku-resolution-review.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports the project store, the artifact read store, the two lower SKU review services, and the project types", () => {
    expect(source).toContain('from "@/lib/db/project-store"');
    expect(source).toContain('from "@/lib/db/project-artifact-store"');
    expect(source).toContain('from "@/lib/projects/sku-resolution-review-artifact"');
    expect(source).toContain('from "@/lib/projects/sku-resolution-review"');
    expect(source).toContain('from "@/types/project"');
  });

  it("does not import the artifact-write helper, approval/evidence stores, the draft SKU/catalog helpers, the normalizer, pricing, config expansion, mantle/export, runner, AI, catalog, coordinator, engine, or adapter modules", () => {
    for (const forbidden of [
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/sku-resolution"',
      'from "@/lib/projects/sku-resolution-artifact"',
      'from "@/lib/projects/catalog-lookup"',
      'from "@/lib/projects/boq-normalization"',
      'from "@/lib/projects/boq-file-loader"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/config-expanded',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/export',
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

  it("exposes only the wrapper service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual([
      "reviewProjectQuickBomSkuResolutionLines",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
