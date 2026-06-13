import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Only the DB repository is mocked: the SKU review helper runs for real so its
// errors and counts are exercised end-to-end (it is pure).
vi.mock("@/lib/db/project-artifact-store", () => ({
  getProjectArtifactById: vi.fn(),
  createProjectArtifactVersion: vi.fn(),
}));

import * as service from "@/lib/projects/sku-resolution-review-artifact";
import {
  createReviewedSkuResolutionArtifact,
  buildReviewedSkuResolutionArtifactPayload,
  type CreateReviewedSkuResolutionArtifactInput,
  type ReviewedSkuResolutionArtifactPayload,
} from "@/lib/projects/sku-resolution-review-artifact";
import {
  getProjectArtifactById,
  createProjectArtifactVersion,
} from "@/lib/db/project-artifact-store";
import type { SkuResolutionReviewAction } from "@/lib/projects/sku-resolution-review";
import type { ProjectArtifact } from "@/types/project";

const getArtifactMock = vi.mocked(getProjectArtifactById);
const createMock = vi.mocked(createProjectArtifactVersion);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const SOURCE_ID = "art-skur-1";

function makeSourcePayload(
  overrides: Record<string, unknown> = {}
): ReviewedSkuResolutionArtifactPayload {
  return {
    sourceNormalizedBoqArtifactId: "art-nb-7",
    sourceNormalizedBoqArtifactVersion: 5,
    sourceFileIds: ["file-1"],
    lineCount: 3,
    decisions: [
      {
        sourceFileId: "file-1",
        sourceRowNumber: 2,
        originalLineNumber: "1",
        originalSku: "SKU-A",
        status: "needs_review",
        suggestions: [{ suggestedSku: "SKU-A", source: "exact", rationale: "catalog match" }],
      },
      {
        sourceFileId: "file-1",
        sourceRowNumber: 3,
        originalLineNumber: "2",
        originalSku: "SKU-B",
        status: "needs_review",
        suggestions: [{ suggestedSku: "SKU-B", source: "normalized" }],
      },
      {
        sourceFileId: "file-1",
        sourceRowNumber: 4,
        originalLineNumber: "3",
        originalSku: "NOPE",
        status: "unresolved",
        suggestions: [],
      },
    ],
    summary: {
      totalLines: 3,
      needsReviewCount: 2,
      unresolvedCount: 1,
      acceptedCount: 0,
      rejectedCount: 0,
      exactSuggestionCount: 1,
      normalizedSuggestionCount: 1,
      ambiguousCount: 0,
      zeroPriceSuggestionCount: 0,
      catalogSource: "local_stc_historical_mock",
    },
    ...overrides,
  } as ReviewedSkuResolutionArtifactPayload;
}

function makeSourceArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  const now = new Date("2026-05-21T08:00:00.000Z");
  return {
    id: SOURCE_ID,
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    version: 2,
    payload: makeSourcePayload() as unknown as Record<string, unknown>,
    sourceFileIds: ["file-1"],
    sourceArtifactIds: ["art-nb-7"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCreatedArtifact(
  overrides: Partial<ProjectArtifact> = {}
): ProjectArtifact {
  const now = new Date("2026-05-21T09:00:00.000Z");
  return {
    id: "art-skur-2",
    projectId: PROJECT,
    stageId: "sku_resolution",
    type: "sku_resolution",
    status: "needs_review",
    version: 3,
    payload: {},
    sourceFileIds: ["file-1"],
    sourceArtifactIds: [SOURCE_ID],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const acceptRow2: SkuResolutionReviewAction = {
  decision: "accept",
  sourceFileId: "file-1",
  sourceRowNumber: 2,
  decidedBy: "engineer@stc.com",
  acceptedSku: "SKU-A",
};
const rejectRow3: SkuResolutionReviewAction = {
  decision: "reject",
  sourceFileId: "file-1",
  sourceRowNumber: 3,
  decidedBy: "engineer@stc.com",
};
// Row 4 is `unresolved` in the source payload; manual/out_of_scope may classify it.
const outOfScopeRow4: SkuResolutionReviewAction = {
  decision: "out_of_scope",
  sourceFileId: "file-1",
  sourceRowNumber: 4,
  decidedBy: "engineer@stc.com",
};
const manualRow4: SkuResolutionReviewAction = {
  decision: "manual",
  sourceFileId: "file-1",
  sourceRowNumber: 4,
  decidedBy: "engineer@stc.com",
};

function input(
  actions: readonly SkuResolutionReviewAction[]
): CreateReviewedSkuResolutionArtifactInput {
  return { tenantId: TENANT, projectId: PROJECT, skuResolutionArtifactId: SOURCE_ID, actions };
}

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue(makeCreatedArtifact());
});

describe("createReviewedSkuResolutionArtifact - guards", () => {
  it("throws the exact missing message and does not create", async () => {
    getArtifactMock.mockResolvedValue(null);
    await expect(createReviewedSkuResolutionArtifact(input([]))).rejects.toThrow(
      "SKU resolution artifact not found."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact wrong-type message and does not create", async () => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact({ type: "priced_boq" }));
    await expect(createReviewedSkuResolutionArtifact(input([]))).rejects.toThrow(
      "Artifact is not a sku_resolution artifact."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws the exact invalid-payload message when decisions is not an array", async () => {
    getArtifactMock.mockResolvedValue(
      makeSourceArtifact({ payload: { summary: {}, sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [] } })
    );
    await expect(createReviewedSkuResolutionArtifact(input([]))).rejects.toThrow(
      "SKU resolution artifact payload is invalid."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("throws invalid-payload when summary, ids, version, or sourceFileIds are wrong", async () => {
    const bad: Record<string, unknown>[] = [
      { decisions: [], sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [] }, // no summary
      { decisions: [], summary: {}, sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [] }, // no id
      { decisions: [], summary: {}, sourceNormalizedBoqArtifactId: "x", sourceFileIds: [] }, // no version
      { decisions: [], summary: {}, sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1 }, // no sourceFileIds
      { decisions: [], summary: {}, sourceNormalizedBoqArtifactId: "x", sourceNormalizedBoqArtifactVersion: 1, sourceFileIds: [1, 2] }, // non-string ids
    ];
    for (const payload of bad) {
      getArtifactMock.mockResolvedValue(makeSourceArtifact({ payload }));
      await expect(createReviewedSkuResolutionArtifact(input([]))).rejects.toThrow(
        "SKU resolution artifact payload is invalid."
      );
    }
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createReviewedSkuResolutionArtifact - review-helper errors bubble", () => {
  beforeEach(() => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
  });

  it("bubbles the not-reviewable error unchanged and does not create", async () => {
    // Row 4 is `unresolved`, so accepting it is not reviewable.
    const action: SkuResolutionReviewAction = {
      decision: "accept",
      sourceFileId: "file-1",
      sourceRowNumber: 4,
      decidedBy: "engineer@stc.com",
      acceptedSku: "ANYTHING",
    };
    await expect(createReviewedSkuResolutionArtifact(input([action]))).rejects.toThrow(
      "SKU resolution decision is not reviewable."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("bubbles the missing-target error unchanged and does not create", async () => {
    const action: SkuResolutionReviewAction = {
      decision: "reject",
      sourceFileId: "file-1",
      sourceRowNumber: 99,
      decidedBy: "engineer@stc.com",
    };
    await expect(createReviewedSkuResolutionArtifact(input([action]))).rejects.toThrow(
      "SKU resolution action target was not found."
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("createReviewedSkuResolutionArtifact - composition", () => {
  beforeEach(() => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
  });

  it("creates exactly one artifact with the expected stage/type/source", async () => {
    await createReviewedSkuResolutionArtifact(input([acceptRow2, rejectRow3]));
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      projectId: PROJECT,
      tenantId: TENANT,
      stageId: "sku_resolution",
      type: "sku_resolution",
    });
    expect(createMock.mock.calls[0][0].sourceArtifactIds).toEqual([SOURCE_ID]);
  });

  it("sets status needs_review while any decision still needs review", async () => {
    // Only row 2 accepted; row 3 stays needs_review.
    await createReviewedSkuResolutionArtifact(input([acceptRow2]));
    expect(createMock.mock.calls[0][0].status).toBe("needs_review");
  });

  it("keeps status needs_review while an unresolved decision remains, even with no needs_review left", async () => {
    // Both needs_review rows decided, but row 4 stays unresolved -> still in review.
    await createReviewedSkuResolutionArtifact(input([acceptRow2, rejectRow3]));
    expect(createMock.mock.calls[0][0].status).toBe("needs_review");
  });

  it("sets status generated when all rows are accepted/rejected/manual/out_of_scope", async () => {
    // Row 2 accepted, row 3 rejected, row 4 (unresolved) classified out_of_scope.
    await createReviewedSkuResolutionArtifact(
      input([acceptRow2, rejectRow3, outOfScopeRow4])
    );
    expect(createMock.mock.calls[0][0].status).toBe("generated");
  });

  it("returns the created artifact, source artifact, payload, and review result", async () => {
    const source = makeSourceArtifact();
    const created = makeCreatedArtifact({ id: "art-skur-9", version: 7 });
    getArtifactMock.mockResolvedValue(source);
    createMock.mockResolvedValue(created);
    const result = await createReviewedSkuResolutionArtifact(input([acceptRow2, rejectRow3]));
    expect(result.artifact).toBe(created);
    expect(result.sourceArtifact).toBe(source);
    expect(result.payload).toBe(createMock.mock.calls[0][0].payload);
    expect(result.reviewResult.acceptedCount).toBe(1);
    expect(result.reviewResult.rejectedCount).toBe(1);
  });
});

describe("createReviewedSkuResolutionArtifact - payload shape", () => {
  beforeEach(() => {
    getArtifactMock.mockResolvedValue(makeSourceArtifact());
  });

  it("applies the human decisions onto the new decisions", async () => {
    const { payload } = await createReviewedSkuResolutionArtifact(input([acceptRow2, rejectRow3]));
    expect(payload.decisions[0].status).toBe("accepted");
    expect(payload.decisions[0].acceptedSku).toBe("SKU-A");
    expect(payload.decisions[0].decidedBy).toBe("engineer@stc.com");
    expect(payload.decisions[1].status).toBe("rejected");
    expect(payload.decisions[2].status).toBe("unresolved");
    expect(payload.lineCount).toBe(3);
  });

  it("preserves the source artifact id and version", async () => {
    const { payload } = await createReviewedSkuResolutionArtifact(input([acceptRow2]));
    expect(payload.sourceNormalizedBoqArtifactId).toBe("art-nb-7");
    expect(payload.sourceNormalizedBoqArtifactVersion).toBe(5);
  });

  it("updates the summary review counts from the review result", async () => {
    const { payload } = await createReviewedSkuResolutionArtifact(input([acceptRow2, rejectRow3]));
    expect(payload.summary).toMatchObject({
      totalLines: 3,
      needsReviewCount: 0,
      acceptedCount: 1,
      rejectedCount: 1,
      unresolvedCount: 1,
      // New review-state counts are always present (zero when no such action ran).
      manualCount: 0,
      outOfScopeCount: 0,
    });
  });

  it("counts manual and out_of_scope classifications in the summary", async () => {
    // Row 4 (unresolved) classified out_of_scope; row 2 accepted, row 3 rejected.
    const { payload } = await createReviewedSkuResolutionArtifact(
      input([acceptRow2, rejectRow3, outOfScopeRow4])
    );
    expect(payload.summary).toMatchObject({
      needsReviewCount: 0,
      acceptedCount: 1,
      rejectedCount: 1,
      unresolvedCount: 0,
      manualCount: 0,
      outOfScopeCount: 1,
    });
  });

  it("classifies a needs_review row as manual without an acceptedSku", async () => {
    // Reuse row 4 manual on the unresolved row alongside the two needs_review rows.
    const { payload } = await createReviewedSkuResolutionArtifact(
      input([acceptRow2, rejectRow3, manualRow4])
    );
    expect(payload.decisions[2].status).toBe("manual");
    expect("acceptedSku" in payload.decisions[2]).toBe(false);
    expect(payload.summary.manualCount).toBe(1);
    expect(payload.summary.outOfScopeCount).toBe(0);
  });

  it("preserves the catalog/source counts from the source summary", async () => {
    const { payload } = await createReviewedSkuResolutionArtifact(input([acceptRow2, rejectRow3]));
    expect(payload.summary).toMatchObject({
      exactSuggestionCount: 1,
      normalizedSuggestionCount: 1,
      ambiguousCount: 0,
      zeroPriceSuggestionCount: 0,
      catalogSource: "local_stc_historical_mock",
    });
  });

  it("does not include pricing fields", async () => {
    const { payload } = await createReviewedSkuResolutionArtifact(input([acceptRow2]));
    expect(payload).not.toHaveProperty("currency");
    expect(payload).not.toHaveProperty("vatRatePercent");
    expect(payload).not.toHaveProperty("ratePercent");
    expect(payload).not.toHaveProperty("pricing");
  });
});

describe("createReviewedSkuResolutionArtifact - freshness & purity", () => {
  it("copies sourceFileIds into a fresh payload array", async () => {
    const source = makeSourceArtifact();
    getArtifactMock.mockResolvedValue(source);
    const { payload } = await createReviewedSkuResolutionArtifact(input([acceptRow2]));
    expect(payload.sourceFileIds).toEqual(["file-1"]);
    const sourcePayloadFileIds = (source.payload as { sourceFileIds: string[] }).sourceFileIds;
    expect(payload.sourceFileIds).not.toBe(sourcePayloadFileIds);
  });

  it("passes a fresh sourceFileIds array that cannot corrupt the source artifact", async () => {
    const source = makeSourceArtifact({ sourceFileIds: ["file-1"] });
    getArtifactMock.mockResolvedValue(source);
    await createReviewedSkuResolutionArtifact(input([acceptRow2]));
    const arg = createMock.mock.calls[0][0];
    arg.sourceFileIds!.push("injected");
    arg.sourceArtifactIds!.push("injected");
    expect(source.sourceFileIds).toEqual(["file-1"]);
    expect(source.sourceArtifactIds).toEqual(["art-nb-7"]);
  });

  it("emits fresh decision and suggestion objects even for untouched rows", async () => {
    const source = makeSourceArtifact();
    getArtifactMock.mockResolvedValue(source);
    // No actions: every reviewed decision is an alias of the source until copied.
    const { payload } = await createReviewedSkuResolutionArtifact(input([]));
    const sourceDecisions = (source.payload as { decisions: typeof payload.decisions }).decisions;
    expect(payload.decisions[0]).not.toBe(sourceDecisions[0]);
    expect(payload.decisions[0].suggestions).not.toBe(sourceDecisions[0].suggestions);
    expect(payload.decisions[0].suggestions[0]).not.toBe(sourceDecisions[0].suggestions[0]);
    // Mutating the new payload must not reach the source payload.
    payload.decisions[0].status = "rejected";
    payload.decisions[0].suggestions[0].suggestedSku = "MUTATED";
    expect(sourceDecisions[0].status).toBe("needs_review");
    expect(sourceDecisions[0].suggestions[0].suggestedSku).toBe("SKU-A");
  });

  it("does not mutate the input, the source artifact, or its source payload", async () => {
    const source = makeSourceArtifact();
    getArtifactMock.mockResolvedValue(source);
    const sourceSnapshot = structuredClone(source);
    const inp = input([acceptRow2, rejectRow3]);
    const inputSnapshot = structuredClone(inp);
    await createReviewedSkuResolutionArtifact(inp);
    expect(source).toEqual(sourceSnapshot);
    expect(inp).toEqual(inputSnapshot);
  });
});

describe("buildReviewedSkuResolutionArtifactPayload", () => {
  it("derives lineCount and totalLines from the reviewed decisions", () => {
    const sourcePayload = makeSourcePayload();
    const payload = buildReviewedSkuResolutionArtifactPayload(sourcePayload, {
      decisions: sourcePayload.decisions,
      appliedCount: 0,
      needsReviewCount: 2,
      acceptedCount: 0,
      rejectedCount: 0,
      unresolvedCount: 1,
      manualCount: 0,
      outOfScopeCount: 0,
    });
    expect(payload.lineCount).toBe(3);
    expect(payload.summary.totalLines).toBe(3);
    expect(payload.sourceFileIds).not.toBe(sourcePayload.sourceFileIds);
  });

  it("carries manual/out_of_scope counts from the review result and preserves catalog counts", () => {
    const sourcePayload = makeSourcePayload();
    const payload = buildReviewedSkuResolutionArtifactPayload(sourcePayload, {
      decisions: sourcePayload.decisions,
      appliedCount: 2,
      needsReviewCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      unresolvedCount: 1,
      manualCount: 1,
      outOfScopeCount: 1,
    });
    expect(payload.summary.manualCount).toBe(1);
    expect(payload.summary.outOfScopeCount).toBe(1);
    // Existing catalog/source counts are still preserved verbatim.
    expect(payload.summary.exactSuggestionCount).toBe(1);
    expect(payload.summary.normalizedSuggestionCount).toBe(1);
    expect(payload.summary.catalogSource).toBe("local_stc_historical_mock");
  });
});

describe("module isolation & surface", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/projects/sku-resolution-review-artifact.ts"),
    "utf8"
  );

  it("does not import DB schema, catalog, approvals, staleness, engines, AI, pricing, API, UI, or the Cisco adapter", () => {
    // Inspect import statements only - docstrings legitimately name these
    // domains to declare what the module deliberately omits. The artifact-store
    // repository is the one allowed DB import.
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    for (const forbidden of [
      "@/lib/db/schema",
      "@/lib/db/index",
      "drizzle",
      "schema",
      "catalog",
      "approval",
      "staleness",
      "@/engines",
      "@/coordinator",
      "pricing",
      "anthropic",
      "adapter",
      "@/app",
      "@/components",
    ]) {
      expect(importLines).not.toContain(forbidden);
    }
  });

  it("exposes only the expected runtime exports", () => {
    expect(Object.keys(service).sort()).toEqual(
      [
        "buildReviewedSkuResolutionArtifactPayload",
        "createReviewedSkuResolutionArtifact",
      ].sort()
    );
  });
});
