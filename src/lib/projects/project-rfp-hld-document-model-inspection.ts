/**
 * RFP HLD DOCUMENT MODEL inspection read model (Stage 6H-A-003a).
 *
 * Read-only list/detail over internal `hld_document_model` artifacts on the
 * `hld_design_delta_review` stage. The document model is a deterministic structured
 * spine of an approved `hld_design_model` and its approved `hld_diagram`, compiled
 * over the approved `hld_source_bundle`, for engineer review BEFORE any final HLD
 * document is rendered. This surface never approves a model, runs no generation,
 * renders no document/diagram markup, and carries no SKU/pricing/catalog/
 * configuration/AI authority. List returns lean artifact summaries plus counts-only
 * payload summaries. Detail validates the persisted payload with the Stage 6H-A-001
 * fail-closed contract validator and returns a sanitized whitelist of the
 * document-model contract fields only.
 *
 * It never surfaces tenant ids, raw file refs, file/storage paths, raw document/
 * evidence text, model/bundle/diagram payload bodies, or any final-output body.
 * Imports exactly: the project + artifact stores, the document-model contract, and
 * canonical project types - no provider/AI adapter, raw file/evidence loader,
 * catalog/pricing/SKU/config service, UI/route, or approval service.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import {
  validateRfpHldDocumentModelPayload,
  type RfpHldDocumentModelDiagramReference,
  type RfpHldDocumentModelPayload,
  type RfpHldDocumentModelSummarySection,
  type RfpHldDocumentModelTextEntry,
  type RfpHldDocumentModelTraceSummary,
  type RfpHldDocumentModelValidationFinding,
} from "@/lib/projects/project-rfp-hld-document-model";
import type { Project, ProjectArtifact } from "@/types/project";

const DOCUMENT_MODEL_TYPE: ProjectArtifact["type"] = "hld_document_model";
const DOCUMENT_MODEL_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";

// ---- project + artifact summaries ------------------------------------------

export interface RfpHldDocumentModelInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Lean artifact metadata: no payload body and no source-file refs. */
export interface RfpHldDocumentModelInspectionArtifactSummary {
  id: string;
  projectId: string;
  stageId: ProjectArtifact["stageId"];
  type: ProjectArtifact["type"];
  status: ProjectArtifact["status"];
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ---- list payload summary (counts/provenance only, no body) ----------------

export interface RfpHldDocumentModelInspectionPayloadSummary {
  payloadKind: string;
  title: string;
  coveredDomainCount: number;
  excludedDomainCount: number;
  assumptionCount: number;
  designSummaryCount: number;
  topologySummaryCount: number;
  siteOrScopeSummaryCount: number;
  implementationNoteCount: number;
  dependencyCount: number;
  riskCount: number;
  complianceTraceCount: number;
  boqTraceCount: number;
  diagramReferenceCount: number;
  validationFindingCount: number;
  sourceHldSourceBundleArtifactId: string;
  sourceHldDesignModelArtifactId: string;
  sourceHldDiagramArtifactId: string;
  sourceModelVersion: number;
  sourceDiagramVersion: number;
}

export interface RfpHldDocumentModelInspectionListItem
  extends RfpHldDocumentModelInspectionArtifactSummary {
  payloadSummary: RfpHldDocumentModelInspectionPayloadSummary;
}

// ---- detail (sanitized whitelist of the contract fields only) --------------

export type RfpHldDocumentModelInspectionDetail = RfpHldDocumentModelPayload;

// ---- list result -----------------------------------------------------------

export interface LoadRfpHldDocumentModelListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldDocumentModelListResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDocumentModelInspectionProjectSummary }
  | {
      status: "ok";
      project: RfpHldDocumentModelInspectionProjectSummary;
      artifacts: RfpHldDocumentModelInspectionListItem[];
      artifactCount: number;
    };

// ---- detail result ---------------------------------------------------------

export interface LoadRfpHldDocumentModelDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldDocumentModelDetailResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDocumentModelInspectionProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_document_model";
      artifact: RfpHldDocumentModelInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldDocumentModelInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldDocumentModelInspectionProjectSummary;
      artifact: RfpHldDocumentModelInspectionArtifactSummary;
      documentModel: RfpHldDocumentModelInspectionDetail;
    };

// ---- helpers ---------------------------------------------------------------

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function toProjectSummary(
  project: Project
): RfpHldDocumentModelInspectionProjectSummary {
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
): RfpHldDocumentModelInspectionArtifactSummary {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    stageId: artifact.stageId,
    type: artifact.type,
    status: artifact.status,
    version: artifact.version,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

/** Lean list summary: counts + provenance ids only, never a payload body. */
function toListPayloadSummary(
  payload: unknown
): RfpHldDocumentModelInspectionPayloadSummary {
  const r = toRecord(payload);
  return {
    payloadKind: asString(r.payloadKind),
    title: asString(r.title),
    coveredDomainCount: countArray(r.coveredDomains),
    excludedDomainCount: countArray(r.excludedDomains),
    assumptionCount: countArray(r.assumptions),
    designSummaryCount: countArray(r.designSummary),
    topologySummaryCount: countArray(r.topologySummary),
    siteOrScopeSummaryCount: countArray(r.siteOrScopeSummary),
    implementationNoteCount: countArray(r.implementationNotes),
    dependencyCount: countArray(r.dependencies),
    riskCount: countArray(r.risksAndCaveats),
    complianceTraceCount: countArray(r.complianceTraceSummary),
    boqTraceCount: countArray(r.boqTraceSummary),
    diagramReferenceCount: countArray(r.diagramReferences),
    validationFindingCount: countArray(r.validationFindings),
    sourceHldSourceBundleArtifactId: asString(r.sourceHldSourceBundleArtifactId),
    sourceHldDesignModelArtifactId: asString(r.sourceHldDesignModelArtifactId),
    sourceHldDiagramArtifactId: asString(r.sourceHldDiagramArtifactId),
    sourceModelVersion: asNumber(r.sourceModelVersion),
    sourceDiagramVersion: asNumber(r.sourceDiagramVersion),
  };
}

function toTextEntry(
  e: RfpHldDocumentModelTextEntry
): RfpHldDocumentModelTextEntry {
  return { id: e.id, text: e.text, sourceRefIds: [...e.sourceRefIds] };
}

function toSummarySection(
  s: RfpHldDocumentModelSummarySection
): RfpHldDocumentModelSummarySection {
  return {
    id: s.id,
    title: s.title,
    items: s.items.map(toTextEntry),
    sourceRefIds: [...s.sourceRefIds],
  };
}

function toTraceSummary(
  t: RfpHldDocumentModelTraceSummary
): RfpHldDocumentModelTraceSummary {
  return {
    id: t.id,
    label: t.label,
    referencedCount: t.referencedCount,
    sourceRefIds: [...t.sourceRefIds],
  };
}

function toDiagramReference(
  d: RfpHldDocumentModelDiagramReference
): RfpHldDocumentModelDiagramReference {
  return {
    id: d.id,
    diagramArtifactId: d.diagramArtifactId,
    diagramTitle: d.diagramTitle,
    diagramType: d.diagramType,
    sourceRefIds: [...d.sourceRefIds],
  };
}

function toFinding(
  f: RfpHldDocumentModelValidationFinding
): RfpHldDocumentModelValidationFinding {
  return {
    id: f.id,
    severity: f.severity,
    code: f.code,
    message: f.message,
    sourceRefIds: [...f.sourceRefIds],
  };
}

/**
 * Reconstruct a clean detail by explicitly picking only the whitelisted
 * document-model contract fields, dropping any leakable extra keys. Validation has
 * already proven the contract shape; every value here is structured document-model
 * data (ids, labels, structured text, counts, coarse artifact pointers), never a
 * tenant id, file path, model/bundle/diagram body, or final-output body.
 */
function toDocumentModelDetail(
  p: RfpHldDocumentModelPayload
): RfpHldDocumentModelInspectionDetail {
  return {
    payloadKind: p.payloadKind,
    createdAt: p.createdAt,
    createdBy: p.createdBy,
    sourceArtifactIds: [...p.sourceArtifactIds],
    sourceHldSourceBundleArtifactId: p.sourceHldSourceBundleArtifactId,
    sourceHldDesignModelArtifactId: p.sourceHldDesignModelArtifactId,
    sourceHldDiagramArtifactId: p.sourceHldDiagramArtifactId,
    sourceModelVersion: p.sourceModelVersion,
    sourceDiagramVersion: p.sourceDiagramVersion,
    title: p.title,
    documentPurpose: p.documentPurpose,
    coveredDomains: [...p.coveredDomains],
    excludedDomains: [...p.excludedDomains],
    assumptions: p.assumptions.map(toTextEntry),
    designSummary: p.designSummary.map(toSummarySection),
    topologySummary: p.topologySummary.map(toSummarySection),
    siteOrScopeSummary: p.siteOrScopeSummary.map(toSummarySection),
    implementationNotes: p.implementationNotes.map(toTextEntry),
    dependencies: p.dependencies.map(toTextEntry),
    risksAndCaveats: p.risksAndCaveats.map(toTextEntry),
    complianceTraceSummary: p.complianceTraceSummary.map(toTraceSummary),
    boqTraceSummary: p.boqTraceSummary.map(toTraceSummary),
    diagramReferences: p.diagramReferences.map(toDiagramReference),
    validationFindings: p.validationFindings.map(toFinding),
  };
}

// ---- public API ------------------------------------------------------------

/**
 * List internal `hld_document_model` artifacts (lean, counts-only) for a tenant's
 * RFP project. Reads only; creates no artifact or approval and never surfaces a
 * full payload body.
 */
export async function loadRfpHldDocumentModelList(
  input: LoadRfpHldDocumentModelListInput
): Promise<LoadRfpHldDocumentModelListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const rows = await listProjectArtifactsByType(tenantId, projectId, DOCUMENT_MODEL_TYPE);
  const artifacts = rows
    .filter(
      (row) =>
        row.projectId === projectId &&
        row.type === DOCUMENT_MODEL_TYPE &&
        row.stageId === DOCUMENT_MODEL_STAGE
    )
    .map((row) => ({
      ...toArtifactSummary(row),
      payloadSummary: toListPayloadSummary(row.payload),
    }));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

/**
 * Read the EXACT `hld_document_model` artifact named by id for engineer inspection.
 * Tenant/project scoped at the store boundary; the payload is gated by the Stage
 * 6H-A-001 validator and returned as a sanitized whitelist only.
 */
export async function loadRfpHldDocumentModelDetail(
  input: LoadRfpHldDocumentModelDetailInput
): Promise<LoadRfpHldDocumentModelDetailResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (!input.artifactId || input.artifactId.trim() === "") {
    throw new Error("artifactId is required.");
  }

  const { tenantId, projectId, artifactId } = input;
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
  if (artifact.type !== DOCUMENT_MODEL_TYPE || artifact.stageId !== DOCUMENT_MODEL_STAGE) {
    return {
      status: "artifact_not_hld_document_model",
      artifact: toArtifactSummary(artifact),
    };
  }

  const validation = validateRfpHldDocumentModelPayload(artifact.payload);
  if (!validation.valid) {
    return { status: "invalid_payload", artifact: toArtifactSummary(artifact) };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    documentModel: toDocumentModelDetail(
      artifact.payload as unknown as RfpHldDocumentModelPayload
    ),
  };
}
