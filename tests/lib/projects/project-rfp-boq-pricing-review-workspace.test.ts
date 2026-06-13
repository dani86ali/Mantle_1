import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// The RFP priced-BoQ review-workspace loader is a thin wrapper over the shared,
// mode-gated review-workspace core. Per the task, the RFP lane must reject quick_bom
// projects as wrong_mode THROUGH THE CORE BEHAVIOR, so this test drives the REAL core
// (mocking only the two DB stores) rather than mocking the core. That proves the wrapper
// truly pins expectedMode = "rfp": an rfp project passes the gate, a quick_bom project is
// rejected with wrong_mode before any artifact read, and the positional ids are
// forwarded tenant-scoped into the core. The full allowlist projection / canary / count
// behavior is proven exhaustively in the core's own test.
const { mockGetProject, mockGetArtifact } = vi.hoisted(() => ({
  mockGetProject: vi.fn(),
  mockGetArtifact: vi.fn(),
}));

vi.mock("@/lib/db/project-store", () => ({ getProjectById: mockGetProject }));
vi.mock("@/lib/db/project-artifact-store", () => ({ getProjectArtifactById: mockGetArtifact }));

import * as workspaceModule from "@/lib/projects/project-rfp-boq-pricing-review-workspace";
import { loadRfpBoqPricedBoqReviewWorkspace } from "@/lib/projects/project-rfp-boq-pricing-review-workspace";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "proj-rfp-pb-1";
const ARTIFACT_ID = "art-rfp-pb-1";

const RFP_PROJECT = {
  id: PROJECT_ID,
  tenantId: TENANT,
  name: "RFP Priced BoQ",
  mode: "rfp",
  pricingConfig: {
    currency: "SAR",
    mode: "margin",
    ratePercent: 30,
    vatRatePercent: 15,
    roundingDecimals: 2,
  },
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  updatedAt: new Date("2026-06-02T11:30:00.000Z"),
};

const VALID_PAYLOAD = {
  sourceConfigurationExpansionArtifactId: "art-ce-7",
  sourceConfigurationExpansionArtifactVersion: 3,
  sourceNormalizedBoqArtifactId: "art-nb-2",
  sourceNormalizedBoqArtifactVersion: 1,
  sourceSkuResolutionArtifactId: "art-skur-5",
  sourceSkuResolutionArtifactVersion: 2,
  sourceFileIds: ["file-1"],
  pricingConfig: {
    currency: "SAR",
    mode: "margin",
    ratePercent: 30,
    vatRatePercent: 15,
    roundingDecimals: 2,
  },
  lineCount: 1,
  summary: {
    inputLineCount: 1,
    pricedLineCount: 1,
    unpricedLineCount: 0,
    missingDecisionCount: 0,
    notAcceptedCount: 0,
    missingPriceCount: 0,
    totals: {
      currency: "SAR",
      lineCount: 1,
      subtotalListPriceSar: 2000,
      subtotalSellPriceSar: 1400,
      vatAmountSar: 210,
      totalIncVatSar: 1610,
    },
  },
  lines: [
    {
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
    },
  ],
};

const RFP_ARTIFACT = {
  id: ARTIFACT_ID,
  projectId: PROJECT_ID,
  stageId: "boq_pricing_review",
  type: "priced_boq",
  status: "needs_review",
  version: 1,
  sourceFileIds: ["file-1"],
  sourceArtifactIds: ["art-ce-7"],
  payload: VALID_PAYLOAD,
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  updatedAt: new Date("2026-06-01T10:30:00.000Z"),
};

beforeEach(() => {
  mockGetProject.mockReset().mockResolvedValue(RFP_PROJECT);
  mockGetArtifact.mockReset().mockResolvedValue(RFP_ARTIFACT);
});

describe("loadRfpBoqPricedBoqReviewWorkspace - pins rfp (through core behavior)", () => {
  it("passes the mode gate for an rfp project and projects the shared review shape", async () => {
    const result = await loadRfpBoqPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.review.project.mode).toBe("rfp");
    expect(result.review.artifact.type).toBe("priced_boq");
    expect(result.review.reviewSummary.pricedLineCount).toBe(1);
    expect(result.review.lines).toHaveLength(1);
  });

  it("rejects a quick_bom project as wrong_mode before any artifact read", async () => {
    mockGetProject.mockResolvedValue({ ...RFP_PROJECT, mode: "quick_bom" });
    const result = await loadRfpBoqPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("wrong_mode");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });

  it("forwards the positional ids tenant-scoped into the core's store reads", async () => {
    await loadRfpBoqPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(mockGetProject).toHaveBeenCalledWith(TENANT, PROJECT_ID, {
      includeArchived: true,
    });
    expect(mockGetArtifact).toHaveBeenCalledWith(TENANT, PROJECT_ID, ARTIFACT_ID);
  });

  it("surfaces the core's exact priced_boq status names unchanged", async () => {
    mockGetArtifact.mockResolvedValue({ ...RFP_ARTIFACT, type: "sku_resolution" });
    const result = await loadRfpBoqPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("artifact_not_priced_boq");
  });

  it("returns not_found when the project is absent", async () => {
    mockGetProject.mockResolvedValue(null);
    const result = await loadRfpBoqPricedBoqReviewWorkspace(TENANT, PROJECT_ID, ARTIFACT_ID);
    expect(result.status).toBe("not_found");
    expect(mockGetArtifact).not.toHaveBeenCalled();
  });
});

describe("loadRfpBoqPricedBoqReviewWorkspace - module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-boq-pricing-review-workspace.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-boq-pricing-review-workspace.test.ts"
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
    expect(source).toContain('expectedMode: "rfp"');
  });

  it("re-exports the RFP-specific public type aliases over the shared shapes", () => {
    for (const typeName of [
      "RfpBoqPricedReviewLineStatus",
      "RfpBoqPricedBoqReviewWorkspaceProject",
      "RfpBoqPricedBoqReviewWorkspaceArtifact",
      "RfpBoqPricedBoqReviewPricingSummary",
      "RfpBoqPricedBoqReviewWorkspacePayload",
      "RfpBoqPricedBoqReviewWorkspaceCounts",
      "RfpBoqPricedBoqReviewLine",
      "RfpBoqPricedBoqReviewWorkspace",
      "LoadRfpBoqPricedBoqReviewWorkspaceResult",
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
      'from "@/lib/projects/project-rfp-boq-pricing"',
      'from "@/lib/projects/project-boq-pricing-core"',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/rfp-runner"',
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
      "loadRfpBoqPricedBoqReviewWorkspace",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
