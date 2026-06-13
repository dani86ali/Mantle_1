import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReviewProjectBoqArtifactCoreResult } from "@/lib/projects/project-boq-approval-core";
import type { ProjectQuickBomWorkspaceResult } from "@/lib/projects/project-quick-bom-workspace";

const { mockReviewProjectBoqArtifact, mockLoadProjectQuickBomWorkspace } =
  vi.hoisted(() => ({
    mockReviewProjectBoqArtifact: vi.fn(),
    mockLoadProjectQuickBomWorkspace: vi.fn(),
  }));

vi.mock("@/lib/projects/project-boq-approval-core", () => ({
  reviewProjectBoqArtifact: mockReviewProjectBoqArtifact,
}));

vi.mock("@/lib/projects/project-quick-bom-workspace", () => ({
  loadProjectQuickBomWorkspace: mockLoadProjectQuickBomWorkspace,
}));

import {
  reviewProjectQuickBomArtifact,
  type ReviewProjectQuickBomArtifactInput,
  type ReviewProjectQuickBomArtifactResult,
} from "@/lib/projects/project-quick-bom-approval";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const ARTIFACT = "sku_resolution-v2";
const DECIDER = "engineer-7";
const DECIDED_AT = new Date("2026-06-03T09:00:00.000Z");

const OK_RESULT = {
  status: "ok",
  approval: {
    id: "approval-1",
    projectId: PROJECT,
    stageId: "sku_resolution",
    artifactId: ARTIFACT,
    artifactVersion: 2,
    decision: "approved",
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
  },
  artifactStatus: "approved",
  stageStatus: "approved",
  workspace: { status: "ok", workspace: { id: PROJECT } },
} as unknown as ReviewProjectBoqArtifactCoreResult<ProjectQuickBomWorkspaceResult>;

function input(
  overrides: Partial<ReviewProjectQuickBomArtifactInput> = {}
): ReviewProjectQuickBomArtifactInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    artifactId: ARTIFACT,
    decision: "approved",
    decidedBy: DECIDER,
    decidedAt: DECIDED_AT,
    note: "ready",
    allowedArtifactTypes: ["priced_boq"],
    ...overrides,
  };
}

beforeEach(() => {
  mockReviewProjectBoqArtifact.mockReset().mockResolvedValue(OK_RESULT);
  mockLoadProjectQuickBomWorkspace.mockReset();
});

describe("reviewProjectQuickBomArtifact", () => {
  it("passes caller input through and pins expectedMode to quick_bom", async () => {
    const request = input({ decision: "rejected", note: "fix pricing" });

    await reviewProjectQuickBomArtifact(request);

    expect(mockReviewProjectBoqArtifact).toHaveBeenCalledTimes(1);
    expect(mockReviewProjectBoqArtifact).toHaveBeenCalledWith({
      ...request,
      expectedMode: "quick_bom",
      loadWorkspace: mockLoadProjectQuickBomWorkspace,
    });
  });

  it("injects the Quick BoM workspace loader without calling it in the wrapper", async () => {
    await reviewProjectQuickBomArtifact(input());

    const arg = mockReviewProjectBoqArtifact.mock.calls[0][0];
    expect(arg.loadWorkspace).toBe(mockLoadProjectQuickBomWorkspace);
    expect(mockLoadProjectQuickBomWorkspace).not.toHaveBeenCalled();
  });

  it("returns the shared core result unchanged", async () => {
    const result: ReviewProjectQuickBomArtifactResult =
      await reviewProjectQuickBomArtifact(input());

    expect(result).toBe(OK_RESULT);
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-quick-bom-approval.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-quick-bom-approval.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the shared approval core and Quick BoM workspace loader", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-boq-approval-core",
      "@/lib/projects/project-quick-bom-workspace",
    ]);
  });

  it("does not import DB, mutation, pricing, export, config-expansion, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db',
      "createProjectArtifactVersion",
      "createProjectApproval",
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/mantle',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/honeywell',
      'from "@/lib/adapters',
      'from "@/lib/agent',
      'from "@/lib/catalog',
      'from "@/coordinator',
      'from "@/engines',
      "@anthropic-ai",
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
