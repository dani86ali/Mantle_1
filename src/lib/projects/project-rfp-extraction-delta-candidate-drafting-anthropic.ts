/**
 * Anthropic-backed RFP extraction-delta candidate drafting executor.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * One of exactly four Project-chain modules allowed to import
 * @anthropic-ai/sdk (the others are the requirements, compliance-matrix, and
 * HLD design-model drafting adapters). Adapts the provider-neutral
 * extraction-delta drafting contract
 * (src/lib/projects/project-rfp-extraction-delta-candidate-drafting.ts)
 * to the Anthropic Messages API: one plain messages.create call per run
 * carrying only the whitelisted executor input plus a fixed system
 * instruction limiting the model to proposing extraction delta
 * candidates for engineer review from the provided non-BoQ evidence -
 * never BoQ processing, pricing, SKU, catalog, configuration,
 * validation, compliance-matrix, HLD/LLD, proposal, export, or approval
 * work, and never any function-calling request field. The output is an
 * unapproved draft the contract sanitizes for engineer review.
 *
 * Configuration arrives only through the factory argument; this module
 * never reads the environment, the DB, stores, routes, or files. Tests
 * inject a fake client through config.client so the network is never
 * reached; a real client is constructed only when none is injected.
 * Text blocks are concatenated and parsed as strict JSON, returned as
 * unknown for the contract's sanitizer; provider, empty-output, and
 * parse failures throw fixed generic errors that never carry provider
 * details, prompts, API keys, evidence bodies, or stack text.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  RfpExtractionDeltaCandidateDraftingExecutor,
  RfpExtractionDeltaCandidateDraftingExecutorInput,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting";

// Safe defaults; current Opus-tier models reject sampling parameters, so
// temperature is omitted from the request unless explicitly configured.
const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 16000;

/** Fixed generic failure messages; never carry provider or request detail. */
const REQUEST_FAILED_MESSAGE =
  "RFP extraction delta candidate drafting request failed.";
const NO_TEXT_MESSAGE =
  "RFP extraction delta candidate drafting returned no text output.";
const INVALID_JSON_MESSAGE =
  "RFP extraction delta candidate drafting returned output that is not valid JSON.";

// Fixed instruction: candidates for engineer review only - no authority.
const SYSTEM_PROMPT = [
  "You propose RFP extraction delta candidates for engineer review only",
  "inside BOMATIC. Work ONLY from the JSON evidence entries in the user",
  "message; never invent facts, evidence rows, or identifiers the evidence",
  "does not support. You are never final authority and make no business",
  "decisions. The evidence excludes BoQ on purpose: do not process or infer",
  "from BoQ content. You must NOT perform pricing, cost, or discount work,",
  "SKU selection or replacement, catalog lookup, product configuration,",
  "validation of any kind, compliance matrix work, HLD or LLD design,",
  "proposal writing, export or document generation, or approvals. Your",
  "output is an unapproved draft that is sanitized and engineer-reviewed",
  "before any downstream use. Respond with strict JSON only: no markdown,",
  "no code fences, no prose outside the JSON. Return exactly one object of",
  'the shape {"candidates":[...]}. Each candidate is an object with: kind',
  "(required, one of missing_evidence, incorrect_extraction,",
  "table_reconstruction, suspicious_item), sourceFileId (required, copied",
  "exactly from the provided sourceFileIds), title (required), description",
  "(required), and optionally severity (one of info, warning, blocking),",
  "confidence (a finite number between 0 and 1), rationale, evidenceIds (an",
  "array of evidenceId values copied exactly from the provided evidence",
  "entries), and proposedEvidence (an object whose evidenceKind is",
  "rfp_document_text_chunk or rfp_document_table).",
].join(" ");

/** The exact request this adapter sends; no function-calling fields exist. */
export interface AnthropicRfpExtractionDeltaDraftingMessageRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
}

/** The only response fields this adapter reads; only "text" entries count. */
export interface AnthropicRfpExtractionDeltaDraftingMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

/** Minimal client contract; tests inject a fake, production uses the SDK. */
export interface AnthropicRfpExtractionDeltaDraftingMessagesClient {
  messages: {
    create(
      request: AnthropicRfpExtractionDeltaDraftingMessageRequest
    ): Promise<AnthropicRfpExtractionDeltaDraftingMessageResponse>;
  };
}

/** Factory configuration; provided by the executor wiring seam or a test. */
export interface AnthropicRfpExtractionDeltaCandidateDraftingConfig {
  /** Used only when no client is injected; never logged or rethrown. */
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Test seam: when present, no real Anthropic client is constructed. */
  client?: AnthropicRfpExtractionDeltaDraftingMessagesClient;
}

/** Serialize exactly the whitelisted executor-input fields, nothing else. */
function toDraftingUserMessage(
  input: RfpExtractionDeltaCandidateDraftingExecutorInput
): string {
  return JSON.stringify({
    project: input.project,
    inputPackage: input.inputPackage,
    requestedBy: input.requestedBy,
    inputPackageArtifactId: input.inputPackageArtifactId,
    sourceFileIds: input.sourceFileIds,
    sourceArtifactIds: input.sourceArtifactIds,
    evidence: input.evidence,
  });
}

/** Concatenate the response's text entries in order, trimmed; "" when none. */
function extractResponseText(
  response: AnthropicRfpExtractionDeltaDraftingMessageResponse
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
): AnthropicRfpExtractionDeltaDraftingMessagesClient {
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
 * Build an RfpExtractionDeltaCandidateDraftingExecutor backed by the
 * Anthropic Messages API: the factory never invokes the executor; each
 * call sends one request, resolving parsed JSON as unknown.
 */
export function createAnthropicRfpExtractionDeltaCandidateDraftingExecutor(
  config: AnthropicRfpExtractionDeltaCandidateDraftingConfig
): RfpExtractionDeltaCandidateDraftingExecutor {
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
    input: RfpExtractionDeltaCandidateDraftingExecutorInput
  ): Promise<unknown> => {
    const request: AnthropicRfpExtractionDeltaDraftingMessageRequest = {
      model,
      max_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: toDraftingUserMessage(input) }],
    };
    let response: AnthropicRfpExtractionDeltaDraftingMessageResponse;
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
