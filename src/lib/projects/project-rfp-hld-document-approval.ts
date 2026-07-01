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
  validateRfpHldDocumentPayload,
  type RfpHldDocumentPayload,
} from "@/lib/projects/project-rfp-hld-document";
import {
  validateRfpHldDocumentModelPayload,
  type RfpHldDocumentModelPayload,
} from "@/lib/projects/project-rfp-hld-document-model";
import { validateRfpHldSourceBundlePayload } from "@/lib/projects/project-rfp-hld-source-bundle";
import {
  validateRfpHldDesignModelPayload,
  type RfpHldDesignModelPayload,
} from "@/lib/projects/project-rfp-hld-design-model";
import {
  validateRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftPayload,
} from "@/lib/projects/project-rfp-hld-diagram";
import type {
  Project,
  ProjectApproval,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectStageStatus,
} from "@/types/project";

const DOCUMENT_TYPE: ProjectArtifact["type"] = "hld_document";
const HLD_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";
const SOURCE_BUNDLE_TYPE: ProjectArtifact["type"] = "hld_source_bundle";
const MODEL_TYPE: ProjectArtifact["type"] = "hld_design_model";
const REVIEW_TYPE: ProjectArtifact["type"] = "hld_design_model_review";
const DIAGRAM_TYPE: ProjectArtifact["type"] = "hld_diagram";
const DOCUMENT_MODEL_TYPE: ProjectArtifact["type"] = "hld_document_model";
const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

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

/** Stable sub-reason for a stale source-chain approval block (never leaks payload). */
export type RfpHldDocumentStaleCode =
  | "source_artifact_ids_mismatch"
  | "source_document_model_unavailable"
  | "source_document_model_invalid"
  | "source_bundle_unavailable"
  | "source_bundle_invalid"
  | "source_model_unavailable"
  | "source_model_invalid"
  | "source_diagram_unavailable"
  | "source_diagram_invalid"
  | "source_review_unavailable"
  | "source_chain_mismatch"
  | "source_version_mismatch";

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

function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

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

function isApprovedTypeOnStage(
  artifact: ProjectArtifact | null,
  projectId: string,
  type: ProjectArtifact["type"]
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === type &&
    artifact.stageId === HLD_STAGE &&
    artifact.status === "approved"
  );
}

function isActiveReviewOnStage(
  artifact: ProjectArtifact | null,
  projectId: string
): boolean {
  return (
    artifact !== null &&
    artifact.projectId === projectId &&
    artifact.type === REVIEW_TYPE &&
    artifact.stageId === HLD_STAGE &&
    ACTIVE_REVIEW_STATUSES.has(artifact.status)
  );
}

/**
 * Approval-only source-chain gate. Returns the invalid/stale result that must
 * short-circuit the approval, or null when the persisted upload is valid and still
 * ties through the approved bundle/model/diagram/document-model chain. Reads the
 * artifact store but mutates nothing, and never leaks any payload body or drawio XML.
 */
async function evaluateDocumentSourceChain(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<ReviewRfpHldDocumentArtifactResult | null> {
  if (!validateRfpHldDocumentPayload(artifact.payload).valid) {
    return {
      status: "invalid_hld_document_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = artifact.payload as unknown as RfpHldDocumentPayload;
  const bundleId = payload.sourceHldSourceBundleArtifactId;
  const modelId = payload.sourceHldDesignModelArtifactId;
  const diagramId = payload.sourceHldDiagramArtifactId;
  const documentModelId = payload.sourceHldDocumentModelArtifactId;
  const expectedSourceIds = [bundleId, modelId, diagramId, documentModelId];

  if (
    !sameOrdered(artifact.sourceArtifactIds, expectedSourceIds) ||
    !sameOrdered(payload.sourceArtifactIds, expectedSourceIds)
  ) {
    return staleResult(artifact, "source_artifact_ids_mismatch");
  }

  // --- Source bundle: approved root authority, version-locked ---
  const bundle = await getProjectArtifactById(tenantId, projectId, bundleId);
  if (!isApprovedTypeOnStage(bundle, projectId, SOURCE_BUNDLE_TYPE)) {
    return staleResult(artifact, "source_bundle_unavailable");
  }
  if ((bundle as ProjectArtifact).version !== payload.sourceBundleVersion) {
    return staleResult(artifact, "source_version_mismatch");
  }
  if (!validateRfpHldSourceBundlePayload((bundle as ProjectArtifact).payload).valid) {
    return staleResult(artifact, "source_bundle_invalid");
  }

  // --- Design model: approved, version-locked, tied to exactly [bundle] ---
  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isApprovedTypeOnStage(model, projectId, MODEL_TYPE)) {
    return staleResult(artifact, "source_model_unavailable");
  }
  const modelArtifact = model as ProjectArtifact;
  if (modelArtifact.version !== payload.sourceModelVersion) {
    return staleResult(artifact, "source_version_mismatch");
  }
  if (!sameOrdered(modelArtifact.sourceArtifactIds, [bundleId])) {
    return staleResult(artifact, "source_chain_mismatch");
  }
  if (!validateRfpHldDesignModelPayload(modelArtifact.payload).valid) {
    return staleResult(artifact, "source_model_invalid");
  }
  const modelPayload = modelArtifact.payload as unknown as RfpHldDesignModelPayload;
  if (
    modelPayload.sourceHldSourceBundleArtifactId !== bundleId ||
    !sameOrdered(modelPayload.sourceArtifactIds, [bundleId])
  ) {
    return staleResult(artifact, "source_chain_mismatch");
  }

  // --- Diagram: approved, version-locked, valid, tied to the model + bundle ---
  const diagram = await getProjectArtifactById(tenantId, projectId, diagramId);
  if (!isApprovedTypeOnStage(diagram, projectId, DIAGRAM_TYPE)) {
    return staleResult(artifact, "source_diagram_unavailable");
  }
  const diagramArtifact = diagram as ProjectArtifact;
  if (diagramArtifact.version !== payload.sourceDiagramVersion) {
    return staleResult(artifact, "source_version_mismatch");
  }
  if (!validateRfpHldDiagramDraftPayload(diagramArtifact.payload).valid) {
    return staleResult(artifact, "source_diagram_invalid");
  }
  const diagramPayload = diagramArtifact.payload as unknown as RfpHldDiagramDraftPayload;
  const reviewId = diagramPayload.sourceReviewArtifactId;
  if (!sameOrdered(diagramArtifact.sourceArtifactIds, [modelId, bundleId, reviewId])) {
    return staleResult(artifact, "source_chain_mismatch");
  }
  if (
    diagramPayload.sourceHldDesignModelArtifactId !== modelId ||
    diagramPayload.sourceHldSourceBundleArtifactId !== bundleId
  ) {
    return staleResult(artifact, "source_chain_mismatch");
  }
  if (diagramPayload.sourceModelVersion !== modelArtifact.version) {
    return staleResult(artifact, "source_version_mismatch");
  }

  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isActiveReviewOnStage(review, projectId)) {
    return staleResult(artifact, "source_review_unavailable");
  }
  if (!sameOrdered((review as ProjectArtifact).sourceArtifactIds, [modelId, bundleId])) {
    return staleResult(artifact, "source_chain_mismatch");
  }

  // --- Document model: approved, version-locked, tied to [bundle, model, diagram] ---
  const documentModel = await getProjectArtifactById(tenantId, projectId, documentModelId);
  if (!isApprovedTypeOnStage(documentModel, projectId, DOCUMENT_MODEL_TYPE)) {
    return staleResult(artifact, "source_document_model_unavailable");
  }
  const documentModelArtifact = documentModel as ProjectArtifact;
  if (documentModelArtifact.version !== payload.sourceDocumentModelVersion) {
    return staleResult(artifact, "source_version_mismatch");
  }
  if (!validateRfpHldDocumentModelPayload(documentModelArtifact.payload).valid) {
    return staleResult(artifact, "source_document_model_invalid");
  }
  const documentModelPayload =
    documentModelArtifact.payload as unknown as RfpHldDocumentModelPayload;
  const docModelSources = [bundleId, modelId, diagramId];
  if (
    !sameOrdered(documentModelArtifact.sourceArtifactIds, docModelSources) ||
    !sameOrdered(documentModelPayload.sourceArtifactIds, docModelSources) ||
    documentModelPayload.sourceHldSourceBundleArtifactId !== bundleId ||
    documentModelPayload.sourceHldDesignModelArtifactId !== modelId ||
    documentModelPayload.sourceHldDiagramArtifactId !== diagramId ||
    documentModelPayload.sourceModelVersion !== modelArtifact.version ||
    documentModelPayload.sourceDiagramVersion !== diagramArtifact.version
  ) {
    return staleResult(artifact, "source_chain_mismatch");
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
