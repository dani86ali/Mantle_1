/**
 * Anthropic-backed RFP HLD design-model CANDIDATE drafting executor
 * (Stage 6E-A-003).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * One of exactly four Project-chain modules allowed to import
 * @anthropic-ai/sdk (the others are the requirements, extraction-delta, and
 * compliance-matrix drafting adapters). It adapts the provider-neutral HLD
 * design-model drafting contract
 * (src/lib/projects/project-rfp-hld-design-model-drafting-executor.ts) to the
 * Anthropic Messages API: one plain messages.create call per drafting run,
 * carrying only the deterministic candidate-input serialized by the Stage
 * 6E-A-002 prompt helper plus its fixed system instruction. The instruction
 * restricts the model to drafting a candidate rfp_hld_design_model from the
 * approved hld_source_bundle-derived candidate input and forbids final HLD
 * docs/diagrams/HTML/draw.io/XML/Mermaid/SVG/TP/proposal output, topology-fact
 * or scope authority, pricing/SKU/catalog/configuration decisions, validation,
 * approval, and certification claims.
 *
 * Configuration arrives exclusively through the factory argument: this module
 * never reads the environment (only the executor wiring seam does), the DB,
 * stores, routes, raw documents, or files. Tests inject a fake client through
 * config.client so the network is never reached; a real Anthropic client is
 * constructed only when no client is injected. Response text blocks are
 * concatenated in order and parsed as strict JSON; the parsed value is returned
 * as the candidate draft payload, untrusted and subordinate to deterministic
 * validation plus human engineer approval. Provider, empty-output, and parse
 * failures throw fixed generic errors that never carry provider details,
 * prompts, API keys, candidate-input bodies, or response text.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  RfpHldDesignModelDraftingExecutor,
  RfpHldDesignModelDraftingExecutorInput,
} from "@/lib/projects/project-rfp-hld-design-model-drafting-executor";
import { buildRfpHldDesignModelDraftingRequest } from "@/lib/projects/project-rfp-hld-design-model-drafting-prompt";

// Safe defaults; current Opus-tier models reject sampling parameters, so
// temperature is omitted from the request unless explicitly configured.
const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 16000;

/** Fixed generic failure messages; never carry provider or request detail. */
const REQUEST_FAILED_MESSAGE =
  "RFP HLD design-model drafting request failed.";
const NO_TEXT_MESSAGE =
  "RFP HLD design-model drafting returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP HLD design-model drafting returned output that is not valid JSON.";

/** The exact request this adapter sends; no function-calling fields exist. */
export interface AnthropicRfpHldDesignModelDraftingMessageRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
}

/** The only response fields this adapter reads; only "text" entries count. */
export interface AnthropicRfpHldDesignModelDraftingMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

/** Minimal client contract; tests inject a fake, production uses the SDK. */
export interface AnthropicRfpHldDesignModelDraftingMessagesClient {
  messages: {
    create(
      request: AnthropicRfpHldDesignModelDraftingMessageRequest
    ): Promise<AnthropicRfpHldDesignModelDraftingMessageResponse>;
  };
}

/** Factory configuration; provided by the executor wiring seam or a test. */
export interface AnthropicRfpHldDesignModelDraftingConfig {
  /** Used only when no client is injected; never logged or rethrown. */
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Test seam: when present, no real Anthropic client is constructed. */
  client?: AnthropicRfpHldDesignModelDraftingMessagesClient;
}

/** Concatenate the response's text entries in order, trimmed; "" when none. */
function extractResponseText(
  response: AnthropicRfpHldDesignModelDraftingMessageResponse
): string {
  const content = Array.isArray(response.content) ? response.content : [];
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("").trim();
}

/** Wrap the real SDK behind the minimal drafting-client contract. */
function createRealClient(
  apiKey: string
): AnthropicRfpHldDesignModelDraftingMessagesClient {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error(
      "A nonblank apiKey is required when no drafting client is injected."
    );
  }
  const sdkClient = new Anthropic({ apiKey: apiKey.trim() });
  return {
    messages: {
      create: (request) => sdkClient.messages.create(request),
    },
  };
}

/**
 * Build an RfpHldDesignModelDraftingExecutor backed by the Anthropic Messages
 * API. The factory only builds the executor (never invokes it); each call
 * sends one request and resolves with { payload: parsedJson } as the candidate
 * draft; failures throw the fixed generic errors. The payload stays untrusted
 * and subordinate to deterministic validation plus human engineer approval.
 */
export function createAnthropicRfpHldDesignModelDraftingExecutor(
  config: AnthropicRfpHldDesignModelDraftingConfig
): RfpHldDesignModelDraftingExecutor {
  const model =
    typeof config.model === "string" && config.model.trim() !== ""
      ? config.model.trim()
      : DEFAULT_MODEL;
  const maxTokens =
    typeof config.maxTokens === "number" &&
    Number.isInteger(config.maxTokens) &&
    config.maxTokens > 0
      ? config.maxTokens
      : DEFAULT_MAX_TOKENS;
  const temperature =
    typeof config.temperature === "number" &&
    Number.isFinite(config.temperature)
      ? config.temperature
      : undefined;
  const client = config.client ?? createRealClient(config.apiKey);

  return async (input: RfpHldDesignModelDraftingExecutorInput) => {
    const prompt = buildRfpHldDesignModelDraftingRequest(input.candidateInput);
    const request: AnthropicRfpHldDesignModelDraftingMessageRequest = {
      model,
      max_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    };
    let response: AnthropicRfpHldDesignModelDraftingMessageResponse;
    try {
      response = await client.messages.create(request);
    } catch {
      throw new Error(REQUEST_FAILED_MESSAGE);
    }
    const text = extractResponseText(response);
    if (text === "") throw new Error(NO_TEXT_MESSAGE);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error(INVALID_JSON_MESSAGE);
    }
    return { payload: parsed };
  };
}
