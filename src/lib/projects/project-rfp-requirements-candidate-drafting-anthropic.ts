/**
 * Anthropic-backed RFP requirement-candidate drafting executor (Milestone 2).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * The ONLY Project-chain module allowed to import @anthropic-ai/sdk. It
 * adapts the provider-neutral drafting contract
 * (src/lib/projects/project-rfp-requirements-candidate-drafting.ts) to the
 * Anthropic Messages API: one plain messages.create call per drafting run,
 * carrying only the whitelisted executor input plus a fixed system
 * instruction that restricts the model to drafting candidate requirement
 * JSON from the provided evidence and forbids pricing, SKU, catalog,
 * configuration, compliance-matrix, HLD, proposal, export, and validation
 * work. The request never carries function-calling fields of any kind, and
 * the output is a draft only: the drafting contract sanitizes it and a human
 * approves the needs_review baseline before any downstream use.
 *
 * Configuration arrives exclusively through the factory argument (the
 * executor wiring seam reads the environment; this module never reads the
 * environment, the DB, stores, routes, or files). Tests inject a fake client
 * through config.client so the network is never reached; a real Anthropic
 * client is constructed only when no client is injected. Response text
 * blocks are concatenated in order and parsed as strict JSON; the parsed
 * value is returned as unknown for the contract's sanitizer. Provider,
 * empty-output, and parse failures throw fixed generic errors that never
 * carry provider details, prompts, API keys, evidence bodies, or stack text.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  RfpCandidateDraftingExecutor,
  RfpCandidateDraftingExecutorInput,
} from "@/lib/projects/project-rfp-requirements-candidate-drafting";

// Safe defaults; current Opus-tier models reject sampling parameters, so
// temperature is omitted from the request unless explicitly configured.
const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 16000;

/** Fixed generic failure messages; never carry provider or request detail. */
const REQUEST_FAILED_MESSAGE =
  "RFP requirement candidate drafting request failed.";
const NO_TEXT_MESSAGE =
  "RFP requirement candidate drafting returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP requirement candidate drafting returned output that is not valid JSON.";

// The fixed drafting instruction: evidence-grounded candidate requirement
// JSON only - no authority, no business decisions, strict JSON shape.
const SYSTEM_PROMPT = [
  "You draft candidate RFP requirement statements for later human review",
  "inside BOMATIC. Work ONLY from the JSON evidence entries in the user",
  "message; never invent facts, requirements, or identifiers the evidence",
  "does not support. You have no authority and make no business decisions:",
  "you must NOT perform pricing, cost, or discount work, SKU selection or",
  "replacement, catalog lookups, product configuration, compliance matrix",
  "work, HLD or LLD design, proposal writing, export or document",
  "generation, or validation of any kind. Your output is an unapproved",
  "draft that is sanitized and human-reviewed before any downstream use.",
  "Respond with strict JSON only: no markdown, no code fences, no prose",
  "outside the JSON. Return exactly one object of the shape",
  '{"candidates":[...]}. Each candidate is an object with: text (required',
  "requirement statement grounded in the evidence), evidenceIds (required",
  "nonempty array of evidenceId values copied exactly from the provided",
  "evidence entries), and optionally category (one of technical,",
  "commercial, compliance, delivery, security, support, legal, other),",
  "priority (one of mandatory, preferred, optional, informational,",
  "unknown), title, and notes.",
].join(" ");

/** The exact request this adapter sends; no function-calling fields exist. */
export interface AnthropicRfpDraftingMessageRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
}

/** One response content entry; only type "text" entries are consumed. */
export interface AnthropicRfpDraftingContentBlock {
  type: string;
  text?: string;
}

/** The only response fields this adapter reads. */
export interface AnthropicRfpDraftingMessageResponse {
  content: AnthropicRfpDraftingContentBlock[];
}

/** Minimal client contract; tests inject a fake, production uses the SDK. */
export interface AnthropicRfpDraftingMessagesClient {
  messages: {
    create(
      request: AnthropicRfpDraftingMessageRequest
    ): Promise<AnthropicRfpDraftingMessageResponse>;
  };
}

/** Factory configuration; provided by the executor wiring seam or a test. */
export interface AnthropicRfpRequirementCandidateDraftingConfig {
  /** Used only when no client is injected; never logged or rethrown. */
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Test seam: when present, no real Anthropic client is constructed. */
  client?: AnthropicRfpDraftingMessagesClient;
}

/** Serialize exactly the whitelisted executor-input fields, nothing else. */
function toDraftingUserMessage(input: RfpCandidateDraftingExecutorInput): string {
  return JSON.stringify({
    project: input.project,
    evidence: input.evidence,
    requestedBy: input.requestedBy,
    sourceFileIds: input.sourceFileIds,
    sourceArtifactIds: input.sourceArtifactIds,
  });
}

/** Concatenate the response's text entries in order, trimmed; "" when none. */
function extractResponseText(
  response: AnthropicRfpDraftingMessageResponse
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
function createRealClient(apiKey: string): AnthropicRfpDraftingMessagesClient {
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
 * Build an RfpCandidateDraftingExecutor backed by the Anthropic Messages
 * API. The factory only builds the executor (never invokes it); each call
 * sends one request and resolves with parsed JSON as unknown for the
 * drafting contract's sanitizer; failures throw the fixed generic errors.
 */
export function createAnthropicRfpRequirementCandidateDraftingExecutor(
  config: AnthropicRfpRequirementCandidateDraftingConfig
): RfpCandidateDraftingExecutor {
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

  return async (
    input: RfpCandidateDraftingExecutorInput
  ): Promise<unknown> => {
    const request: AnthropicRfpDraftingMessageRequest = {
      model,
      max_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: toDraftingUserMessage(input) }],
    };
    let response: AnthropicRfpDraftingMessageResponse;
    try {
      response = await client.messages.create(request);
    } catch {
      throw new Error(REQUEST_FAILED_MESSAGE);
    }
    const text = extractResponseText(response);
    if (text === "") throw new Error(NO_TEXT_MESSAGE);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(INVALID_JSON_MESSAGE);
    }
  };
}
