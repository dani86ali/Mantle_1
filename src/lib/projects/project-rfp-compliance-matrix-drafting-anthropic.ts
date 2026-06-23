/**
 * Anthropic-backed RFP compliance-matrix drafting executor (Stage 5).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * One of exactly three Project-chain modules allowed to import
 * @anthropic-ai/sdk (the others are the requirements and extraction-delta
 * drafting adapters). It adapts the provider-neutral compliance-matrix
 * drafting contract
 * (src/lib/projects/project-rfp-compliance-matrix-drafting.ts) to the
 * Anthropic Messages API: one plain messages.create call per drafting run,
 * carrying only the whitelisted executor input plus a fixed system
 * instruction that restricts the model to drafting candidate
 * compliance-matrix rows from the approved requirements_baseline, evidence
 * package, and the approved configuration gate artifact and lines supplied
 * in the user JSON.
 * The instruction forbids approval, any final compliance decision, pricing,
 * SKU, catalog, configuration, legal/commercial/local-content/safety/
 * insurance determinations, HLD/LLD/TP/proposal authority, export, and
 * validation. The request never carries function-calling fields of any kind,
 * and the output is a draft only: the drafting contract sanitizes it (the
 * neutral sanitizer, not the model, owns the needs_review status) and a human
 * approves before any downstream use.
 *
 * Configuration arrives exclusively through the factory argument (the
 * executor wiring seam reads the environment; this module never reads the
 * environment, the DB, stores, routes, or files). Tests inject a fake client
 * through config.client so the network is never reached; a real Anthropic
 * client is constructed only when no client is injected. Response text blocks
 * are concatenated in order and parsed as strict JSON; the parsed value is
 * returned as unknown for the contract's sanitizer. Provider, empty-output,
 * and parse failures throw fixed generic errors that never carry provider
 * details, prompts, API keys, evidence bodies, or stack text.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  RfpComplianceMatrixDraftingExecutor,
  RfpComplianceMatrixDraftingExecutorInput,
} from "@/lib/projects/project-rfp-compliance-matrix-drafting";

// Safe defaults; current Opus-tier models reject sampling parameters, so
// temperature is omitted from the request unless explicitly configured.
const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 16000;

/** Fixed generic failure messages; never carry provider or request detail. */
const REQUEST_FAILED_MESSAGE =
  "RFP compliance matrix drafting request failed.";
const NO_TEXT_MESSAGE =
  "RFP compliance matrix drafting returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP compliance matrix drafting returned output that is not valid JSON.";

// The fixed drafting instruction: candidate compliance-matrix rows grounded
// only in the supplied approved artifacts - one row per approved baseline
// requirement, no authority, no business decisions, strict JSON shape. The
// neutral sanitizer, not the model, assigns the needs_review status.
const SYSTEM_PROMPT = [
  "You draft candidate RFP compliance-matrix rows for later human review",
  "inside BOMATIC. Work ONLY from the approved requirements_baseline, the",
  "approved evidence_package, and the approved configuration gate artifact",
  "and configuration lines supplied as JSON in the user message; never",
  "invent facts, requirements, evidence, configuration lines, or identifiers",
  "that input does not support. Draft exactly one row per approved baseline",
  "requirement, and copy every requirementId, evidenceId, and",
  "configurationLineId exactly from the supplied requirements, evidence",
  "entries, and configuration lines. You have no authority and make no",
  "business decisions: you must NOT approve anything, make a final",
  "compliance decision, choose a comply or not-comply status, make a legal,",
  "commercial, local-content, safety, or insurance determination, perform",
  "pricing, cost, or discount work, SKU selection or replacement, catalog",
  "lookup, or product configuration decisions, act as the HLD, LLD, TP, or",
  "proposal authority, perform export or document generation, or perform",
  "validation of any kind. Draft every legal, commercial, local-content,",
  "safety, and insurance row as requiring review by the right human owner,",
  "never as satisfied by technical design. Your output is an unapproved",
  "draft that is sanitized and human-reviewed and human-approved before any",
  "downstream use. Respond with strict JSON only: no markdown, no code",
  "fences, no prose outside the JSON. Return exactly one object of the shape",
  '{"rows":[...]}. Each row is an object with: requirementId (required,',
  "copied exactly from a supplied baseline requirement) and response",
  "(required, the drafted compliance narrative for that requirement), and",
  "optionally rationale, notes, evidenceIds (an array of evidenceId values",
  "copied exactly from the supplied evidence entries), and",
  "configurationLineIds (an array of lineId values copied exactly from the",
  "supplied configuration lines). Do NOT include a complianceStatus, status,",
  "approval, or any other authority field on a row; the reviewing system owns",
  "the needs_review status.",
].join(" ");

/** The exact request this adapter sends; no function-calling fields exist. */
export interface AnthropicRfpComplianceMatrixDraftingMessageRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
}

/** The only response fields this adapter reads; only "text" entries count. */
export interface AnthropicRfpComplianceMatrixDraftingMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

/** Minimal client contract; tests inject a fake, production uses the SDK. */
export interface AnthropicRfpComplianceMatrixDraftingMessagesClient {
  messages: {
    create(
      request: AnthropicRfpComplianceMatrixDraftingMessageRequest
    ): Promise<AnthropicRfpComplianceMatrixDraftingMessageResponse>;
  };
}

/** Factory configuration; provided by the executor wiring seam or a test. */
export interface AnthropicRfpComplianceMatrixDraftingConfig {
  /** Used only when no client is injected; never logged or rethrown. */
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Test seam: when present, no real Anthropic client is constructed. */
  client?: AnthropicRfpComplianceMatrixDraftingMessagesClient;
}

/** Serialize exactly the whitelisted executor-input fields, nothing else. */
function toDraftingUserMessage(
  input: RfpComplianceMatrixDraftingExecutorInput
): string {
  return JSON.stringify({
    project: input.project,
    requirementsBaseline: input.requirementsBaseline,
    evidencePackage: input.evidencePackage,
    ...(input.configurationExpansion !== undefined
      ? { configurationExpansion: input.configurationExpansion }
      : {}),
    requirements: input.requirements,
    evidence: input.evidence,
    ...(input.configurationLines !== undefined
      ? { configurationLines: input.configurationLines }
      : {}),
    requestedBy: input.requestedBy,
    sourceFileIds: input.sourceFileIds,
    sourceArtifactIds: input.sourceArtifactIds,
  });
}

/** Concatenate the response's text entries in order, trimmed; "" when none. */
function extractResponseText(
  response: AnthropicRfpComplianceMatrixDraftingMessageResponse
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
): AnthropicRfpComplianceMatrixDraftingMessagesClient {
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
 * Build an RfpComplianceMatrixDraftingExecutor backed by the Anthropic
 * Messages API. The factory only builds the executor (never invokes it); each
 * call sends one request and resolves with parsed JSON as unknown for the
 * drafting contract's sanitizer; failures throw the fixed generic errors.
 */
export function createAnthropicRfpComplianceMatrixDraftingExecutor(
  config: AnthropicRfpComplianceMatrixDraftingConfig
): RfpComplianceMatrixDraftingExecutor {
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
    input: RfpComplianceMatrixDraftingExecutorInput
  ): Promise<unknown> => {
    const request: AnthropicRfpComplianceMatrixDraftingMessageRequest = {
      model,
      max_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: toDraftingUserMessage(input) }],
    };
    let response: AnthropicRfpComplianceMatrixDraftingMessageResponse;
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
