/**
 * RFP HLD DIAGRAM DRAFT inspection read model (Stage 6G-A-001).
 *
 * Read-only list/detail over internal `hld_diagram` draft artifacts on the
 * `hld_design_delta_review` stage. The diagram draft is a deterministic projection
 * of an approved `hld_design_model` topology for engineer review. This surface
 * never approves a model, runs no generation, renders no document/diagram markup,
 * and carries no SKU/pricing/catalog/configuration/AI authority. List returns lean
 * artifact summaries plus counts-only payload summaries. Detail validates the
 * persisted payload with the Stage 6G-A-001 fail-closed contract validator and
 * returns a sanitized whitelist of the diagram-draft contract fields only.
 *
 * It never surfaces tenant ids, raw file refs, file/storage paths, raw
 * document/evidence text, model/bundle/review payload bodies, or any final-output
 * body. Imports exactly: the project + artifact stores, the diagram contract, and
 * canonical project types - no provider/AI adapter, raw file/evidence loader,
 * catalog/pricing/SKU/config service, UI/route, or approval service.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import {
  validateRfpHldDiagramDraftPayload,
  type RfpHldDiagramDraftDiagramType,
  type RfpHldDiagramDraftPayload,
  type RfpHldDiagramLink,
  type RfpHldDiagramNode,
  type RfpHldDiagramSourceReference,
  type RfpHldDiagramZone,
} from "@/lib/projects/project-rfp-hld-diagram";
import type { Project, ProjectArtifact } from "@/types/project";

const DIAGRAM_TYPE: ProjectArtifact["type"] = "hld_diagram";
const DIAGRAM_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";

// ---- project + artifact summaries ------------------------------------------

export interface RfpHldDiagramInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Lean artifact metadata: no payload body and no source-file refs. */
export interface RfpHldDiagramInspectionArtifactSummary {
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

export interface RfpHldDiagramInspectionPayloadSummary {
  payloadKind: string;
  diagramType: string;
  title: string;
  nodeCount: number;
  linkCount: number;
  zoneCount: number;
  sourceReferenceCount: number;
  validationFindingCount: number;
  sourceHldDesignModelArtifactId: string;
  sourceHldSourceBundleArtifactId: string;
  sourceReviewArtifactId: string;
  sourceModelVersion: number;
}

export interface RfpHldDiagramInspectionListItem
  extends RfpHldDiagramInspectionArtifactSummary {
  payloadSummary: RfpHldDiagramInspectionPayloadSummary;
}

// ---- detail (sanitized whitelist of the contract fields only) --------------

export type RfpHldDiagramInspectionDetail = RfpHldDiagramDraftPayload;

// ---- list result -----------------------------------------------------------

export interface LoadRfpHldDiagramListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldDiagramListResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDiagramInspectionProjectSummary }
  | {
      status: "ok";
      project: RfpHldDiagramInspectionProjectSummary;
      artifacts: RfpHldDiagramInspectionListItem[];
      artifactCount: number;
    };

// ---- detail result ---------------------------------------------------------

export interface LoadRfpHldDiagramDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldDiagramDetailResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDiagramInspectionProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_diagram";
      artifact: RfpHldDiagramInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldDiagramInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldDiagramInspectionProjectSummary;
      artifact: RfpHldDiagramInspectionArtifactSummary;
      diagram: RfpHldDiagramInspectionDetail;
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

function toProjectSummary(project: Project): RfpHldDiagramInspectionProjectSummary {
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
): RfpHldDiagramInspectionArtifactSummary {
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
function toListPayloadSummary(payload: unknown): RfpHldDiagramInspectionPayloadSummary {
  const r = toRecord(payload);
  return {
    payloadKind: asString(r.payloadKind),
    diagramType: asString(r.diagramType),
    title: asString(r.title),
    nodeCount: countArray(r.nodes),
    linkCount: countArray(r.links),
    zoneCount: countArray(r.zones),
    sourceReferenceCount: countArray(r.sourceReferences),
    validationFindingCount: countArray(r.validationFindings),
    sourceHldDesignModelArtifactId: asString(r.sourceHldDesignModelArtifactId),
    sourceHldSourceBundleArtifactId: asString(r.sourceHldSourceBundleArtifactId),
    sourceReviewArtifactId: asString(r.sourceReviewArtifactId),
    sourceModelVersion: asNumber(r.sourceModelVersion),
  };
}

/**
 * Reconstruct a clean detail by explicitly picking only the whitelisted
 * diagram-draft contract fields, dropping any leakable extra keys. Validation has
 * already proven the contract shape; every value here is structured diagram data
 * (ids, labels, types, coarse artifact pointers), never a tenant id, file path,
 * model body, or final-output body.
 */
function toDiagramDetail(p: RfpHldDiagramDraftPayload): RfpHldDiagramInspectionDetail {
  return {
    payloadKind: p.payloadKind,
    createdAt: p.createdAt,
    createdBy: p.createdBy,
    sourceArtifactIds: [...p.sourceArtifactIds],
    sourceHldDesignModelArtifactId: p.sourceHldDesignModelArtifactId,
    sourceHldSourceBundleArtifactId: p.sourceHldSourceBundleArtifactId,
    sourceReviewArtifactId: p.sourceReviewArtifactId,
    sourceModelVersion: p.sourceModelVersion,
    diagramType: p.diagramType as RfpHldDiagramDraftDiagramType,
    title: p.title,
    nodes: p.nodes.map((n: RfpHldDiagramNode) => ({
      id: n.id,
      label: n.label,
      nodeType: n.nodeType,
      ...(n.domain !== undefined ? { domain: n.domain } : {}),
      ...(n.zoneId !== undefined ? { zoneId: n.zoneId } : {}),
      sourceRefIds: [...n.sourceRefIds],
    })),
    links: p.links.map((l: RfpHldDiagramLink) => ({
      id: l.id,
      ...(l.label !== undefined ? { label: l.label } : {}),
      fromNodeId: l.fromNodeId,
      toNodeId: l.toNodeId,
      linkType: l.linkType,
      sourceRefIds: [...l.sourceRefIds],
    })),
    zones: p.zones.map((z: RfpHldDiagramZone) => ({
      id: z.id,
      label: z.label,
      nodeIds: [...z.nodeIds],
      sourceRefIds: [...z.sourceRefIds],
    })),
    sourceReferences: p.sourceReferences.map((ref: RfpHldDiagramSourceReference) => ({
      id: ref.id,
      artifactId: ref.artifactId,
      artifactType: ref.artifactType,
      ...(ref.sourcePath !== undefined ? { sourcePath: ref.sourcePath } : {}),
      ...(ref.label !== undefined ? { label: ref.label } : {}),
    })),
    validationFindings: p.validationFindings.map((f) => ({
      id: f.id,
      severity: f.severity,
      code: f.code,
      message: f.message,
      sourceRefIds: [...f.sourceRefIds],
    })),
  };
}

// ---- public API ------------------------------------------------------------

/**
 * List internal `hld_diagram` draft artifacts (lean, counts-only) for a tenant's
 * RFP project, ordered by version ascending. Reads only; creates no artifact or
 * approval and never surfaces a full payload body.
 */
export async function loadRfpHldDiagramList(
  input: LoadRfpHldDiagramListInput
): Promise<LoadRfpHldDiagramListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const rows = await listProjectArtifactsByType(tenantId, projectId, DIAGRAM_TYPE);
  const artifacts = rows
    .filter(
      (row) =>
        row.projectId === projectId &&
        row.type === DIAGRAM_TYPE &&
        row.stageId === DIAGRAM_STAGE
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
 * Read the EXACT `hld_diagram` draft artifact named by id for engineer inspection.
 * Tenant/project scoped at the store boundary; the payload is gated by the Stage
 * 6G-A-001 validator and returned as a sanitized whitelist only.
 */
export async function loadRfpHldDiagramDetail(
  input: LoadRfpHldDiagramDetailInput
): Promise<LoadRfpHldDiagramDetailResult> {
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
  if (artifact.type !== DIAGRAM_TYPE || artifact.stageId !== DIAGRAM_STAGE) {
    return { status: "artifact_not_hld_diagram", artifact: toArtifactSummary(artifact) };
  }

  const validation = validateRfpHldDiagramDraftPayload(artifact.payload);
  if (!validation.valid) {
    return { status: "invalid_payload", artifact: toArtifactSummary(artifact) };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    diagram: toDiagramDetail(artifact.payload as unknown as RfpHldDiagramDraftPayload),
  };
}
