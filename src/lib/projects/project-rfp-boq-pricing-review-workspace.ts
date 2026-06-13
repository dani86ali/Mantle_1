/**
 * Read-only RFP BoQ priced-BoQ review WORKSPACE loader: the RFP lane wrapper over the
 * shared, mode-gated priced-BoQ review-workspace core. It loads ONE `priced_boq`
 * artifact and projects a lean, serializable line-pricing review view for the workspace
 * UI. Source of truth:
 * C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 9, 10, 11A).
 *
 * RFP priced_boq artifacts are created by the SAME deterministic pricing core as Quick
 * BoM, so they are reviewable through this identical read-only projection. All
 * deterministic work - project/artifact verification, the exact artifact gates, the
 * priced_boq payload parsing, the allowlist line projection, the deterministic counts,
 * and the lean serializable summaries - lives in
 * project-boq-pricing-review-workspace-core. This wrapper only pins the lane's
 * `expectedMode` to "rfp" and re-exports the lane's compatible projection type names
 * (as RFP-specific aliases over the shared shapes) so callers (the RFP route and review
 * panel) keep a stable surface. A non-rfp project therefore returns the same lean
 * `wrong_mode` status and reads nothing further. It imports the shared workspace core
 * only and adds no stores, pricing math, pricing-creation service, fixture/catalog/GPL
 * reader, config expansion, export, approval store, runner, AI/LLM, catalog, engine,
 * coordinator, adapter, or package dependency of its own.
 */
import {
  loadProjectBoqPricedBoqReviewWorkspaceCore,
  type LoadProjectBoqPricedBoqReviewWorkspaceResult,
  type ProjectBoqPricedReviewLineStatus,
  type ProjectBoqPricedBoqReviewWorkspaceProject,
  type ProjectBoqPricedBoqReviewWorkspaceArtifact,
  type ProjectBoqPricedBoqReviewTotals,
  type ProjectBoqPricedBoqReviewPricingSummary,
  type ProjectBoqPricedBoqReviewPricingAuthoritySummary,
  type ProjectBoqPricedBoqReviewConfigurationAuthoritySummary,
  type ProjectBoqPricedBoqReviewWorkspacePayload,
  type ProjectBoqPricedBoqReviewWorkspaceCounts,
  type ProjectBoqPricedBoqReviewLineAmounts,
  type ProjectBoqPricedBoqReviewLine,
  type ProjectBoqPricedBoqReviewWorkspace,
} from "@/lib/projects/project-boq-pricing-review-workspace-core";

/** Per-line pricing outcome, mirrored from priced-boq.ts (not imported). */
export type RfpBoqPricedReviewLineStatus = ProjectBoqPricedReviewLineStatus;

/** Lean project summary for the review header; tenant-scoped projection. */
export type RfpBoqPricedBoqReviewWorkspaceProject =
  ProjectBoqPricedBoqReviewWorkspaceProject;

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export type RfpBoqPricedBoqReviewWorkspaceArtifact =
  ProjectBoqPricedBoqReviewWorkspaceArtifact;

/** Allowlisted SAR totals over the priced rows. */
export type RfpBoqPricedBoqReviewTotals = ProjectBoqPricedBoqReviewTotals;

/** Allowlisted priced-BoQ roll-up counts plus SAR totals (no per-line detail). */
export type RfpBoqPricedBoqReviewPricingSummary =
  ProjectBoqPricedBoqReviewPricingSummary;

/** Safe pricing-authority provenance summary; no workbook path or sheet name. */
export type RfpBoqPricedBoqReviewPricingAuthoritySummary =
  ProjectBoqPricedBoqReviewPricingAuthoritySummary;

/** Safe configuration-authority provenance summary; no pricing fields or paths. */
export type RfpBoqPricedBoqReviewConfigurationAuthoritySummary =
  ProjectBoqPricedBoqReviewConfigurationAuthoritySummary;

/** Lean payload summary: provenance + config + counts/totals + safe authority traces. */
export type RfpBoqPricedBoqReviewWorkspacePayload =
  ProjectBoqPricedBoqReviewWorkspacePayload;

/** Deterministic review-state counts, counted from the projected line statuses. */
export type RfpBoqPricedBoqReviewWorkspaceCounts =
  ProjectBoqPricedBoqReviewWorkspaceCounts;

/** Allowlisted per-line SAR amounts; present only on priced lines. */
export type RfpBoqPricedBoqReviewLineAmounts =
  ProjectBoqPricedBoqReviewLineAmounts;

/** One priced (or retained-unpriced) BoQ line, projected for review. */
export type RfpBoqPricedBoqReviewLine = ProjectBoqPricedBoqReviewLine;

/** The lean, serializable priced-BoQ line-review projection returned on `ok`. */
export type RfpBoqPricedBoqReviewWorkspace = ProjectBoqPricedBoqReviewWorkspace;

/** Discriminated result of {@link loadRfpBoqPricedBoqReviewWorkspace}. */
export type LoadRfpBoqPricedBoqReviewWorkspaceResult =
  LoadProjectBoqPricedBoqReviewWorkspaceResult;

/**
 * Load the read-only RFP BoQ priced-BoQ line-review projection for one `priced_boq`
 * artifact by delegating to the shared review-workspace core with the RFP
 * `expectedMode`. Behavior, status order, allowlist projection, deterministic counts,
 * and immutability are exactly the core's; only non-rfp projects diverge, returning the
 * lean `wrong_mode` status without reading further.
 */
export async function loadRfpBoqPricedBoqReviewWorkspace(
  tenantId: string,
  projectId: string,
  artifactId: string
): Promise<LoadRfpBoqPricedBoqReviewWorkspaceResult> {
  return loadProjectBoqPricedBoqReviewWorkspaceCore({
    tenantId,
    projectId,
    artifactId,
    expectedMode: "rfp",
  });
}
