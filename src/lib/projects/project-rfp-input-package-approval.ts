/**
 * RFP input-package review/approval service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Records one approve/reject decision against the EXACT input_package artifact
 * version named by the caller (section 16). This module does NOT read file
 * contents or storage paths, parse documents, extract, build evidence,
 * generate requirements/compliance/HLD/proposal, price, export, resolve SKUs,
 * expand configuration, run the runner, call AI, or look up the catalog. It
 * loads the Project and the exact artifact, gates on rfp mode, the
 * input_package type within the intake_package_review stage, and reviewability
 * via the pure approval helper, then persists exactly one approval via
 * createProjectApproval (its only mutation; it never creates a new artifact
 * version). Tenant scoping is enforced on every store call. Approval is per
 * exact artifact id only: never by type, latest version, stage, or a
 * user-supplied version. Summaries are lean and serializable (ISO dates,
 * copied arrays, no payload, no tenantId); inputs are never mutated.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

/** The only artifact type / stage this RFP review path may approve or reject. */
const RFP_INPUT_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] = "input_package";
const RFP_INPUT_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/** Input for {@link reviewRfpInputPackageArtifact}. */
export interface ReviewRfpInputPackageArtifactInput {
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

/** Lean serializable project projection returned on wrong_mode; no tenantId. */
export interface RfpInputPackageReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpInputPackageReviewArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Discriminated result of {@link reviewRfpInputPackageArtifact}. */
export type ReviewRfpInputPackageArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpInputPackageReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_input_package";
      artifact: RfpInputPackageReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpInputPackageReviewArtifactSummary;
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      /** Pre-approval summary of the exact reviewed artifact version. */
      artifact: RfpInputPackageReviewArtifactSummary;
    };

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpInputPackageReviewProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined
      ? { customerName: project.customerName }
      : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Project the loaded artifact to a serializable summary; arrays are copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpInputPackageReviewArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    sourceFileIds: artifact.sourceFileIds.slice(),
    sourceArtifactIds: artifact.sourceArtifactIds.slice(),
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/**
 * Review (approve/reject) one EXACT input_package artifact version, tenant
 * scoped on every store call. Validates nonblank artifactId then decidedBy
 * before any store call. Gates in order: project existence, rfp mode, exact
 * artifact existence, input_package type in the intake_package_review stage,
 * reviewable status. On a passing gate it persists exactly one approval (the
 * only mutation) and returns the approval, the post-decision artifact/stage
 * statuses, and the pre-approval artifact summary. Unexpected errors bubble to
 * the caller; only a null createProjectApproval maps to approval_failed.
 */
export async function reviewRfpInputPackageArtifact(
  input: ReviewRfpInputPackageArtifactInput
): Promise<ReviewRfpInputPackageArtifactResult> {
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }
  if (!input.decidedBy || input.decidedBy.trim() === "") {
    throw new Error("decidedBy is required.");
  }

  const { tenantId, projectId, artifactId, decision, decidedBy } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== RFP_INPUT_PACKAGE_ARTIFACT_TYPE ||
    artifact.stageId !== RFP_INPUT_PACKAGE_STAGE_ID
  ) {
    return {
      status: "artifact_not_input_package",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  // Captured before the approval transitions statuses: the returned artifact
  // reflects the exact version as loaded for review.
  const artifactSummary = toArtifactSummary(artifact);

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

  return {
    status: "ok",
    approval: created.approval,
    artifactStatus: created.artifactStatus,
    stageStatus: created.stageStatus,
    artifact: artifactSummary,
  };
}
