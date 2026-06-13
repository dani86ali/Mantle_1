import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// The Quick BoM priced-BoQ review-workspace loader is now a thin wrapper over the
// shared, mode-gated review-workspace core. Mock ONLY the core: the wrapper's whole job
// is to pin expectedMode = "quick_bom", forward the positional tenant/project/artifact
// ids unchanged, return the core's result verbatim, and re-export the legacy
// QuickBomPriced* projection type names so the route/UI keep a stable surface. All
// deterministic behavior (store reads, artifact gates, payload parsing, the allowlist
// projection, the deterministic counts, the lean summaries) is proven in the core's own
// test; here we prove the wrapper adds nothing, hides nothing, and keeps the API.
vi.mock("@/lib/projects/project-boq-pricing-review-workspace-core", () => ({
  loadProjectBoqPricedBoqReviewWorkspaceCore: vi.fn(),
}));

import * as workspaceModule from "@/lib/projects/project-quick-bom-pricing-review-workspace";
import {
  loadQuickBomPricedBoqReviewWorkspace,
  type LoadQuickBomPricedBoqReviewWorkspaceResult,
  type QuickBomPricedBoqReviewWorkspace,
  type QuickBomPricedBoqReviewLine,
} from "@/lib/projects/project-quick-bom-pricing-review-workspace";
import { loadProjectBoqPricedBoqReviewWorkspaceCore } from "@/lib/projects/project-boq-pricing-review-workspace-core";

const coreMock = vi.mocked(loadProjectBoqPricedBoqReviewWorkspaceCore);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-pb-1";
const ARTIFACT_ID = "art-pb-1";

// Typed against the re-exported legacy aliases: this only compiles if the wrapper still
// exports QuickBomPricedBoqReviewLine / QuickBomPricedBoqReviewWorkspace /
// LoadQuickBomPricedBoqReviewWorkspaceResult with the shared shapes.
const PRICED_LINE: QuickBomPricedBoqReviewLine = {
  sourceFileId: "file-1",
  sourceRowNumber: 3,
  originalLineNumber: "L-003",
  originalSku: "WS-OLD",
  acceptedSku: "C9300-48P-A",
  description: "Catalyst 9300 switch",
  quantity: 2,
  status: "priced",
  decisionStatus: "accepted",
  amounts: {
    currency: "SAR",
    quantity: 2,
    unitListPriceSar: 1000,
    extendedListPriceSar: 2000,
    unitSellPriceSar: 700,
    extendedSellPriceSar: 1400,
    pricingMode: "margin",
    ratePercent: 30,
    vatRatePercent: 15,
    vatAmountSar: 210,
    totalIncVatSar: 1610,
  },
};

const REVIEW: QuickBomPricedBoqReviewWorkspace = {
  project: {
    id: PROJECT,
    tenantId: TENANT,
    name: "Honeywell",
    mode: "quick_bom",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
  },
  artifact: {
    id: ARTIFACT_ID,
    projectId: PROJECT,
    stageId: "boq_pricing_review",
    type: "priced_boq",
    status: "needs_review",
    version: 1,
    sourceFileIds: ["file-1"],
    sourceArtifactIds: ["art-ce-7"],
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:30:00.000Z",
  },
  payloadSummary: {
    sourceConfigurationExpansionArtifactId: "art-ce-7",
    sourceConfigurationExpansionArtifactVersion: 3,
    sourceNormalizedBoqArtifactId: "art-nb-2",
    sourceNormalizedBoqArtifactVersion: 1,
    sourceSkuResolutionArtifactId: "art-skur-5",
    sourceSkuResolutionArtifactVersion: 2,
    sourceFileIds: ["file-1"],
    pricingConfig: { currency: "SAR", mode: "margin", ratePercent: 30, vatRatePercent: 15, roundingDecimals: 2 },
    lineCount: 1,
    pricingSummary: {
      inputLineCount: 1,
      pricedLineCount: 1,
      unpricedLineCount: 0,
      missingDecisionCount: 0,
      notAcceptedCount: 0,
      missingPriceCount: 0,
      totals: { currency: "SAR", lineCount: 1, subtotalListPriceSar: 2000, subtotalSellPriceSar: 1400, vatAmountSar: 210, totalIncVatSar: 1610 },
    },
  },
  reviewSummary: { totalLineCount: 1, pricedLineCount: 1, unpricedLineCount: 0, missingPriceCount: 0, warningCount: 0 },
  lines: [PRICED_LINE],
};

const OK_RESULT: LoadQuickBomPricedBoqReviewWorkspaceResult = { status: "ok", review: REVIEW };

beforeEach(() => {
  vi.clearAllMocks();
  coreMock.mockResolvedValue(OK_RESULT);
});

describe("loadQuickBomPricedBoqReviewWorkspace - delegation", () => {
  it("calls the shared core exactly once with the positional ids plus expectedMode quick_bom", async () => {
    await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    expect(coreMock).toHaveBeenCalledTimes(1);
    expect(coreMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT_ID,
      expectedMode: "quick_bom",
    });
  });

  it("passes ONLY the tenant/project/artifact ids plus expectedMode - no other authority", async () => {
    await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    const arg = coreMock.mock.calls[0][0];
    expect(Object.keys(arg).sort()).toEqual([
      "artifactId",
      "expectedMode",
      "projectId",
      "tenantId",
    ]);
    expect(arg.expectedMode).toBe("quick_bom");
  });
});

describe("loadQuickBomPricedBoqReviewWorkspace - result pass-through", () => {
  it("returns the core ok result unchanged (same reference)", async () => {
    coreMock.mockResolvedValue(OK_RESULT);

    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    expect(result).toBe(OK_RESULT);
  });

  it("returns the core not_found result unchanged", async () => {
    const notFound: LoadQuickBomPricedBoqReviewWorkspaceResult = { status: "not_found" };
    coreMock.mockResolvedValue(notFound);

    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    expect(result).toBe(notFound);
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns the core wrong_mode result unchanged", async () => {
    const wrongMode: LoadQuickBomPricedBoqReviewWorkspaceResult = { status: "wrong_mode" };
    coreMock.mockResolvedValue(wrongMode);

    const result = await loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    expect(result).toBe(wrongMode);
    expect(result).toEqual({ status: "wrong_mode" });
  });

  it("re-throws whatever the core throws (no swallow, no remap)", async () => {
    const boom = new Error("boom-internal-stack-detail");
    coreMock.mockRejectedValue(boom);

    await expect(
      loadQuickBomPricedBoqReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID)
    ).rejects.toBe(boom);
  });
});

describe("loadQuickBomPricedBoqReviewWorkspace - module purity, public API, and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-pricing-review-workspace.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-pricing-review-workspace.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports/re-exports from the shared workspace core and nothing else", () => {
    const froms = Array.from(
      new Set(Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]))
    );
    expect(froms).toEqual([
      "@/lib/projects/project-boq-pricing-review-workspace-core",
    ]);
    expect(source).toContain("loadProjectBoqPricedBoqReviewWorkspaceCore");
  });

  it("re-exports the legacy QuickBomPriced* public type names (stable API)", () => {
    for (const typeName of [
      "QuickBomPricedReviewLineStatus",
      "QuickBomPricedBoqReviewWorkspaceProject",
      "QuickBomPricedBoqReviewWorkspaceArtifact",
      "QuickBomPricedBoqReviewTotals",
      "QuickBomPricedBoqReviewPricingSummary",
      "QuickBomPricedBoqReviewPricingAuthoritySummary",
      "QuickBomPricedBoqReviewConfigurationAuthoritySummary",
      "QuickBomPricedBoqReviewWorkspacePayload",
      "QuickBomPricedBoqReviewWorkspaceCounts",
      "QuickBomPricedBoqReviewLineAmounts",
      "QuickBomPricedBoqReviewLine",
      "QuickBomPricedBoqReviewWorkspace",
      "LoadQuickBomPricedBoqReviewWorkspaceResult",
    ]) {
      expect(source).toContain(`export type ${typeName}`);
    }
  });

  it("does not import the stores, the artifact writer, the pricing service, approvals, the runner, export, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-store"',
      'from "@/lib/db/project-artifact-store"',
      'from "@/types/project"',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/project-quick-bom-pricing"',
      'from "@/lib/projects/project-boq-pricing-core"',
      'from "@/lib/projects/config-expansion',
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

  it("exposes only the wrapper loader as a runtime export", () => {
    expect(Object.keys(workspaceModule)).toEqual([
      "loadQuickBomPricedBoqReviewWorkspace",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
