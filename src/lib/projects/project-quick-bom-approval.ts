/**
 * Project Quick BoM artifact review/approval service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Records an approve/reject decision against an EXACT Quick BoM artifact version
 * (section 16) and returns the refreshed read-only workspace. This module does
 * NOT normalize, resolve SKUs, expand configuration, price, export, run the
 * runner, call AI, or look up the catalog. It loads the Project and the exact
 * artifact, gates on quick_bom mode and the Quick BoM approval-gated artifact
 * types, checks reviewability with the pure approval helper, persists exactly
 * one approval via createProjectApproval (its only mutation; it never creates a
 * new artifact version), then reloads the workspace. Tenant scoping is enforced
 * on every store/service call. Approval is per exact artifact id only: never by
 * type, latest version, stage, or a user-supplied version.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  loadProjectQuickBomWorkspace,
  type ProjectArtifactSummary,
  type ProjectQuickBomWorkspaceResult,
  type ProjectSummary,
} from "@/lib/projects/project-quick-bom-workspace";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageStatus,
} from "@/types/project";

/**
 * Artifact types this Quick BoM route may approve/reject (section 11, 11A).
 * normalized_boq is intentionally excluded: only SKU resolution, configuration
 * expansion, pricing, and the export package are approval-gated here.
 */
const QUICK_BOM_APPROVAL_GATED_ARTIFACT_TYPES: readonly ProjectArtifactType[] = [
  "sku_resolution",
  "configuration_expansion",
  "priced_boq",
  "export_package",
];

/** Input for {@link reviewProjectQuickBomArtifact}. */
export interface ReviewProjectQuickBomArtifactInput {
  tenantId: string;
  projectId: string;
  /** The exact artifact version under review; identity is this id only. */
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  /** Defaults to now downstream (via the materializer) when omitted. */
  decidedAt?: Date;
  note?: string;
}

/** Discriminated result of {@link reviewProjectQuickBomArtifact}. */
export type ReviewProjectQuickBomArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: ProjectSummary }
  | { status: "artifact_not_found" }
  | { status: "artifact_not_quick_bom"; artifact: ProjectArtifactSummary }
  | { status: "artifact_not_reviewable"; artifact: ProjectArtifactSummary }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      workspace: ProjectQuickBomWorkspaceResult;
    };

function iso(value: Date): string {
  return value.toISOString();
}

/**
 * Intentional payload-free projection mirroring the Quick BoM workspace read
 * model. The Prompt 77 converter is private, so this avoids editing that file.
 */
function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    tenantId: project.tenantId,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    ...(project.pricingConfig !== undefined
      ? { pricingConfig: { ...project.pricingConfig } }
      : {}),
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  };
}

/**
 * Intentional payload-free projection mirroring the Quick BoM workspace read
 * model; the artifact payload must never leak into an approval response.
 */
function toArtifactSummary(artifact: ProjectArtifact): ProjectArtifactSummary {
  return {
    id: artifact.id,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    ...(artifact.filePath !== undefined ? { filePath: artifact.filePath } : {}),
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: iso(artifact.createdAt),
    updatedAt: iso(artifact.updatedAt),
  };
}

/**
 * Review (approve/reject) one EXACT Quick BoM artifact version, tenant-scoped on
 * every store/service call. Validates nonblank artifactId then decidedBy before
 * any store call. Gates in order: project existence, quick_bom mode, exact
 * artifact existence, Quick BoM approval-gated type, reviewable status. On a
 * passing gate it persists exactly one approval (the only mutation) and returns
 * the refreshed workspace result. Unexpected errors (including a race where the
 * artifact became non-reviewable between load and write) bubble to the caller;
 * only a null createProjectApproval maps to approval_failed.
 */
export async function reviewProjectQuickBomArtifact(
  input: ReviewProjectQuickBomArtifactInput
): Promise<ReviewProjectQuickBomArtifactResult> {
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }
  if (!input.decidedBy || input.decidedBy.trim() === "") {
    throw new Error("decidedBy is required.");
  }

  const { tenantId, projectId, artifactId, decision, decidedBy } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "quick_bom") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "artifact_not_found" };
  if (!QUICK_BOM_APPROVAL_GATED_ARTIFACT_TYPES.includes(artifact.type)) {
    return {
      status: "artifact_not_quick_bom",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  const created = await createProjectApproval({
    tenantId,
    projectId,
    artifactId: artifact.id,
    decision,
    decidedBy,
    ...(input.decidedAt !== undefined ? { decidedAt: input.decidedAt } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
  });
  if (created === null) return { status: "approval_failed" };

  const workspace = await loadProjectQuickBomWorkspace(tenantId, projectId);

  return {
    status: "ok",
    approval: created.approval,
    artifactStatus: created.artifactStatus,
    stageStatus: created.stageStatus,
    workspace,
  };
}
