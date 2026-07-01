/**
 * OpenAI-adapter RFP HLD design-model ADVISORY quality-review boundary
 * (Stage 6H-0H-A).
 *
 * Adapts the provider-neutral HLD design-model review contract
 * (src/lib/projects/project-rfp-hld-design-model-openai-review-executor.ts) to an
 * OpenAI Responses-style API through an INJECTED minimal client only. This stage
 * wires NO real HTTP client, imports NO provider SDK, uses NO fetch, and reads NO
 * environment: a live client must be supplied by the caller. Each run sends one
 * responses.create call carrying only the review request serialized by the
 * Stage 6H-0H-A prompt helper plus its fixed system instruction.
 *
 * The request surface is small and explicit - model, instructions, input, and the
 * optional max_output_tokens / temperature - with no provider tool-calling, no
 * forced-function, no response-shape, and no schema fields. Only text output is
 * read (response.output_text, then text blocks in response.output, in order),
 * concatenated, and parsed as strict JSON; the parsed value is returned as the
 * UNKNOWN candidate provider output for the executor boundary to wrap and
 * validate. Provider, empty-output, and parse failures throw fixed generic errors
 * that never carry provider response text, API keys, request bodies, prompts,
 * model names, or stack detail.
 */
import type {
  RfpHldDesignModelOpenAiReviewExecutor,
  RfpHldDesignModelOpenAiReviewExecutorInput,
} from "@/lib/projects/project-rfp-hld-design-model-openai-review-executor";
import { buildRfpHldDesignModelOpenAiReviewRequest } from "@/lib/projects/project-rfp-hld-design-model-openai-review-prompt";

/** Fixed generic failure messages; never carry provider or request detail. */
const SETUP_MESSAGE =
  "A live review client must be injected; client wiring is not configured for this stage.";
const MODEL_MESSAGE = "A nonblank model is required to build the review executor.";
const REQUEST_FAILED_MESSAGE = "RFP HLD design-model quality-review request failed.";
const NO_TEXT_MESSAGE = "RFP HLD design-model quality-review returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP HLD design-model quality-review returned output that is not valid JSON.";

/** The exact request this adapter sends; no function-calling/schema fields exist. */
export interface OpenAiRfpHldDesignModelReviewRequest {
  model: string;
  instructions: string;
  input: string;
  max_output_tokens?: number;
  temperature?: number;
}

/** One nested output content block; only "text" entries are read. */
export interface OpenAiRfpHldDesignModelReviewOutputBlock {
  type?: string;
  text?: string;
}

/** One top-level output item carrying nested content blocks. */
export interface OpenAiRfpHldDesignModelReviewOutputItem {
  type?: string;
  content?: OpenAiRfpHldDesignModelReviewOutputBlock[];
}

/** The only response fields this adapter reads. */
export interface OpenAiRfpHldDesignModelReviewResponse {
  output_text?: string;
  output?: OpenAiRfpHldDesignModelReviewOutputItem[];
}

/** Minimal Responses-style client contract; tests inject a fake. */
export interface OpenAiRfpHldDesignModelReviewClient {
  responses: {
    create(
      request: OpenAiRfpHldDesignModelReviewRequest
    ): Promise<OpenAiRfpHldDesignModelReviewResponse>;
  };
}

/** Factory configuration; a nonblank model and an injected client are required. */
export interface OpenAiRfpHldDesignModelReviewConfig {
  model: string;
  /** Required in this stage: no real client is constructed here. */
  client?: OpenAiRfpHldDesignModelReviewClient;
  maxOutputTokens?: number;
  temperature?: number;
}

/**
 * Concatenate the response's text output in order, trimmed; "" when none. Reads
 * response.output_text first, then every text block inside response.output.
 */
function extractResponseText(response: OpenAiRfpHldDesignModelReviewResponse): string {
  const parts: string[] = [];
  if (typeof response.output_text === "string") {
    parts.push(response.output_text);
  }
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }
  return parts.join("").trim();
}

/**
 * Build an RfpHldDesignModelOpenAiReviewExecutor backed by an injected OpenAI
 * Responses-style client. Requires a nonblank model and an injected client; with
 * no client it throws a fixed setup error (no env/package is consulted). Each call
 * sends one responses.create request and resolves with the parsed JSON as the
 * UNKNOWN candidate provider output; failures throw the fixed generic errors. The
 * output stays untrusted and subordinate to the executor boundary's deterministic
 * validation plus human engineer approval.
 */
export function createOpenAiRfpHldDesignModelReviewExecutor(
  config: OpenAiRfpHldDesignModelReviewConfig
): RfpHldDesignModelOpenAiReviewExecutor {
  const model =
    typeof config.model === "string" && config.model.trim() !== ""
      ? config.model.trim()
      : "";
  if (model === "") throw new Error(MODEL_MESSAGE);

  const client = config.client;
  if (client === undefined || client === null) throw new Error(SETUP_MESSAGE);

  const maxOutputTokens =
    typeof config.maxOutputTokens === "number" &&
    Number.isInteger(config.maxOutputTokens) &&
    config.maxOutputTokens > 0
      ? config.maxOutputTokens
      : undefined;
  const temperature =
    typeof config.temperature === "number" && Number.isFinite(config.temperature)
      ? config.temperature
      : undefined;

  return async (input: RfpHldDesignModelOpenAiReviewExecutorInput) => {
    const prompt = buildRfpHldDesignModelOpenAiReviewRequest(input.reviewInput);
    const request: OpenAiRfpHldDesignModelReviewRequest = {
      model,
      instructions: prompt.system,
      input: prompt.user,
      ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    };
    let response: OpenAiRfpHldDesignModelReviewResponse;
    try {
      response = await client.responses.create(request);
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
    return parsed;
  };
}
