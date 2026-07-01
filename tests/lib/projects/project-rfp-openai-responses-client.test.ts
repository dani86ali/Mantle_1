import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";

import {
  createOpenAiResponsesClient,
  type OpenAiResponsesFetch,
  type OpenAiResponsesFetchInit,
  type OpenAiResponsesRequest,
} from "@/lib/projects/project-rfp-openai-responses-client";

const API_KEY_MESSAGE =
  "A nonblank OpenAI API key is required to construct a live OpenAI Responses client.";
const REQUEST_FAILED_MESSAGE = "OpenAI Responses request failed.";
const DEFAULT_URL = "https://api.openai.com/v1/responses";

const REQUEST: OpenAiResponsesRequest = {
  model: "gpt-x",
  instructions: "SYSTEM-PROMPT-SECRET",
  input: "USER-PROMPT-SECRET",
  max_output_tokens: 256,
  temperature: 0.2,
};

function okFetch(
  captured: { url?: string; init?: OpenAiResponsesFetchInit },
  json: unknown
): OpenAiResponsesFetch {
  return vi.fn(async (url: string, init: OpenAiResponsesFetchInit) => {
    captured.url = url;
    captured.init = init;
    return { ok: true, status: 200, json: async () => json };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createOpenAiResponsesClient - construction", () => {
  it("requires a nonblank API key and never echoes it", () => {
    expect(() => createOpenAiResponsesClient({ apiKey: "" })).toThrow(
      API_KEY_MESSAGE
    );
    let thrown: unknown;
    try {
      createOpenAiResponsesClient({ apiKey: "   " });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as Error).message).toBe(API_KEY_MESSAGE);
  });
});

describe("createOpenAiResponsesClient - request shape", () => {
  it("POSTs the narrow request to the default endpoint with auth headers", async () => {
    const captured: { url?: string; init?: OpenAiResponsesFetchInit } = {};
    const client = createOpenAiResponsesClient({
      apiKey: "sk-secret-key",
      fetchImpl: okFetch(captured, { output_text: "{}" }),
    });

    await client.responses.create(REQUEST);

    expect(captured.url).toBe(DEFAULT_URL);
    expect(captured.init?.method).toBe("POST");
    expect(captured.init?.headers["Content-Type"]).toBe("application/json");
    expect(captured.init?.headers.Authorization).toBe("Bearer sk-secret-key");
    const body = JSON.parse(captured.init?.body ?? "{}");
    expect(Object.keys(body).sort()).toEqual([
      "input",
      "instructions",
      "max_output_tokens",
      "model",
      "temperature",
    ]);
    expect(body).toEqual({
      model: "gpt-x",
      instructions: "SYSTEM-PROMPT-SECRET",
      input: "USER-PROMPT-SECRET",
      max_output_tokens: 256,
      temperature: 0.2,
    });
    for (const banned of ["tools", "tool_choice", "response_format", "apiKey"]) {
      expect(banned in body).toBe(false);
    }
  });

  it("omits the optional fields when unset", async () => {
    const captured: { url?: string; init?: OpenAiResponsesFetchInit } = {};
    const client = createOpenAiResponsesClient({
      apiKey: "sk-key",
      fetchImpl: okFetch(captured, { output_text: "{}" }),
    });
    await client.responses.create({
      model: "m",
      instructions: "i",
      input: "u",
    });
    const body = JSON.parse(captured.init?.body ?? "{}");
    expect(Object.keys(body).sort()).toEqual(["input", "instructions", "model"]);
  });

  it("honors the base URL override", async () => {
    const captured: { url?: string; init?: OpenAiResponsesFetchInit } = {};
    const client = createOpenAiResponsesClient({
      apiKey: "sk-key",
      baseUrl: "https://proxy.internal/v1/responses",
      fetchImpl: okFetch(captured, { output_text: "{}" }),
    });
    await client.responses.create(REQUEST);
    expect(captured.url).toBe("https://proxy.internal/v1/responses");
  });

  it("defaults to the global fetch when none is injected", async () => {
    const captured: { url?: string; init?: OpenAiResponsesFetchInit } = {};
    vi.stubGlobal("fetch", okFetch(captured, { output_text: "{}" }));
    const client = createOpenAiResponsesClient({ apiKey: "sk-key" });
    await client.responses.create(REQUEST);
    expect(captured.url).toBe(DEFAULT_URL);
  });
});

describe("createOpenAiResponsesClient - response narrowing", () => {
  it("returns only output_text and output text blocks, dropping other fields", async () => {
    const captured: { url?: string; init?: OpenAiResponsesFetchInit } = {};
    const client = createOpenAiResponsesClient({
      apiKey: "sk-key",
      fetchImpl: okFetch(captured, {
        id: "resp_secret",
        usage: { total_tokens: 999 },
        output_text: "hello",
        output: [
          {
            type: "message",
            extra: "DROP-ME",
            content: [
              { type: "output_text", text: "world", secret: "DROP" },
              { type: "reasoning", text: "keep-shape" },
            ],
          },
          "not-an-object",
        ],
      }),
    });

    const result = await client.responses.create(REQUEST);
    expect(result).toEqual({
      output_text: "hello",
      output: [
        {
          type: "message",
          content: [
            { type: "text", text: "world" },
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("DROP");
    expect(JSON.stringify(result)).not.toContain("keep-shape");
    expect(JSON.stringify(result)).not.toContain("resp_secret");
  });

  it("returns an empty result for a non-object body", async () => {
    const captured: { url?: string; init?: OpenAiResponsesFetchInit } = {};
    const client = createOpenAiResponsesClient({
      apiKey: "sk-key",
      fetchImpl: okFetch(captured, 42),
    });
    expect(await client.responses.create(REQUEST)).toEqual({});
  });
});

describe("createOpenAiResponsesClient - failures redact everything", () => {
  it("throws the fixed error and no leak when fetch rejects", async () => {
    const client = createOpenAiResponsesClient({
      apiKey: "sk-secret-key",
      fetchImpl: vi.fn(async () => {
        throw new Error("ECONNREFUSED sk-secret-key USER-PROMPT-SECRET");
      }),
    });
    const error = await client.responses
      .create(REQUEST)
      .then(() => null, (e: unknown) => e);
    expect((error as Error).message).toBe(REQUEST_FAILED_MESSAGE);
    const msg = (error as Error).message;
    expect(msg).not.toContain("sk-secret-key");
    expect(msg).not.toContain("USER-PROMPT-SECRET");
    expect(msg).not.toContain("ECONNREFUSED");
  });

  it("throws the fixed error on a non-OK HTTP status without the provider body", async () => {
    const client = createOpenAiResponsesClient({
      apiKey: "sk-key",
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: "PROVIDER-BODY-LEAK invalid api key" }),
      })),
    });
    const error = await client.responses
      .create(REQUEST)
      .then(() => null, (e: unknown) => e);
    expect((error as Error).message).toBe(REQUEST_FAILED_MESSAGE);
    expect((error as Error).message).not.toContain("PROVIDER-BODY-LEAK");
    expect((error as Error).message).not.toContain("401");
  });

  it("throws the fixed error when the body is unreadable JSON", async () => {
    const client = createOpenAiResponsesClient({
      apiKey: "sk-key",
      fetchImpl: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("SECRET-PARSE-DETAIL");
        },
      })),
    });
    const error = await client.responses
      .create(REQUEST)
      .then(() => null, (e: unknown) => e);
    expect((error as Error).message).toBe(REQUEST_FAILED_MESSAGE);
    expect((error as Error).message).not.toContain("SECRET-PARSE-DETAIL");
  });

  it("throws the fixed error when no fetch is available", async () => {
    vi.stubGlobal("fetch", undefined);
    const client = createOpenAiResponsesClient({ apiKey: "sk-key" });
    await expect(client.responses.create(REQUEST)).rejects.toThrow(
      REQUEST_FAILED_MESSAGE
    );
  });
});

describe("module purity (static source check)", () => {
  const SRC_PATH = join(
    process.cwd(),
    "src/lib/projects/project-rfp-openai-responses-client.ts"
  );
  const source = readFileSync(SRC_PATH, "utf8");

  it("imports nothing and never imports the openai package or another provider SDK", () => {
    const froms = Array.from(source.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
    expect(froms).toEqual([]);
    for (const forbidden of [
      'from "openai"',
      "'openai'",
      "@anthropic-ai",
      "@google/generative-ai",
      "langchain",
      "process.env",
      "node:fs",
      "node:path",
    ]) {
      expect(source, `forbidden: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("uses fetch and posts to the OpenAI Responses endpoint", () => {
    expect(source).toContain("https://api.openai.com/v1/responses");
    expect(source).toContain("globalThis.fetch");
  });

  it("keeps the source and this test file ASCII-only", () => {
    const testSource = readFileSync(
      join(process.cwd(), "tests/lib/projects/project-rfp-openai-responses-client.test.ts"),
      "utf8"
    );
    expect(/[^\x00-\x7F]/.test(source)).toBe(false);
    expect(/[^\x00-\x7F]/.test(testSource)).toBe(false);
  });
});
