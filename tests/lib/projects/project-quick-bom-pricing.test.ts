import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the shared BoQ pricing core so this wrapper is exercised in isolation: the only
// thing under test is that caller input passes through verbatim, expectedMode is pinned
// to "quick_bom", and the core result is returned unchanged. Every gate, the
// deterministic price+persist, and the lean summaries are the core's job (and are
// covered by tests/lib/projects/project-boq-pricing-core.test.ts).
const { mockCreateProjectBoqPricedBoq } = vi.hoisted(() => ({
  mockCreateProjectBoqPricedBoq: vi.fn(),
}));

vi.mock("@/lib/projects/project-boq-pricing-core", () => ({
  createProjectBoqPricedBoq: mockCreateProjectBoqPricedBoq,
}));

import * as serviceModule from "@/lib/projects/project-quick-bom-pricing";
import {
  createProjectQuickBomPricedBoq,
  type CreateProjectQuickBomPricedBoqInput,
  type CreateProjectQuickBomPricedBoqResult,
} from "@/lib/projects/project-quick-bom-pricing";

const TENANT = "11111111-1111-1111-1111-111111111111";
const PROJECT = "proj-1";
const EXPANSION_ID = "art-ce-7";

// Opaque to the wrapper: it is returned verbatim, so a sentinel object proves passthrough.
const CORE_RESULT = {
  status: "ok",
  artifact: { id: "art-pb-1" },
  payloadSummary: { sourceConfigurationExpansionArtifactId: EXPANSION_ID },
  pricingSummary: { inputLineCount: 2 },
} as unknown as CreateProjectQuickBomPricedBoqResult;

function input(
  overrides: Partial<CreateProjectQuickBomPricedBoqInput> = {}
): CreateProjectQuickBomPricedBoqInput {
  return {
    tenantId: TENANT,
    projectId: PROJECT,
    configurationExpansionArtifactId: EXPANSION_ID,
    ...overrides,
  };
}

beforeEach(() => {
  mockCreateProjectBoqPricedBoq.mockReset().mockResolvedValue(CORE_RESULT);
});

describe("createProjectQuickBomPricedBoq", () => {
  it("passes caller input through and pins expectedMode to quick_bom", async () => {
    const request = input({ configurationExpansionArtifactId: "art-ce-99" });

    await createProjectQuickBomPricedBoq(request);

    expect(mockCreateProjectBoqPricedBoq).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectBoqPricedBoq).toHaveBeenCalledWith({
      ...request,
      expectedMode: "quick_bom",
    });
  });

  it("overrides any caller-supplied expectedMode with quick_bom", async () => {
    const sneaky = {
      ...input(),
      expectedMode: "rfp",
    } as unknown as CreateProjectQuickBomPricedBoqInput;

    await createProjectQuickBomPricedBoq(sneaky);

    expect(mockCreateProjectBoqPricedBoq.mock.calls[0][0].expectedMode).toBe("quick_bom");
  });

  it("returns the shared core result unchanged", async () => {
    const result: CreateProjectQuickBomPricedBoqResult =
      await createProjectQuickBomPricedBoq(input());

    expect(result).toBe(CORE_RESULT);
  });
});

describe("module purity and surface (static source check)", () => {
  const SRC_PATH = join(process.cwd(), "src/lib/projects/project-quick-bom-pricing.ts");
  const TEST_PATH = join(process.cwd(), "tests/lib/projects/project-quick-bom-pricing.test.ts");
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports only the shared BoQ pricing core in the production wrapper", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual(["@/lib/projects/project-boq-pricing-core"]);
  });

  it("does not import the project store, priced-boq artifact service, demo fixture/authority, DB, pricing math, config-expansion, export, runner, AI, catalog, engine, coordinator, or adapter modules", () => {
    for (const forbidden of [
      'from "@/lib/db/project-store"',
      'from "@/lib/db',
      'from "@/lib/projects/priced-boq-artifact"',
      'from "@/lib/projects/priced-boq"',
      'from "@/lib/projects/pricing"',
      'from "@/lib/projects/honeywell',
      'from "@/lib/projects/config-expansion',
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
    expect(Object.keys(serviceModule)).toEqual(["createProjectQuickBomPricedBoq"]);
  });

  it("keeps the source and test files ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
