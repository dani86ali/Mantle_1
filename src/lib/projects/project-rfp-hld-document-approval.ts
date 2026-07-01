/**
 * RFP HLD document review/approval service (Stage 6H-0I-A).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Records one human approve/reject decision against the EXACT final `hld_document`
 * artifact version named by the caller, on the `hld_design_delta_review` stage. Human
 * approval (or an approved SE manual upload) is the ONLY path to runtime/customer HLD
 * authority; this service records that decision and delegates all state transitions to
 * createProjectApproval (its only mutation).
 *
 * Because an approved manual `hld_document` becomes final HLD authority, APPROVAL fails
 * closed unless the persisted upload is still sound: the payload re-validates against
 * the Stage 6H-0I-A contract, the artifact row and payload source ids both equal
 * [bundle, model, diagram, documentModel], and the whole upstream chain still resolves
 * on the HLD stage - the approved source bundle, the approved version-locked design
 * model tied to [bundle], the approved version-locked diagram tied to the model/bundle,
 * and the approved version-locked document model tied to [bundle, model, diagram] -
 * each with its version matching the recorded source version. A malformed upload is
 * invalid; a broken chain is stale - either records nothing. A REJECTION skips every
 * payload and source-chain check so a malformed or stale upload can still be retired.
 *
 * Pricing and configuration authority stay with the approved upstream artifacts. The
 * service reads only Project state through the project/artifact stores; it reads no raw
 * file and constructs no provider/AI/catalog/pricing call. Summaries are lean and
 * serializable (ISO dates, copied arrays, no payload body, no drawio XML, no tenantId).
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
import {
  evaluateRfpHldDocumentSourceChain,
  type RfpHldDocumentStaleCode,
} from "@/lib/projects/project-rfp-hld-document-source-chain";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

const DOCUMENT_TYPE: ProjectArtifact["type"] = "hld_document";
const HLD_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";

export interface ReviewRfpHldDocumentArtifactInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt?: Date;
  note?: string;
}

export interface RfpHldDocumentReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDocumentReviewArtifactSummary {
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

export type ReviewRfpHldDocumentArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDocumentReviewProjectSummary }
  | { status: "artifact_not_found" }
  | { status: "artifact_not_hld_document"; artifact: RfpHldDocumentReviewArtifactSummary }
  | { status: "artifact_not_reviewable"; artifact: RfpHldDocumentReviewArtifactSummary }
  | { status: "invalid_hld_document_payload"; artifact: RfpHldDocumentReviewArtifactSummary }
  | {
      status: "stale_hld_document_source_chain";
      artifact: RfpHldDocumentReviewArtifactSummary;
      staleCode: RfpHldDocumentStaleCode;
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpHldDocumentReviewArtifactSummary;
    };

function toProjectSummary(project: Project): RfpHldDocumentReviewProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): RfpHldDocumentReviewArtifactSummary {
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

function staleResult(
  artifact: ProjectArtifact,
  staleCode: RfpHldDocumentStaleCode
): ReviewRfpHldDocumentArtifactResult {
  return {
    status: "stale_hld_document_source_chain",
    artifact: toArtifactSummary(artifact),
    staleCode,
  };
}

/**
 * Approval-only source-chain gate. Wraps {@link evaluateRfpHldDocumentSourceChain},
 * mapping its neutral outcome to the approval result that must short-circuit the
 * approval, or null when the persisted upload is valid and still ties through the
 * approved bundle/model/diagram/document-model chain.
 */
async function evaluateDocumentSourceChain(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<ReviewRfpHldDocumentArtifactResult | null> {
  const outcome = await evaluateRfpHldDocumentSourceChain(tenantId, projectId, artifact);
  if (outcome.kind === "invalid_payload") {
    return {
      status: "invalid_hld_document_payload",
      artifact: toArtifactSummary(artifact),
    };
  }
  if (outcome.kind === "stale") {
    return staleResult(artifact, outcome.staleCode);
  }
  return null;
}

/**
 * Review (approve/reject) one EXACT hld_document artifact version, tenant scoped on
 * every store call. Validates nonblank artifactId then decidedBy before any store call.
 * Gates in order: project existence, rfp mode, exact artifact existence (including a
 * route-project id match), hld_document type in the hld_design_delta_review stage,
 * reviewable status. An APPROVAL additionally re-validates the persisted upload payload
 * and re-ties it through the approved bundle/model/diagram/document-model source chain
 * (blocking with invalid_hld_document_payload or stale_hld_document_source_chain, the
 * payload body and drawio XML never leaked); a REJECTION skips those checks so a
 * malformed/stale upload can still be retired. On a passing path it persists exactly one
 * approval (the only mutation). Only a null createProjectApproval maps to
 * approval_failed; other store errors bubble.
 */
export async function reviewRfpHldDocumentArtifact(
  input: ReviewRfpHldDocumentArtifactInput
): Promise<ReviewRfpHldDocumentArtifactResult> {
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
  if (artifact === null || artifact.projectId !== projectId) {
    return { status: "artifact_not_found" };
  }
  if (artifact.type !== DOCUMENT_TYPE || artifact.stageId !== HLD_STAGE) {
    return { status: "artifact_not_hld_document", artifact: toArtifactSummary(artifact) };
  }
  if (!isArtifactReviewable(artifact)) {
    return { status: "artifact_not_reviewable", artifact: toArtifactSummary(artifact) };
  }

  if (decision === "approved") {
    const blocked = await evaluateDocumentSourceChain(tenantId, projectId, artifact);
    if (blocked !== null) return blocked;
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
