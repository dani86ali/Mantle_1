import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The Anthropic adapter factory is mocked so this suite tests ONLY the
// wiring seam: which environment variables the factory reads, how it
// normalizes them, and the exact construction arguments it forwards to the
// approved adapter. The real adapter (and therefore @anthropic-ai/sdk) is
// never loaded, so no real client is constructed and the network is never
// reached. The factory under test is imported normally and resolves the
// adapter factory through this mock. The static source checks at the bottom
// prove the factory's own two-import surface, env-read allowlist, and purity.
const { mockCreateAdapter } = vi.hoisted(() => ({
  mockCreateAdapter: vi.fn(),
}));

vi.mock(
  "@/lib/projects/project-rfp-compliance-matrix-drafting-anthropic",
  () => ({
    createAnthropicRfpComplianceMatrixDraftingExecutor: mockCreateAdapter,
  })
);

import {
  getConfiguredRfpComplianceMatrixDraftingExecutor,
} from "@/lib/projects/project-rfp-compliance-matrix-drafting-executor";

// The injected executor the mocked adapter factory hands back. Identity is
// asserted on the factory's return value; it must never be invoked here.
const SENTINEL_EXECUTOR = vi.fn(() => Promise.resolve({ rows: [] }));

const FACTORY_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MODEL",
  "BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MAX_TOKENS",
];

describe("getConfiguredRfpComplianceMatrixDraftingExecutor", () => {
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    mockCreateAdapter.mockReset();
    mockCreateAdapter.mockReturnValue(SENTINEL_EXECUTOR);
    SENTINEL_EXECUTOR.mockClear();
    savedEnv = {};
    for (const key of FACTORY_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of FACTORY_ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  /** The single construction argument forwarded to the adapter factory. */
  function singleConstructionArg(): Record<string, unknown> {
    expect(mockCreateAdapter).toHaveBeenCalledTimes(1);
    return mockCreateAdapter.mock.calls[0][0] as Record<string, unknown>;
  }

  it("returns null and never constructs the adapter when ANTHROPIC_API_KEY is missing", () => {
    expect(getConfiguredRfpComplianceMatrixDraftingExecutor()).toBeNull();
    expect(mockCreateAdapter).not.toHaveBeenCalled();
  });

  it("returns null and never constructs the adapter when ANTHROPIC_API_KEY is blank", () => {
    process.env.ANTHROPIC_API_KEY = "   ";

    expect(getConfiguredRfpComplianceMatrixDraftingExecutor()).toBeNull();
    expect(mockCreateAdapter).not.toHaveBeenCalled();
  });

  it("constructs the adapter with the trimmed apiKey only and returns the mocked executor when no overrides are set", () => {
    process.env.ANTHROPIC_API_KEY = "  test-anthropic-key  ";

    const result = getConfiguredRfpComplianceMatrixDraftingExecutor();

    expect(result).toBe(SENTINEL_EXECUTOR);
    expect(typeof result).toBe("function");
    expect(singleConstructionArg()).toStrictEqual({
      apiKey: "test-anthropic-key",
    });
  });

  it("trims the model override and passes it as model", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MODEL =
      "  model-override-1  ";

    const result = getConfiguredRfpComplianceMatrixDraftingExecutor();

    expect(result).toBe(SENTINEL_EXECUTOR);
    expect(singleConstructionArg()).toStrictEqual({
      apiKey: "test-anthropic-key",
      model: "model-override-1",
    });
  });

  it("ignores a blank model override (passes no model key)", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MODEL = "   ";

    getConfiguredRfpComplianceMatrixDraftingExecutor();

    const arg = singleConstructionArg();
    expect("model" in arg).toBe(false);
    expect(arg).toStrictEqual({ apiKey: "test-anthropic-key" });
  });

  const MAX_TOKENS_CASES: Array<[string, string, number | undefined]> = [
    ["a valid positive integer", "2048", 2048],
    ["a non-integer", "12.5", undefined],
    ["a non-numeric string", "lots", undefined],
    ["zero", "0", undefined],
    ["a negative integer", "-5", undefined],
    ["a blank string", "   ", undefined],
  ];

  it.each(MAX_TOKENS_CASES)(
    "applies the max-tokens override only for %s",
    (_label, rawMaxTokens, expected) => {
      process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
      process.env.BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MAX_TOKENS =
        rawMaxTokens;

      const result = getConfiguredRfpComplianceMatrixDraftingExecutor();

      expect(result).toBe(SENTINEL_EXECUTOR);
      const arg = singleConstructionArg();
      if (expected === undefined) {
        expect("maxTokens" in arg).toBe(false);
        expect(arg).toStrictEqual({ apiKey: "test-anthropic-key" });
      } else {
        expect(arg.maxTokens).toBe(expected);
        expect(arg).toStrictEqual({
          apiKey: "test-anthropic-key",
          maxTokens: expected,
        });
      }
    }
  );

  it("forwards trimmed model and a valid maxTokens together", () => {
    process.env.ANTHROPIC_API_KEY = "  test-anthropic-key  ";
    process.env.BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MODEL =
      "  model-override-1  ";
    process.env.BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MAX_TOKENS = "4096";

    getConfiguredRfpComplianceMatrixDraftingExecutor();

    expect(singleConstructionArg()).toStrictEqual({
      apiKey: "test-anthropic-key",
      model: "model-override-1",
      maxTokens: 4096,
    });
  });

  it("never invokes the returned executor", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

    const result = getConfiguredRfpComplianceMatrixDraftingExecutor();

    expect(result).toBe(SENTINEL_EXECUTOR);
    expect(mockCreateAdapter).toHaveBeenCalledTimes(1);
    expect(SENTINEL_EXECUTOR).not.toHaveBeenCalled();
  });

  it("saves and restores pre-existing approved env values across a mutate cycle", () => {
    // Exercises the same snapshot/clear/restore the suite's beforeEach and
    // afterEach use, proving the approved env vars are restored after a test
    // mutates them rather than leaking to the next test.
    process.env.ANTHROPIC_API_KEY = "pre-existing-key";
    const snapshot: Record<string, string | undefined> = {};
    for (const key of FACTORY_ENV_KEYS) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();

    process.env.ANTHROPIC_API_KEY = "mutated-during-test";
    process.env.BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MODEL = "mutated-model";

    for (const key of FACTORY_ENV_KEYS) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    expect(process.env.ANTHROPIC_API_KEY).toBe("pre-existing-key");
    expect(
      process.env.BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MODEL
    ).toBeUndefined();
  });
});

describe("compliance-matrix drafting executor factory module purity (static source check)", () => {
  const FACTORY_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-compliance-matrix-drafting-executor.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-compliance-matrix-drafting-executor.test.ts"
  );
  const factorySource = readFileSync(FACTORY_PATH, "utf8");

  const APPROVED_ENV = [
    "ANTHROPIC_API_KEY",
    "BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MODEL",
    "BOMATIC_RFP_COMPLIANCE_MATRIX_DRAFTING_MAX_TOKENS",
  ];

  it("imports exactly the type-only drafting contract type and the Anthropic adapter factory, in that order", () => {
    const importLines = factorySource
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toHaveLength(2);
    expect(importLines[0]).toMatch(/^import type \{/);
    expect(importLines[1]).toMatch(/^import \{/);
    const froms = Array.from(
      factorySource.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-compliance-matrix-drafting",
      "@/lib/projects/project-rfp-compliance-matrix-drafting-anthropic",
    ]);
    expect(factorySource).toContain(
      "createAnthropicRfpComplianceMatrixDraftingExecutor"
    );
  });

  it("never imports @anthropic-ai/sdk or any other provider, AI, LLM, agent, adapter, coordinator, engine, catalog, pricing, SKU, config, export, Quick BoM, DB, store, route, or UI module", () => {
    for (const forbidden of [
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/catalog',
      'from "@/lib/db',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/middleware',
      'from "@/lib/validation',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/files',
      'from "@/lib/projects/quick-bom-runner"',
      'from "@/lib/projects/project-rfp-evidence-persistence',
      // The compliance-matrix generation, draft, and payload modules (exact
      // modules, closing quote: the drafting-contract and adapter imports
      // legitimately share the project-rfp-compliance-matrix prefix).
      'from "@/lib/projects/project-rfp-compliance-matrix-generation',
      'from "@/lib/projects/project-rfp-compliance-matrix-draft"',
      'from "@/lib/projects/project-rfp-compliance-matrix"',
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/',
      'from "next',
      'from "react',
      "node:fs",
      "node:path",
      "createProjectArtifactVersion",
      "createProjectApproval",
      "createProjectEvidenceItem",
      "getProjectById",
      "listProjectEvidenceItems",
    ]) {
      expect(factorySource).not.toContain(forbidden);
    }
  });

  it("performs no network call or dynamic require and reads only the approved environment variables by dot access", () => {
    for (const forbidden of ["fetch(", "require(", "process.env["]) {
      expect(factorySource).not.toContain(forbidden);
    }
    const envReads = Array.from(
      factorySource.matchAll(/process\.env\.([A-Za-z0-9_]+)/g),
      (m) => m[1]
    );
    expect(envReads.length).toBeGreaterThan(0);
    for (const name of envReads) {
      expect(APPROVED_ENV).toContain(name);
    }
  });

  it("keeps the factory and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(factorySource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
