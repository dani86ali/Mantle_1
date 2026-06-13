/**
 * Read-only Quick BoM configuration-expansion review WORKSPACE loader: the Quick BoM
 * lane wrapper over the shared, mode-gated review-workspace core. It loads ONE
 * `configuration_expansion` artifact and projects a lean, serializable line-review view
 * for the workspace UI. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 11, 11A).
 *
 * All deterministic work - project/artifact verification, the exact artifact gates,
 * draft/reviewed payload parsing, the allowlist line projection, the deterministic
 * counts, and the lean serializable summaries - lives in
 * project-boq-config-expansion-review-workspace-core. This wrapper only pins the lane's
 * `expectedMode` to "quick_bom" and re-exports the lane's compatible projection type
 * names so callers (the Quick BoM route and review panel) keep a stable surface. A
 * non-quick_bom project therefore returns the same lean `wrong_mode` status and reads
 * nothing further. It imports the shared workspace core only and adds no stores,
 * config-expansion types, pricing, export, approval/evidence stores, runner, AI/LLM,
 * catalog, engine, coordinator, adapter, or package dependency of its own.
 */
import {
  loadProjectBoqConfigurationExpansionReviewWorkspaceCore,
  type LoadProjectBoqConfigExpansionReviewWorkspaceResult,
  type ProjectBoqConfigExpansionReviewWorkspaceProject,
  type ProjectBoqConfigExpansionReviewWorkspaceArtifact,
  type ProjectBoqConfigExpansionReviewDraftSummary,
  type ProjectBoqConfigExpansionReviewWorkspacePayload,
  type ProjectBoqConfigExpansionReviewWorkspaceCounts,
  type ProjectBoqConfigExpansionReviewReviewedCounts,
  type ProjectBoqConfigExpansionReviewLine,
  type ProjectBoqConfigExpansionReviewWorkspace,
} from "@/lib/projects/project-boq-config-expansion-review-workspace-core";

/** Lean project summary for the review header; tenant-scoped projection. */
export type QuickBomConfigExpansionReviewWorkspaceProject =
  ProjectBoqConfigExpansionReviewWorkspaceProject;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export type QuickBomConfigExpansionReviewWorkspaceArtifact =
  ProjectBoqConfigExpansionReviewWorkspaceArtifact;

/** Allowlisted draft roll-up counts; only these numeric fields survive. */
export type QuickBomConfigExpansionReviewDraftSummary =
  ProjectBoqConfigExpansionReviewDraftSummary;

/** Lean payload summary: provenance + rule-pack metadata + counts; never the lines. */
export type QuickBomConfigExpansionReviewWorkspacePayload =
  ProjectBoqConfigExpansionReviewWorkspacePayload;

/** Deterministic review-state counts, counted from the projected line origins. */
export type QuickBomConfigExpansionReviewWorkspaceCounts =
  ProjectBoqConfigExpansionReviewWorkspaceCounts;

/** Reviewed-mode roll-up counts, projected from a reviewed (non-draft) artifact. */
export type QuickBomConfigExpansionReviewReviewedCounts =
  ProjectBoqConfigExpansionReviewReviewedCounts;

/** One draft line projected to the fields the line-review UI shows. */
export type QuickBomConfigExpansionReviewLine =
  ProjectBoqConfigExpansionReviewLine;

/** The lean, serializable configuration-expansion line-review projection returned on `ok`. */
export type QuickBomConfigExpansionReviewWorkspace =
  ProjectBoqConfigExpansionReviewWorkspace;

/** Discriminated result of {@link loadQuickBomConfigurationExpansionReviewWorkspace}. */
export type LoadQuickBomConfigExpansionReviewWorkspaceResult =
  LoadProjectBoqConfigExpansionReviewWorkspaceResult;

/**
 * Load the read-only Quick BoM configuration-expansion line-review projection for one
 * `configuration_expansion` artifact by delegating to the shared review-workspace core
 * with the Quick BoM `expectedMode`. Behavior, status order, allowlist projection,
 * deterministic counts, and immutability are exactly the core's; only non-quick_bom
 * projects diverge, returning the lean `wrong_mode` status without reading further.
 */
export async function loadQuickBomConfigurationExpansionReviewWorkspace(
  tenantId: string,
  projectId: string,
  artifactId: string
): Promise<LoadQuickBomConfigExpansionReviewWorkspaceResult> {
  return loadProjectBoqConfigurationExpansionReviewWorkspaceCore({
    tenantId,
    projectId,
    artifactId,
    expectedMode: "quick_bom",
  });
}
