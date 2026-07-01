import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";

// The Anthropic SDK is never imported here: every behavior test injects a fake
// client through config.client, so no real client is constructed and the
// network is never reached. The adapter module is one of exactly four
// Project-chain modules allowed to import @anthropic-ai/sdk (the others are the
// requirements, extraction-delta, and compliance-matrix drafting adapters),
// proven by the static source checks at the bottom of this suite.
import {
  createAnthropicRfpHldDesignModelDraftingExecutor,
  type AnthropicRfpHldDesignModelDraftingMessageRequest,
  type AnthropicRfpHldDesignModelDraftingMessageResponse,
} from "@/lib/projects/project-rfp-hld-design-model-drafting-anthropic";
import { buildRfpHldDesignModelDraftingRequest } from "@/lib/projects/project-rfp-hld-design-model-drafting-prompt";
import type { RfpHldDesignModelDraftingExecutorInput } from "@/lib/projects/project-rfp-hld-design-model-drafting-executor";
import {
  RFP_HLD_DESIGN_MODEL_CANDIDATE_INPUT_PAYLOAD_KIND,
  RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_CANDIDATE_ONLY,
  RFP_HLD_DESIGN_MODEL_CANDIDATE_DRAFTING_FORBIDDEN,
  type RfpHldDesignModelCandidateInputBundle,
} from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import { RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-design-model";
import { RFP_HLD_SOURCE_BUNDLE_PAYLOAD_KIND } from "@/lib/projects/project-rfp-hld-source-bundle";

const REQUEST_FAILED_MESSAGE = "RFP HLD design-model drafting request failed.";
const NO_TEXT_MESSAGE = "RFP HLD design-model drafting returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP HLD design-model drafting returned output that is not valid JSON.";

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
    hldIntakeAnswers: {
      sourceHldIntakeArtifactId: "hint-1",
      sourceHldIntakeVersion: 1,
      sourceMode: "manual_override",
      answers: [
        {
          fieldId: "target_topology_intent",
          label: "Target topology intent",
          status: "answered",
          value: "Collapsed core campus.",
        },
      ],
      answerCount: 1,
      statusCounts: { answered: 1, unknown: 0, not_applicable: 0 },
    },
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

const EXECUTOR_INPUT: RfpHldDesignModelDraftingExecutorInput = {
  candidateInput: makeBundle(),
};

/** The exact prompt the helper produces for this input. */
const EXPECTED_PROMPT = buildRfpHldDesignModelDraftingRequest(
  EXECUTOR_INPUT.candidateInput
);

/** Raw model output, an arbitrary candidate-only JSON object. */
const RAW_MODEL_OUTPUT = {
  payloadKind: RFP_HLD_DESIGN_MODEL_PAYLOAD_KIND,
  sections: [{ id: "s1", title: "Overview" }],
  modelCommentary: "candidate-only draft body the validator may reshape later",
};

function textResponse(
  ...texts: string[]
): AnthropicRfpHldDesignModelDraftingMessageResponse {
  return { content: texts.map((text) => ({ type: "text", text })) };
}

function makeClient(
  response: AnthropicRfpHldDesignModelDraftingMessageResponse
) {
  const create = vi.fn(
    (request: AnthropicRfpHldDesignModelDraftingMessageRequest) => {
      void request;
      return Promise.resolve(response);
    }
  );
  return { create, client: { messages: { create } } };
}

function makeRejectingClient(reason: unknown) {
  const create = vi.fn(
    (request: AnthropicRfpHldDesignModelDraftingMessageRequest) => {
      void request;
      return Promise.reject(reason);
    }
  );
  return { create, client: { messages: { create } } };
}

describe("createAnthropicRfpHldDesignModelDraftingExecutor - request shape", () => {
  it("calls messages.create once with the configured model, max_tokens, and temperature and no function-calling fields", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
      apiKey: "test-api-key",
      model: "model-override-1",
      maxTokens: 2048,
      temperature: 0,
      client,
    });

    await executor(EXECUTOR_INPUT);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("model-override-1");
    expect(request.max_tokens).toBe(2048);
    expect(request.temperature).toBe(0);
    // The whole request surface: nothing besides these five fields exists, so
    // no function-calling, provider-tool, or schema field is ever sent.
    expect(Object.keys(request).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "system",
      "temperature",
    ]);
    expect("tools" in request).toBe(false);
    expect("tool_choice" in request).toBe(false);
  });

  it("applies safe defaults: claude-opus-4-8, 16000 max tokens, and no temperature key at all", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

    await executor(EXECUTOR_INPUT);

    const request = create.mock.calls[0][0];
    expect(request.model).toBe("claude-opus-4-8");
    expect(request.max_tokens).toBe(16000);
    expect("temperature" in request).toBe(false);
    expect(Object.keys(request).sort()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "system",
    ]);
  });

  it("omits temperature when it is configured as a non-finite value", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
      apiKey: "test-api-key",
      temperature: Number.NaN,
      client,
    });

    await executor(EXECUTOR_INPUT);

    expect("temperature" in create.mock.calls[0][0]).toBe(false);
  });

  it("uses the prompt helper output exactly for the system and the single user turn", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

    await executor(EXECUTOR_INPUT);

    const request = create.mock.calls[0][0];
    expect(request.system).toBe(EXPECTED_PROMPT.system);
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0].role).toBe("user");
    expect(request.messages[0].content).toBe(EXPECTED_PROMPT.user);
  });

  it("never forwards decoy fields beyond the prompt helper whitelist", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });
    // Smuggle hostile fields onto the bundle; the helper whitelist must drop
    // every one of them, so the serialized request never carries them.
    const decoyBundle = {
      ...makeBundle(),
      tenantId: "attacker-tenant",
      storagePath: "C:/secret-store/never-send.json",
      rawDocument: "ARBITRARY-CONTENT-VALUE",
      unitPrice: 1234,
      catalogLookup: { sku: "ATTACKER-SKU-9000" },
    } as unknown as RfpHldDesignModelCandidateInputBundle;

    await executor({ candidateInput: decoyBundle });

    const serialized = JSON.stringify(create.mock.calls[0][0]);
    expect(serialized).not.toContain("tenantId");
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("attacker");
    expect(serialized).not.toContain("secret-store");
    expect(serialized).not.toContain("ARBITRARY-CONTENT-VALUE");
    expect(serialized).not.toContain("unitPrice");
    expect(serialized).not.toContain("catalogLookup");
    expect(serialized).not.toContain("ATTACKER-SKU-9000");
  });

  it("builds the executor without calling the client; one create call per invocation afterwards", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
      apiKey: "",
      client,
    });

    expect(create).not.toHaveBeenCalled();
    await executor(EXECUTOR_INPUT);
    await executor(EXECUTOR_INPUT);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws a fixed setup error when no client is injected and apiKey is blank", () => {
    expect(() =>
      createAnthropicRfpHldDesignModelDraftingExecutor({ apiKey: "   " })
    ).toThrow(
      "A nonblank apiKey is required when no drafting client is injected."
    );
  });
});

describe("createAnthropicRfpHldDesignModelDraftingExecutor - response handling", () => {
  it("returns the parsed JSON as the candidate draft payload, untrusted and unvalidated", async () => {
    const { client } = makeClient(
      textResponse(JSON.stringify(RAW_MODEL_OUTPUT))
    );
    const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

    const output = await executor(EXECUTOR_INPUT);

    expect(output).toStrictEqual({ payload: RAW_MODEL_OUTPUT });
  });

  it("concatenates multiple text entries in order and ignores non-text entries", async () => {
    const serialized = JSON.stringify(RAW_MODEL_OUTPUT);
    const splitAt = 17;
    const { client } = makeClient({
      content: [
        { type: "thinking" },
        { type: "text", text: serialized.slice(0, splitAt) },
        { type: "thinking" },
        { type: "text", text: serialized.slice(splitAt) },
      ],
    });
    const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
      apiKey: "test-api-key",
      client,
    });

    const output = await executor(EXECUTOR_INPUT);

    expect(output).toStrictEqual({ payload: RAW_MODEL_OUTPUT });
  });

  const NO_TEXT_CASES: Array<
    [string, AnthropicRfpHldDesignModelDraftingMessageResponse]
  > = [
    ["an empty content array", { content: [] }],
    ["only non-text content entries", { content: [{ type: "thinking" }] }],
    ["only whitespace text", textResponse("   ", "\n\t")],
  ];

  it.each(NO_TEXT_CASES)(
    "rejects %s with the fixed generic no-text error",
    async (_label, response) => {
      const { client } = makeClient(response);
      const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
        apiKey: "test-api-key",
        client,
      });

      const error = await executor(EXECUTOR_INPUT).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(NO_TEXT_MESSAGE);
    }
  );

  const INVALID_JSON_CASES: Array<[string, string]> = [
    ["raw prose", "SECRET-MODEL-PROSE: here is your answer, not JSON {"],
    [
      "a markdown code fence wrapping JSON",
      "```json\n" + JSON.stringify(RAW_MODEL_OUTPUT) + "\n```",
    ],
    [
      "prose wrapped around JSON",
      "Here is the draft: " + JSON.stringify(RAW_MODEL_OUTPUT),
    ],
  ];

  it.each(INVALID_JSON_CASES)(
    "rejects %s with the fixed generic parse error and never repairs or echoes the output",
    async (_label, text) => {
      const { client } = makeClient(textResponse(text));
      const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
        apiKey: "test-api-key",
        client,
      });

      const error = await executor(EXECUTOR_INPUT).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(INVALID_JSON_MESSAGE);
      expect((error as Error).message).not.toContain("SECRET-MODEL-PROSE");
      expect((error as Error).message).not.toContain("```");
    }
  );

  const PROVIDER_FAILURES: Array<[string, unknown]> = [
    [
      "an Error carrying provider detail",
      new Error("401 invalid x-api-key sk-ant-secret-key prompt dump"),
    ],
    ["a raw string rejection", "raw-provider-string-detail"],
  ];

  it.each(PROVIDER_FAILURES)(
    "maps %s to the fixed generic request error with no provider, key, or model detail",
    async (_label, reason) => {
      const { client } = makeRejectingClient(reason);
      const executor = createAnthropicRfpHldDesignModelDraftingExecutor({
        apiKey: "test-api-key",
        model: "model-secret-name",
        client,
      });

      const error = await executor(EXECUTOR_INPUT).then(
        () => null,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(REQUEST_FAILED_MESSAGE);
      expect((error as Error).message).not.toContain("sk-ant");
      expect((error as Error).message).not.toContain("401");
      expect((error as Error).message).not.toContain("raw-provider-string");
      expect((error as Error).message).not.toContain("model-secret-name");
    }
  );
});

describe("Anthropic HLD design-model drafting adapter module purity (static source check)", () => {
  const ADAPTER_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-design-model-drafting-anthropic.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-design-model-drafting-anthropic.test.ts"
  );
  const adapterSource = readFileSync(ADAPTER_PATH, "utf8");

  function listSourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...listSourceFiles(fullPath));
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it("imports exactly the Anthropic SDK, the drafting executor contract, and the prompt helper", () => {
    const froms = Array.from(
      adapterSource.matchAll(/from\s+"([^"]+)"/g),
      (m) => m[1]
    );
    expect(froms).toEqual([
      "@anthropic-ai/sdk",
      "@/lib/projects/project-rfp-hld-design-model-drafting-executor",
      "@/lib/projects/project-rfp-hld-design-model-drafting-prompt",
    ]);
    const importLines = adapterSource
      .split(/\r?\n/)
      .filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toHaveLength(3);
    expect(importLines[0]).toMatch(
      /^import Anthropic from "@anthropic-ai\/sdk";$/
    );
    expect(importLines[1]).toMatch(/^import type \{/);
    expect(importLines[2]).toMatch(/^import \{ buildRfpHldDesignModelDraftingRequest/);
  });

  it("limits Project-chain (src/lib/projects, src/app) @anthropic-ai/sdk imports to exactly the four approved drafting adapters", () => {
    const sdkImport = /from\s+["']@anthropic-ai\/sdk["']/;
    const offenders: string[] = [];
    for (const root of ["src/lib/projects", "src/app"]) {
      for (const file of listSourceFiles(join(process.cwd(), root))) {
        if (sdkImport.test(readFileSync(file, "utf8"))) {
          offenders.push(file);
        }
      }
    }
    expect(offenders.sort()).toEqual(
      [
        join(
          process.cwd(),
          "src/lib/projects/project-rfp-requirements-candidate-drafting-anthropic.ts"
        ),
        join(
          process.cwd(),
          "src/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic.ts"
        ),
        join(
          process.cwd(),
          "src/lib/projects/project-rfp-compliance-matrix-drafting-anthropic.ts"
        ),
        ADAPTER_PATH,
      ].sort()
    );
  });

  it("stays free of legacy AI/LLM/catalog/pricing/SKU/config/export/DB/route/UI imports, environment reads, file/network primitives, and function-calling fields", () => {
    for (const forbidden of [
      "process.env",
      "fetch(",
      "require(",
      "chat.completions",
      "tool_choice",
      'from "openai',
      "@google/generative-ai",
      "langchain",
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
      'from "@/lib/projects/project-rfp-evidence-persistence',
      "artifact-store",
      "project-file-store",
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/',
      'from "next',
      'from "react',
      "node:fs",
      "node:path",
    ]) {
      expect(adapterSource).not.toContain(forbidden);
    }
    expect(/generateText\s*\(/.test(adapterSource)).toBe(false);
    expect(/generateObject\s*\(/.test(adapterSource)).toBe(false);
    // No request-level function-calling field is even spelled in the source.
    expect(/\btools\s*:/.test(adapterSource)).toBe(false);
  });

  it("keeps the adapter and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(adapterSource)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
