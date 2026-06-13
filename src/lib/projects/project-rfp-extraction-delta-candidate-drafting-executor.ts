/**
 * Configured RFP extraction-delta candidate drafting executor factory
 * (Milestone 2).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * The single wiring seam between the provider-neutral extraction-delta
 * candidate-drafting contract
 * (src/lib/projects/project-rfp-extraction-delta-candidate-drafting.ts) and
 * the approved live Anthropic drafting adapter
 * (src/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic.ts).
 * Configuration is read HERE and nowhere else, through exactly three
 * environment variables:
 *
 * - ANTHROPIC_API_KEY enables drafting when nonblank. When missing or blank
 *   this factory returns null; callers must treat null as "extraction-delta
 *   candidate drafting unavailable", skip the drafting orchestrator entirely,
 *   and load no evidence while drafting is unconfigured.
 * - BOMATIC_RFP_EXTRACTION_DELTA_CANDIDATE_DRAFTING_MODEL optionally overrides
 *   the adapter's default model when nonblank.
 * - BOMATIC_RFP_EXTRACTION_DELTA_CANDIDATE_DRAFTING_MAX_TOKENS optionally
 *   overrides the adapter's default max output tokens, applied only when it
 *   parses to a positive finite integer; anything else is ignored.
 *
 * The factory only constructs the executor - it never invokes it, reads no
 * evidence, DB, store, file, route, or raw document, and performs no network
 * call itself. Executor output stays untrusted either way: the drafting
 * contract validates and sanitizes whatever any executor resolves with, the
 * resulting delta candidates are an unapproved draft only, and a human
 * approval is still required before any downstream stage may rely on it.
 */
import type {
  RfpExtractionDeltaCandidateDraftingExecutor,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting";
import {
  createAnthropicRfpExtractionDeltaCandidateDraftingExecutor,
} from "@/lib/projects/project-rfp-extraction-delta-candidate-drafting-anthropic";

/** The optional max-tokens override; positive finite integers only. */
function parseMaxTokensOverride(raw: string | undefined): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parsed = Number(raw.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The configured extraction-delta candidate-drafting executor, or null while
 * ANTHROPIC_API_KEY is missing or blank. Callers must treat null as
 * "candidate drafting unavailable" and skip the drafting orchestrator
 * entirely. The returned executor is never called here.
 */
export function getConfiguredRfpExtractionDeltaCandidateDraftingExecutor(): RfpExtractionDeltaCandidateDraftingExecutor | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") return null;

  const modelOverride =
    process.env.BOMATIC_RFP_EXTRACTION_DELTA_CANDIDATE_DRAFTING_MODEL;
  const maxTokensOverride = parseMaxTokensOverride(
    process.env.BOMATIC_RFP_EXTRACTION_DELTA_CANDIDATE_DRAFTING_MAX_TOKENS
  );

  return createAnthropicRfpExtractionDeltaCandidateDraftingExecutor({
    apiKey: apiKey.trim(),
    ...(typeof modelOverride === "string" && modelOverride.trim() !== ""
      ? { model: modelOverride.trim() }
      : {}),
    ...(maxTokensOverride !== undefined
      ? { maxTokens: maxTokensOverride }
      : {}),
  });
}
