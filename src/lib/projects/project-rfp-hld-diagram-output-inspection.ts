/**
 * RFP HLD DIAGRAM OUTPUT inspection read model (Stage 6I-B).
 *
 * Read-only list/detail over internal `hld_diagram_output` artifacts on the
 * `hld_design_delta_review` stage. The output is a deterministic layout projection of
 * a single approved `hld_diagram` for engineer review. This surface approves nothing,
 * runs no generation, renders no draw.io XML/markup/download, and carries no
 * SKU/pricing/catalog/configuration/AI authority. List returns lean artifact summaries
 * plus counts-only payload summaries. Detail validates the persisted payload with the
 * Stage 6I-A fail-closed contract validator and returns a sanitized whitelist of the
 * diagram-output contract fields only.
 *
 * It never surfaces tenant ids, raw file refs, file/storage paths, raw
 * document/evidence text, upstream payload bodies, provider data, or any
 * final/customer-deliverable body. Imports exactly: the project + artifact stores, the
 * diagram-output contract, and canonical project types.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import {
  validateRfpHldDiagramOutputPayload,
  type RfpHldDiagramOutputPayload,
} from "@/lib/projects/project-rfp-hld-diagram-output";
import type { Project, ProjectArtifact } from "@/types/project";

const OUTPUT_TYPE: ProjectArtifact["type"] = "hld_diagram_output";
const OUTPUT_STAGE: ProjectArtifact["stageId"] = "hld_design_delta_review";

// ---- project + artifact summaries ------------------------------------------

export interface RfpHldDiagramOutputInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Lean artifact metadata: no payload body and no source-file refs. */
export interface RfpHldDiagramOutputInspectionArtifactSummary {
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

export interface RfpHldDiagramOutputInspectionPayloadSummary {
  payloadKind: string;
  outputFormat: string;
  diagramType: string;
  title: string;
  nodeCount: number;
  linkCount: number;
  zoneCount: number;
  validationFindingCount: number;
  sourceHldDiagramArtifactId: string;
  sourceDiagramVersion: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface RfpHldDiagramOutputInspectionListItem
  extends RfpHldDiagramOutputInspectionArtifactSummary {
  payloadSummary: RfpHldDiagramOutputInspectionPayloadSummary;
}

// ---- detail (sanitized whitelist of the contract fields only) --------------

export type RfpHldDiagramOutputInspectionDetail = RfpHldDiagramOutputPayload;

// ---- list result -----------------------------------------------------------

export interface LoadRfpHldDiagramOutputListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpHldDiagramOutputListResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDiagramOutputInspectionProjectSummary }
  | {
      status: "ok";
      project: RfpHldDiagramOutputInspectionProjectSummary;
      artifacts: RfpHldDiagramOutputInspectionListItem[];
      artifactCount: number;
    };

// ---- detail result ---------------------------------------------------------

export interface LoadRfpHldDiagramOutputDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpHldDiagramOutputDetailResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpHldDiagramOutputInspectionProjectSummary }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_hld_diagram_output";
      artifact: RfpHldDiagramOutputInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpHldDiagramOutputInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpHldDiagramOutputInspectionProjectSummary;
      artifact: RfpHldDiagramOutputInspectionArtifactSummary;
      diagramOutput: RfpHldDiagramOutputInspectionDetail;
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

function toProjectSummary(project: Project): RfpHldDiagramOutputInspectionProjectSummary {
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
): RfpHldDiagramOutputInspectionArtifactSummary {
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

/** Lean list summary: counts + provenance only, never a payload body. */
function toListPayloadSummary(
  payload: unknown
): RfpHldDiagramOutputInspectionPayloadSummary {
  const r = toRecord(payload);
  const canvas = toRecord(r.canvas);
  return {
    payloadKind: asString(r.payloadKind),
    outputFormat: asString(r.outputFormat),
    diagramType: asString(r.diagramType),
    title: asString(r.title),
    nodeCount: countArray(r.nodes),
    linkCount: countArray(r.links),
    zoneCount: countArray(r.zones),
    validationFindingCount: countArray(r.validationFindings),
    sourceHldDiagramArtifactId: asString(r.sourceHldDiagramArtifactId),
    sourceDiagramVersion: asNumber(r.sourceDiagramVersion),
    canvasWidth: asNumber(canvas.width),
    canvasHeight: asNumber(canvas.height),
  };
}

/**
 * Reconstruct a clean detail by explicitly picking only the whitelisted diagram-output
 * contract fields, dropping any leakable extra keys. Validation has already proven the
 * contract shape; every value here is structured layout data (ids, labels, geometry,
 * coarse source pointers), never a tenant id, file path, upstream body, or final body.
 */
function toOutputDetail(
  p: RfpHldDiagramOutputPayload
): RfpHldDiagramOutputInspectionDetail {
  return {
    payloadKind: p.payloadKind,
    createdAt: p.createdAt,
    createdBy: p.createdBy,
    sourceArtifactIds: [...p.sourceArtifactIds],
    sourceHldDiagramArtifactId: p.sourceHldDiagramArtifactId,
    sourceDiagramVersion: p.sourceDiagramVersion,
    outputFormat: p.outputFormat,
    diagramType: p.diagramType,
    title: p.title,
    canvas: {
      width: p.canvas.width,
      height: p.canvas.height,
      ...(p.canvas.gridSize !== undefined ? { gridSize: p.canvas.gridSize } : {}),
    },
    zones: p.zones.map((z) => ({
      id: z.id,
      label: z.label,
      geometry: { ...z.geometry },
      sourceRefIds: [...z.sourceRefIds],
    })),
    nodes: p.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      ...(n.zoneId !== undefined ? { zoneId: n.zoneId } : {}),
      geometry: { ...n.geometry },
      sourceRefIds: [...n.sourceRefIds],
    })),
    links: p.links.map((l) => ({
      id: l.id,
      sourceNodeId: l.sourceNodeId,
      targetNodeId: l.targetNodeId,
      ...(l.label !== undefined ? { label: l.label } : {}),
      sourceRefIds: [...l.sourceRefIds],
    })),
    validationFindings: p.validationFindings.map((f) => ({
      id: f.id,
      code: f.code,
      message: f.message,
      severity: f.severity,
      sourceRefIds: [...f.sourceRefIds],
    })),
  };
}

// ---- public API ------------------------------------------------------------

/**
 * List internal `hld_diagram_output` artifacts (lean, counts-only) for a tenant's RFP
 * project. Reads only; creates no artifact or approval and never surfaces a payload
 * body.
 */
export async function loadRfpHldDiagramOutputList(
  input: LoadRfpHldDiagramOutputListInput
): Promise<LoadRfpHldDiagramOutputListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const rows = await listProjectArtifactsByType(tenantId, projectId, OUTPUT_TYPE);
  const artifacts = rows
    .filter(
      (row) =>
        row.projectId === projectId &&
        row.type === OUTPUT_TYPE &&
        row.stageId === OUTPUT_STAGE
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
 * Read the EXACT `hld_diagram_output` artifact named by id for engineer inspection.
 * Tenant/project scoped at the store boundary; the payload is gated by the Stage 6I-A
 * validator and returned as a sanitized whitelist only.
 */
export async function loadRfpHldDiagramOutputDetail(
  input: LoadRfpHldDiagramOutputDetailInput
): Promise<LoadRfpHldDiagramOutputDetailResult> {
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
  if (artifact.type !== OUTPUT_TYPE || artifact.stageId !== OUTPUT_STAGE) {
    return {
      status: "artifact_not_hld_diagram_output",
      artifact: toArtifactSummary(artifact),
    };
  }

  const validation = validateRfpHldDiagramOutputPayload(artifact.payload);
  if (!validation.ok) {
    return { status: "invalid_payload", artifact: toArtifactSummary(artifact) };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    diagramOutput: toOutputDetail(
      artifact.payload as unknown as RfpHldDiagramOutputPayload
    ),
  };
}
