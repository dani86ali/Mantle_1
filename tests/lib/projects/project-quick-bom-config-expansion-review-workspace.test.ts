import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// The Quick BoM review-workspace loader is now a thin wrapper over the shared,
// mode-gated review-workspace core. Mock ONLY the core: the wrapper's whole job is to
// pin expectedMode = "quick_bom", forward the positional tenant/project/artifact ids
// unchanged, and return the core's result verbatim. All deterministic behavior (store
// reads, artifact gates, payload parsing, the allowlist projection, the deterministic
// counts, the lean summaries) is proven in the core's own test; here we prove the
// wrapper adds nothing and hides nothing.
vi.mock("@/lib/projects/project-boq-config-expansion-review-workspace-core", () => ({
  loadProjectBoqConfigurationExpansionReviewWorkspaceCore: vi.fn(),
}));

import * as workspaceModule from "@/lib/projects/project-quick-bom-config-expansion-review-workspace";
import {
  loadQuickBomConfigurationExpansionReviewWorkspace,
  type LoadQuickBomConfigExpansionReviewWorkspaceResult,
} from "@/lib/projects/project-quick-bom-config-expansion-review-workspace";
import { loadProjectBoqConfigurationExpansionReviewWorkspaceCore } from "@/lib/projects/project-boq-config-expansion-review-workspace-core";

const coreMock = vi.mocked(loadProjectBoqConfigurationExpansionReviewWorkspaceCore);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-ce-1";
const ARTIFACT_ID = "art-ce-draft-1";

const OK_RESULT: LoadQuickBomConfigExpansionReviewWorkspaceResult = {
  status: "ok",
  review: {
    mode: "draft",
    project: {
      id: PROJECT,
      tenantId: TENANT,
      name: "Honeywell Test",
      mode: "quick_bom",
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-02T11:30:00.000Z",
    },
    artifact: {
      id: ARTIFACT_ID,
      projectId: PROJECT,
      stageId: "configuration_expansion_review",
      type: "configuration_expansion",
      status: "needs_review",
      version: 4,
      sourceFileIds: ["file-1"],
      sourceArtifactIds: ["art-nb-7", "art-skur-3"],
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-01T10:30:00.000Z",
    },
    payloadSummary: {
      sourceNormalizedBoqArtifactId: "art-nb-7",
      sourceNormalizedBoqArtifactVersion: 3,
      sourceSkuResolutionArtifactId: "art-skur-3",
      sourceSkuResolutionArtifactVersion: 2,
      sourceFileIds: ["file-1"],
      rulePackId: "honeywell-scope-rules",
      rulePackVersion: "1.0.0",
      rulePackStatus: "approved",
      rulePackSourceScope: "honeywell_mvp_demo_only",
      lineCount: 2,
      summary: {
        customerLineCount: 1,
        addedLineCount: 1,
        totalLineCount: 2,
        requiresReviewCount: 1,
        includedItemCount: 0,
      },
    },
    reviewSummary: {
      totalLineCount: 2,
      customerLineCount: 1,
      expansionLineCount: 1,
      requiresDecisionCount: 1,
      includedItemCount: 0,
    },
    lines: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  coreMock.mockResolvedValue(OK_RESULT);
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - delegation", () => {
  it("calls the shared core exactly once with the positional ids plus expectedMode quick_bom", async () => {
    await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    expect(coreMock).toHaveBeenCalledTimes(1);
    expect(coreMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      artifactId: ARTIFACT_ID,
      expectedMode: "quick_bom",
    });
  });

  it("passes ONLY the tenant/project/artifact ids plus expectedMode - no other authority", async () => {
    await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

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

describe("loadQuickBomConfigurationExpansionReviewWorkspace - result pass-through", () => {
  it("returns the core ok result unchanged (same reference)", async () => {
    coreMock.mockResolvedValue(OK_RESULT);

    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    expect(result).toBe(OK_RESULT);
  });

  it("returns the core not_found result unchanged", async () => {
    const notFound: LoadQuickBomConfigExpansionReviewWorkspaceResult = { status: "not_found" };
    coreMock.mockResolvedValue(notFound);

    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    expect(result).toBe(notFound);
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns the core wrong_mode result unchanged", async () => {
    const wrongMode: LoadQuickBomConfigExpansionReviewWorkspaceResult = { status: "wrong_mode" };
    coreMock.mockResolvedValue(wrongMode);

    const result = await loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID);

    expect(result).toBe(wrongMode);
    expect(result).toEqual({ status: "wrong_mode" });
  });

  it("re-throws whatever the core throws (no swallow, no remap)", async () => {
    const boom = new Error("boom-internal-stack-detail");
    coreMock.mockRejectedValue(boom);

    await expect(
      loadQuickBomConfigurationExpansionReviewWorkspace(TENANT, PROJECT, ARTIFACT_ID)
    ).rejects.toBe(boom);
  });
});

describe("loadQuickBomConfigurationExpansionReviewWorkspace - module purity and surface (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-config-expansion-review-workspace.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-config-expansion-review-workspace.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports/re-exports from the shared workspace core and nothing else", () => {
    const froms = Array.from(
      new Set(Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]))
    );
    expect(froms).toEqual([
      "@/lib/projects/project-boq-config-expansion-review-workspace-core",
    ]);
    expect(source).toContain("loadProjectBoqConfigurationExpansionReviewWorkspaceCore");
  });

  it("does not import the stores, config-expansion-types, the artifact writer, the config review helper, approvals/evidence stores, the runner, pricing, export, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-store"',
      'from "@/lib/db/project-artifact-store"',
      'from "@/types/project"',
      'from "@/lib/projects/config-expansion-types"',
      'from "@/lib/projects/config-expansion-artifact"',
      'from "@/lib/projects/config-expansion-review"',
      "createProjectArtifactVersion",
      "createConfigurationExpansionArtifact",
      "createProjectApproval",
      'from "@/lib/db/project-approval-store"',
      'from "@/lib/db/project-evidence-store"',
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

  it("exposes only the wrapper loader as a runtime export", () => {
    expect(Object.keys(workspaceModule)).toEqual([
      "loadQuickBomConfigurationExpansionReviewWorkspace",
    ]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
