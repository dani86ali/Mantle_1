/**
 * Configured RFP requirement-candidate drafting executor factory
 * (Milestone 2).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * The single wiring seam between the provider-neutral candidate-drafting
 * contract (src/lib/projects/project-rfp-requirements-candidate-drafting.ts)
 * and the approved live Anthropic drafting adapter
 * (src/lib/projects/project-rfp-requirements-candidate-drafting-anthropic.ts).
 * Configuration is read HERE and nowhere else, through exactly three
 * environment variables:
 *
 * - ANTHROPIC_API_KEY enables drafting when nonblank. When missing or blank
 *   this factory returns null, the generate route maps null to 503
 *   rfp_requirements_candidate_drafting_unavailable, and no evidence is
 *   loaded while drafting is unconfigured.
 * - BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MODEL optionally overrides
 *   the adapter's default model when nonblank.
 * - BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MAX_TOKENS optionally
 *   overrides the adapter's default max output tokens, applied only when it
 *   parses to a positive finite integer; anything else is ignored.
 *
 * The factory only constructs the executor - it never invokes it, reads no
 * evidence, DB, store, file, route, or raw document, and performs no network
 * call itself. Executor output stays untrusted either way: the drafting
 * contract validates and sanitizes whatever any executor resolves with, the
 * resulting baseline draft is persisted as needs_review only, and a human
 * approval is still required before any downstream stage may rely on it.
 */
import type {
  RfpCandidateDraftingExecutor,
} from "@/lib/projects/project-rfp-requirements-candidate-drafting";
import {
  createAnthropicRfpRequirementCandidateDraftingExecutor,
} from "@/lib/projects/project-rfp-requirements-candidate-drafting-anthropic";

/** The optional max-tokens override; positive finite integers only. */
function parseMaxTokensOverride(raw: string | undefined): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parsed = Number(raw.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * The configured candidate-drafting executor, or null while
 * ANTHROPIC_API_KEY is missing or blank. Callers must treat null as
 * "candidate drafting unavailable" and skip the generation orchestrator
 * entirely. The returned executor is never called here.
 */
export function getConfiguredRfpRequirementCandidateDraftingExecutor(): RfpCandidateDraftingExecutor | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") return null;

  const modelOverride =
    process.env.BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MODEL;
  const maxTokensOverride = parseMaxTokensOverride(
    process.env.BOMATIC_RFP_REQUIREMENTS_CANDIDATE_DRAFTING_MAX_TOKENS
  );

  return createAnthropicRfpRequirementCandidateDraftingExecutor({
    apiKey: apiKey.trim(),
    ...(typeof modelOverride === "string" && modelOverride.trim() !== ""
      ? { model: modelOverride.trim() }
      : {}),
    ...(maxTokensOverride !== undefined
      ? { maxTokens: maxTokensOverride }
      : {}),
  });
}
