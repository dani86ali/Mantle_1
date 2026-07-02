/**
 * Tenant-scoped deterministic RFP HLD GENERATED FINAL DOCUMENT service (Stage G3).
 *
 * Records exactly ONE reviewable (`needs_review`) FINAL `hld_document` artifact on the
 * existing `hld_design_delta_review` stage as an SE-approvable GENERATED draw.io output.
 * The client (via an authenticated route/session) supplies ONLY the approved source
 * `hld_document_model` artifact id; tenant/project/createdBy come from the session alone,
 * and the draw.io XML, source ids, versions, status, title, file name, and authority are
 * all derived deterministically here - never caller supplied.
 *
 * The flow is fail-closed: verify the project within its tenant, gate rfp mode, consult
 * the shared final-authority REGENERATION GUARD (so an already-approved final HLD - a
 * generated document OR a manual upload - is never silently regenerated), then re-prove
 * the SAME approved source chain the manual-upload lane uses (approved document model
 * whose row/payload source ids equal [bundle, model, diagram], plus the approved bundle,
 * design model, diagram, and active review with all obvious ties/versions). It then
 * requires an approved HLD-stage `hld_diagram_output` tied to THIS approved diagram at
 * its reviewed version (returning precondition_failed / diagram_output_unavailable and
 * writing nothing when none qualifies), builds a deterministic draw.io mxfile from that
 * REVIEWED diagram-output layout (never a re-layout of the diagram), persists the extra
 * diagram-output source id/version, HARD-GATEs the `rfp_hld_document` payload with the
 * Stage 6H-0I-A contract validator BEFORE any write, and persists exactly one artifact.
 * The response returns lean summaries only and NEVER the draw.io XML, an upstream payload
 * body, or the tenant id.
 *
 * This service reads only Project state through the project/artifact stores and the
 * read-only regeneration guard. It reads NO raw RFP/PDF/DOCX/XLSX file, storage path,
 * evidence/file store, or parser; constructs NO provider adapter and imports NO
 * provider/AI SDK; makes NO pricing/SKU/catalog/configuration decision; and approves
 * nothing - human approval is the only path to runtime/customer HLD authority.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import {
  validateRfpHldDiagramOutputPayload,
  type RfpHldDiagramOutputPayload,
} from "@/lib/projects/project-rfp-hld-diagram-output";
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
  RFP_HLD_DOCUMENT_AUTHORITY_KIND_GENERATED,
  RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
  RFP_HLD_DOCUMENT_PAYLOAD_KIND,
  RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED,
  validateRfpHldDocumentPayload,
  type RfpHldDocumentAuthorityKind,
  type RfpHldDocumentPayload,
  type RfpHldDocumentSourceMode,
} from "@/lib/projects/project-rfp-hld-document";
import {
  evaluateRfpHldFinalAuthorityRegenerationGuard,
  type RfpHldFinalAuthorityRegenerationSummary,
} from "@/lib/projects/project-rfp-hld-final-authority-regeneration-guard";
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
const DIAGRAM_OUTPUT_TYPE: ProjectArtifactType = "hld_diagram_output";
const DOCUMENT_MODEL_TYPE: ProjectArtifactType = "hld_document_model";
const DOCUMENT_TYPE: ProjectArtifactType = "hld_document";
const ACTIVE_REVIEW_STATUSES: ReadonlySet<ProjectArtifactStatus> =
  new Set<ProjectArtifactStatus>(["generated", "needs_review", "approved"]);

/** Deterministic, server-derived title + file name for a generated final HLD document. */
const GENERATED_TITLE = "Final HLD (Generated)";
const GENERATED_FILE_NAME = "hld-generated.drawio";

// ---------------------------------------------------------------------------
// Result + summary shapes (lean, serializable, never carry a payload body / tenant)
// ---------------------------------------------------------------------------

export interface RfpHldGeneratedProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpHldGeneratedArtifactSummary {
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
export interface RfpHldGeneratedPayloadSummary {
  payloadKind: typeof RFP_HLD_DOCUMENT_PAYLOAD_KIND;
  sourceMode: RfpHldDocumentSourceMode;
  title: string;
  uploadedFileName: string;
  drawioXmlLength: number;
  authorityKind: RfpHldDocumentAuthorityKind;
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
  sourceHldDiagramOutputArtifactId: string;
  sourceDiagramOutputVersion: number;
}

export type RfpHldGeneratedPreconditionCode =
  | "diagram_output_unavailable"
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

export interface CreateRfpHldDocumentGeneratedInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** The approved source `hld_document_model` artifact id (client-provided). */
  documentModelArtifactId: string;
  /** Optional fixed timestamp for deterministic callers/tests; defaults to now. */
  createdAt?: Date;
}

export type CreateRfpHldDocumentGeneratedResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldGeneratedProjectSummary }
  | {
      status: "final_hld_already_approved";
      finalAuthority: RfpHldFinalAuthorityRegenerationSummary;
    }
  | { status: "precondition_failed"; code: RfpHldGeneratedPreconditionCode }
  | { status: "invalid_payload"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpHldGeneratedArtifactSummary;
      payloadSummary: RfpHldGeneratedPayloadSummary;
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

function toProjectSummary(project: Project): RfpHldGeneratedProjectSummary {
  return {
    id: project.id,
    name: project.name,
    ...(project.customerName !== undefined ? { customerName: project.customerName } : {}),
    mode: project.mode,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toArtifactSummary(artifact: ProjectArtifact): RfpHldGeneratedArtifactSummary {
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

function toPayloadSummary(p: RfpHldDocumentPayload): RfpHldGeneratedPayloadSummary {
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
    sourceHldDiagramOutputArtifactId: p.sourceHldDiagramOutputArtifactId as string,
    sourceDiagramOutputVersion: p.sourceDiagramOutputVersion as number,
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

/** Newest by highest version, then latest createdAt. Never called on []. */
function selectNewest(artifacts: ProjectArtifact[]): ProjectArtifact {
  return artifacts.reduce((best, cur) => {
    if (cur.version !== best.version) return cur.version > best.version ? cur : best;
    return cur.createdAt.getTime() > best.createdAt.getTime() ? cur : best;
  });
}

/**
 * A qualifying approved hld_diagram_output for this generated document: same project,
 * HLD stage, type hld_diagram_output, status approved, a valid diagram-output payload,
 * and BOTH the row and payload single-source ties resolving to the approved diagram at
 * the exact reviewed version (row sourceArtifactIds [diagramId], payload sourceArtifactIds
 * [diagramId], payload.sourceHldDiagramArtifactId === diagramId, payload.sourceDiagramVersion
 * === diagramVersion). No pricing/SKU/catalog/config decision is made here.
 */
function isQualifyingDiagramOutput(
  artifact: ProjectArtifact,
  projectId: string,
  diagramId: string,
  diagramVersion: number
): boolean {
  if (!isApprovedTypeOnStage(artifact, projectId, DIAGRAM_OUTPUT_TYPE)) return false;
  if (!sameOrdered(artifact.sourceArtifactIds, [diagramId])) return false;
  if (!validateRfpHldDiagramOutputPayload(artifact.payload).ok) return false;
  const p = artifact.payload as unknown as RfpHldDiagramOutputPayload;
  return (
    sameOrdered(p.sourceArtifactIds, [diagramId]) &&
    p.sourceHldDiagramArtifactId === diagramId &&
    p.sourceDiagramVersion === diagramVersion
  );
}

/** Escape a label for safe inclusion inside double-quoted XML attribute values. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a deterministic, well-formed draw.io mxfile from the REVIEWED diagram-output
 * layout ONLY - its node/link geometry and labels, NOT a re-layout of the hld_diagram.
 * Node cell ids are positional (`n0`, `n1`, ...) so arbitrary payload ids never reach an
 * attribute; every label is escaped and every geometry coordinate is the output model's.
 * It carries no scripts, entities, or pricing/SKU/catalog/config data - just the reviewed
 * layout as an mxGraphModel.
 */
function buildDrawioXml(output: RfpHldDiagramOutputPayload): string {
  const nodeIndex = new Map<string, number>();
  output.nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  const cells: string[] = [];
  output.nodes.forEach((n, i) => {
    const g = n.geometry;
    cells.push(
      `<mxCell id="n${i}" value="${escapeXml(n.label)}" vertex="1" parent="1">` +
        `<mxGeometry x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" as="geometry"/></mxCell>`
    );
  });
  output.links.forEach((l, i) => {
    const from = nodeIndex.get(l.sourceNodeId);
    const to = nodeIndex.get(l.targetNodeId);
    if (from === undefined || to === undefined) return;
    const value = l.label !== undefined ? ` value="${escapeXml(l.label)}"` : "";
    cells.push(
      `<mxCell id="e${i}"${value} edge="1" parent="1" source="n${from}" target="n${to}">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`
    );
  });

  return (
    `<mxfile host="bomatic">` +
    `<diagram id="hld-topology" name="${escapeXml(GENERATED_TITLE)}">` +
    `<mxGraphModel><root>` +
    `<mxCell id="0"/><mxCell id="1" parent="0"/>` +
    cells.join("") +
    `</root></mxGraphModel></diagram></mxfile>`
  );
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Create exactly ONE final `needs_review` `hld_document` artifact on the
 * `hld_design_delta_review` stage as a deterministically GENERATED draw.io output,
 * tenant-scoped, only after every gate passes. Throws on blank projectId, createdBy, or
 * documentModelArtifactId before any store call. Returns explicit result statuses for
 * not_found, wrong_mode, final_hld_already_approved (writing nothing), precondition_failed
 * (writing nothing), invalid_payload (writing nothing), and ok. Never approves anything;
 * human approval is the only path to runtime/customer HLD authority, and an approved
 * manual upload is never regenerated over.
 */
export async function createRfpHldDocumentGenerated(
  input: CreateRfpHldDocumentGeneratedInput
): Promise<CreateRfpHldDocumentGeneratedResult> {
  const projectId = str(input.projectId).trim();
  const createdBy = str(input.createdBy).trim();
  const documentModelArtifactId = str(input.documentModelArtifactId).trim();
  if (projectId === "") throw new Error("Generated HLD document requires a projectId.");
  if (createdBy === "") throw new Error("Generated HLD document requires a createdBy.");
  if (documentModelArtifactId === "") {
    throw new Error("Generated HLD document requires a documentModelArtifactId.");
  }

  const { tenantId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // Never silently regenerate over an already-approved final HLD authority (generated
  // OR manual). The read-only guard blocks ONLY on a source-valid approved final doc.
  const guard = await evaluateRfpHldFinalAuthorityRegenerationGuard({ tenantId, projectId });
  if (guard.blocked) {
    return { status: "final_hld_already_approved", finalAuthority: guard.finalAuthority };
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

  // --- Approved diagram OUTPUT: the reviewed layout this generated document consumes ---
  // Require an approved HLD-stage hld_diagram_output tied to THIS approved diagram at its
  // reviewed version. The draw.io XML is built from that layout, never re-laid-out here.
  const outputs = await listProjectArtifactsByType(tenantId, projectId, DIAGRAM_OUTPUT_TYPE);
  const qualifying = outputs.filter((o) =>
    isQualifyingDiagramOutput(o, projectId, diagramId, diagramArtifact.version)
  );
  if (qualifying.length === 0) {
    return { status: "precondition_failed", code: "diagram_output_unavailable" };
  }
  const diagramOutputArtifact = selectNewest(qualifying);
  const diagramOutputPayload =
    diagramOutputArtifact.payload as unknown as RfpHldDiagramOutputPayload;

  // Build the generated final payload from the approved diagram OUTPUT + coarse ids.
  const createdAt = (input.createdAt ?? new Date()).toISOString();
  const documentModelId = documentModelArtifact.id;
  const diagramOutputId = diagramOutputArtifact.id;
  const payload: RfpHldDocumentPayload = {
    payloadKind: RFP_HLD_DOCUMENT_PAYLOAD_KIND,
    sourceMode: RFP_HLD_DOCUMENT_SOURCE_MODE_GENERATED,
    createdAt,
    createdBy,
    title: GENERATED_TITLE,
    uploadedFileName: GENERATED_FILE_NAME,
    drawioXml: buildDrawioXml(diagramOutputPayload),
    sourceArtifactIds: [bundleId, modelId, diagramId, diagramOutputId, documentModelId],
    sourceHldSourceBundleArtifactId: bundleId,
    sourceHldDesignModelArtifactId: modelId,
    sourceHldDiagramArtifactId: diagramId,
    sourceHldDocumentModelArtifactId: documentModelId,
    sourceBundleVersion: bundleArtifact.version,
    sourceModelVersion: modelArtifact.version,
    sourceDiagramVersion: diagramArtifact.version,
    sourceDocumentModelVersion: documentModelArtifact.version,
    sourceHldDiagramOutputArtifactId: diagramOutputId,
    sourceDiagramOutputVersion: diagramOutputArtifact.version,
    finalAuthority: {
      authorityKind: RFP_HLD_DOCUMENT_AUTHORITY_KIND_GENERATED,
      effectiveWhenArtifactStatus: RFP_HLD_DOCUMENT_AUTHORITY_STATUS,
    },
    supersedesArtifactIds: [diagramId, documentModelId],
  };

  // HARD GATE: the generated document must validate before any persistence.
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
    sourceArtifactIds: [bundleId, modelId, diagramId, diagramOutputId, documentModelId],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(payload),
  };
}
