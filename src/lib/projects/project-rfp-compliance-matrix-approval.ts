/**
 * RFP compliance-matrix review/approval service.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Records one approve/reject decision against the exact compliance_matrix
 * artifact version named by the caller. It gates on rfp mode, compliance_matrix
 * type/stage, and reviewable status. An "approved" decision additionally inspects
 * the exact payload so an AI-drafted or partially reviewed matrix cannot be
 * approved as final; rejection stays recordable against any reviewable matrix even
 * with an incomplete payload. It creates no artifacts, mutates no rows, leaks no
 * payload body/tenant, and does no AI, pricing, SKU, catalog, or config work.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
  RFP_COMPLIANCE_STATUSES,
} from "@/lib/projects/project-rfp-compliance-matrix";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

const COMPLIANCE_MATRIX_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "compliance_matrix";
const COMPLIANCE_MATRIX_STAGE_ID: ProjectArtifact["stageId"] =
  "compliance_matrix_review";

export interface ReviewRfpComplianceMatrixArtifactInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt?: Date;
  note?: string;
}

export interface RfpComplianceMatrixReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpComplianceMatrixReviewArtifactSummary {
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

/** Deterministic refusal of an "approved" decision after payload inspection;
 * rowIds carry only row identifiers, never payload bodies, evidence, or tenant. */
export type ComplianceMatrixApprovalBlock =
  | { status: "invalid_compliance_matrix_payload" }
  | { status: "no_active_rows" }
  | { status: "rows_need_review"; rowIds: string[] }
  | { status: "rows_not_reviewed"; rowIds: string[] }
  | { status: "not_applicable_reason_required"; rowIds: string[] }
  | { status: "removed_reason_required"; rowIds: string[] };

export type ReviewRfpComplianceMatrixArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpComplianceMatrixReviewProjectSummary }
  | { status: "artifact_not_found" }
  | { status: "artifact_not_compliance_matrix"; artifact: RfpComplianceMatrixReviewArtifactSummary }
  | { status: "artifact_not_reviewable"; artifact: RfpComplianceMatrixReviewArtifactSummary }
  | { status: "approval_failed" }
  | ComplianceMatrixApprovalBlock
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpComplianceMatrixReviewArtifactSummary;
    };

function toProjectSummary(project: Project): RfpComplianceMatrixReviewProjectSummary {
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

function toArtifactSummary(artifact: ProjectArtifact): RfpComplianceMatrixReviewArtifactSummary {
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

type ApprovalReadiness = ComplianceMatrixApprovalBlock | { status: "ready" };
type Row = Record<string, unknown>;

const PAYLOAD_INVALID: ApprovalReadiness = {
  status: "invalid_compliance_matrix_payload",
};
const isKnownStatus = (v: unknown): boolean =>
  typeof v === "string" && (RFP_COMPLIANCE_STATUSES as readonly string[]).includes(v);
const isNonBlank = (v: unknown): boolean =>
  typeof v === "string" && v.trim() !== "";
const isRowWithId = (r: unknown): r is Row =>
  typeof r === "object" && r !== null && !Array.isArray(r) && isNonBlank((r as Row).id);
const idsOf = (rows: Row[]): string[] => rows.map((row) => row.id as string);

/** Decide whether an "approved" decision may proceed for the exact payload. Pure:
 * reads only the payload, mutates nothing, returns row ids (never bodies). */
function evaluateComplianceMatrixApproval(payload: unknown): ApprovalReadiness {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    return PAYLOAD_INVALID;
  const record = payload as Row;
  if (record.payloadKind !== RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND || !Array.isArray(record.rows))
    return PAYLOAD_INVALID;
  if (!record.rows.every(isRowWithId)) return PAYLOAD_INVALID;
  const all = record.rows as Row[];
  const active = all.filter((row) => row.rowReviewStatus !== "removed");
  if (active.length === 0) return { status: "no_active_rows" };
  const needReview = active.filter(
    (row) => row.complianceStatus === "needs_review" || !isKnownStatus(row.complianceStatus)
  );
  if (needReview.length > 0) return { status: "rows_need_review", rowIds: idsOf(needReview) };
  const notReviewed = active.filter((row) => row.rowReviewStatus !== "reviewed");
  if (notReviewed.length > 0) return { status: "rows_not_reviewed", rowIds: idsOf(notReviewed) };
  const naMissing = active.filter(
    (row) => row.complianceStatus === "not_applicable" && !isNonBlank(row.notApplicableReason)
  );
  if (naMissing.length > 0)
    return { status: "not_applicable_reason_required", rowIds: idsOf(naMissing) };
  const removedMissing = all.filter(
    (row) => row.rowReviewStatus === "removed" && !isNonBlank(row.removedReason)
  );
  if (removedMissing.length > 0)
    return { status: "removed_reason_required", rowIds: idsOf(removedMissing) };
  return { status: "ready" };
}

export async function reviewRfpComplianceMatrixArtifact(
  input: ReviewRfpComplianceMatrixArtifactInput
): Promise<ReviewRfpComplianceMatrixArtifactResult> {
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
    artifact.type !== COMPLIANCE_MATRIX_ARTIFACT_TYPE ||
    artifact.stageId !== COMPLIANCE_MATRIX_STAGE_ID
  ) {
    return {
      status: "artifact_not_compliance_matrix",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (!isArtifactReviewable(artifact)) {
    return {
      status: "artifact_not_reviewable",
      artifact: toArtifactSummary(artifact),
    };
  }

  if (decision === "approved") {
    const readiness = evaluateComplianceMatrixApproval(artifact.payload);
    if (readiness.status !== "ready") return readiness;
  }

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
