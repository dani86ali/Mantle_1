/**
 * Quick BoM configuration-expansion DRAFT service: the Quick BoM lane wrapper over
 * the shared, mode-gated draft core. It turns one already-APPROVED `sku_resolution`
 * artifact (and its `normalized_boq` source) into a versioned
 * `configuration_expansion` DRAFT artifact for the `configuration_expansion_review`
 * stage. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 11, 11A).
 *
 * All deterministic work - project/artifact reads, the sku_resolution and
 * normalized_boq gates, the pure builder call, the approved Honeywell rule pack and
 * configuration-authority trace, and the single `needs_review`
 * `configuration_expansion` draft write - lives in
 * project-boq-config-expansion-draft-core. This wrapper only pins the lane's
 * `expectedMode` to "quick_bom" and re-exports the lane's compatible
 * input/result/summary type names so callers (the Quick BoM route) keep a stable
 * surface. A non-quick_bom project therefore returns the same lean `wrong_mode`
 * summary and writes nothing. It imports the shared core only and adds no stores,
 * builder, rule pack, config authority, pricing, export, AI, catalog, engine,
 * coordinator, or adapter of its own.
 */
import {
  createProjectBoqConfigurationExpansionDraftCore,
  type CreateProjectBoqConfigurationExpansionDraftCoreInput,
  type CreateProjectBoqConfigurationExpansionDraftCoreResult,
  type ProjectBoqConfigExpansionProjectSummary,
  type ProjectBoqConfigExpansionArtifactSummary,
  type ProjectBoqConfigExpansionPayloadSummary,
} from "@/lib/projects/project-boq-config-expansion-draft-core";

/**
 * Input for {@link createProjectQuickBomConfigurationExpansionDraft}: the core
 * input minus the lane mode, which this wrapper supplies as "quick_bom".
 */
export type CreateProjectQuickBomConfigurationExpansionDraftInput = Omit<
  CreateProjectBoqConfigurationExpansionDraftCoreInput,
  "expectedMode"
>;

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export type QuickBomConfigExpansionProjectSummary =
  ProjectBoqConfigExpansionProjectSummary;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export type QuickBomConfigExpansionArtifactSummary =
  ProjectBoqConfigExpansionArtifactSummary;

/** Serializable payload summary: provenance ids, rule-pack metadata, counts; never the lines. */
export type QuickBomConfigExpansionPayloadSummary =
  ProjectBoqConfigExpansionPayloadSummary;

/** Discriminated result of {@link createProjectQuickBomConfigurationExpansionDraft}. */
export type CreateProjectQuickBomConfigurationExpansionDraftResult =
  CreateProjectBoqConfigurationExpansionDraftCoreResult;

/**
 * Create a configuration-expansion DRAFT for one already-recorded Quick BoM
 * `sku_resolution` artifact by delegating to the shared draft core with the Quick
 * BoM `expectedMode`. Behavior, gate order, artifact coordinates, payload content,
 * and lean summaries are exactly the core's; only non-quick_bom projects diverge,
 * returning the lean `wrong_mode` summary without any write.
 */
export async function createProjectQuickBomConfigurationExpansionDraft(
  input: CreateProjectQuickBomConfigurationExpansionDraftInput
): Promise<CreateProjectQuickBomConfigurationExpansionDraftResult> {
  return createProjectBoqConfigurationExpansionDraftCore({
    ...input,
    expectedMode: "quick_bom",
  });
}
