/**
 * RFP compliance-matrix row-review persistence service (Stage 5).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 * Payload contract: src/lib/projects/project-rfp-compliance-matrix.ts.
 *
 * Persists one engineer row-review pass over ONE exact needs_review
 * compliance_matrix artifact version by creating ONE new needs_review
 * compliance_matrix version whose rows carry the edited metadata and a visible
 * append-only review history; the reviewed version itself stays immutable. Human
 * review data ONLY: this service never approves the artifact (it always writes
 * needs_review), creates no approval, and calls no AI/model/provider. It is
 * deterministic Project-state assembly: no document reread, no OCR or parsing,
 * and no pricing, SKU, catalog, configuration, legal, commercial, safety,
 * local-content, HLD, TP, proposal, or export authority. Pricing authority and
 * configuration authority stay with their own artifacts; locator-only evidence
 * and configuration references are copied through the payload contract whitelist
 * and never carry a price, margin, discount, currency, catalog lookup,
 * replacement authority, or raw evidence body.
 *
 * Decision shapes are validated before any store call (deterministic programmer
 * errors naming decisions[index]); reason/note sanitize instead of throwing.
 * Gates run in order, tenant scoped on every store call: project existence, rfp
 * mode, exact artifact existence, compliance_matrix type within the
 * compliance_matrix_review stage, needs_review status, then a valid
 * rfp_compliance_matrix payload. Decision gates follow, each collecting every
 * offender in decision order before anything persists: duplicate rowIds, unknown
 * rowIds, edit/mark/remove against an already-removed row, restore against a
 * non-removed row, mark_not_applicable/remove without a reason, and invalid
 * editedFields. Any failed gate persists nothing. On success exactly one new
 * needs_review compliance_matrix version is created: undecided rows are preserved
 * as fresh whitelisted copies, decided rows get the action's metadata and one
 * appended history entry, and the payload preserves the original source ids and
 * created fields, copies the reviewed artifact sourceFileIds, extends its
 * sourceArtifactIds with the reviewed artifact id (no duplicates), and stamps the
 * review provenance (reviewedBy, reviewedAt, reviewedDecisionCount, active/removed
 * row counts, and the reviewed artifact id/version). The ok result surfaces lean
 * artifact and payload summaries only - never a row body, evidence body, tenantId,
 * or approval data. Inputs, loaded payloads, and row objects are never mutated;
 * store failures bubble unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
  RFP_COMPLIANCE_STATUSES,
  RFP_COMPLIANCE_REVIEW_LANES,
  RFP_COMPLIANCE_IMPACT_LEVELS,
  RFP_COMPLIANCE_ROW_REVIEW_STATUSES,
  RFP_COMPLIANCE_REVIEW_ACTIONS,
  buildRfpComplianceMatrixPayloadSummary,
  type RfpComplianceMatrixPayload,
  type RfpComplianceMatrixPayloadSummary,
  type RfpComplianceMatrixRow,
  type RfpComplianceMatrixEvidenceReference,
  type RfpComplianceMatrixConfigurationReference,
  type RfpComplianceMatrixReviewEvent,
  type RfpComplianceStatus,
  type RfpComplianceReviewLane,
  type RfpComplianceImpactLevel,
  type RfpComplianceRowReviewStatus,
  type RfpComplianceReviewAction,
  type RfpComplianceMatrixCategory,
  type RfpComplianceMatrixPriority,
} from "@/lib/projects/project-rfp-compliance-matrix";

/** The artifact type / stage this service reviews and creates. */
const COMPLIANCE_MATRIX_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "compliance_matrix";
const COMPLIANCE_MATRIX_STAGE_ID: ProjectArtifact["stageId"] =
  "compliance_matrix_review";

/** The only artifact status decisions may be recorded against. */
const REVIEWABLE_ARTIFACT_STATUS: ProjectArtifact["status"] = "needs_review";

/** The per-row lifecycle state that blocks edit/mark/remove and enables restore. */
const REMOVED_ROW_REVIEW_STATUS: RfpComplianceRowReviewStatus = "removed";

/**
 * The two locator-only evidence-reference kinds, declared locally exactly as the
 * payload contract declares them (importing the value would pull a coupled module
 * into the contract's runtime graph). Kept in sync with the contract union.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/** The four engineer row-review actions a decision may carry. */
const RFP_COMPLIANCE_ROW_REVIEW_ACTIONS = [
  "edit",
  "mark_not_applicable",
  "remove",
  "restore",
] as const;
export type RfpComplianceMatrixRowReviewAction =
  (typeof RFP_COMPLIANCE_ROW_REVIEW_ACTIONS)[number];

/**
 * Compliance outcomes an edit may set: every status EXCEPT not_applicable, which
 * is reachable only through mark_not_applicable/remove (so an edit can never
 * silently route a row out of scope).
 */
const EDITABLE_COMPLIANCE_STATUSES = [
  "compliant",
  "partially_compliant",
  "non_compliant",
  "needs_review",
] as const;

/** Caller-supplied edit fields; whitelisted/validated/trimmed before storage. */
export interface RfpComplianceMatrixRowEditedFieldsInput {
  /** Must be nonblank when present; stored trimmed. */
  response?: string;
  rationale?: string;
  notes?: string;
  /** Any status except not_applicable. */
  complianceStatus?: RfpComplianceStatus;
  sectionReference?: string;
  responseLane?: RfpComplianceReviewLane;
  ownerLane?: RfpComplianceReviewLane;
  hldImpact?: RfpComplianceImpactLevel;
  tpImpact?: RfpComplianceImpactLevel;
  boqConfigImpact?: RfpComplianceImpactLevel;
  requiresOwnerReview?: boolean;
}

/** One engineer decision against one row of the reviewed compliance_matrix. */
export interface RfpComplianceMatrixRowReviewDecisionInput {
  rowId: string;
  action: RfpComplianceMatrixRowReviewAction;
  /** Required nonblank for mark_not_applicable and remove; also the history note. */
  reason?: string;
  /** Optional nonblank free note; carried into the edit/restore history event. */
  note?: string;
  /** edit only; validated against the editable whitelist. */
  editedFields?: RfpComplianceMatrixRowEditedFieldsInput;
}

/** Input for {@link reviewRfpComplianceMatrixRows}. */
export interface ReviewRfpComplianceMatrixRowsInput {
  tenantId: string;
  projectId: string;
  /** The exact needs_review compliance_matrix version being reviewed. */
  complianceMatrixArtifactId: string;
  reviewedBy: string;
  /** Deterministic review timestamp for tests; defaults to now. */
  reviewedAt?: Date;
  /** Nonempty: a row review records at least one decision. */
  decisions: RfpComplianceMatrixRowReviewDecisionInput[];
}

/**
 * The reviewed compliance_matrix payload: the original draft source ids and
 * created fields plus the edited rows and the review provenance fields.
 */
export type RfpComplianceMatrixReviewedPayload = RfpComplianceMatrixPayload & {
  reviewedBy: string;
  /** ISO review timestamp; also each appended history entry's `at`. */
  reviewedAt: string;
  reviewedDecisionCount: number;
  /** Rows whose rowReviewStatus is not removed. */
  activeRowCount: number;
  removedRowCount: number;
  /** The exact artifact version these decisions were applied against. */
  sourceComplianceMatrixArtifactId: string;
  sourceComplianceMatrixArtifactVersion: number;
};

/** Lean wrong-mode Project projection; tenantId is never surfaced. */
export interface RfpComplianceMatrixRowReviewProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpComplianceMatrixRowReviewArtifactSummary {
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

/** Identifier/count projection of the new payload plus review provenance; no row bodies. */
export interface RfpComplianceMatrixRowReviewPayloadSummary
  extends RfpComplianceMatrixPayloadSummary {
  reviewedBy: string;
  reviewedAt: string;
  reviewedDecisionCount: number;
  activeRowCount: number;
  removedRowCount: number;
  sourceComplianceMatrixArtifactId: string;
  sourceComplianceMatrixArtifactVersion: number;
}

/** One offending edit decision and its first failing reason. */
export interface RfpComplianceMatrixInvalidEditDetail {
  rowId: string;
  reason: string;
}

/** Discriminated result of {@link reviewRfpComplianceMatrixRows}. */
export type ReviewRfpComplianceMatrixRowsResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpComplianceMatrixRowReviewProjectSummary }
  | { status: "compliance_matrix_not_found" }
  | {
      status: "artifact_not_compliance_matrix";
      artifact: RfpComplianceMatrixRowReviewArtifactSummary;
    }
  | {
      status: "compliance_matrix_not_reviewable";
      artifact: RfpComplianceMatrixRowReviewArtifactSummary;
    }
  | {
      status: "invalid_compliance_matrix_payload";
      artifact: RfpComplianceMatrixRowReviewArtifactSummary;
    }
  | { status: "duplicate_decision"; rowIds: string[] }
  | { status: "decision_target_not_found"; rowIds: string[] }
  | { status: "row_already_removed"; rowIds: string[] }
  | { status: "row_not_removed"; rowIds: string[] }
  | { status: "reason_required"; rowIds: string[] }
  | { status: "invalid_edit"; edits: RfpComplianceMatrixInvalidEditDetail[] }
  | {
      status: "ok";
      artifact: RfpComplianceMatrixRowReviewArtifactSummary;
      payloadSummary: RfpComplianceMatrixRowReviewPayloadSummary;
    };

/** One shape-validated decision; editedFields stays raw until the edit gate. */
interface SanitizedDecision {
  rowId: string;
  action: RfpComplianceMatrixRowReviewAction;
  reason?: string;
  note?: string;
  editedFields?: unknown;
}

/** One payload row that passed the payload gate; record kept to copy. */
interface LoadedRow {
  id: string;
  rowReviewStatus?: RfpComplianceRowReviewStatus;
  record: Record<string, unknown>;
}

/** The preserved original metadata of one valid loaded payload. */
interface ParsedCompliancePayload {
  createdBy: string;
  createdAt: string;
  sourceRequirementsBaselineArtifactId: string;
  sourceEvidencePackageArtifactId: string;
  sourceConfigurationExpansionArtifactId?: string;
  rows: LoadedRow[];
}

/** Outcome of validating one edit decision's editedFields value. */
type SanitizedEditOutcome =
  | { edits: RfpComplianceMatrixRowEditedFieldsInput }
  | { reason: string };

/** True when value is one of the allowed string literals (indexed loop). */
function isOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown
): value is T {
  for (let index = 0; index < allowed.length; index += 1) {
    if (allowed[index] === value) return true;
  }
  return false;
}

/** True for a plain non-array object value. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** True for a nonblank string. */
function isNonblankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Read one string field; "" when missing or not a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Read one count field; 0 when missing or not a finite number. */
function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Read one optional numeric field; omitted when not finite. */
function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Read one optional string field; omitted when not a string. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The trimmed value when it is a nonblank string; undefined otherwise. */
function trimmedNonblankOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

/** A known compliance status, or needs_review (the gate guarantees a known value). */
function asComplianceStatus(value: unknown): RfpComplianceStatus {
  return isOneOf(RFP_COMPLIANCE_STATUSES, value) ? value : "needs_review";
}

/** A known review lane, or undefined (a malformed stored value is dropped). */
function asReviewLane(value: unknown): RfpComplianceReviewLane | undefined {
  return isOneOf(RFP_COMPLIANCE_REVIEW_LANES, value) ? value : undefined;
}

/** A known impact level, or undefined (a malformed stored value is dropped). */
function asImpactLevel(value: unknown): RfpComplianceImpactLevel | undefined {
  return isOneOf(RFP_COMPLIANCE_IMPACT_LEVELS, value) ? value : undefined;
}

/** A known row review status, or undefined (a malformed stored value is dropped). */
function asRowReviewStatus(
  value: unknown
): RfpComplianceRowReviewStatus | undefined {
  return isOneOf(RFP_COMPLIANCE_ROW_REVIEW_STATUSES, value) ? value : undefined;
}

/** Lean wrong-mode Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpComplianceMatrixRowReviewProjectSummary {
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

/** Project one loaded or stored artifact to a lean summary; arrays copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpComplianceMatrixRowReviewArtifactSummary {
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

/**
 * Validate one decision's shape. Throws deterministic programmer errors naming
 * decisions[index] for a non-object decision, a blank rowId, or an unknown
 * action. reason/note sanitize instead of throwing (trimmed; omitted when blank
 * or not a string - the reason gate is discriminated, not a throw); editedFields
 * is carried raw and validated by the edit gate only for edit decisions.
 */
function sanitizeDecision(decision: unknown, index: number): SanitizedDecision {
  if (!isPlainObject(decision)) {
    throw new Error(`decisions[${index}] must be an object.`);
  }
  const rowId =
    typeof decision.rowId === "string" ? decision.rowId.trim() : "";
  if (rowId === "") {
    throw new Error(`decisions[${index}].rowId is required.`);
  }
  const action = decision.action;
  if (!isOneOf(RFP_COMPLIANCE_ROW_REVIEW_ACTIONS, action)) {
    throw new Error(
      `decisions[${index}].action must be one of ${RFP_COMPLIANCE_ROW_REVIEW_ACTIONS.join(" | ")}.`
    );
  }
  const reason = trimmedNonblankOrUndefined(decision.reason);
  const note = trimmedNonblankOrUndefined(decision.note);
  return {
    rowId,
    action,
    ...(reason !== undefined ? { reason } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(decision.editedFields !== undefined
      ? { editedFields: decision.editedFields }
      : {}),
  };
}

/**
 * Parse one loaded compliance_matrix payload, or null when it is not a valid
 * rfp_compliance_matrix payload: the discriminator, nonblank baseline/evidence
 * source ids, and a rows array whose entries each carry a nonblank id,
 * requirementId, requirementText, and response, a known complianceStatus, and an
 * evidenceReferences array. createdBy/createdAt and the optional configuration
 * source id are preserved as found.
 */
function parseCompliancePayload(
  payload: unknown
): ParsedCompliancePayload | null {
  if (!isPlainObject(payload)) return null;
  if (payload.payloadKind !== RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND) return null;
  const sourceRequirementsBaselineArtifactId =
    payload.sourceRequirementsBaselineArtifactId;
  if (!isNonblankString(sourceRequirementsBaselineArtifactId)) return null;
  const sourceEvidencePackageArtifactId =
    payload.sourceEvidencePackageArtifactId;
  if (!isNonblankString(sourceEvidencePackageArtifactId)) return null;
  if (!Array.isArray(payload.rows)) return null;
  const rows: LoadedRow[] = [];
  for (const rawRow of payload.rows) {
    if (!isPlainObject(rawRow)) return null;
    const id = rawRow.id;
    if (!isNonblankString(id)) return null;
    if (!isNonblankString(rawRow.requirementId)) return null;
    if (!isNonblankString(rawRow.requirementText)) return null;
    if (!isNonblankString(rawRow.response)) return null;
    if (!isOneOf(RFP_COMPLIANCE_STATUSES, rawRow.complianceStatus)) return null;
    if (!Array.isArray(rawRow.evidenceReferences)) return null;
    const rowReviewStatus = asRowReviewStatus(rawRow.rowReviewStatus);
    rows.push({
      id,
      ...(rowReviewStatus !== undefined ? { rowReviewStatus } : {}),
      record: rawRow,
    });
  }
  const sourceConfigurationExpansionArtifactId =
    payload.sourceConfigurationExpansionArtifactId;
  return {
    createdBy: asString(payload.createdBy),
    createdAt: asString(payload.createdAt),
    sourceRequirementsBaselineArtifactId,
    sourceEvidencePackageArtifactId,
    ...(isNonblankString(sourceConfigurationExpansionArtifactId)
      ? { sourceConfigurationExpansionArtifactId }
      : {}),
    rows,
  };
}

/**
 * Fresh locator-only copy of one stored evidence reference through the per-kind
 * whitelist, or null for a malformed stored value (dropped). A stored text body
 * or table rows matrix could never survive this copy.
 */
function copyEvidenceReference(
  value: unknown
): RfpComplianceMatrixEvidenceReference | null {
  if (!isPlainObject(value)) return null;
  if (value.evidenceKind === RFP_TEXT_CHUNK_EVIDENCE_KIND) {
    return {
      evidenceId: asString(value.evidenceId),
      sourceFileId: asString(value.sourceFileId),
      evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
      inputPackageArtifactId: asString(value.inputPackageArtifactId),
      chunkIndex: asCount(value.chunkIndex),
      chunkCount: asCount(value.chunkCount),
      charCount: asCount(value.charCount),
    };
  }
  if (value.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(value.pageNumber);
    const sheetName = asOptionalString(value.sheetName);
    return {
      evidenceId: asString(value.evidenceId),
      sourceFileId: asString(value.sourceFileId),
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      inputPackageArtifactId: asString(value.inputPackageArtifactId),
      tableId: asString(value.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(value.rowCount),
      columnCount: asCount(value.columnCount),
    };
  }
  return null;
}

/** Fresh locator-only copies of a stored evidenceReferences array; malformed dropped. */
function copyEvidenceReferences(
  value: unknown
): RfpComplianceMatrixEvidenceReference[] {
  if (!Array.isArray(value)) return [];
  const out: RfpComplianceMatrixEvidenceReference[] = [];
  for (const entry of value) {
    const copied = copyEvidenceReference(entry);
    if (copied !== null) out.push(copied);
  }
  return out;
}

/**
 * Fresh locator-only copy of one stored configuration reference through the
 * payload-contract whitelist: line/source identifiers and descriptive fields
 * ONLY. A price, margin, discount, currency, catalog lookup, replacement, or
 * rule field could never survive this copy.
 */
function copyConfigurationReference(
  value: Record<string, unknown>
): RfpComplianceMatrixConfigurationReference {
  const origin =
    value.origin === "customer" || value.origin === "expansion"
      ? value.origin
      : undefined;
  const sku = asOptionalString(value.sku);
  const description = asOptionalString(value.description);
  const parentLineId = asOptionalString(value.parentLineId);
  const parentLineNumber = asOptionalString(value.parentLineNumber);
  const sourceFileId = asOptionalString(value.sourceFileId);
  const sourceRowNumber = asOptionalNumber(value.sourceRowNumber);
  const originalLineNumber = asOptionalString(value.originalLineNumber);
  return {
    configurationExpansionArtifactId: asString(
      value.configurationExpansionArtifactId
    ),
    lineId: asString(value.lineId),
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

/** Fresh copies of a stored configurationReferences array; undefined when absent. */
function copyConfigurationReferences(
  value: unknown
): RfpComplianceMatrixConfigurationReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: RfpComplianceMatrixConfigurationReference[] = [];
  for (const entry of value) {
    if (isPlainObject(entry)) out.push(copyConfigurationReference(entry));
  }
  return out;
}

/**
 * Fresh whitelisted copy of one stored review-history event; null for a malformed
 * stored value (dropped): the action must be known and `at`/`by` nonblank
 * strings. Existing visible history is preserved by copying, never by aliasing.
 */
function copyReviewEvent(
  value: unknown
): RfpComplianceMatrixReviewEvent | null {
  if (!isPlainObject(value)) return null;
  if (!isOneOf(RFP_COMPLIANCE_REVIEW_ACTIONS, value.action)) return null;
  if (!isNonblankString(value.at)) return null;
  if (!isNonblankString(value.by)) return null;
  const note = trimmedNonblankOrUndefined(value.note);
  return {
    action: value.action,
    at: value.at,
    by: value.by,
    ...(note !== undefined ? { note } : {}),
  };
}

/** Fresh copies of a stored reviewHistory array; malformed entries dropped. */
function copyReviewHistory(value: unknown): RfpComplianceMatrixReviewEvent[] {
  if (!Array.isArray(value)) return [];
  const out: RfpComplianceMatrixReviewEvent[] = [];
  for (const entry of value) {
    const copied = copyReviewEvent(entry);
    if (copied !== null) out.push(copied);
  }
  return out;
}

/**
 * Fresh whitelisted copy of one loaded row: required identity/snapshot fields,
 * locator-only references, the validated Stage 5 metadata, and every valid
 * existing review-history entry, in stored order. Arbitrary keys, malformed union
 * values, and malformed history entries are dropped; the loaded record is never
 * aliased.
 */
function copyRow(record: Record<string, unknown>): RfpComplianceMatrixRow {
  const rationale = asOptionalString(record.rationale);
  const notes = asOptionalString(record.notes);
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
  const configurationReferences = copyConfigurationReferences(
    record.configurationReferences
  );
  const reviewHistory = copyReviewHistory(record.reviewHistory);
  return {
    id: asString(record.id),
    requirementId: asString(record.requirementId),
    requirementText: asString(record.requirementText),
    category: asString(record.category) as RfpComplianceMatrixCategory,
    priority: asString(record.priority) as RfpComplianceMatrixPriority,
    complianceStatus: asComplianceStatus(record.complianceStatus),
    response: asString(record.response),
    ...(rationale !== undefined ? { rationale } : {}),
    ...(notes !== undefined ? { notes } : {}),
    evidenceReferences: copyEvidenceReferences(record.evidenceReferences),
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

/**
 * Validate and sanitize one edit decision's editedFields against the narrow
 * editable whitelist. response, when present, must be a nonblank string (trimmed);
 * complianceStatus must be an editable status (never not_applicable); lanes and
 * impacts must match the contract constants; requiresOwnerReview must be a
 * boolean. rationale/notes/sectionReference store trimmed nonblank values and are
 * otherwise ignored. Every other key (identity, references, statuses set only by
 * mark/remove/restore, history, pricing/SKU/config fields, ...) is dropped. An
 * edit that edits nothing is invalid.
 */
function sanitizeEditedFields(value: unknown): SanitizedEditOutcome {
  if (!isPlainObject(value)) {
    return { reason: "editedFields must be an object." };
  }
  const edits: RfpComplianceMatrixRowEditedFieldsInput = {};
  if (value.response !== undefined) {
    if (typeof value.response !== "string" || value.response.trim() === "") {
      return { reason: "editedFields.response must be a nonblank string." };
    }
    edits.response = value.response.trim();
  }
  if (value.complianceStatus !== undefined) {
    if (!isOneOf(EDITABLE_COMPLIANCE_STATUSES, value.complianceStatus)) {
      return {
        reason: `editedFields.complianceStatus must be one of ${EDITABLE_COMPLIANCE_STATUSES.join(" | ")}.`,
      };
    }
    edits.complianceStatus = value.complianceStatus;
  }
  if (value.responseLane !== undefined) {
    if (!isOneOf(RFP_COMPLIANCE_REVIEW_LANES, value.responseLane)) {
      return {
        reason: `editedFields.responseLane must be one of ${RFP_COMPLIANCE_REVIEW_LANES.join(" | ")}.`,
      };
    }
    edits.responseLane = value.responseLane;
  }
  if (value.ownerLane !== undefined) {
    if (!isOneOf(RFP_COMPLIANCE_REVIEW_LANES, value.ownerLane)) {
      return {
        reason: `editedFields.ownerLane must be one of ${RFP_COMPLIANCE_REVIEW_LANES.join(" | ")}.`,
      };
    }
    edits.ownerLane = value.ownerLane;
  }
  if (value.hldImpact !== undefined) {
    if (!isOneOf(RFP_COMPLIANCE_IMPACT_LEVELS, value.hldImpact)) {
      return {
        reason: `editedFields.hldImpact must be one of ${RFP_COMPLIANCE_IMPACT_LEVELS.join(" | ")}.`,
      };
    }
    edits.hldImpact = value.hldImpact;
  }
  if (value.tpImpact !== undefined) {
    if (!isOneOf(RFP_COMPLIANCE_IMPACT_LEVELS, value.tpImpact)) {
      return {
        reason: `editedFields.tpImpact must be one of ${RFP_COMPLIANCE_IMPACT_LEVELS.join(" | ")}.`,
      };
    }
    edits.tpImpact = value.tpImpact;
  }
  if (value.boqConfigImpact !== undefined) {
    if (!isOneOf(RFP_COMPLIANCE_IMPACT_LEVELS, value.boqConfigImpact)) {
      return {
        reason: `editedFields.boqConfigImpact must be one of ${RFP_COMPLIANCE_IMPACT_LEVELS.join(" | ")}.`,
      };
    }
    edits.boqConfigImpact = value.boqConfigImpact;
  }
  if (value.requiresOwnerReview !== undefined) {
    if (typeof value.requiresOwnerReview !== "boolean") {
      return { reason: "editedFields.requiresOwnerReview must be a boolean." };
    }
    edits.requiresOwnerReview = value.requiresOwnerReview;
  }
  const rationale = trimmedNonblankOrUndefined(value.rationale);
  if (rationale !== undefined) edits.rationale = rationale;
  const notes = trimmedNonblankOrUndefined(value.notes);
  if (notes !== undefined) edits.notes = notes;
  const sectionReference = trimmedNonblankOrUndefined(value.sectionReference);
  if (sectionReference !== undefined) edits.sectionReference = sectionReference;
  if (Object.keys(edits).length === 0) {
    return {
      reason:
        "editedFields must edit at least one of response, rationale, notes, complianceStatus, sectionReference, responseLane, ownerLane, hldImpact, tpImpact, boqConfigImpact, requiresOwnerReview.",
    };
  }
  return { edits };
}

/** A new review-history event for a decided row. */
function reviewEvent(
  action: RfpComplianceReviewAction,
  at: string,
  by: string,
  note: string | undefined
): RfpComplianceMatrixReviewEvent {
  return { action, at, by, ...(note !== undefined ? { note } : {}) };
}

/** Append one event after the existing history; a fresh array, input untouched. */
function appendEvent(
  existing: RfpComplianceMatrixReviewEvent[] | undefined,
  event: RfpComplianceMatrixReviewEvent
): RfpComplianceMatrixReviewEvent[] {
  return (existing ?? []).concat(event);
}

/**
 * Apply edit fields onto a fresh row copy and append one history event:
 * status_changed when complianceStatus is edited; owner_review_requested when
 * requiresOwnerReview transitions to true without a complianceStatus edit;
 * otherwise edited. Only whitelisted fields change; rowReviewStatus is untouched.
 */
function applyEdit(
  base: RfpComplianceMatrixRow,
  edits: RfpComplianceMatrixRowEditedFieldsInput,
  by: string,
  atIso: string,
  note: string | undefined
): RfpComplianceMatrixRow {
  const next: RfpComplianceMatrixRow = { ...base };
  if (edits.response !== undefined) next.response = edits.response;
  if (edits.rationale !== undefined) next.rationale = edits.rationale;
  if (edits.notes !== undefined) next.notes = edits.notes;
  if (edits.complianceStatus !== undefined) {
    next.complianceStatus = edits.complianceStatus;
  }
  if (edits.sectionReference !== undefined) {
    next.sectionReference = edits.sectionReference;
  }
  if (edits.responseLane !== undefined) next.responseLane = edits.responseLane;
  if (edits.ownerLane !== undefined) next.ownerLane = edits.ownerLane;
  if (edits.hldImpact !== undefined) next.hldImpact = edits.hldImpact;
  if (edits.tpImpact !== undefined) next.tpImpact = edits.tpImpact;
  if (edits.boqConfigImpact !== undefined) {
    next.boqConfigImpact = edits.boqConfigImpact;
  }
  if (edits.requiresOwnerReview !== undefined) {
    next.requiresOwnerReview = edits.requiresOwnerReview;
  }
  const action: RfpComplianceReviewAction =
    edits.complianceStatus !== undefined
      ? "status_changed"
      : edits.requiresOwnerReview === true && base.requiresOwnerReview !== true
        ? "owner_review_requested"
        : "edited";
  next.reviewHistory = appendEvent(
    base.reviewHistory,
    reviewEvent(action, atIso, by, note)
  );
  return next;
}

/** Apply one decision to a fresh row copy; the loaded record is never touched. */
function decideRow(
  base: RfpComplianceMatrixRow,
  decision: SanitizedDecision,
  edits: RfpComplianceMatrixRowEditedFieldsInput | undefined,
  by: string,
  atIso: string
): RfpComplianceMatrixRow {
  if (decision.action === "edit") {
    return applyEdit(base, edits ?? {}, by, atIso, decision.note);
  }
  if (decision.action === "mark_not_applicable") {
    const reason = decision.reason ?? "";
    return {
      ...base,
      complianceStatus: "not_applicable",
      notApplicableReason: reason,
      rowReviewStatus: "reviewed",
      reviewHistory: appendEvent(
        base.reviewHistory,
        reviewEvent("marked_not_applicable", atIso, by, reason)
      ),
    };
  }
  if (decision.action === "remove") {
    const reason = decision.reason ?? "";
    return {
      ...base,
      complianceStatus: "not_applicable",
      rowReviewStatus: "removed",
      removedReason: reason,
      reviewHistory: appendEvent(
        base.reviewHistory,
        reviewEvent("removed", atIso, by, reason)
      ),
    };
  }
  // restore: clear the removed reason and return the row to pending review.
  const next: RfpComplianceMatrixRow = {
    ...base,
    complianceStatus: "needs_review",
    rowReviewStatus: "pending",
    reviewHistory: appendEvent(
      base.reviewHistory,
      reviewEvent("restored", atIso, by, decision.note)
    ),
  };
  delete next.removedReason;
  return next;
}

/** Trimmed nonblank ids that appear more than once, reported once in first-seen order. */
function collectDuplicateRowIds(decisions: SanitizedDecision[]): string[] {
  const duplicates: string[] = [];
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const decision of decisions) {
    if (!seen.has(decision.rowId)) {
      seen.add(decision.rowId);
      continue;
    }
    if (reported.has(decision.rowId)) continue;
    reported.add(decision.rowId);
    duplicates.push(decision.rowId);
  }
  return duplicates;
}

/**
 * Persist one engineer row-review pass over ONE exact needs_review
 * compliance_matrix artifact version as ONE new needs_review compliance_matrix
 * version. Validates nonblank projectId, complianceMatrixArtifactId, and
 * reviewedBy, an optional valid reviewedAt Date, a nonempty decisions array, and
 * every decision's rowId/action shape before any store call (deterministic
 * programmer errors naming decisions[index]); reviewedBy and the artifact id are
 * trimmed for use. Gates in order, tenant scoped on every store call: project
 * existence, rfp mode, exact artifact existence, compliance_matrix type within the
 * compliance_matrix_review stage, needs_review status, then a valid
 * rfp_compliance_matrix payload. Decision gates follow, each returning every
 * offender in decision order before anything persists: duplicate rowIds, unknown
 * rowIds, edit/mark/remove against an already-removed row, restore against a
 * non-removed row, mark_not_applicable/remove without a reason, and invalid
 * editedFields. On success exactly one new needs_review compliance_matrix version
 * is created at compliance_matrix_review: undecided rows are preserved as fresh
 * whitelisted copies, decided rows get the action's metadata and one appended
 * history entry, and the payload preserves the original source ids and created
 * fields, copies the reviewed artifact sourceFileIds, extends its sourceArtifactIds
 * with the reviewed artifact id (no duplicates), and stamps the review provenance.
 * This service never approves the artifact and never calls AI. The ok result
 * surfaces lean artifact and payload summaries only - never a row body, evidence
 * body, or tenantId. Nothing is mutated; store failures bubble.
 */
export async function reviewRfpComplianceMatrixRows(
  input: ReviewRfpComplianceMatrixRowsInput
): Promise<ReviewRfpComplianceMatrixRowsResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (
    typeof input.complianceMatrixArtifactId !== "string" ||
    input.complianceMatrixArtifactId.trim() === ""
  ) {
    throw new Error("complianceMatrixArtifactId is required.");
  }
  if (typeof input.reviewedBy !== "string" || input.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (
    input.reviewedAt !== undefined &&
    (!(input.reviewedAt instanceof Date) ||
      Number.isNaN(input.reviewedAt.getTime()))
  ) {
    throw new Error("reviewedAt must be a valid Date.");
  }
  if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
    throw new Error("decisions must be a nonempty array.");
  }

  const reviewedBy = input.reviewedBy.trim();
  const complianceMatrixArtifactId = input.complianceMatrixArtifactId.trim();
  const { tenantId, projectId } = input;
  const decisions = input.decisions.map((decision, index) =>
    sanitizeDecision(decision, index)
  );
  const reviewedAtIso = (input.reviewedAt ?? new Date()).toISOString();

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const reviewedArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    complianceMatrixArtifactId
  );
  if (reviewedArtifact === null) {
    return { status: "compliance_matrix_not_found" };
  }
  if (
    reviewedArtifact.type !== COMPLIANCE_MATRIX_ARTIFACT_TYPE ||
    reviewedArtifact.stageId !== COMPLIANCE_MATRIX_STAGE_ID
  ) {
    return {
      status: "artifact_not_compliance_matrix",
      artifact: toArtifactSummary(reviewedArtifact),
    };
  }
  if (reviewedArtifact.status !== REVIEWABLE_ARTIFACT_STATUS) {
    return {
      status: "compliance_matrix_not_reviewable",
      artifact: toArtifactSummary(reviewedArtifact),
    };
  }
  const parsed = parseCompliancePayload(reviewedArtifact.payload);
  if (parsed === null) {
    return {
      status: "invalid_compliance_matrix_payload",
      artifact: toArtifactSummary(reviewedArtifact),
    };
  }

  // Decision gate 1: a row decided twice fails the whole review.
  const duplicateRowIds = collectDuplicateRowIds(decisions);
  if (duplicateRowIds.length > 0) {
    return { status: "duplicate_decision", rowIds: duplicateRowIds };
  }

  // Decision gate 2: every decision must target a known row.
  const rowById = new Map<string, LoadedRow>();
  for (const row of parsed.rows) rowById.set(row.id, row);
  const unknownRowIds = decisions
    .filter((decision) => !rowById.has(decision.rowId))
    .map((decision) => decision.rowId);
  if (unknownRowIds.length > 0) {
    return { status: "decision_target_not_found", rowIds: unknownRowIds };
  }

  // Decision gate 3: edit/mark/remove cannot touch an already-removed row.
  const removedTargetRowIds = decisions
    .filter(
      (decision) =>
        decision.action !== "restore" &&
        rowById.get(decision.rowId)?.rowReviewStatus ===
          REMOVED_ROW_REVIEW_STATUS
    )
    .map((decision) => decision.rowId);
  if (removedTargetRowIds.length > 0) {
    return { status: "row_already_removed", rowIds: removedTargetRowIds };
  }

  // Decision gate 4: restore only applies to a removed row.
  const notRemovedRestoreRowIds = decisions
    .filter(
      (decision) =>
        decision.action === "restore" &&
        rowById.get(decision.rowId)?.rowReviewStatus !==
          REMOVED_ROW_REVIEW_STATUS
    )
    .map((decision) => decision.rowId);
  if (notRemovedRestoreRowIds.length > 0) {
    return { status: "row_not_removed", rowIds: notRemovedRestoreRowIds };
  }

  // Decision gate 5: mark_not_applicable and remove require a reason.
  const missingReasonRowIds = decisions
    .filter(
      (decision) =>
        (decision.action === "mark_not_applicable" ||
          decision.action === "remove") &&
        decision.reason === undefined
    )
    .map((decision) => decision.rowId);
  if (missingReasonRowIds.length > 0) {
    return { status: "reason_required", rowIds: missingReasonRowIds };
  }

  // Decision gate 6: every edit's editedFields must validate.
  const invalidEdits: RfpComplianceMatrixInvalidEditDetail[] = [];
  const editsByRowId = new Map<string, RfpComplianceMatrixRowEditedFieldsInput>();
  for (const decision of decisions) {
    if (decision.action !== "edit") continue;
    const outcome = sanitizeEditedFields(decision.editedFields);
    if ("reason" in outcome) {
      invalidEdits.push({ rowId: decision.rowId, reason: outcome.reason });
      continue;
    }
    editsByRowId.set(decision.rowId, outcome.edits);
  }
  if (invalidEdits.length > 0) {
    return { status: "invalid_edit", edits: invalidEdits };
  }

  // All gates passed: build the reviewed rows (undecided rows preserved fresh).
  const decisionByRowId = new Map<string, SanitizedDecision>();
  for (const decision of decisions) decisionByRowId.set(decision.rowId, decision);
  const rows = parsed.rows.map((loaded) => {
    const base = copyRow(loaded.record);
    const decision = decisionByRowId.get(loaded.id);
    if (decision === undefined) return base;
    return decideRow(base, decision, editsByRowId.get(loaded.id), reviewedBy, reviewedAtIso);
  });

  let removedRowCount = 0;
  for (const row of rows) {
    if (row.rowReviewStatus === REMOVED_ROW_REVIEW_STATUS) removedRowCount += 1;
  }
  const activeRowCount = rows.length - removedRowCount;

  // Provenance: keep the reviewed artifact's source ids and add its own id once.
  const sourceArtifactIds: string[] = [];
  const seenSourceArtifactIds = new Set<string>();
  for (const artifactId of reviewedArtifact.sourceArtifactIds) {
    if (seenSourceArtifactIds.has(artifactId)) continue;
    seenSourceArtifactIds.add(artifactId);
    sourceArtifactIds.push(artifactId);
  }
  if (!seenSourceArtifactIds.has(complianceMatrixArtifactId)) {
    sourceArtifactIds.push(complianceMatrixArtifactId);
  }
  const sourceFileIds = reviewedArtifact.sourceFileIds.slice();

  const payload: RfpComplianceMatrixReviewedPayload = {
    payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
    sourceRequirementsBaselineArtifactId:
      parsed.sourceRequirementsBaselineArtifactId,
    sourceEvidencePackageArtifactId: parsed.sourceEvidencePackageArtifactId,
    ...(parsed.sourceConfigurationExpansionArtifactId !== undefined
      ? {
          sourceConfigurationExpansionArtifactId:
            parsed.sourceConfigurationExpansionArtifactId,
        }
      : {}),
    createdBy: parsed.createdBy,
    createdAt: parsed.createdAt,
    sourceFileIds: sourceFileIds.slice(),
    sourceArtifactIds: sourceArtifactIds.slice(),
    rows,
    reviewedBy,
    reviewedAt: reviewedAtIso,
    reviewedDecisionCount: decisions.length,
    activeRowCount,
    removedRowCount,
    sourceComplianceMatrixArtifactId: complianceMatrixArtifactId,
    sourceComplianceMatrixArtifactVersion: reviewedArtifact.version,
  };

  const stored = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: COMPLIANCE_MATRIX_STAGE_ID,
    type: COMPLIANCE_MATRIX_ARTIFACT_TYPE,
    status: "needs_review",
    payload,
    sourceFileIds: sourceFileIds.slice(),
    sourceArtifactIds: sourceArtifactIds.slice(),
  });

  const payloadSummary: RfpComplianceMatrixRowReviewPayloadSummary = {
    ...buildRfpComplianceMatrixPayloadSummary(payload),
    reviewedBy,
    reviewedAt: reviewedAtIso,
    reviewedDecisionCount: decisions.length,
    activeRowCount,
    removedRowCount,
    sourceComplianceMatrixArtifactId: complianceMatrixArtifactId,
    sourceComplianceMatrixArtifactVersion: reviewedArtifact.version,
  };

  return {
    status: "ok",
    artifact: toArtifactSummary(stored),
    payloadSummary,
  };
}
