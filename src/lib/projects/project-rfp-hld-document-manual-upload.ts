/**
 * Tenant-scoped deterministic RFP HLD DOCUMENT MANUAL UPLOAD service (Stage 6H-0I-A).
 *
 * Records exactly ONE reviewable (`needs_review`) FINAL `hld_document` artifact on the
 * existing `hld_design_delta_review` stage from a SE MANUAL draw.io upload. The client
 * (via an authenticated route/session) supplies only the approved source
 * `hld_document_model` artifact id, a title, the uploaded file name, the draw.io XML,
 * and an optional short note; tenant/project/createdBy come from the session alone.
 *
 * The flow is fail-closed: verify the project within its tenant, gate rfp mode, load
 * the source `hld_document_model` and require it is the approved internal document
 * model on the HLD stage with a still-valid payload whose row + payload source ids
 * equal [bundle, model, diagram]; then re-load the bundle, design model, and diagram
 * it names and require they are still approved HLD-stage artifacts of the expected
 * types whose obvious row/source/version ties still hold. Only then build the
 * `rfp_hld_document` payload, HARD-GATE it with the Stage 6H-0I-A contract validator
 * BEFORE any write, and persist exactly one artifact. The upload response returns lean
 * summaries only and NEVER the draw.io XML, an upstream payload body, or the tenant id.
 *
 * This service reads only Project state through the project/artifact stores. It reads
 * NO raw RFP/PDF/DOCX/XLSX file, storage path, evidence/file store, or parser;
 * constructs NO provider adapter and imports NO provider/AI SDK; makes NO
 * pricing/SKU/catalog/configuration decision; and approves nothing - human approval is
 * the only path to runtime/customer HLD authority.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
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
import {
  RFP_HLD_DOCUMENT_AUTHORITY_KIND,
  RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
  RFP_HLD_DOCUMENT_PAYLOAD_KIND,
  RFP_HLD_DOCUMENT_SOURCE_MODE,
  validateRfpHldDocumentPayload,
  type RfpHldDocumentPayload,
} from "@/lib/projects/project-rfp-hld-document";
import type {
  Project,
  ProjectArtifact,
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectStageId,
} from "@/types/project";

const HLD_STAGE: ProjectStageId = "hld_design_delta_review";
const SOURCE_BUNDLE_TYPE: ProjectArtifactType = "hld_source_bundle";
const MODEL_TYPE: ProjectArtifactType = "hld_design_model";
const REVIEW_TYPE: ProjectArtifactType = "hld_design_model_review";
const DIAGRAM_TYPE: ProjectArtifactType = "hld_diagram";
const DOCUMENT_MODEL_TYPE: ProjectArtifactType = "hld_document_model";
const DOCUMENT_TYPE: ProjectArtifactType = "hld_document";
const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload body / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldDocumentUploadProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldDocumentUploadArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Lean payload summary. It NEVER carries the draw.io XML body. */
export interface RfpHldDocumentUploadPayloadSummary {
  payloadKind: typeof RFP_HLD_DOCUMENT_PAYLOAD_KIND;
  sourceMode: typeof RFP_HLD_DOCUMENT_SOURCE_MODE;
  title: string;
  uploadedFileName: string;
  drawioXmlLength: number;
  authorityKind: typeof RFP_HLD_DOCUMENT_AUTHORITY_KIND;
  effectiveWhenArtifactStatus: typeof RFP_HLD_DOCUMENT_AUTHORITY_STATUS;
  supersedesArtifactIds: string[];
  sourceHldSourceBundleArtifactId: string;
  sourceHldDesignModelArtifactId: string;
  sourceHldDiagramArtifactId: string;
  sourceHldDocumentModelArtifactId: string;
  sourceBundleVersion: number;
  sourceModelVersion: number;
  sourceDiagramVersion: number;
  sourceDocumentModelVersion: number;
}

export type RfpHldDocumentUploadPreconditionCode =
  | "document_model_unavailable"
  | "document_model_invalid"
  | "document_model_source_ids_mismatch"
  | "source_bundle_unavailable"
  | "source_bundle_invalid"
  | "design_model_unavailable"
  | "design_model_invalid"
  | "diagram_unavailable"
  | "diagram_invalid"
  | "source_review_unavailable"
  | "source_chain_mismatch";

export interface CreateRfpHldDocumentManualUploadInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** The approved source `hld_document_model` artifact id (client-provided). */
  documentModelArtifactId: string;
  title: string;
  uploadedFileName: string;
  drawioXml: string;
  note?: string;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  createdAt?: Date;
}

export type CreateRfpHldDocumentManualUploadResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDocumentUploadProjectSummary }
  | { status: "precondition_failed"; code: RfpHldDocumentUploadPreconditionCode }
  | { status: "invalid_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldDocumentUploadArtifactSummary;
      payloadSummary: RfpHldDocumentUploadPayloadSummary;
    };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function sameOrdered(a: readonly unknown[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toProjectSummary(project: Project): RfpHldDocumentUploadProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): RfpHldDocumentUploadArtifactSummary {
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

function toPayloadSummary(p: RfpHldDocumentPayload): RfpHldDocumentUploadPayloadSummary {
  return {
    payloadKind: p.payloadKind,
    sourceMode: p.sourceMode,
    title: p.title,
    uploadedFileName: p.uploadedFileName,
    drawioXmlLength: p.drawioXml.length,
    authorityKind: p.finalAuthority.authorityKind,
    effectiveWhenArtifactStatus: p.finalAuthority.effectiveWhenArtifactStatus,
    supersedesArtifactIds: p.supersedesArtifactIds.slice(),
    sourceHldSourceBundleArtifactId: p.sourceHldSourceBundleArtifactId,
    sourceHldDesignModelArtifactId: p.sourceHldDesignModelArtifactId,
    sourceHldDiagramArtifactId: p.sourceHldDiagramArtifactId,
    sourceHldDocumentModelArtifactId: p.sourceHldDocumentModelArtifactId,
    sourceBundleVersion: p.sourceBundleVersion,
    sourceModelVersion: p.sourceModelVersion,
    sourceDiagramVersion: p.sourceDiagramVersion,
    sourceDocumentModelVersion: p.sourceDocumentModelVersion,
  };
}

function isApprovedTypeOnStage(
  artifact: ProjectArtifact | null,
  projectId: string,
  type: ProjectArtifactType
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

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Create exactly ONE final `needs_review` `hld_document` artifact on the
 * `hld_design_delta_review` stage from a SE manual draw.io upload, tenant-scoped,
 * only after every gate passes. Throws on blank projectId, createdBy, or
 * documentModelArtifactId before any store call. Returns explicit result statuses
 * for not_found, wrong_mode, precondition_failed (writing nothing), invalid_payload
 * (writing nothing), and ok. Never approves anything; human approval is the only path
 * to runtime/customer HLD authority.
 */
export async function createRfpHldDocumentManualUpload(
  input: CreateRfpHldDocumentManualUploadInput
): Promise<CreateRfpHldDocumentManualUploadResult> {
  const projectId = str(input.projectId).trim();
  const createdBy = str(input.createdBy).trim();
  const documentModelArtifactId = str(input.documentModelArtifactId).trim();
  if (projectId === "") throw new Error("HLD document manual upload requires a projectId.");
  if (createdBy === "") throw new Error("HLD document manual upload requires a createdBy.");
  if (documentModelArtifactId === "") {
    throw new Error("HLD document manual upload requires a documentModelArtifactId.");
  }

  const { tenantId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // --- Source document model: approved internal doc model on the HLD stage ---
  const documentModel = await getProjectArtifactById(tenantId, projectId, documentModelArtifactId);
  if (!isApprovedTypeOnStage(documentModel, projectId, DOCUMENT_MODEL_TYPE)) {
    return { status: "precondition_failed", code: "document_model_unavailable" };
  }
  const documentModelArtifact = documentModel as ProjectArtifact;
  if (!validateRfpHldDocumentModelPayload(documentModelArtifact.payload).valid) {
    return { status: "precondition_failed", code: "document_model_invalid" };
  }
  const documentModelPayload =
    documentModelArtifact.payload as unknown as RfpHldDocumentModelPayload;
  const bundleId = documentModelPayload.sourceHldSourceBundleArtifactId;
  const modelId = documentModelPayload.sourceHldDesignModelArtifactId;
  const diagramId = documentModelPayload.sourceHldDiagramArtifactId;
  const expectedDocModelSources = [bundleId, modelId, diagramId];
  if (
    !sameOrdered(documentModelArtifact.sourceArtifactIds, expectedDocModelSources) ||
    !sameOrdered(documentModelPayload.sourceArtifactIds, expectedDocModelSources)
  ) {
    return { status: "precondition_failed", code: "document_model_source_ids_mismatch" };
  }

  // --- Source bundle: approved root authority on the HLD stage ---
  const bundle = await getProjectArtifactById(tenantId, projectId, bundleId);
  if (!isApprovedTypeOnStage(bundle, projectId, SOURCE_BUNDLE_TYPE)) {
    return { status: "precondition_failed", code: "source_bundle_unavailable" };
  }
  const bundleArtifact = bundle as ProjectArtifact;
  if (!validateRfpHldSourceBundlePayload(bundleArtifact.payload).valid) {
    return { status: "precondition_failed", code: "source_bundle_invalid" };
  }

  // --- Design model: approved, version-locked to the doc model, tied to [bundle] ---
  const model = await getProjectArtifactById(tenantId, projectId, modelId);
  if (!isApprovedTypeOnStage(model, projectId, MODEL_TYPE)) {
    return { status: "precondition_failed", code: "design_model_unavailable" };
  }
  const modelArtifact = model as ProjectArtifact;
  if (!validateRfpHldDesignModelPayload(modelArtifact.payload).valid) {
    return { status: "precondition_failed", code: "design_model_invalid" };
  }
  const modelPayload = modelArtifact.payload as unknown as RfpHldDesignModelPayload;
  if (
    modelArtifact.version !== documentModelPayload.sourceModelVersion ||
    !sameOrdered(modelArtifact.sourceArtifactIds, [bundleId]) ||
    modelPayload.sourceHldSourceBundleArtifactId !== bundleId ||
    !sameOrdered(modelPayload.sourceArtifactIds, [bundleId])
  ) {
    return { status: "precondition_failed", code: "source_chain_mismatch" };
  }

  // --- Diagram: approved, version-locked, tied to the model + bundle ---
  const diagram = await getProjectArtifactById(tenantId, projectId, diagramId);
  if (!isApprovedTypeOnStage(diagram, projectId, DIAGRAM_TYPE)) {
    return { status: "precondition_failed", code: "diagram_unavailable" };
  }
  const diagramArtifact = diagram as ProjectArtifact;
  if (!validateRfpHldDiagramDraftPayload(diagramArtifact.payload).valid) {
    return { status: "precondition_failed", code: "diagram_invalid" };
  }
  const diagramPayload = diagramArtifact.payload as unknown as RfpHldDiagramDraftPayload;
  const reviewId = str(diagramPayload.sourceReviewArtifactId).trim();
  if (
    diagramArtifact.version !== documentModelPayload.sourceDiagramVersion ||
    reviewId === "" ||
    !sameOrdered(diagramArtifact.sourceArtifactIds, [modelId, bundleId, reviewId]) ||
    diagramPayload.sourceHldDesignModelArtifactId !== modelId ||
    diagramPayload.sourceHldSourceBundleArtifactId !== bundleId ||
    diagramPayload.sourceModelVersion !== modelArtifact.version
  ) {
    return { status: "precondition_failed", code: "source_chain_mismatch" };
  }

  const review = await getProjectArtifactById(tenantId, projectId, reviewId);
  if (!isActiveReviewOnStage(review, projectId)) {
    return { status: "precondition_failed", code: "source_review_unavailable" };
  }
  if (!sameOrdered((review as ProjectArtifact).sourceArtifactIds, [modelId, bundleId])) {
    return { status: "precondition_failed", code: "source_chain_mismatch" };
  }

  // Build the final manual-upload payload from the SE-provided body + coarse ids.
  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const documentModelId = documentModelArtifact.id;
  const payload: RfpHldDocumentPayload = {
    payloadKind: RFP_HLD_DOCUMENT_PAYLOAD_KIND,
    sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE,
    createdAt,
    createdBy,
    title: str(input.title),
    uploadedFileName: str(input.uploadedFileName),
    drawioXml: str(input.drawioXml),
    sourceArtifactIds: [bundleId, modelId, diagramId, documentModelId],
    sourceHldSourceBundleArtifactId: bundleId,
    sourceHldDesignModelArtifactId: modelId,
    sourceHldDiagramArtifactId: diagramId,
    sourceHldDocumentModelArtifactId: documentModelId,
    sourceBundleVersion: bundleArtifact.version,
    sourceModelVersion: modelArtifact.version,
    sourceDiagramVersion: diagramArtifact.version,
    sourceDocumentModelVersion: documentModelArtifact.version,
    finalAuthority: {
      authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND,
      effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
    },
    supersedesArtifactIds: [diagramId, documentModelId],
    ...(str(input.note).trim() !== "" ? { note: str(input.note).trim() } : {}),
  };

  // HARD GATE: the manual upload must validate before any persistence.
  const validation = validateRfpHldDocumentPayload(payload);
  if (!validation.valid) {
    return { status: "invalid_payload", errors: [...validation.errors] };
  }

  const artifact = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: HLD_STAGE,
    type: DOCUMENT_TYPE,
    status: "needs_review",
    payload: payload as unknown as Record<string, unknown>,
    sourceFileIds: [],
    sourceArtifactIds: [bundleId, modelId, diagramId, documentModelId],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}
