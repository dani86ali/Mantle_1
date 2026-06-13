import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// The RFP review service is a thin wrapper over the shared, mode-gated review core.
// Mock ONLY the core: the wrapper's whole job is to pin expectedMode = "rfp", forward
// the rest of the input unchanged, and return the core's result verbatim. All
// deterministic behavior (store reads, draft gates, payload parsing, delegation, error
// translation, lean summaries) is proven in the core's own test; here we prove the
// wrapper adds nothing and hides nothing.
vi.mock("@/lib/projects/project-boq-config-expansion-review-core", () => ({
  reviewProjectBoqConfigurationExpansionDraftCore: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-rfp-config-expansion-review";
import {
  reviewProjectRfpConfigurationExpansionDraft,
  type ReviewProjectRfpConfigurationExpansionDraftInput,
  type ReviewProjectRfpConfigurationExpansionDraftResult,
} from "@/lib/projects/project-rfp-config-expansion-review";
import { reviewProjectBoqConfigurationExpansionDraftCore } from "@/lib/projects/project-boq-config-expansion-review-core";

const coreMock = vi.mocked(reviewProjectBoqConfigurationExpansionDraftCore);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const DRAFT_ID = "art-ce-draft-1";
const REVIEWED_BY = "engineer@stc.com";

const DECISIONS = [
  { lineId: "line-1-x1", action: "accept" as const, note: "looks right" },
];

const OK_RESULT: ReviewProjectRfpConfigurationExpansionDraftResult = {
  status: "ok",
  artifact: {
    id: "art-ce-rev-9",
    projectId: PROJECT,
    stageId: "configuration_expansion_review",
    type: "configuration_expansion",
    status: "needs_review",
    version: 1,
    sourceFileIds: ["file-1"],
    sourceArtifactIds: ["art-nb-7", "art-skur-3", DRAFT_ID],
    createdAt: "2026-05-21T09:00:00.000Z",
    updatedAt: "2026-05-21T09:30:00.000Z",
  },
  payloadSummary: {
    sourceNormalizedBoqArtifactId: "art-nb-7",
    sourceNormalizedBoqArtifactVersion: 5,
    sourceSkuResolutionArtifactId: "art-skur-3",
    sourceSkuResolutionArtifactVersion: 2,
    sourceConfigurationExpansionDraftArtifactId: DRAFT_ID,
    sourceConfigurationExpansionDraftArtifactVersion: 4,
    sourceFileIds: ["file-1"],
    rulePackId: "honeywell-scope-rules",
    rulePackVersion: "1.0.0",
    rulePackStatus: "approved",
    lineCount: 2,
    summary: {
      customerLineCount: 1,
      acceptedExpansionLineCount: 1,
      rejectedExpansionLineCount: 1,
      totalAcceptedLineCount: 2,
      reviewedExpansionLineCount: 2,
    },
  },
  reviewSummary: {
    customerLineCount: 1,
    acceptedExpansionLineCount: 1,
    rejectedExpansionLineCount: 1,
    totalAcceptedLineCount: 2,
    reviewedExpansionLineCount: 2,
  },
};

const WRONG_MODE_RESULT: ReviewProjectRfpConfigurationExpansionDraftResult = {
  status: "wrong_mode",
  project: {
    id: PROJECT,
    name: "Quick BoM",
    customerName: "Acme",
    mode: "quick_bom",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-02T11:30:00.000Z",
  },
};

function input(
  overrides: Partial<ReviewProjectRfpConfigurationExpansionDraftInput> = {}
): ReviewProjectRfpConfigurationExpansionDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    configurationExpansionDraftArtifactId: DRAFT_ID,
    reviewedBy: REVIEWED_BY,
    decisions: DECISIONS,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  coreMock.mockResolvedValue(OK_RESULT);
});

describe("reviewProjectRfpConfigurationExpansionDraft - delegation", () => {
  it("calls the shared core exactly once with the input plus expectedMode rfp", async () => {
    await reviewProjectRfpConfigurationExpansionDraft(input());

    expect(coreMock).toHaveBeenCalledTimes(1);
    expect(coreMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      configurationExpansionDraftArtifactId: DRAFT_ID,
      reviewedBy: REVIEWED_BY,
      decisions: DECISIONS,
      expectedMode: "rfp",
    });
  });

  it("forwards the decisions array by reference (no rewrap) and an empty array unchanged", async () => {
    await reviewProjectRfpConfigurationExpansionDraft(input());
    expect(coreMock.mock.calls[0][0].decisions).toBe(DECISIONS);

    coreMock.mockClear();
    await reviewProjectRfpConfigurationExpansionDraft(input({ decisions: [] }));
    expect(coreMock.mock.calls[0][0].decisions).toEqual([]);
  });

  it("passes ONLY the input fields plus expectedMode - no catalog/profile/pricing/rule-pack/config-authority authority", async () => {
    await reviewProjectRfpConfigurationExpansionDraft(input());

    const arg = coreMock.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual([
      "configurationExpansionDraftArtifactId",
      "decisions",
      "expectedMode",
      "projectId",
      "reviewedBy",
      "tenantId",
    ]);
    for (const forbidden of [
      "rulePackId",
      "rulePackVersion",
      "rulePackStatus",
      "configurationAuthority",
      "normalizedBoqArtifactId",
      "skuResolutionArtifactId",
      "catalog",
      "profile",
      "pricing",
      "reviewedAt",
    ]) {
      expect(forbidden in arg).toBe(false);
    }
  });

  it("never overrides expectedMode from a caller-supplied field on the input", async () => {
    // Even if a caller smuggles expectedMode onto the input, the wrapper pins rfp
    // last in the spread so the lane authority cannot be hijacked.
    const smuggled = input();
    (smuggled as Record<string, unknown>).expectedMode = "quick_bom";

    await reviewProjectRfpConfigurationExpansionDraft(smuggled);

    expect(coreMock.mock.calls[0][0].expectedMode).toBe("rfp");
  });
});

describe("reviewProjectRfpConfigurationExpansionDraft - result pass-through", () => {
  it("returns the core ok result unchanged (same reference)", async () => {
    coreMock.mockResolvedValue(OK_RESULT);

    const result = await reviewProjectRfpConfigurationExpansionDraft(input());

    expect(result).toBe(OK_RESULT);
  });

  it("returns the core not_found result unchanged", async () => {
    const notFound: ReviewProjectRfpConfigurationExpansionDraftResult = { status: "not_found" };
    coreMock.mockResolvedValue(notFound);

    const result = await reviewProjectRfpConfigurationExpansionDraft(input());

    expect(result).toBe(notFound);
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns the core wrong_mode result (lean project, no tenantId) unchanged", async () => {
    coreMock.mockResolvedValue(WRONG_MODE_RESULT);

    const result = await reviewProjectRfpConfigurationExpansionDraft(input());

    expect(result).toBe(WRONG_MODE_RESULT);
    if (result.status !== "wrong_mode") throw new Error("unreachable");
    expect("tenantId" in result.project).toBe(false);
  });

  it("re-throws whatever the core throws (no swallow, no remap)", async () => {
    const boom = new Error("boom-internal-stack-detail");
    coreMock.mockRejectedValue(boom);

    await expect(reviewProjectRfpConfigurationExpansionDraft(input())).rejects.toBe(boom);
  });
});

describe("reviewProjectRfpConfigurationExpansionDraft - immutability", () => {
  it("does not mutate the input object or its decisions (expectedMode is not added to the caller's input)", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await reviewProjectRfpConfigurationExpansionDraft(inp);

    expect(inp).toEqual(snapshot);
    expect("expectedMode" in inp).toBe(false);
  });
});

describe("reviewProjectRfpConfigurationExpansionDraft - module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-config-expansion-review.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-config-expansion-review.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports/re-exports from the shared core and nothing else", () => {
    const froms = Array.from(
      new Set(Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]))
    );
    expect(froms).toEqual(["@/lib/projects/project-boq-config-expansion-review-core"]);
    expect(source).toContain("reviewProjectBoqConfigurationExpansionDraftCore");
  });

  it("does not import the stores, the config-expansion artifact writer, the config review helper, approvals/evidence stores, the runner, pricing, export, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-store"',
      'from "@/lib/db/project-artifact-store"',
      'from "@/lib/projects/config-expansion-artifact"',
      'from "@/lib/projects/config-expansion-review"',
      'from "@/lib/projects/config-expansion-types"',
      "createProjectArtifactVersion",
      "createConfigurationExpansionArtifact",
      "createProjectApproval",
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
      'from "@/lib/projects/rfp-runner"',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
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
      "reviewProjectRfpConfigurationExpansionDraft",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
