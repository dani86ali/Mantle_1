/**
 * Project Quick BoM artifact review/approval service (thin lane wrapper).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Pins the shared BoQ exact-artifact approval core to the Quick BoM lane:
 * expectedMode "quick_bom" and the read-only Quick BoM workspace loader. Every
 * gate (nonblank artifactId/decidedBy, project + exact artifact load, mode gate,
 * canonical BoQ approval-gated type + allowlist narrowing, configuration_expansion
 * draft guard, reviewability, and the single approval mutation) lives in
 * the core. This wrapper adds no behavior of its own and leaks no artifact
 * payloads. Approval is per exact artifact id only: never by type, latest version,
 * stage, or a user-supplied version.
 */
import {
  reviewProjectBoqArtifact,
  type ReviewProjectBoqArtifactCoreResult,
  type ReviewProjectBoqArtifactRequest,
} from "@/lib/projects/project-boq-approval-core";
import {
  loadProjectQuickBomWorkspace,
  type ProjectQuickBomWorkspaceResult,
} from "@/lib/projects/project-quick-bom-workspace";

/**
 * Input for {@link reviewProjectQuickBomArtifact}: the shared BoQ approval request
 * (tenantId, projectId, artifactId, decision, decidedBy, optional decidedAt/note,
 * and the optional narrowing allowedArtifactTypes allowlist). expectedMode and the
 * workspace loader are pinned by this wrapper, so they are not caller-facing.
 */
export type ReviewProjectQuickBomArtifactInput = ReviewProjectBoqArtifactRequest;

/** Discriminated result of {@link reviewProjectQuickBomArtifact}. */
export type ReviewProjectQuickBomArtifactResult =
  ReviewProjectBoqArtifactCoreResult<ProjectQuickBomWorkspaceResult>;

/**
 * Review (approve/reject) one EXACT Quick BoM artifact version. Thin wrapper:
 * delegates every gate and the single mutation to the shared BoQ approval core,
 * pinning expectedMode "quick_bom" and the read-only Quick BoM workspace
 * loader. Tenant scoping, the exact-artifact identity rule, and the discriminated
 * result are unchanged from the core.
 */
export function reviewProjectQuickBomArtifact(
  input: ReviewProjectQuickBomArtifactInput
): Promise<ReviewProjectQuickBomArtifactResult> {
  return reviewProjectBoqArtifact({
    ...input,
    expectedMode: "quick_bom",
    loadWorkspace: loadProjectQuickBomWorkspace,
  });
}
