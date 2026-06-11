/**
 * RFP requirements-baseline review/approval service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Records one approve/reject decision against the EXACT requirements_baseline
 * artifact version named by the caller (section 16). This module never reads
 * file contents, storage paths, evidence, or requirement text, and never
 * generates compliance/HLD/proposal, prices, exports, resolves SKUs, expands
 * configuration, runs the runner, calls AI, or looks up the catalog. It
 * loads the Project and the exact artifact, gates on rfp mode, the
 * requirements_baseline type in the requirements_baseline_review stage, and
 * reviewability via the pure approval helper, then persists exactly one
 * approval via createProjectApproval (its only mutation; it never creates a
 * new artifact version). Tenant scoping is enforced on every store call.
 * Approval is per exact artifact id only: never by type, latest version,
 * stage, source file/artifact, or a payload field. Summaries are lean,
 * serializable, payload- and tenant-free; inputs are never mutated.
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
const RFP_REQUIREMENTS_BASELINE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "requirements_baseline";
const RFP_REQUIREMENTS_BASELINE_STAGE_ID: ProjectArtifact["stageId"] =
  "requirements_baseline_review";

/** Input for {@link reviewRfpRequirementsBaselineArtifact}. */
export interface ReviewRfpRequirementsBaselineArtifactInput {
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
export interface RfpRequirementsBaselineReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpRequirementsBaselineReviewArtifactSummary {
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

/** Discriminated result of {@link reviewRfpRequirementsBaselineArtifact}. */
export type ReviewRfpRequirementsBaselineArtifactResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpRequirementsBaselineReviewProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_requirements_baseline";
      artifact: RfpRequirementsBaselineReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpRequirementsBaselineReviewArtifactSummary;
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      /** Pre-approval summary of the exact reviewed artifact version. */
      artifact: RfpRequirementsBaselineReviewArtifactSummary;
    };

/** Lean wrong-mode project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpRequirementsBaselineReviewProjectSummary {
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
): RfpRequirementsBaselineReviewArtifactSummary {
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
 * Review (approve/reject) one EXACT requirements_baseline artifact version,
 * tenant scoped on every store call. Validates nonblank artifactId then
 * decidedBy before any store call. Gates in order: project existence, rfp
 * mode, exact artifact existence, requirements_baseline type in the
 * requirements_baseline_review stage, reviewable status. It then persists
 * exactly one approval (the only mutation) and returns it with the
 * post-decision artifact/stage statuses and the pre-approval artifact
 * summary. Unexpected errors bubble; only null maps to approval_failed.
 */
export async function reviewRfpRequirementsBaselineArtifact(
  input: ReviewRfpRequirementsBaselineArtifactInput
): Promise<ReviewRfpRequirementsBaselineArtifactResult> {
  if (!input.artifactId?.trim()) throw new Error("artifactId is required.");
  if (!input.decidedBy?.trim()) throw new Error("decidedBy is required.");

  const { tenantId, projectId, artifactId, decision, decidedBy } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const artifact = await getProjectArtifactById(tenantId, projectId, artifactId);
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== RFP_REQUIREMENTS_BASELINE_ARTIFACT_TYPE ||
    artifact.stageId !== RFP_REQUIREMENTS_BASELINE_STAGE_ID
  ) {
    return {
      status: "artifact_not_requirements_baseline",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  // Pre-approval snapshot: the returned artifact is the version as loaded.
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
