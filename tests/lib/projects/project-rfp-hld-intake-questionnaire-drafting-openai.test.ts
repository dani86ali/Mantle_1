import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";

// The OpenAI SDK is never imported here: every behavior test injects a fake
// client through config.client, so no real client is constructed and no network
// is reached. The static source checks at the bottom prove the adapter imports
// no provider package and uses no fetch/env.
import {
  createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor,
  type OpenAiRfpHldIntakeQuestionnaireDraftingRequest,
  type OpenAiRfpHldIntakeQuestionnaireDraftingResponse,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-openai";
import { buildRfpHldIntakeQuestionnaireDraftingRequest } from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-prompt";
import type { RfpHldIntakeQuestionnaireDraftingExecutorInput } from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-executor";
import {
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY,
  RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN,
  type RfpHldIntakeQuestionnaireDraftingInput,
} from "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-input";

const REQUEST_FAILED_MESSAGE = "RFP HLD intake-question drafting request failed.";
const NO_TEXT_MESSAGE = "RFP HLD intake-question drafting returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP HLD intake-question drafting returned output that is not valid JSON.";

function makeInput(): RfpHldIntakeQuestionnaireDraftingInput {
  return {
    payloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_INPUT_PAYLOAD_KIND,
    createdBy: "engineer-1",
    createdAt: "2026-06-30T00:00:00.000Z",
    sourceArtifactIds: ["art-source-bundle-1"],
    sourceRefs: [
      {
        refId: "ref-1",
        artifactId: "art-source-bundle-1",
        artifactType: "hld_source_bundle",
        stageId: "hld_source_bundle_review",
        status: "approved",
        version: 2,
        payloadKind: "rfp_hld_source_bundle",
        label: "Source bundle",
      },
    ],
    designKnowledgePackContents: [],
    instructions: {
      candidateOnly: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_CANDIDATE_ONLY,
      targetPayloadKind: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_TARGET_PAYLOAD_KIND,
      forbidden: RFP_HLD_INTAKE_QUESTIONNAIRE_DRAFTING_FORBIDDEN.slice(),
    },
  };
}

const EXECUTOR_INPUT: RfpHldIntakeQuestionnaireDraftingExecutorInput = {
  draftingInput: makeInput(),
};
const EXPECTED_PROMPT = buildRfpHldIntakeQuestionnaireDraftingRequest(
  EXECUTOR_INPUT.draftingInput
);

const RAW_OUTPUT = { questions: [{ questionId: "q-1" }] };

function textResponse(output_text: string): OpenAiRfpHldIntakeQuestionnaireDraftingResponse {
  return { output_text };
}

function makeClient(response: OpenAiRfpHldIntakeQuestionnaireDraftingResponse) {
  const create = vi.fn(
    (request: OpenAiRfpHldIntakeQuestionnaireDraftingRequest) => {
      void request;
      return Promise.resolve(response);
    }
  );
  return { create, client: { responses: { create } } };
}

function makeRejectingClient(reason: unknown) {
  const create = vi.fn(
    (request: OpenAiRfpHldIntakeQuestionnaireDraftingRequest) => {
      void request;
      return Promise.reject(reason);
    }
  );
  return { create, client: { responses: { create } } };
}

describe("createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor - request shape", () => {
  it("sends exactly model, instructions, input and the configured optional fields, and no tool/function/schema field", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_OUTPUT))
    );
    const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
      model: "model-x",
      maxOutputTokens: 2048,
      temperature: 0,
      client,
    });

    await executor(EXECUTOR_INPUT);

    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("model-x");
    expect(request.max_output_tokens).toBe(2048);
    expect(request.temperature).toBe(0);
    expect(Object.keys(request).sort()).toEqual([
      "input",
      "instructions",
      "max_output_tokens",
      "model",
      "temperature",
    ]);
    for (const banned of [
      "tools",
      "tool_choice",
      "function_call",
      "functions",
      "response_format",
      "schema",
      "text",
    ]) {
      expect(banned in request).toBe(false);
    }
  });

  it("omits optional fields when unset or non-finite/non-positive", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_OUTPUT))
    );
    const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
      model: "model-x",
      maxOutputTokens: 0,
      temperature: Number.NaN,
      client,
    });

    await executor(EXECUTOR_INPUT);

    const request = create.mock.calls[0][0];
    expect(Object.keys(request).sort()).toEqual(["input", "instructions", "model"]);
  });

  it("uses the prompt serializer output exactly for instructions and input", async () => {
    const { create, client } = makeClient(
      textResponse(JSON.stringify(RAW_OUTPUT))
    );
    const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
      model: "model-x",
      client,
    });

    await executor(EXECUTOR_INPUT);

    const request = create.mock.calls[0][0];
    expect(request.instructions).toBe(EXPECTED_PROMPT.system);
    expect(request.input).toBe(EXPECTED_PROMPT.user);
  });

  it("throws a fixed setup error when no client is injected", () => {
    expect(() =>
      createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({ model: "model-x" })
    ).toThrow(
      "A live drafting client must be injected; client wiring is not configured for this stage."
    );
  });

  it("throws a fixed error when the model is blank", () => {
    const { client } = makeClient(textResponse(JSON.stringify(RAW_OUTPUT)));
    expect(() =>
      createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({ model: "   ", client })
    ).toThrow("A nonblank model is required to build the drafting executor.");
  });
});

describe("createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor - response handling", () => {
  it("parses output_text as the unknown candidate provider output", async () => {
    const { client } = makeClient(textResponse(JSON.stringify(RAW_OUTPUT)));
    const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
      model: "model-x",
      client,
    });

    const output = await executor(EXECUTOR_INPUT);
    expect(output).toStrictEqual(RAW_OUTPUT);
  });

  it("parses text blocks in response.output, ignoring non-text entries, in order", async () => {
    const serialized = JSON.stringify(RAW_OUTPUT);
    const splitAt = 8;
    const { client } = makeClient({
      output: [
        { type: "reasoning", content: [{ type: "reasoning_text", text: "IGNORE" }] },
        { type: "message", content: [{ type: "text", text: serialized.slice(0, splitAt) }] },
        { type: "message", content: [{ type: "text", text: serialized.slice(splitAt) }] },
      ],
    });
    const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
      model: "model-x",
      client,
    });

    const output = await executor(EXECUTOR_INPUT);
    expect(output).toStrictEqual(RAW_OUTPUT);
  });

  it("reads output_text first, then output text blocks, in order", async () => {
    const serialized = JSON.stringify(RAW_OUTPUT);
    const splitAt = 5;
    const { client } = makeClient({
      output_text: serialized.slice(0, splitAt),
      output: [
        { type: "message", content: [{ type: "text", text: serialized.slice(splitAt) }] },
      ],
    });
    const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
      model: "model-x",
      client,
    });

    const output = await executor(EXECUTOR_INPUT);
    expect(output).toStrictEqual(RAW_OUTPUT);
  });

  const NO_TEXT_CASES: Array<[string, OpenAiRfpHldIntakeQuestionnaireDraftingResponse]> = [
    ["an empty response", {}],
    ["an empty output array", { output: [] }],
    ["only non-text content", { output: [{ type: "reasoning", content: [{ type: "reasoning_text", text: "x" }] }] }],
    ["only whitespace text", { output_text: "   \n\t" }],
  ];

  it.each(NO_TEXT_CASES)(
    "throws the fixed no-text error for %s",
    async (_label, response) => {
      const { client } = makeClient(response);
      const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
        model: "model-x",
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

  it("throws the fixed parse error and never echoes invalid output", async () => {
    const { client } = makeClient(
      textResponse("SECRET-MODEL-PROSE: not json {")
    );
    const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
      model: "model-secret-name",
      client,
    });

    const error = await executor(EXECUTOR_INPUT).then(
      () => null,
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(INVALID_JSON_MESSAGE);
    expect((error as Error).message).not.toContain("SECRET-MODEL-PROSE");
    expect((error as Error).message).not.toContain("model-secret-name");
  });

  it("maps a provider rejection to the fixed request error with no leaked detail", async () => {
    const { client } = makeRejectingClient(
      new Error("401 invalid api-key sk-openai-secret prompt dump")
    );
    const executor = createOpenAiRfpHldIntakeQuestionnaireDraftingExecutor({
      model: "model-secret-name",
      client,
    });

    const error = await executor(EXECUTOR_INPUT).then(
      () => null,
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(REQUEST_FAILED_MESSAGE);
    expect((error as Error).message).not.toContain("sk-openai-secret");
    expect((error as Error).message).not.toContain("401");
    expect((error as Error).message).not.toContain("model-secret-name");
  });
});

describe("OpenAI HLD intake-question drafting adapter module purity (static source check)", () => {
  const SOURCE_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-hld-intake-questionnaire-drafting-openai.ts"
  );
  const TEST_PATH = join(
    process.cwd(),
    "tests/lib/projects/project-rfp-hld-intake-questionnaire-drafting-openai.test.ts"
  );
  const source = readFileSync(SOURCE_PATH, "utf8");

  it("imports exactly the executor contract and the prompt helper", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([
      "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-executor",
      "@/lib/projects/project-rfp-hld-intake-questionnaire-drafting-prompt",
    ]);
  });

  it("imports no provider SDK and uses no fetch, env, dynamic require, or file/network primitive", () => {
    for (const forbidden of [
      'from "openai',
      "'openai'",
      "@anthropic-ai/sdk",
      "@google/generative-ai",
      "langchain",
      "process.env",
      "fetch(",
      "require(",
      "node:fs",
      "node:path",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("imports no store, raw-document, route, UI, pricing, SKU, catalog, or config module", () => {
    for (const forbidden of [
      'from "@/lib/ai',
      'from "@/lib/llm',
      'from "@/lib/agent',
      'from "@/lib/adapters',
      'from "@/lib/catalog',
      'from "@/lib/db',
      'from "@/lib/export',
      'from "@/lib/projects/pricing',
      'from "@/lib/projects/priced-boq',
      'from "@/lib/projects/sku-resolution',
      'from "@/lib/projects/config-expansion',
      'from "@/lib/projects/files',
      "artifact-store",
      "project-file-store",
      'from "@/coordinator',
      'from "@/engines',
      'from "@/components',
      'from "@/app/',
      'from "next',
      'from "react',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("declares no request-level function-calling or schema field", () => {
    for (const banned of [
      "tools:",
      "tool_choice",
      "function_call",
      "functions:",
      "response_format",
    ]) {
      expect(source).not.toContain(banned);
    }
  });

  it("keeps the adapter and this test file ASCII-only", () => {
    const testSource = readFileSync(TEST_PATH, "utf8");
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
