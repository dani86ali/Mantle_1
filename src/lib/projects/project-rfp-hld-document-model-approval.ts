/**
 * RFP HLD document-model review/approval service (Stage 6H-B-001).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * and BOMATIC_POST_STAGE4_HLD_IMPLEMENTATION_PLAN.md (Stage 6 HLD readiness).
 *
 * Records one approve/reject decision against the EXACT internal hld_document_model
 * artifact version named by the caller, on the hld_design_delta_review stage. It
 * loads the Project and the exact artifact, gates on rfp mode, the hld_document_model
 * type within the hld_design_delta_review stage, and reviewable status, then persists
 * exactly one approval through createProjectApproval (its only mutation).
 *
 * Because an approved document model is the structured spine future HLD document
 * rendering builds on, APPROVAL additionally fails closed unless the persisted model
 * is still sound: the payload re-validates against the Stage 6H-A contract, the
 * artifact row and payload source ids both equal [bundle, model, diagram], and the
 * whole upstream chain still resolves on the hld_design_delta_review stage - the
 * approved source bundle, the approved version-locked design model tied to [bundle],
 * the approved version-locked diagram tied to [model, bundle, review], and the active
 * design-model review tied to [model, bundle] - with each upstream payload still valid
 * and still pointing back through the expected chain. A malformed model is invalid; a
 * broken chain is stale - either records nothing. A REJECTION skips every payload and
 * source-chain check so a malformed or stale model can still be retired.
 *
 * Pricing and configuration authority stay with the approved upstream artifacts. The
 * service reads only Project state through the project/artifact stores; it reads no
 * raw file and constructs no provider/AI/catalog/pricing call. Summaries are lean and
 * serializable (ISO dates, copied arrays, no payload body, no tenantId).
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { createProjectApproval } from "@/lib/db/project-approval-store";
import { isArtifactReviewable } from "@/lib/projects/approvals";
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

const DOCUMENT_MODEL_TYPE: ProjectArtifact["type"] = "hld_document_model";
const HLD_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";
const SOURCE_BUNDLE_TYPE: ProjectArtifact["type"] = "hld_source_bundle";
const MODEL_TYPE: ProjectArtifact["type"] = "hld_design_model";
const DIAGRAM_TYPE: ProjectArtifact["type"] = "hld_diagram";
const REVIEW_TYPE: ProjectArtifact["type"] = "hld_design_model_review";

/**
 * Active advisory-review statuses that may still back an approved document model,
 * mirroring Stage 6F/6G/6H-A exactly. A referenced review outside this set (rejected
 * / failed / stale / missing / not_applicable) is treated as unavailable, so an
 * obsolete review blocks approval.
 */
const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

export interface ReviewRfpHldDocumentModelArtifactInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
  decision: ProjectApproval["decision"];
  decidedBy: string;
  decidedAt?: Date;
  note?: string;
}

export interface RfpHldDocumentModelReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDocumentModelReviewArtifactSummary {
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
export type RfpHldDocumentModelStaleCode =
  | "source_artifact_ids_mismatch"
  | "source_bundle_unavailable"
  | "source_model_unavailable"
  | "source_review_unavailable"
  | "source_diagram_unavailable"
  | "source_bundle_invalid"
  | "source_model_invalid"
  | "source_diagram_invalid"
  | "source_chain_mismatch"
  | "source_version_mismatch";

export type ReviewRfpHldDocumentModelArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDocumentModelReviewProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_document_model";
      artifact: RfpHldDocumentModelReviewArtifactSummary;
    }
  | {
      status: "artifact_not_reviewable";
      artifact: RfpHldDocumentModelReviewArtifactSummary;
    }
  | {
      status: "invalid_hld_document_model_payload";
      artifact: RfpHldDocumentModelReviewArtifactSummary;
    }
  | {
      status: "stale_hld_document_model_source_chain";
      artifact: RfpHldDocumentModelReviewArtifactSummary;
      staleCode: RfpHldDocumentModelStaleCode;
      messages?: string[];
    }
  | { status: "approval_failed" }
  | {
      status: "ok";
      approval: ProjectApproval;
      artifactStatus: ProjectArtifactStatus;
      stageStatus: ProjectStageStatus;
      artifact: RfpHldDocumentModelReviewArtifactSummary;
    };

/** Order-sensitive element-wise equality for the source id arrays. */
function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toProjectSummary(project: Project): RfpHldDocumentModelReviewProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpHldDocumentModelReviewArtifactSummary {
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
  staleCode: RfpHldDocumentModelStaleCode,
  messages: string[]
): ReviewRfpHldDocumentModelArtifactResult {
  return {
    status: "stale_hld_document_model_source_chain",
    artifact: toArtifactSummary(artifact),
    staleCode,
    messages,
  };
}

/** True when an upstream artifact is the approved `type` on the HLD stage. */
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

/** True when the review is an active design-model review on the HLD stage. */
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
 * short-circuit the approval, or null when the persisted document model is valid and
 * still ties through the approved bundle/model/diagram/review chain. Reads the artifact
 * store but mutates nothing, and never leaks any payload body (the target summary is
 * the only artifact surfaced). The Stage 6H-A contract validator guarantees the three
 * document-model source ids are present, non-blank, mutually distinct, and equal to
 * the payload's own sourceArtifactIds before this gate reads them.
 */
async function evaluateDocumentModelSourceChain(
  tenantId: string,
  projectId: string,
  artifact: ProjectArtifact
): Promise<ReviewRfpHldDocumentModelArtifactResult | null> {
  const validation = validateRfpHldDocumentModelPayload(artifact.payload);
  if (!validation.valid) {
    return {
      status: "invalid_hld_document_model_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = artifact.payload as unknown as RfpHldDocumentModelPayload;
  const bundleId = payload.sourceHldSourceBundleArtifactId;
  const modelId = payload.sourceHldDesignModelArtifactId;
  const diagramId = payload.sourceHldDiagramArtifactId;
  const expectedSourceIds = [bundleId, modelId, diagramId];

  // Row + payload tie: both id lists must equal [bundle, model, diagram].
  if (
    !sameOrdered(artifact.sourceArtifactIds, expectedSourceIds) ||
    !sameOrdered(payload.sourceArtifactIds, expectedSourceIds)
  ) {
    return staleResult(artifact, "source_artifact_ids_mismatch", [
      "The document model source ids no longer equal [bundle, model, diagram].",
    ]);
  }

  // --- Source bundle: approved root authority, payload still valid ---
  const bundle = await getProjectArtifactById(tenantId, projectId, bundleId);
  if (!isApprovedTypeOnStage(bundle, projectId, SOURCE_BUNDLE_TYPE)) {
    return staleResult(artifact, "source_bundle_unavailable", [
      "The source bundle is not an approved hld_source_bundle on the hld_design_delta_review stage.",
    ]);
  }
  if (!validateRfpHldSourceBundlePayload((bundle as ProjectArtifact).payload).valid) {
    return staleResult(artifact, "source_bundle_invalid", [
      "The source bundle payload no longer satisfies its contract.",
    ]);
  }

  // --- Design model: approved, version-locked, tied to exactly [bundle] ---
  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isApprovedTypeOnStage(model, projectId, MODEL_TYPE)) {
    return staleResult(artifact, "source_model_unavailable", [
      "The source design model is not an approved hld_design_model on the hld_design_delta_review stage.",
    ]);
  }
  const modelArtifact = model as ProjectArtifact;
  if (modelArtifact.version !== payload.sourceModelVersion) {
    return staleResult(artifact, "source_version_mismatch", [
      "The design model version no longer equals the document model sourceModelVersion.",
    ]);
  }
  if (!sameOrdered(modelArtifact.sourceArtifactIds, [bundleId])) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The design model row source ids no longer equal [bundle].",
    ]);
  }
  if (!validateRfpHldDesignModelPayload(modelArtifact.payload).valid) {
    return staleResult(artifact, "source_model_invalid", [
      "The design model payload no longer satisfies its contract.",
    ]);
  }
  const modelPayload = modelArtifact.payload as unknown as RfpHldDesignModelPayload;
  if (
    modelPayload.sourceHldSourceBundleArtifactId !== bundleId ||
    !sameOrdered(modelPayload.sourceArtifactIds, [bundleId])
  ) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The design model payload source ids no longer point at the source bundle.",
    ]);
  }

  // --- Diagram: approved, version-locked, valid, tied to [model, bundle, review] ---
  const diagram = await getProjectArtifactById(tenantId, projectId, diagramId);
  if (!isApprovedTypeOnStage(diagram, projectId, DIAGRAM_TYPE)) {
    return staleResult(artifact, "source_diagram_unavailable", [
      "The source diagram is not an approved hld_diagram on the hld_design_delta_review stage.",
    ]);
  }
  const diagramArtifact = diagram as ProjectArtifact;
  if (diagramArtifact.version !== payload.sourceDiagramVersion) {
    return staleResult(artifact, "source_version_mismatch", [
      "The diagram version no longer equals the document model sourceDiagramVersion.",
    ]);
  }
  if (!validateRfpHldDiagramDraftPayload(diagramArtifact.payload).valid) {
    return staleResult(artifact, "source_diagram_invalid", [
      "The diagram payload no longer satisfies its contract.",
    ]);
  }
  const diagramPayload = diagramArtifact.payload as unknown as RfpHldDiagramDraftPayload;
  const reviewId = diagramPayload.sourceReviewArtifactId;
  if (!sameOrdered(diagramArtifact.sourceArtifactIds, [modelId, bundleId, reviewId])) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The diagram row source ids no longer equal [model, bundle, review].",
    ]);
  }
  if (
    diagramPayload.sourceHldDesignModelArtifactId !== modelId ||
    diagramPayload.sourceHldSourceBundleArtifactId !== bundleId
  ) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The diagram payload source ids no longer point at the design model and source bundle.",
    ]);
  }
  if (diagramPayload.sourceModelVersion !== modelArtifact.version) {
    return staleResult(artifact, "source_version_mismatch", [
      "The diagram sourceModelVersion no longer equals the current design model version.",
    ]);
  }

  // --- Design-model review: active, tied to exactly [model, bundle] ---
  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isActiveReviewOnStage(review, projectId)) {
    return staleResult(artifact, "source_review_unavailable", [
      "The source review is not an active hld_design_model_review on the hld_design_delta_review stage.",
    ]);
  }
  if (!sameOrdered((review as ProjectArtifact).sourceArtifactIds, [modelId, bundleId])) {
    return staleResult(artifact, "source_chain_mismatch", [
      "The review row source ids no longer equal [model, bundle].",
    ]);
  }

  return null;
}

/**
 * Review (approve/reject) one EXACT hld_document_model artifact version, tenant scoped
 * on every store call. Validates nonblank artifactId then decidedBy before any store
 * call. Gates in order: project existence, rfp mode, exact artifact existence
 * (including a route-project id match), hld_document_model type in the
 * hld_design_delta_review stage, reviewable status. An APPROVAL additionally
 * re-validates the persisted document-model payload and re-ties it through the approved
 * bundle/model/diagram/review source chain (blocking with
 * invalid_hld_document_model_payload or stale_hld_document_model_source_chain, the
 * payload body never leaked); a REJECTION skips those checks so a malformed/stale model
 * can still be retired. On a passing path it persists exactly one approval (the only
 * mutation) and returns the approval, the post-decision artifact/stage statuses, and
 * the pre-approval artifact summary. Only a null createProjectApproval maps to
 * approval_failed; other store errors bubble.
 */
export async function reviewRfpHldDocumentModelArtifact(
  input: ReviewRfpHldDocumentModelArtifactInput
): Promise<ReviewRfpHldDocumentModelArtifactResult> {
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
  // Defense in depth on top of the tenant/project-scoped store lookup.
  if (artifact === null || artifact.projectId !== projectId) {
    return { status: "artifact_not_found" };
  }
  if (artifact.type !== DOCUMENT_MODEL_TYPE || artifact.stageId !== HLD_STAGE) {
    return {
      status: "artifact_not_hld_document_model",
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
    const blocked = await evaluateDocumentModelSourceChain(tenantId, projectId, artifact);
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
