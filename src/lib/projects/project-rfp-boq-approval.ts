/**
 * Project RFP BoQ artifact review/approval service (thin lane wrapper).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Pins the shared BoQ exact-artifact approval core to the RFP lane:
 * expectedMode "rfp" and a read-only RFP BoQ workspace loader. Every gate
 * (nonblank artifactId/decidedBy, project + exact artifact load, mode gate,
 * canonical BoQ approval-gated type + allowlist narrowing, configuration_expansion
 * draft guard, reviewability, and the single approval mutation) lives in the core.
 * This wrapper adds no behavior of its own and leaks no artifact payloads.
 * Approval is per exact artifact id only: never by type, latest version, stage,
 * or a user-supplied version. The lane never prices, expands configuration,
 * resolves SKUs, exports, runs the runner, calls AI, or looks up a catalog; the
 * one mutation (the approval) belongs to the core.
 */
import {
  reviewProjectBoqArtifact,
  type ReviewProjectBoqArtifactCoreResult,
  type ReviewProjectBoqArtifactRequest,
} from "@/lib/projects/project-boq-approval-core";
import {
  getRfpBoqReadinessReport,
  type RfpBoqReadinessReport,
} from "@/lib/projects/project-rfp-boq-readiness";
import { listProjectFiles } from "@/lib/db/project-file-store";
import { listProjectArtifacts } from "@/lib/db/project-artifact-store";

/**
 * Lean, read-only RFP BoQ lane workspace returned after a successful approval:
 * only the pure readiness report, which already omits storagePath. No artifact
 * payloads and no storage handles ever appear here.
 */
export interface ProjectRfpBoqWorkspaceResult {
  readiness: RfpBoqReadinessReport;
}

/**
 * Input for {@link reviewProjectRfpBoqArtifact}: the shared BoQ approval request
 * (tenantId, projectId, artifactId, decision, decidedBy, optional decidedAt/note,
 * and the optional narrowing allowedArtifactTypes allowlist). expectedMode and the
 * workspace loader are pinned by this wrapper, so they are not caller-facing.
 */
export type ReviewProjectRfpBoqArtifactInput = ReviewProjectBoqArtifactRequest;

/** Discriminated result of {@link reviewProjectRfpBoqArtifact}. */
export type ReviewProjectRfpBoqArtifactResult =
  ReviewProjectBoqArtifactCoreResult<ProjectRfpBoqWorkspaceResult>;

/**
 * Read-only RFP BoQ lane workspace loader, tenant-scoped. The shared core runs
 * it only after an approval succeeds; this wrapper never calls it directly. It
 * lists the project's files and artifacts, then delegates to the pure RFP BoQ
 * readiness helper, whose BoQ file summaries already omit storagePath.
 */
async function loadProjectRfpBoqWorkspace(
  tenantId: string,
  projectId: string
): Promise<ProjectRfpBoqWorkspaceResult> {
  const [files, artifacts] = await Promise.all([
    listProjectFiles(tenantId, projectId),
    listProjectArtifacts(tenantId, projectId),
  ]);
  return { readiness: getRfpBoqReadinessReport({ projectId, files, artifacts }) };
}

/**
 * Review (approve/reject) one EXACT RFP BoQ artifact version. Thin wrapper:
 * delegates every gate and the single mutation to the shared BoQ approval core,
 * pinning expectedMode "rfp" and the read-only RFP BoQ workspace loader. Tenant
 * scoping, the exact-artifact identity rule, and the discriminated result
 * (including the artifact_not_quick_bom type gate) are unchanged from the core.
 */
export function reviewProjectRfpBoqArtifact(
  input: ReviewProjectRfpBoqArtifactInput
): Promise<ReviewProjectRfpBoqArtifactResult> {
  return reviewProjectBoqArtifact({
    ...input,
    expectedMode: "rfp",
    loadWorkspace: loadProjectRfpBoqWorkspace,
  });
}
