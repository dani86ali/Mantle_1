/**
 * Configured RFP requirement-candidate drafting executor factory
 * (Milestone 2).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * The single wiring seam between the provider-neutral candidate-drafting
 * contract (src/lib/projects/project-rfp-requirements-candidate-drafting.ts)
 * and a future live drafting executor. Live provider wiring is NOT approved
 * yet, so this factory deliberately returns null: the generate route maps
 * null to 503 rfp_requirements_candidate_drafting_unavailable and never
 * calls the generation orchestrator, so no evidence is loaded while
 * drafting is unconfigured. When live wiring is approved, the approved
 * executor implementation will be constructed and returned here - nowhere
 * else - and its output stays untrusted: the drafting contract validates
 * and sanitizes whatever any executor resolves with.
 *
 * This module performs no environment read, no network call, and no model
 * invocation, and it never touches a store, file, or route. Its only import
 * is the executor TYPE, erased at compile time, keeping every AI, LLM,
 * provider, SDK, agent, coordinator, DB, store, pricing, SKU, catalog,
 * configuration, and export module out of its graph.
 */
import type {
  RfpCandidateDraftingExecutor,
} from "@/lib/projects/project-rfp-requirements-candidate-drafting";

/**
 * The configured candidate-drafting executor, or null while live provider
 * wiring remains unapproved. Callers must treat null as "candidate drafting
 * unavailable" and skip the generation orchestrator entirely.
 */
export function getConfiguredRfpRequirementCandidateDraftingExecutor(): RfpCandidateDraftingExecutor | null {
  return null;
}
