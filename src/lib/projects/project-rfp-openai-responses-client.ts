/**
 * Minimal fetch-based OpenAI Responses API client (RFP runtime wiring).
 *
 * The single live-provider seam behind the existing HLD OpenAI adapter
 * boundaries. It imports NO provider SDK (never the `openai` package) and speaks
 * to the OpenAI Responses API with a plain `fetch` POST. Constructing a live
 * client REQUIRES a nonblank API key; tests inject a fake fetch and optional base
 * URL so no network is ever reached.
 *
 * The request surface is exactly the narrow adapter fields - model, instructions,
 * input, and the optional max_output_tokens / temperature - and nothing else is
 * serialized. Only the narrow response fields the adapters consume are returned
 * (output_text plus text blocks under output); every other field is dropped.
 *
 * All failures - a missing fetch, a fetch rejection, a non-OK HTTP status, or an
 * unreadable body - throw one fixed generic error. That error never carries the
 * API key, the request body, the prompt text, the raw response text, a provider
 * error body, or stack detail.
 */

/** The exact request fields sent to the Responses API; nothing else is serialized. */
export interface OpenAiResponsesRequest {
  model: string;
  instructions: string;
  input: string;
  max_output_tokens?: number;
  temperature?: number;
}

/** One nested output content block; only type/text are surfaced. */
export interface OpenAiResponsesOutputBlock {
  type?: string;
  text?: string;
}

/** One top-level output item carrying nested content blocks. */
export interface OpenAiResponsesOutputItem {
  type?: string;
  content?: OpenAiResponsesOutputBlock[];
}

/** The only response fields returned to the adapters. */
export interface OpenAiResponsesResult {
  output_text?: string;
  output?: OpenAiResponsesOutputItem[];
}

/** The Responses-style client contract the adapters consume. */
export interface OpenAiResponsesClient {
  responses: {
    create(request: OpenAiResponsesRequest): Promise<OpenAiResponsesResult>;
  };
}

/** The init passed to the injected/global fetch; body is a JSON string. */
export interface OpenAiResponsesFetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** The narrow fetch response shape this client reads. */
export interface OpenAiResponsesFetchResult {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** The minimal fetch contract; tests inject a fake matching this shape. */
export type OpenAiResponsesFetch = (
  url: string,
  init: OpenAiResponsesFetchInit
) => Promise<OpenAiResponsesFetchResult>;

/** Client configuration; only the API key is required. */
export interface OpenAiResponsesClientConfig {
  /** Required: a nonblank API key. Never included in thrown messages. */
  apiKey: string;
  /** Optional injected fetch (tests); defaults to the global fetch. */
  fetchImpl?: OpenAiResponsesFetch;
  /** Optional endpoint override (tests); defaults to the OpenAI Responses URL. */
  baseUrl?: string;
}

/** Fixed generic messages; never carry key, body, prompt, or provider detail. */
const API_KEY_MESSAGE =
  "A nonblank OpenAI API key is required to construct a live OpenAI Responses client.";
const REQUEST_FAILED_MESSAGE = "OpenAI Responses request failed.";

const DEFAULT_BASE_URL = "https://api.openai.com/v1/responses";

/** Serialize ONLY the allowed request fields; drop everything else. */
function buildRequestBody(request: OpenAiResponsesRequest): string {
  const payload: Record<string, unknown> = {
    model: request.model,
    instructions: request.instructions,
    input: request.input,
  };
  if (request.max_output_tokens !== undefined) {
    payload.max_output_tokens = request.max_output_tokens;
  }
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  return JSON.stringify(payload);
}

/** Copy ONLY output_text and output text blocks; drop every other field. */
function narrowResult(raw: unknown): OpenAiResponsesResult {
  const result: OpenAiResponsesResult = {};
  if (typeof raw !== "object" || raw === null) return result;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.output_text === "string") result.output_text = obj.output_text;
  if (Array.isArray(obj.output)) {
    const items: OpenAiResponsesOutputItem[] = [];
    for (const rawItem of obj.output) {
      if (typeof rawItem !== "object" || rawItem === null) continue;
      const itemObj = rawItem as Record<string, unknown>;
      const item: OpenAiResponsesOutputItem = {};
      if (typeof itemObj.type === "string") item.type = itemObj.type;
      if (Array.isArray(itemObj.content)) {
        const blocks: OpenAiResponsesOutputBlock[] = [];
        for (const rawBlock of itemObj.content) {
          if (typeof rawBlock !== "object" || rawBlock === null) continue;
          const b = rawBlock as Record<string, unknown>;
          if (b.type !== "text" && b.type !== "output_text") continue;
          const block: OpenAiResponsesOutputBlock = {};
          block.type = "text";
          if (typeof b.text === "string") block.text = b.text;
          blocks.push(block);
        }
        item.content = blocks;
      }
      items.push(item);
    }
    result.output = items;
  }
  return result;
}

/**
 * Construct a live fetch-based OpenAI Responses client. Requires a nonblank API
 * key; constructing does NOT make a network call. Each create() POSTs the narrow
 * request to the Responses endpoint and returns only the narrow response fields.
 * Any failure throws the single fixed generic error with no leaked detail.
 */
export function createOpenAiResponsesClient(
  config: OpenAiResponsesClientConfig
): OpenAiResponsesClient {
  const apiKey =
    typeof config.apiKey === "string" ? config.apiKey.trim() : "";
  if (apiKey === "") throw new Error(API_KEY_MESSAGE);

  const baseUrl =
    typeof config.baseUrl === "string" && config.baseUrl.trim() !== ""
      ? config.baseUrl.trim()
      : DEFAULT_BASE_URL;
  const fetchImpl =
    config.fetchImpl ??
    (globalThis.fetch as unknown as OpenAiResponsesFetch | undefined);

  return {
    responses: {
      async create(
        request: OpenAiResponsesRequest
      ): Promise<OpenAiResponsesResult> {
        if (typeof fetchImpl !== "function") {
          throw new Error(REQUEST_FAILED_MESSAGE);
        }
        const body = buildRequestBody(request);
        let response: OpenAiResponsesFetchResult;
        try {
          response = await fetchImpl(baseUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body,
          });
        } catch {
          throw new Error(REQUEST_FAILED_MESSAGE);
        }
        if (!response.ok) throw new Error(REQUEST_FAILED_MESSAGE);
        let json: unknown;
        try {
          json = await response.json();
        } catch {
          throw new Error(REQUEST_FAILED_MESSAGE);
        }
        return narrowResult(json);
      },
    },
  };
}
