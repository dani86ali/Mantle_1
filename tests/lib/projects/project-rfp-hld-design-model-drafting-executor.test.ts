import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import {
  draftRfpHldDesignModelCandidate,
  getConfiguredRfpHldDesignModelDraftingExecutor,
  type RfpHldDesignModelDraftingExecutor,
  type RfpHldDesignModelDraftingExecutorInput,
} from "@/lib/projects/project-rfp-hld-design-model-drafting-executor";
import { createAnthropicRfpHldDesignModelDraftingExecutor } from "@/lib/projects/project-rfp-hld-design-model-drafting-anthropic";
import {
  RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
  RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_CANDIDATE_ONLY,
  RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_FORBIDDEN,
  type RfpHldDesignModelCandidateInputBundle,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";
import { RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-source-bundle";

// Mock the Anthropic adapter factory so the env-backed configured factory never
// constructs a real client. The factory records the config it receives and
// returns a sentinel executor that the wiring seam must NOT invoke. The mock
// factory is self-contained (no outer references) to satisfy vitest hoisting.
vi.mock(
  "@/lib/projects/project-rfp-hld-design-model-drafting-anthropic",
  () => ({
    createAnthropicRfpHldDesignModelDraftingExecutor: vi.fn(
      () => async () => ({ payload: { sentinel: true } })
    ),
  })
);

const createAdapterMock = vi.mocked(
  createAnthropicRfpHldDesignModelDraftingExecutor
);

/** A minimal, well-typed Stage 6D-002 candidate-input bundle fixture. */
function makeBundle(): RfpHldDesignModelCandidateInputBundle {
  return {
    payloadKind: RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
    createdBy: "engineer-1",
    createdAt: "2026-06-24T00:00:00.000Z",
    sourceHldSourceBundleArtifactId: "art-source-bundle-1",
    sourceHldSourceBundleVersion: 3,
    sourceHldSourceBundlePayloadKind: RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND,
    sourceArtifactIds: ["art-source-bundle-1"],
    coveredDomains: [],
    excludedDomains: [],
    authorities: {} as RfpHldDesignModelCandidateInputBundle["authorities"],
    designKnowledgePackRefs: [],
    assumptions: [],
    constraints: [],
    warnings: [],
    instructions: {
      candidateOnly: RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_CANDIDATE_ONLY,
      targetPayloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
      forbidden: RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_FORBIDDEN.slice(),
    },
  };
}

describe("getConfiguredRfpHldDesignModelDraftingExecutor", () => {
  const ENV_KEYS = [
    "ANTHROPIC_API_KEY",
    "BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MODEL",
    "BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MAX_TOKENS",
  ] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    createAdapterMock.mockClear();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("returns null and constructs no adapter when ANTHROPIC_API_KEY is missing", () => {
    expect(getConfiguredRfpHldDesignModelDraftingExecutor()).toBeNull();
    expect(createAdapterMock).not.toHaveBeenCalled();
  });

  it("returns null and constructs no adapter when ANTHROPIC_API_KEY is blank", () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    expect(getConfiguredRfpHldDesignModelDraftingExecutor()).toBeNull();
    expect(createAdapterMock).not.toHaveBeenCalled();
  });

  it("returns the configured executor without invoking it when the key is nonblank", async () => {
    process.env.ANTHROPIC_API_KEY = "test-api-key";
    const executor = getConfiguredRfpHldDesignModelDraftingExecutor();
    expect(typeof executor).toBe("function");
    // The factory builds but never calls the executor.
    expect(createAdapterMock).toHaveBeenCalledTimes(1);
    // Sentinel proves it is the adapter-built executor, still uninvoked here.
    const out = await (executor as RfpHldDesignModelDraftingExecutor)({
      candidateInput: makeBundle(),
    });
    expect(out).toStrictEqual({ payload: { sentinel: true } });
  });

  it("trims the API key and model and parses a positive integer max-tokens override", () => {
    process.env.ANTHROPIC_API_KEY = "  test-api-key  ";
    process.env.BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MODEL = "  model-x  ";
    process.env.BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MAX_TOKENS = "  2048  ";

    getConfiguredRfpHldDesignModelDraftingExecutor();

    expect(createAdapterMock).toHaveBeenCalledTimes(1);
    expect(createAdapterMock.mock.calls[0][0]).toStrictEqual({
      apiKey: "test-api-key",
      model: "model-x",
      maxTokens: 2048,
    });
  });

  it("ignores a blank model override and lets the adapter default stand", () => {
    process.env.ANTHROPIC_API_KEY = "test-api-key";
    process.env.BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MODEL = "   ";

    getConfiguredRfpHldDesignModelDraftingExecutor();

    const config = createAdapterMock.mock.calls[0][0];
    expect("model" in config).toBe(false);
    expect(config).toStrictEqual({ apiKey: "test-api-key" });
  });

  it.each(["0", "-5", "12.5", "not-a-number", "  "])(
    "ignores the non-positive/non-integer max-tokens override %p",
    (raw) => {
      process.env.ANTHROPIC_API_KEY = "test-api-key";
      process.env.BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MAX_TOKENS = raw;

      getConfiguredRfpHldDesignModelDraftingExecutor();

      const config = createAdapterMock.mock.calls[0][0];
      expect("maxTokens" in config).toBe(false);
      expect(config).toStrictEqual({ apiKey: "test-api-key" });
    }
  );
});

describe("draftRfpHldDesignModelCandidate", () => {
  it("returns an unavailable result when no executor is supplied (null)", async () => {
    const result = await draftRfpHldDesignModelCandidate({
      candidateInput: makeBundle(),
      executor: null,
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });

  it("returns an unavailable result when the executor is absent (undefined)", async () => {
    const result = await draftRfpHldDesignModelCandidate({
      candidateInput: makeBundle(),
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });

  it("does not inspect any candidate payload detail when unavailable", async () => {
    // A hostile bundle whose property reads would throw if the boundary touched
    // them. The unavailable path must never read into it.
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error("candidate bundle must not be inspected when unavailable");
        },
      }
    ) as unknown as RfpHldDesignModelCandidateInputBundle;

    const result = await draftRfpHldDesignModelCandidate({
      candidateInput: trap,
      executor: null,
    });
    expect(result).toStrictEqual({ status: "unavailable" });
  });

  it("passes exactly the Stage 6D-002 candidate input as the executor's only drafting input", async () => {
    const bundle = makeBundle();
    let received: RfpHldDesignModelDraftingExecutorInput | undefined;
    const executor: RfpHldDesignModelDraftingExecutor = vi.fn(async (input) => {
      received = input;
      return { payload: { anything: "untrusted" } };
    });

    await draftRfpHldDesignModelCandidate({ candidateInput: bundle, executor });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(received).toBeDefined();
    // Exactly one key: candidateInput, and it is the SAME bundle reference.
    expect(Object.keys(received as object)).toEqual(["candidateInput"]);
    expect((received as RfpHldDesignModelDraftingExecutorInput).candidateInput).toBe(
      bundle
    );
  });

  it("returns the executor draft verbatim with an untrusted, unvalidated payload", async () => {
    const bundle = makeBundle();
    // A payload that no validator would accept; the boundary must not validate
    // or reshape it - it is carried through untouched.
    const rawPayload = { not: "a-real-design-model", n: 7 };
    const executor: RfpHldDesignModelDraftingExecutor = async () => ({
      payload: rawPayload,
    });

    const result = await draftRfpHldDesignModelCandidate({
      candidateInput: bundle,
      executor,
    });

    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") throw new Error("expected drafted");
    // Same payload reference, unchanged: not validated, not persisted, not cloned.
    expect(result.draft.payload).toBe(rawPayload);
  });
});

describe("HLD design-model drafting executor boundary purity (static source check)", () => {
  const SOURCE_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-drafting-executor.ts"
  );
  const source = readFileSync(SOURCE_PATH, "utf8");

  it("imports exactly the candidate-input bundle type and the Anthropic adapter factory", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toHaveLength(2);
    // The candidate-input import is type-only; the adapter factory is a value
    // import (it is the single wiring seam to the provider adapter).
    expect(importLines[0]).toMatch(/^import type \{/);
    expect(importLines[1]).toMatch(/^import \{/);
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-hld-design-model-candidate-input",
      "@/lib/projects/project-rfp-hld-design-model-drafting-anthropic",
    ]);
  });

  it("imports no provider SDK, store, raw-document, route, or UI module", () => {
    for (const forbidden of [
      "@anthropic-ai",
      "@google/generative-ai",
      'from "openai',
      "langchain",
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/catalog',
      'from "@/lib/db',
      'from "@/lib/export',
      'from "@/lib/intake',
      'from "@/lib/validation',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/files',
      "artifact-store",
      "project-file-store",
      "evidence-persistence",
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
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("performs no network call, dynamic require, or file read", () => {
    for (const forbidden of [
      "fetch(",
      "require(",
      "readFileSync",
      "readFile",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("reads only the three named env vars and no other process.env key", () => {
    const allowed = new Set([
      "ANTHROPIC_API_KEY",
      "BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MODEL",
      "BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MAX_TOKENS",
    ]);
    const reads = Array.from(
      source.matchAll(/process\.env\.([A-Z0-9_]+)/g),
      (m) => m[1]
    );
    expect(reads.length).toBeGreaterThan(0);
    for (const key of reads) expect(allowed.has(key)).toBe(true);
    // No bracket-style or destructured env access sneaks past the dotted scan.
    expect(source).not.toContain("process.env[");
    expect(source).not.toMatch(/=\s*process\.env\s*;/);
  });

  it("makes no final-output, pricing/SKU/catalog/config, or certification/AI-authority claim", () => {
    const lowered = source.toLowerCase();
    for (const forbidden of [
      "draw.io",
      "drawio",
      "html",
      "proposal",
      "rendered diagram",
      "pricing",
      "catalog",
      "certified",
      "certification",
    ]) {
      expect(lowered).not.toContain(forbidden);
    }
  });

  it("keeps the new source file ASCII-only", () => {
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
  });
});
