import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock ONLY the shared core: this is a thin lane wrapper, so the contract under
// test is "delegate to the core once, pinning expectedMode to 'rfp', and return
// whatever the core returns unchanged". The core's own behavior is proven by its
// own (Quick lane) test suite against the real deterministic pieces.
vi.mock("@/lib/projects/project-boq-config-expansion-draft-core", () => ({
  createProjectBoqConfigurationExpansionDraftCore: vi.fn(),
}));

import * as serviceModule from "@/lib/projects/project-rfp-config-expansion-draft";
import {
  createProjectRfpConfigurationExpansionDraft,
  type CreateProjectRfpConfigurationExpansionDraftInput,
} from "@/lib/projects/project-rfp-config-expansion-draft";
import { createProjectBoqConfigurationExpansionDraftCore } from "@/lib/projects/project-boq-config-expansion-draft-core";

const coreMock = vi.mocked(createProjectBoqConfigurationExpansionDraftCore);

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-rfp-1";
const SKU_ID = "art-skur-1";

function input(): CreateProjectRfpConfigurationExpansionDraftInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    skuResolutionArtifactId: SKU_ID,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  coreMock.mockResolvedValue({ status: "ok" } as never);
});

describe("createProjectRfpConfigurationExpansionDraft - delegation", () => {
  it("delegates exactly once to the shared core with the rfp expectedMode and the coordinates", async () => {
    await createProjectRfpConfigurationExpansionDraft(input());

    expect(coreMock).toHaveBeenCalledTimes(1);
    expect(coreMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      projectId: PROJECT,
      skuResolutionArtifactId: SKU_ID,
      expectedMode: "rfp",
    });
  });

  it("passes no extra catalog/profile/pricing/config-authority arguments beyond expectedMode", async () => {
    await createProjectRfpConfigurationExpansionDraft(input());

    const arg = coreMock.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(Object.keys(arg).sort()).toEqual(
      ["expectedMode", "projectId", "skuResolutionArtifactId", "tenantId"].sort()
    );
  });

  it("returns the core ok result unchanged", async () => {
    const coreResult = {
      status: "ok",
      artifact: { id: "art-cfg-1" },
      payloadSummary: { payloadKind: "configuration_expansion_draft" },
    } as never;
    coreMock.mockResolvedValue(coreResult);

    const result = await createProjectRfpConfigurationExpansionDraft(input());

    expect(result).toBe(coreResult);
  });

  it("returns the core not_found result unchanged", async () => {
    const coreResult = { status: "not_found" } as never;
    coreMock.mockResolvedValue(coreResult);

    const result = await createProjectRfpConfigurationExpansionDraft(input());

    expect(result).toBe(coreResult);
  });

  it("returns the core wrong_mode result unchanged", async () => {
    const coreResult = {
      status: "wrong_mode",
      project: { id: PROJECT, mode: "quick_bom" },
    } as never;
    coreMock.mockResolvedValue(coreResult);

    const result = await createProjectRfpConfigurationExpansionDraft(input());

    expect(result).toBe(coreResult);
  });
});

describe("createProjectRfpConfigurationExpansionDraft - immutability", () => {
  it("does not mutate the input object", async () => {
    const inp = input();
    const snapshot = structuredClone(inp);

    await createProjectRfpConfigurationExpansionDraft(inp);

    expect(inp).toEqual(snapshot);
  });
});

describe("createProjectRfpConfigurationExpansionDraft - surface and purity", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-config-expansion-draft.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-config-expansion-draft.test.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("exposes only the RFP wrapper service as a runtime export", () => {
    expect(Object.keys(serviceModule)).toEqual([
      "createProjectRfpConfigurationExpansionDraft",
    ]);
  });

  it("imports the shared core only", () => {
    expect(source).toContain(
      'from "@/lib/projects/project-boq-config-expansion-draft-core"'
    );
    expect(source).toContain("createProjectBoqConfigurationExpansionDraftCore");

    const importLines = source
      .split("\n")
      .filter((line) => /\bfrom\s+["']/.test(line));
    for (const line of importLines) {
      expect(line).toContain(
        '@/lib/projects/project-boq-config-expansion-draft-core'
      );
    }
  });

  it("does not import the stores, builder, Honeywell pack, config authority, the artifact-write fn, reviewed expansion/review helpers, pricing, export, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-store"',
      'from "@/lib/db/project-artifact-store"',
      "createProjectArtifactVersion",
      'from "@/lib/projects/config-expansion"',
      'from "@/lib/projects/config-expansion-types"',
      'from "@/lib/projects/config-expansion-artifact"',
      'from "@/lib/projects/config-expansion-review"',
      'from "@/lib/projects/honeywell-config-expansion-rule-pack"',
      'from "@/lib/projects/honeywell-demo-config-authority"',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/sku-resolution',
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

  it("keeps the wrapper and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
