/**
 * RFP BoQ configuration-expansion DRAFT service: the RFP lane wrapper over the
 * shared, mode-gated draft core. It turns one already-APPROVED `sku_resolution`
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
 * `expectedMode` to "rfp" and re-exports the lane's compatible
 * input/result/summary type names so callers (the RFP route) keep a stable surface.
 * A non-rfp project therefore returns the same lean `wrong_mode` summary and writes
 * nothing. It imports the shared core only and adds no stores, builder, rule pack,
 * config authority, pricing, export, AI, catalog, engine, coordinator, or adapter of
 * its own.
 */
import {
  createProjectBoqConfigurationExpansionDraftCore,
  type CreateProjectBoqConfigurationExpansionDraftCoreResult,
  type ProjectBoqConfigExpansionProjectSummary,
  type ProjectBoqConfigExpansionArtifactSummary,
  type ProjectBoqConfigExpansionPayloadSummary,
} from "@/lib/projects/project-boq-config-expansion-draft-core";

/**
 * Input for {@link createProjectRfpConfigurationExpansionDraft}: the RFP lane
 * supplies its own `expectedMode` ("rfp"), so callers pass only the coordinates.
 */
export interface CreateProjectRfpConfigurationExpansionDraftInput {
  tenantId: string;
  projectId: string;
  /** The exact approved `sku_resolution` artifact to seed the draft from. */
  skuResolutionArtifactId: string;
}

/** Lean serializable project projection returned on a wrong-mode request; no tenantId. */
export type RfpConfigExpansionProjectSummary =
  ProjectBoqConfigExpansionProjectSummary;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export type RfpConfigExpansionArtifactSummary =
  ProjectBoqConfigExpansionArtifactSummary;

/** Serializable payload summary: provenance ids, rule-pack metadata, counts; never the lines. */
export type RfpConfigExpansionPayloadSummary =
  ProjectBoqConfigExpansionPayloadSummary;

/** Discriminated result of {@link createProjectRfpConfigurationExpansionDraft}. */
export type CreateProjectRfpConfigurationExpansionDraftResult =
  CreateProjectBoqConfigurationExpansionDraftCoreResult;

/**
 * Create a configuration-expansion DRAFT for one already-recorded RFP
 * `sku_resolution` artifact by delegating to the shared draft core with the RFP
 * `expectedMode`. Behavior, gate order, artifact coordinates, payload content, and
 * lean summaries are exactly the core's; only non-rfp projects diverge, returning
 * the lean `wrong_mode` summary without any write.
 */
export async function createProjectRfpConfigurationExpansionDraft(
  input: CreateProjectRfpConfigurationExpansionDraftInput
): Promise<CreateProjectRfpConfigurationExpansionDraftResult> {
  return createProjectBoqConfigurationExpansionDraftCore({
    ...input,
    expectedMode: "rfp",
  });
}
