/**
 * Provider-neutral RFP HLD design-model candidate-drafting executor BOUNDARY
 * (Stage 6D-003).
 *
 * This is the typed seam between the deterministic Stage 6D-002 candidate-input
 * bundle (src/lib/projects/project-rfp-hld-design-model-candidate-input.ts) and
 * a FUTURE injected drafting executor that will draft a candidate
 * `rfp_hld_design_model`. It is boundary-only: it drafts nothing itself, makes
 * no provider/network call, reads no DB/store/file/raw source document, touches
 * no route or UI, and persists nothing. It also constructs no provider adapter:
 * the configured factory is a safe null seam while no adapter exists.
 *
 * The boundary carries exactly ONE drafting input through to the executor - the
 * deterministic candidate-input bundle - and performs NO validation on whatever
 * the executor resolves with. Any executor output is CANDIDATE-ONLY and
 * UNTRUSTED: its payload is `unknown` here and is never inspected, validated, or
 * persisted at this boundary. It is subordinate to deterministic validation
 * (Stage 6D-004) plus human engineer approval before any downstream stage may
 * rely on it. This boundary claims no design or AI authority.
 *
 * It imports EXACTLY the candidate-input bundle type and the Anthropic drafting
 * adapter factory - it never imports the provider SDK directly, and the
 * configured factory below is the single environment-reading wiring seam.
 */
import type { RfpHldDesignModelCandidateInputBundle } from "@/lib/projects/project-rfp-hld-design-model-candidate-input";
import { createAnthropicRfpHldDesignModelDraftingExecutor } from "@/lib/projects/project-rfp-hld-design-model-drafting-anthropic";

/**
 * Everything the injected executor receives: exactly the deterministic
 * candidate-input bundle from Stage 6D-002, carried through unchanged. No other
 * drafting input is ever added at this boundary.
 */
export interface RfpHldDesignModelDraftingExecutorInput {
  candidateInput: RfpHldDesignModelCandidateInputBundle;
}

/**
 * The result an executor resolves with. The payload is intentionally `unknown`:
 * it is a CANDIDATE-ONLY, UNTRUSTED draft body that this boundary never
 * inspects, validates, or persists. Deterministic validation (Stage 6D-004) and
 * a human engineer must approve it before any reliance.
 */
export interface RfpHldDesignModelCandidateDraft {
  /** Untrusted candidate draft body; opaque and unvalidated at this boundary. */
  payload: unknown;
}

/**
 * The injected drafting dependency. This module never imports, constructs, or
 * names a real implementation; a future seam wires one in. Whatever it resolves
 * with stays candidate-only and untrusted - it is not validated here.
 */
export type RfpHldDesignModelDraftingExecutor = (
  input: RfpHldDesignModelDraftingExecutorInput
) => Promise<RfpHldDesignModelCandidateDraft>;

/** Input for {@link draftRfpHldDesignModelCandidate}. */
export interface DraftRfpHldDesignModelCandidateInput {
  /** The deterministic Stage 6D-002 candidate-input bundle to draft from. */
  candidateInput: RfpHldDesignModelCandidateInputBundle;
  /**
   * The injected executor, or null/absent when none is configured (e.g. the
   * configured factory returned null). A null/absent executor yields a safe
   * unavailable result and the bundle is never inspected.
   */
  executor?: RfpHldDesignModelDraftingExecutor | null;
}

/** Discriminated result of {@link draftRfpHldDesignModelCandidate}. */
export type RfpHldDesignModelDraftingResult =
  | { status: "unavailable" }
  | { status: "drafted"; draft: RfpHldDesignModelCandidateDraft };

/**
 * Invoke the injected executor with exactly the Stage 6D-002 candidate-input
 * bundle as its only drafting input. Returns a safe `unavailable` result when no
 * executor is supplied; otherwise returns `drafted` carrying the executor's
 * candidate draft VERBATIM. Performs no validation, no persistence, no
 * DB/store/file access, no raw source document reread, no route/UI work, and no
 * provider/network call. The returned draft payload remains untrusted and
 * subordinate to deterministic validation plus human engineer approval.
 */
export async function draftRfpHldDesignModelCandidate(
  input: DraftRfpHldDesignModelCandidateInput
): Promise<RfpHldDesignModelDraftingResult> {
  const executor = input.executor;
  if (executor === null || executor === undefined) {
    return { status: "unavailable" };
  }
  const draft = await executor({ candidateInput: input.candidateInput });
  return { status: "drafted", draft };
}

/** The optional max-tokens override; positive finite integers only. */
function parseMaxTokensOverride(raw: string | undefined): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parsed = Number(raw.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The configured drafting executor, or null while ANTHROPIC_API_KEY is missing
 * or blank. This is the single environment-reading wiring seam: it reads ONLY
 * ANTHROPIC_API_KEY, BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MODEL, and
 * BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MAX_TOKENS, and constructs the Anthropic
 * adapter executor through its factory. The model override is applied only when
 * nonblank and the max-tokens override only when it parses to a positive
 * integer; otherwise the adapter defaults stand. The factory never invokes the
 * executor, and this seam performs no DB/store/file/raw-document/route/UI or
 * network work. Callers must treat null as "HLD design-model candidate drafting
 * unavailable"; any returned executor stays candidate-only and untrusted.
 */
export function getConfiguredRfpHldDesignModelDraftingExecutor(): RfpHldDesignModelDraftingExecutor | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") return null;

  const modelOverride =
    process.env.BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MODEL;
  const maxTokensOverride = parseMaxTokensOverride(
    process.env.BOMATIC_RFP_HLD_DESIGN_MODEL_DRAFTING_MAX_TOKENS
  );

  return createAnthropicRfpHldDesignModelDraftingExecutor({
    apiKey: apiKey.trim(),
    ...(typeof modelOverride === "string" && modelOverride.trim() !== ""
      ? { model: modelOverride.trim() }
      : {}),
    ...(maxTokensOverride !== undefined
      ? { maxTokens: maxTokensOverride }
      : {}),
  });
}
