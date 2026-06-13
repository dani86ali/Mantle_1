/**
 * RFP compliance-matrix inspection read model (Stage 4).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * Read-only engineer inspection over compliance_matrix artifact versions. The
 * list returns lean artifact summaries plus identifier/count payload summaries.
 * The detail returns one exact artifact version with whitelisted row fields,
 * locator-only evidence references, and descriptive configuration references.
 * It writes nothing, approves nothing, reads no files/evidence stores, calls no
 * AI, and never surfaces tenant ids, storage paths, pricing, catalog lookup, or
 * configuration authority fields.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import type {
  RfpComplianceMatrixConfigurationReference,
  RfpComplianceMatrixEvidenceReference,
  RfpComplianceMatrixPayload,
  RfpComplianceMatrixRow,
  RfpComplianceStatus,
} from "@/lib/projects/project-rfp-compliance-matrix";

const RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND: RfpComplianceMatrixPayload["payloadKind"] =
  "rfp_compliance_matrix";

const COMPLIANCE_MATRIX_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "compliance_matrix";
const COMPLIANCE_MATRIX_STAGE_ID: ProjectArtifact["stageId"] =
  "compliance_matrix_review";

const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

const RFP_COMPLIANCE_STATUSES: readonly RfpComplianceStatus[] = [
  "compliant",
  "partially_compliant",
  "non_compliant",
  "not_applicable",
  "needs_review",
];

export interface RfpComplianceMatrixInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

export interface RfpComplianceMatrixInspectionArtifactSummary {
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

export interface RfpComplianceMatrixInspectionPayloadSummary {
  payloadKind: string;
  sourceRequirementsBaselineArtifactId: string;
  sourceEvidencePackageArtifactId: string;
  sourceConfigurationExpansionArtifactId?: string;
  createdBy: string;
  createdAt: string;
  rowCount: number;
  rowIds: string[];
  requirementIds: string[];
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  statusCounts: Record<RfpComplianceStatus, number>;
}

export interface RfpComplianceMatrixInspectionListItem
  extends RfpComplianceMatrixInspectionArtifactSummary {
  payloadSummary: RfpComplianceMatrixInspectionPayloadSummary;
}

export interface LoadRfpComplianceMatrixListInput {
  tenantId: string;
  projectId: string;
}

export type LoadRfpComplianceMatrixListResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpComplianceMatrixInspectionProjectSummary;
    }
  | {
      status: "ok";
      project: RfpComplianceMatrixInspectionProjectSummary;
      artifacts: RfpComplianceMatrixInspectionListItem[];
      artifactCount: number;
    };

export interface RfpComplianceMatrixInspectionRow {
  id: string;
  requirementId: string;
  requirementText: string;
  category: string;
  priority: string;
  complianceStatus: string;
  response: string;
  rationale?: string;
  notes?: string;
  evidenceReferences: RfpComplianceMatrixEvidenceReference[];
  configurationReferences?: RfpComplianceMatrixConfigurationReference[];
}

export interface RfpComplianceMatrixInspectionMatrix {
  payloadKind: RfpComplianceMatrixPayload["payloadKind"];
  sourceRequirementsBaselineArtifactId: string;
  sourceEvidencePackageArtifactId: string;
  sourceConfigurationExpansionArtifactId?: string;
  createdBy: string;
  createdAt: string;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  rows: RfpComplianceMatrixInspectionRow[];
}

export interface LoadRfpComplianceMatrixDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

export type LoadRfpComplianceMatrixDetailResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpComplianceMatrixInspectionProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_compliance_matrix";
      artifact: RfpComplianceMatrixInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpComplianceMatrixInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpComplianceMatrixInspectionProjectSummary;
      artifact: RfpComplianceMatrixInspectionArtifactSummary;
      matrix: RfpComplianceMatrixInspectionMatrix;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asString(entry));
}

function emptyStatusCounts(): Record<RfpComplianceStatus, number> {
  const counts = {} as Record<RfpComplianceStatus, number>;
  for (const status of RFP_COMPLIANCE_STATUSES) counts[status] = 0;
  return counts;
}

function isComplianceStatus(value: string): value is RfpComplianceStatus {
  return (RFP_COMPLIANCE_STATUSES as readonly string[]).includes(value);
}

function toProjectSummary(
  project: Project
): RfpComplianceMatrixInspectionProjectSummary {
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

function toArtifactSummary(
  artifact: ProjectArtifact
): RfpComplianceMatrixInspectionArtifactSummary {
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

function toRowIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (isPlainRecord(entry) ? asString(entry.id) : ""));
}

function toRequirementIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) =>
    isPlainRecord(entry) ? asString(entry.requirementId) : ""
  );
}

function toStatusCounts(value: unknown): Record<RfpComplianceStatus, number> {
  const counts = emptyStatusCounts();
  if (!Array.isArray(value)) return counts;
  for (const entry of value) {
    if (!isPlainRecord(entry)) continue;
    const status = asString(entry.complianceStatus);
    if (isComplianceStatus(status)) counts[status] += 1;
  }
  return counts;
}

function toPayloadSummary(
  payload: unknown
): RfpComplianceMatrixInspectionPayloadSummary {
  const record = toRecord(payload);
  const sourceConfigurationExpansionArtifactId = asOptionalString(
    record.sourceConfigurationExpansionArtifactId
  );
  return {
    payloadKind: asString(record.payloadKind),
    sourceRequirementsBaselineArtifactId: asString(
      record.sourceRequirementsBaselineArtifactId
    ),
    sourceEvidencePackageArtifactId: asString(
      record.sourceEvidencePackageArtifactId
    ),
    ...(sourceConfigurationExpansionArtifactId !== undefined
      ? { sourceConfigurationExpansionArtifactId }
      : {}),
    createdBy: asString(record.createdBy),
    createdAt: asString(record.createdAt),
    rowCount: Array.isArray(record.rows) ? record.rows.length : 0,
    rowIds: toRowIds(record.rows),
    requirementIds: toRequirementIds(record.rows),
    sourceFileIds: toStringArray(record.sourceFileIds),
    sourceArtifactIds: toStringArray(record.sourceArtifactIds),
    statusCounts: toStatusCounts(record.rows),
  };
}

function toListItem(
  artifact: ProjectArtifact
): RfpComplianceMatrixInspectionListItem {
  return {
    ...toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(artifact.payload),
  };
}

function toEvidenceReference(entry: unknown): RfpComplianceMatrixEvidenceReference {
  const record = toRecord(entry);
  const base = {
    evidenceId: asString(record.evidenceId),
    sourceFileId: asString(record.sourceFileId),
    inputPackageArtifactId: asString(record.inputPackageArtifactId),
  };
  if (record.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(record.pageNumber);
    const sheetName = asOptionalString(record.sheetName);
    return {
      ...base,
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      tableId: asString(record.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(record.rowCount),
      columnCount: asCount(record.columnCount),
    };
  }
  return {
    ...base,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    chunkIndex: asCount(record.chunkIndex),
    chunkCount: asCount(record.chunkCount),
    charCount: asCount(record.charCount),
  };
}

function toEvidenceReferences(
  value: unknown
): RfpComplianceMatrixEvidenceReference[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toEvidenceReference(entry));
}

function toConfigurationReference(
  entry: unknown
): RfpComplianceMatrixConfigurationReference {
  const record = toRecord(entry);
  const origin =
    record.origin === "customer" || record.origin === "expansion"
      ? record.origin
      : undefined;
  const sku = asOptionalString(record.sku);
  const description = asOptionalString(record.description);
  const parentLineId = asOptionalString(record.parentLineId);
  const parentLineNumber = asOptionalString(record.parentLineNumber);
  const sourceFileId = asOptionalString(record.sourceFileId);
  const sourceRowNumber = asOptionalNumber(record.sourceRowNumber);
  const originalLineNumber = asOptionalString(record.originalLineNumber);
  return {
    configurationExpansionArtifactId: asString(
      record.configurationExpansionArtifactId
    ),
    lineId: asString(record.lineId),
    ...(origin !== undefined ? { origin } : {}),
    ...(sku !== undefined ? { sku } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(parentLineId !== undefined ? { parentLineId } : {}),
    ...(parentLineNumber !== undefined ? { parentLineNumber } : {}),
    ...(sourceFileId !== undefined ? { sourceFileId } : {}),
    ...(sourceRowNumber !== undefined ? { sourceRowNumber } : {}),
    ...(originalLineNumber !== undefined ? { originalLineNumber } : {}),
  };
}

function toConfigurationReferences(
  value: unknown
): RfpComplianceMatrixConfigurationReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => toConfigurationReference(entry));
}

function toRow(entry: unknown): RfpComplianceMatrixInspectionRow {
  const record = toRecord(entry);
  const rationale = asOptionalString(record.rationale);
  const notes = asOptionalString(record.notes);
  const configurationReferences = toConfigurationReferences(
    record.configurationReferences
  );
  return {
    id: asString(record.id),
    requirementId: asString(record.requirementId),
    requirementText: asString(record.requirementText),
    category: asString(record.category),
    priority: asString(record.priority),
    complianceStatus: asString(record.complianceStatus),
    response: asString(record.response),
    ...(rationale !== undefined ? { rationale } : {}),
    ...(notes !== undefined ? { notes } : {}),
    evidenceReferences: toEvidenceReferences(record.evidenceReferences),
    ...(configurationReferences !== undefined
      ? { configurationReferences }
      : {}),
  };
}

export async function loadRfpComplianceMatrixList(
  input: LoadRfpComplianceMatrixListInput
): Promise<LoadRfpComplianceMatrixListResult> {
  if (!input.projectId || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }

  const { tenantId, projectId } = input;
  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const rows = await listProjectArtifactsByType(
    tenantId,
    projectId,
    COMPLIANCE_MATRIX_ARTIFACT_TYPE
  );
  const artifacts = rows
    .filter((row) => row.type === COMPLIANCE_MATRIX_ARTIFACT_TYPE)
    .map((row) => toListItem(row));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

export async function loadRfpComplianceMatrixDetail(
  input: LoadRfpComplianceMatrixDetailInput
): Promise<LoadRfpComplianceMatrixDetailResult> {
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

  const artifact = await getProjectArtifactById(
    tenantId,
    projectId,
    artifactId
  );
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

  const payload = toRecord(artifact.payload);
  const rows = payload.rows;
  if (
    payload.payloadKind !== RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND ||
    !Array.isArray(rows) ||
    rows.some((entry) => !isPlainRecord(entry))
  ) {
    return {
      status: "invalid_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  const sourceConfigurationExpansionArtifactId = asOptionalString(
    payload.sourceConfigurationExpansionArtifactId
  );
  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    matrix: {
      payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
      sourceRequirementsBaselineArtifactId: asString(
        payload.sourceRequirementsBaselineArtifactId
      ),
      sourceEvidencePackageArtifactId: asString(
        payload.sourceEvidencePackageArtifactId
      ),
      ...(sourceConfigurationExpansionArtifactId !== undefined
        ? { sourceConfigurationExpansionArtifactId }
        : {}),
      createdBy: asString(payload.createdBy),
      createdAt: asString(payload.createdAt),
      sourceFileIds: toStringArray(payload.sourceFileIds),
      sourceArtifactIds: toStringArray(payload.sourceArtifactIds),
      rows: (rows as RfpComplianceMatrixRow[]).map((entry) => toRow(entry)),
    },
  };
}
