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
  RfpComplianceImpactLevel,
  RfpComplianceMatrixConfigurationReference,
  RfpComplianceMatrixEvidenceReference,
  RfpComplianceMatrixPayload,
  RfpComplianceMatrixReviewEvent,
  RfpComplianceMatrixRow,
  RfpComplianceReviewAction,
  RfpComplianceReviewLane,
  RfpComplianceRowReviewStatus,
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

/**
 * Stage 5 review whitelists, declared locally as runtime values because the
 * compliance-matrix contract is imported type-only (importing its runtime
 * constants would widen this read model's import surface). Kept in sync with the
 * contract unions; the readonly element type makes a drifted literal a compile
 * error.
 */
const RFP_COMPLIANCE_REVIEW_LANES: readonly RfpComplianceReviewLane[] = [
  "technical",
  "commercial",
  "legal",
  "project_delivery",
  "security",
  "safety",
  "vendor",
  "customer",
  "other",
];

const RFP_COMPLIANCE_IMPACT_LEVELS: readonly RfpComplianceImpactLevel[] = [
  "none",
  "potential",
  "required",
  "owner_review_required",
];

const RFP_COMPLIANCE_ROW_REVIEW_STATUSES: readonly RfpComplianceRowReviewStatus[] =
  ["pending", "reviewed", "removed"];

const RFP_COMPLIANCE_REVIEW_ACTIONS: readonly RfpComplianceReviewAction[] = [
  "edited",
  "status_changed",
  "marked_not_applicable",
  "removed",
  "restored",
  "owner_review_requested",
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

/**
 * Optional Stage 5 review provenance stamped by the row-review service onto a
 * reviewed compliance_matrix version. Surfaced only when present and valid; a
 * freshly drafted (un-reviewed) payload omits every field.
 */
export interface RfpComplianceMatrixInspectionReviewProvenance {
  reviewedBy?: string;
  reviewedAt?: string;
  reviewedDecisionCount?: number;
  activeRowCount?: number;
  removedRowCount?: number;
  sourceComplianceMatrixArtifactId?: string;
  sourceComplianceMatrixArtifactVersion?: number;
}

export interface RfpComplianceMatrixInspectionPayloadSummary
  extends RfpComplianceMatrixInspectionReviewProvenance {
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
  /**
   * Optional Stage 5 engineer-owned review metadata, surfaced only when present
   * and valid. Lanes/impacts/status/history actions are whitelisted; malformed
   * stored values are dropped, never echoed. These are human review hints only -
   * never pricing, SKU, catalog, or configuration authority.
   */
  sectionReference?: string;
  responseLane?: RfpComplianceReviewLane;
  ownerLane?: RfpComplianceReviewLane;
  hldImpact?: RfpComplianceImpactLevel;
  tpImpact?: RfpComplianceImpactLevel;
  boqConfigImpact?: RfpComplianceImpactLevel;
  requiresOwnerReview?: boolean;
  rowReviewStatus?: RfpComplianceRowReviewStatus;
  notApplicableReason?: string;
  removedReason?: string;
  reviewHistory?: RfpComplianceMatrixReviewEvent[];
}

export interface RfpComplianceMatrixInspectionMatrix
  extends RfpComplianceMatrixInspectionReviewProvenance {
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

function asNonblankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
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

function asReviewLane(value: unknown): RfpComplianceReviewLane | undefined {
  return typeof value === "string" &&
    (RFP_COMPLIANCE_REVIEW_LANES as readonly string[]).includes(value)
    ? (value as RfpComplianceReviewLane)
    : undefined;
}

function asImpactLevel(value: unknown): RfpComplianceImpactLevel | undefined {
  return typeof value === "string" &&
    (RFP_COMPLIANCE_IMPACT_LEVELS as readonly string[]).includes(value)
    ? (value as RfpComplianceImpactLevel)
    : undefined;
}

function asRowReviewStatus(
  value: unknown
): RfpComplianceRowReviewStatus | undefined {
  return typeof value === "string" &&
    (RFP_COMPLIANCE_ROW_REVIEW_STATUSES as readonly string[]).includes(value)
    ? (value as RfpComplianceRowReviewStatus)
    : undefined;
}

function isReviewAction(value: unknown): value is RfpComplianceReviewAction {
  return (
    typeof value === "string" &&
    (RFP_COMPLIANCE_REVIEW_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Surface review provenance fields only when present and valid: nonblank strings
 * for the id/timestamp fields and finite numbers for the counts/version. An
 * un-reviewed payload yields an empty object (every field omitted).
 */
function toReviewProvenance(
  record: Record<string, unknown>
): RfpComplianceMatrixInspectionReviewProvenance {
  const reviewedBy = asNonblankString(record.reviewedBy);
  const reviewedAt = asNonblankString(record.reviewedAt);
  const reviewedDecisionCount = asOptionalNumber(record.reviewedDecisionCount);
  const activeRowCount = asOptionalNumber(record.activeRowCount);
  const removedRowCount = asOptionalNumber(record.removedRowCount);
  const sourceComplianceMatrixArtifactId = asNonblankString(
    record.sourceComplianceMatrixArtifactId
  );
  const sourceComplianceMatrixArtifactVersion = asOptionalNumber(
    record.sourceComplianceMatrixArtifactVersion
  );
  return {
    ...(reviewedBy !== undefined ? { reviewedBy } : {}),
    ...(reviewedAt !== undefined ? { reviewedAt } : {}),
    ...(reviewedDecisionCount !== undefined ? { reviewedDecisionCount } : {}),
    ...(activeRowCount !== undefined ? { activeRowCount } : {}),
    ...(removedRowCount !== undefined ? { removedRowCount } : {}),
    ...(sourceComplianceMatrixArtifactId !== undefined
      ? { sourceComplianceMatrixArtifactId }
      : {}),
    ...(sourceComplianceMatrixArtifactVersion !== undefined
      ? { sourceComplianceMatrixArtifactVersion }
      : {}),
  };
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
    ...toReviewProvenance(record),
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

/**
 * Whitelisted copy of one stored review-history event, or null for a malformed
 * value (dropped): the action must be known and at/by nonblank strings. The note
 * is copied only when a nonblank string; arbitrary extra keys never survive.
 */
function toReviewEvent(value: unknown): RfpComplianceMatrixReviewEvent | null {
  if (!isPlainRecord(value)) return null;
  if (!isReviewAction(value.action)) return null;
  const at = asNonblankString(value.at);
  const by = asNonblankString(value.by);
  if (at === undefined || by === undefined) return null;
  const note = asNonblankString(value.note);
  return {
    action: value.action,
    at,
    by,
    ...(note !== undefined ? { note } : {}),
  };
}

function toReviewHistory(value: unknown): RfpComplianceMatrixReviewEvent[] {
  if (!Array.isArray(value)) return [];
  const events: RfpComplianceMatrixReviewEvent[] = [];
  for (const entry of value) {
    const event = toReviewEvent(entry);
    if (event !== null) events.push(event);
  }
  return events;
}

function toRow(entry: unknown): RfpComplianceMatrixInspectionRow {
  const record = toRecord(entry);
  const rationale = asOptionalString(record.rationale);
  const notes = asOptionalString(record.notes);
  const configurationReferences = toConfigurationReferences(
    record.configurationReferences
  );
  const sectionReference = asOptionalString(record.sectionReference);
  const responseLane = asReviewLane(record.responseLane);
  const ownerLane = asReviewLane(record.ownerLane);
  const hldImpact = asImpactLevel(record.hldImpact);
  const tpImpact = asImpactLevel(record.tpImpact);
  const boqConfigImpact = asImpactLevel(record.boqConfigImpact);
  const requiresOwnerReview =
    typeof record.requiresOwnerReview === "boolean"
      ? record.requiresOwnerReview
      : undefined;
  const rowReviewStatus = asRowReviewStatus(record.rowReviewStatus);
  const notApplicableReason = asOptionalString(record.notApplicableReason);
  const removedReason = asOptionalString(record.removedReason);
  const reviewHistory = toReviewHistory(record.reviewHistory);
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
    ...(sectionReference !== undefined ? { sectionReference } : {}),
    ...(responseLane !== undefined ? { responseLane } : {}),
    ...(ownerLane !== undefined ? { ownerLane } : {}),
    ...(hldImpact !== undefined ? { hldImpact } : {}),
    ...(tpImpact !== undefined ? { tpImpact } : {}),
    ...(boqConfigImpact !== undefined ? { boqConfigImpact } : {}),
    ...(requiresOwnerReview !== undefined ? { requiresOwnerReview } : {}),
    ...(rowReviewStatus !== undefined ? { rowReviewStatus } : {}),
    ...(notApplicableReason !== undefined ? { notApplicableReason } : {}),
    ...(removedReason !== undefined ? { removedReason } : {}),
    ...(reviewHistory.length > 0 ? { reviewHistory } : {}),
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
      ...toReviewProvenance(payload),
      rows: (rows as RfpComplianceMatrixRow[]).map((entry) => toRow(entry)),
    },
  };
}
