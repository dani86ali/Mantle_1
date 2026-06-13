/**
 * RFP extraction-delta inspection read model (Stage 1A).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts. The inspected payload shape is the
 * extraction_delta artifact payload of
 * src/lib/projects/project-rfp-extraction-delta.ts, imported type-only so
 * this read module never pulls the draft-writing service, the review
 * persistence service, the AI candidate-drafting executor, or any provider
 * SDK into its runtime graph.
 *
 * Read-only engineer inspection over the extraction_delta artifact versions
 * the Stage 1A draft and review services record: a Project-gated list of
 * lean artifact summaries plus a single-artifact sanitized delta detail.
 * Both services load the Project by exact tenant/project id, return
 * not_found when it is missing and wrong_mode (with a lean no-tenantId
 * project summary) when it is not an rfp Project, and read artifacts only
 * after that gate passes. The list reads exactly the extraction_delta
 * artifact type, tenant/project scoped, and keeps only rows of that type;
 * every entry carries identifiers, ISO dates, copied source-id arrays, and
 * an identifier/count payload summary read through an explicit field
 * whitelist (the review-status tallies are recomputed from the stored
 * candidates) - malformed payload fields degrade to safe fallbacks ("", 0,
 * []) and the list never throws for a malformed payload. The list summary
 * never exposes a candidate title/description/rationale, proposed evidence
 * text or table rows, raw evidence text or table rows, a tenantId, a
 * storage path, or an arbitrary payload key.
 *
 * The detail loads the EXACT artifact version named by the caller and
 * whitelist-copies the stored delta payload: marker, provenance, counts,
 * optional review provenance, and the pending/decided candidates with
 * locator-only evidence references (identifiers, counts, positions - never
 * raw evidence text, never persisted evidence table rows). A candidate's
 * proposedEvidence and review history are an engineer/AI proposal and
 * review trail, never final authority, and are intentionally surfaced for
 * review: a proposed table's rows are copied as a fresh string matrix. The
 * detail never surfaces a tenantId, a storage path, raw provider output,
 * provider metadata, or an arbitrary candidate/reference/history key. This
 * module reads only Project and ProjectArtifact rows and writes nothing: no
 * artifact versions, no approvals, no evidence reads, no file or storage
 * reads, no OCR, no AI, and no SKU/catalog/pricing/configuration/export
 * logic. Loaded rows are never mutated and returned values never alias the
 * stored payload; store failures bubble to the caller unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  getProjectArtifactById,
  listProjectArtifactsByType,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import type {
  RfpExtractionDeltaEvidenceReference,
  RfpExtractionDeltaPayload,
  RfpExtractionDeltaProposedEvidence,
  RfpExtractionDeltaTableEvidenceReference,
  RfpExtractionDeltaTextEvidenceReference,
} from "@/lib/projects/project-rfp-extraction-delta";

/**
 * The payload discriminator every extraction_delta payload carries. Pinned
 * locally against the canonical payload type so a drift in the draft module
 * fails typecheck here without a runtime value import.
 */
const RFP_EXTRACTION_DELTA_PAYLOAD_KIND: RfpExtractionDeltaPayload["payloadKind"] =
  "rfp_extraction_delta";

/** The only artifact type / stage this inspection surface exposes. */
const EXTRACTION_DELTA_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "extraction_delta";
const EXTRACTION_DELTA_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/**
 * The two locator evidence kinds a stored evidence reference or proposal may
 * carry, pinned locally against the canonical reference types (type-only) so
 * a drift in the draft module fails typecheck here too.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND: RfpExtractionDeltaTextEvidenceReference["evidenceKind"] =
  "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND: RfpExtractionDeltaTableEvidenceReference["evidenceKind"] =
  "rfp_document_table";

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpExtractionDeltaInspectionProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied arrays, no payload. */
export interface RfpExtractionDeltaInspectionArtifactSummary {
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
 * Identifier/count projection of one stored payload, read through the field
 * whitelist only; malformed fields degrade to "" / 0 / []. The review-status
 * tallies are recomputed from the stored candidates. The optional review
 * provenance fields are present only when the stored payload was produced by
 * a review pass and stored them as the correct primitive type. No candidate
 * body, proposed evidence, or raw evidence ever appears in a list summary.
 */
export interface RfpExtractionDeltaInspectionPayloadSummary {
  payloadKind: string;
  createdBy: string;
  createdAt: string;
  proposalSource: string;
  inputPackageArtifactId: string;
  candidateCount: number;
  evidenceReferenceCount: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  waivedCount: number;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewedDecisionCount?: number;
  sourceExtractionDeltaArtifactId?: string;
  sourceExtractionDeltaArtifactVersion?: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
}

/** One list entry: the artifact summary plus its lean payload summary. */
export interface RfpExtractionDeltaInspectionListItem
  extends RfpExtractionDeltaInspectionArtifactSummary {
  payloadSummary: RfpExtractionDeltaInspectionPayloadSummary;
}

/** Input for {@link loadRfpExtractionDeltaList}. */
export interface LoadRfpExtractionDeltaListInput {
  tenantId: string;
  projectId: string;
}

/** Discriminated result of {@link loadRfpExtractionDeltaList}. */
export type LoadRfpExtractionDeltaListResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpExtractionDeltaInspectionProjectSummary;
    }
  | {
      status: "ok";
      project: RfpExtractionDeltaInspectionProjectSummary;
      artifacts: RfpExtractionDeltaInspectionListItem[];
      artifactCount: number;
    };

/**
 * The narrow editable surface one edit_accept history entry recorded:
 * candidate display/proposal fields only, copied through the whitelist.
 * severity is surfaced exactly as stored (a plain string): inspection
 * reports what is persisted and never re-validates the vocabulary.
 */
export interface RfpExtractionDeltaInspectionEditedFields {
  title?: string;
  description?: string;
  severity?: string;
  confidence?: number;
  rationale?: string;
  proposedEvidence?: RfpExtractionDeltaProposedEvidence;
}

/**
 * One visible review-history entry copied through the whitelist. action and
 * the two review statuses are surfaced exactly as stored (plain strings);
 * arbitrary history keys never surface.
 */
export interface RfpExtractionDeltaInspectionReviewHistoryEntry {
  action: string;
  decidedBy: string;
  decidedAt: string;
  previousReviewStatus: string;
  nextReviewStatus: string;
  note?: string;
  editedFields?: RfpExtractionDeltaInspectionEditedFields;
}

/**
 * One candidate copied from a stored delta payload through the field
 * whitelist. kind, severity, and reviewStatus are surfaced exactly as
 * stored (plain strings): inspection reports what is persisted and never
 * re-classifies. Evidence references are locator-only; proposedEvidence and
 * reviewHistory are an engineer/AI proposal and review trail surfaced for
 * review, never authority. Arbitrary candidate keys never surface.
 */
export interface RfpExtractionDeltaInspectionCandidate {
  id: string;
  kind: string;
  sourceFileId: string;
  title: string;
  description: string;
  severity: string;
  reviewStatus: string;
  confidence?: number;
  rationale?: string;
  /** Locator metadata only: identifiers, counts, positions - no body. */
  evidenceReferences: RfpExtractionDeltaEvidenceReference[];
  proposedEvidence?: RfpExtractionDeltaProposedEvidence;
  /** Visible review decisions, oldest first; [] until first decided. */
  reviewHistory: RfpExtractionDeltaInspectionReviewHistoryEntry[];
}

/** Sanitized whitelist copy of one stored extraction_delta payload. */
export interface RfpExtractionDeltaInspectionDetail {
  payloadKind: RfpExtractionDeltaPayload["payloadKind"];
  createdBy: string;
  createdAt: string;
  proposalSource: string;
  inputPackageArtifactId: string;
  candidateCount: number;
  evidenceReferenceCount: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  waivedCount: number;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewedDecisionCount?: number;
  sourceExtractionDeltaArtifactId?: string;
  sourceExtractionDeltaArtifactVersion?: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  candidates: RfpExtractionDeltaInspectionCandidate[];
}

/** Input for {@link loadRfpExtractionDeltaDetail}. */
export interface LoadRfpExtractionDeltaDetailInput {
  tenantId: string;
  projectId: string;
  artifactId: string;
}

/** Discriminated result of {@link loadRfpExtractionDeltaDetail}. */
export type LoadRfpExtractionDeltaDetailResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpExtractionDeltaInspectionProjectSummary;
    }
  | { status: "artifact_not_found" }
  | {
      status: "artifact_not_extraction_delta";
      artifact: RfpExtractionDeltaInspectionArtifactSummary;
    }
  | {
      status: "invalid_payload";
      artifact: RfpExtractionDeltaInspectionArtifactSummary;
    }
  | {
      status: "ok";
      project: RfpExtractionDeltaInspectionProjectSummary;
      artifact: RfpExtractionDeltaInspectionArtifactSummary;
      delta: RfpExtractionDeltaInspectionDetail;
    };

/** Tallies of the four review statuses across the stored candidates. */
interface ReviewStatusCounts {
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  waivedCount: number;
}

/** True for a plain object record; arrays and null are not records. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A payload value as a plain record; {} when it is anything else. */
function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
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
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Read one optional string field; omitted when not a string. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Fresh copy of one stored string-id array; [] when the stored value is not
 * an array or carries any non-string entry. The returned array never aliases
 * the stored payload.
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return [];
    result.push(entry);
  }
  return result;
}

/**
 * Tally the four review statuses across stored candidates by reading each
 * entry's reviewStatus string only; a non-array, a non-object entry, or an
 * unknown status contributes to no bucket. Never throws.
 */
function toReviewStatusCounts(value: unknown): ReviewStatusCounts {
  let pendingCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let waivedCount = 0;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const reviewStatus = isPlainRecord(entry)
        ? asString(entry.reviewStatus)
        : "";
      if (reviewStatus === "pending_review") pendingCount += 1;
      else if (reviewStatus === "accepted") acceptedCount += 1;
      else if (reviewStatus === "rejected") rejectedCount += 1;
      else if (reviewStatus === "waived") waivedCount += 1;
    }
  }
  return { pendingCount, acceptedCount, rejectedCount, waivedCount };
}

/** Lean wrong-mode/ok Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpExtractionDeltaInspectionProjectSummary {
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

/** Project one loaded artifact to a serializable summary; arrays copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpExtractionDeltaInspectionArtifactSummary {
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
 * Identifier/count projection of one stored payload for the list. Reads the
 * whitelisted scalar/count/id fields only, recomputes the review-status
 * tallies from the stored candidates, and surfaces the optional review
 * provenance only when stored as the correct primitive type - so arbitrary
 * payload keys (a tenantId or storage path smuggled into a malformed payload
 * included) can never surface, and never throws for a malformed payload.
 */
function toPayloadSummary(
  payload: unknown
): RfpExtractionDeltaInspectionPayloadSummary {
  const record = toRecord(payload);
  const counts = toReviewStatusCounts(record.candidates);
  const reviewedBy = asOptionalString(record.reviewedBy);
  const reviewedAt = asOptionalString(record.reviewedAt);
  const reviewedDecisionCount = asOptionalNumber(record.reviewedDecisionCount);
  const sourceArtifactId = asOptionalString(
    record.sourceExtractionDeltaArtifactId
  );
  const sourceArtifactVersion = asOptionalNumber(
    record.sourceExtractionDeltaArtifactVersion
  );
  return {
    payloadKind: asString(record.payloadKind),
    createdBy: asString(record.createdBy),
    createdAt: asString(record.createdAt),
    proposalSource: asString(record.proposalSource),
    inputPackageArtifactId: asString(record.inputPackageArtifactId),
    candidateCount: asCount(record.candidateCount),
    evidenceReferenceCount: asCount(record.evidenceReferenceCount),
    pendingCount: counts.pendingCount,
    acceptedCount: counts.acceptedCount,
    rejectedCount: counts.rejectedCount,
    waivedCount: counts.waivedCount,
    ...(reviewedBy !== undefined ? { reviewedBy } : {}),
    ...(reviewedAt !== undefined ? { reviewedAt } : {}),
    ...(reviewedDecisionCount !== undefined ? { reviewedDecisionCount } : {}),
    ...(sourceArtifactId !== undefined
      ? { sourceExtractionDeltaArtifactId: sourceArtifactId }
      : {}),
    ...(sourceArtifactVersion !== undefined
      ? { sourceExtractionDeltaArtifactVersion: sourceArtifactVersion }
      : {}),
    sourceFileIds: toStringArray(record.sourceFileIds),
    sourceArtifactIds: toStringArray(record.sourceArtifactIds),
  };
}

/** One list entry for a loaded extraction_delta artifact version. */
function toListItem(
  artifact: ProjectArtifact
): RfpExtractionDeltaInspectionListItem {
  return {
    ...toArtifactSummary(artifact),
    payloadSummary: toPayloadSummary(artifact.payload),
  };
}

/**
 * Build one fresh locator-only copy of a stored evidence reference through
 * the per-kind field whitelist: identifiers, counts, and positions only.
 * Malformed locator fields degrade to safe fallbacks ("" / 0 / omitted
 * optionals); a reference whose stored kind is not the table kind is
 * surfaced through the text-chunk locator shape with degraded counts. The
 * evidence text body and persisted table rows are never read or copied.
 */
function toEvidenceReference(
  entry: unknown
): RfpExtractionDeltaEvidenceReference {
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

/** Whitelist-copy stored references; a non-array degrades to []. */
function toEvidenceReferences(
  value: unknown
): RfpExtractionDeltaEvidenceReference[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toEvidenceReference(entry));
}

/**
 * Fresh string matrix copy of one proposed rows value: a malformed cell
 * degrades to "", a malformed row to [], and a malformed matrix to []. The
 * returned matrix never aliases the stored payload.
 */
function toTableRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => (typeof cell === "string" ? cell : ""))
      : []
  );
}

/**
 * Whitelisted sanitized copy of one stored proposed evidence value, or
 * undefined when the proposal is missing, not a plain object, or not one of
 * the two RFP extraction kinds. A proposed table's rows are copied as a
 * fresh matrix. Arbitrary proposal keys never surface; a malformed proposal
 * never throws. A proposal is an engineer/AI suggestion only, never final
 * authority, and is intentionally visible in the detail read model.
 */
function toProposedEvidence(
  value: unknown
): RfpExtractionDeltaProposedEvidence | undefined {
  if (!isPlainRecord(value)) return undefined;
  if (value.evidenceKind === RFP_TEXT_CHUNK_EVIDENCE_KIND) {
    const sourceFileName = asOptionalString(value.sourceFileName);
    const sourceFileRole = asOptionalString(value.sourceFileRole);
    const chunkIndex = asOptionalNumber(value.chunkIndex);
    const chunkCount = asOptionalNumber(value.chunkCount);
    const charCount = asOptionalNumber(value.charCount);
    return {
      evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
      text: asString(value.text),
      ...(sourceFileName !== undefined ? { sourceFileName } : {}),
      ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
      ...(chunkIndex !== undefined ? { chunkIndex } : {}),
      ...(chunkCount !== undefined ? { chunkCount } : {}),
      ...(charCount !== undefined ? { charCount } : {}),
    };
  }
  if (value.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const tableId = asOptionalString(value.tableId);
    const sourceFileName = asOptionalString(value.sourceFileName);
    const sourceFileRole = asOptionalString(value.sourceFileRole);
    const sheetName = asOptionalString(value.sheetName);
    const pageNumber = asOptionalNumber(value.pageNumber);
    const rowCount = asOptionalNumber(value.rowCount);
    const columnCount = asOptionalNumber(value.columnCount);
    return {
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      ...(tableId !== undefined ? { tableId } : {}),
      ...(sourceFileName !== undefined ? { sourceFileName } : {}),
      ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(rowCount !== undefined ? { rowCount } : {}),
      ...(columnCount !== undefined ? { columnCount } : {}),
      rows: toTableRows(value.rows),
    };
  }
  return undefined;
}

/**
 * Whitelisted copy of one stored editedFields value; undefined when not a
 * plain object or when no whitelisted field survives. severity is surfaced
 * exactly as stored (a plain string); the proposal re-runs the proposal
 * whitelist. Arbitrary keys never surface.
 */
function toEditedFields(
  value: unknown
): RfpExtractionDeltaInspectionEditedFields | undefined {
  if (!isPlainRecord(value)) return undefined;
  const title = asOptionalString(value.title);
  const description = asOptionalString(value.description);
  const severity = asOptionalString(value.severity);
  const confidence = asOptionalNumber(value.confidence);
  const rationale = asOptionalString(value.rationale);
  const proposedEvidence = toProposedEvidence(value.proposedEvidence);
  const copied: RfpExtractionDeltaInspectionEditedFields = {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(severity !== undefined ? { severity } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(rationale !== undefined ? { rationale } : {}),
    ...(proposedEvidence !== undefined ? { proposedEvidence } : {}),
  };
  return Object.keys(copied).length > 0 ? copied : undefined;
}

/**
 * Whitelisted copy of one stored review-history entry. action and the two
 * review statuses are surfaced exactly as stored (plain strings); note and
 * editedFields are copied only when valid. Arbitrary history keys never
 * surface; a malformed entry degrades to safe fallbacks.
 */
function toReviewHistoryEntry(
  entry: unknown
): RfpExtractionDeltaInspectionReviewHistoryEntry {
  const record = toRecord(entry);
  const note = asOptionalString(record.note);
  const editedFields = toEditedFields(record.editedFields);
  return {
    action: asString(record.action),
    decidedBy: asString(record.decidedBy),
    decidedAt: asString(record.decidedAt),
    previousReviewStatus: asString(record.previousReviewStatus),
    nextReviewStatus: asString(record.nextReviewStatus),
    ...(note !== undefined ? { note } : {}),
    ...(editedFields !== undefined ? { editedFields } : {}),
  };
}

/** Whitelist-copy stored review history; a non-array degrades to []. */
function toReviewHistory(
  value: unknown
): RfpExtractionDeltaInspectionReviewHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toReviewHistoryEntry(entry));
}

/**
 * Whitelist-copy one stored candidate entry: identity/display fields,
 * locator-only evidence references, the sanitized proposal, and the visible
 * review history. kind, severity, and reviewStatus are surfaced exactly as
 * stored; arbitrary entry keys never surface; malformed fields degrade
 * safely.
 */
function toCandidate(
  entry: unknown
): RfpExtractionDeltaInspectionCandidate {
  const record = toRecord(entry);
  const confidence = asOptionalNumber(record.confidence);
  const rationale = asOptionalString(record.rationale);
  const proposedEvidence = toProposedEvidence(record.proposedEvidence);
  return {
    id: asString(record.id),
    kind: asString(record.kind),
    sourceFileId: asString(record.sourceFileId),
    title: asString(record.title),
    description: asString(record.description),
    severity: asString(record.severity),
    reviewStatus: asString(record.reviewStatus),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(rationale !== undefined ? { rationale } : {}),
    evidenceReferences: toEvidenceReferences(record.evidenceReferences),
    ...(proposedEvidence !== undefined ? { proposedEvidence } : {}),
    reviewHistory: toReviewHistory(record.reviewHistory),
  };
}

/**
 * Sanitized whitelist copy of one stored extraction_delta payload. The
 * marker is fixed (the caller already gated it), the counts use safe numeric
 * reads, the review-status tallies and source arrays are recomputed/copied,
 * the optional review provenance is surfaced only when stored as the correct
 * primitive type, and the candidates are copied in stored order.
 */
function toDetail(
  payload: Record<string, unknown>
): RfpExtractionDeltaInspectionDetail {
  const counts = toReviewStatusCounts(payload.candidates);
  const reviewedBy = asOptionalString(payload.reviewedBy);
  const reviewedAt = asOptionalString(payload.reviewedAt);
  const reviewedDecisionCount = asOptionalNumber(payload.reviewedDecisionCount);
  const sourceArtifactId = asOptionalString(
    payload.sourceExtractionDeltaArtifactId
  );
  const sourceArtifactVersion = asOptionalNumber(
    payload.sourceExtractionDeltaArtifactVersion
  );
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates.map((entry) => toCandidate(entry))
    : [];
  return {
    payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
    createdBy: asString(payload.createdBy),
    createdAt: asString(payload.createdAt),
    proposalSource: asString(payload.proposalSource),
    inputPackageArtifactId: asString(payload.inputPackageArtifactId),
    candidateCount: asCount(payload.candidateCount),
    evidenceReferenceCount: asCount(payload.evidenceReferenceCount),
    pendingCount: counts.pendingCount,
    acceptedCount: counts.acceptedCount,
    rejectedCount: counts.rejectedCount,
    waivedCount: counts.waivedCount,
    ...(reviewedBy !== undefined ? { reviewedBy } : {}),
    ...(reviewedAt !== undefined ? { reviewedAt } : {}),
    ...(reviewedDecisionCount !== undefined ? { reviewedDecisionCount } : {}),
    ...(sourceArtifactId !== undefined
      ? { sourceExtractionDeltaArtifactId: sourceArtifactId }
      : {}),
    ...(sourceArtifactVersion !== undefined
      ? { sourceExtractionDeltaArtifactVersion: sourceArtifactVersion }
      : {}),
    sourceFileIds: toStringArray(payload.sourceFileIds),
    sourceArtifactIds: toStringArray(payload.sourceArtifactIds),
    candidates,
  };
}

/**
 * List one rfp Project's extraction_delta artifact versions as lean
 * serializable summaries. Validates a nonblank projectId before any store
 * call (deterministic programmer error), gates on project existence and rfp
 * mode, then reads exactly the extraction_delta artifact type, tenant and
 * project scoped, keeping only rows of that type even if the store returns
 * more. Every entry carries identifiers, ISO dates, copied source-id arrays,
 * and the whitelisted payload summary; malformed payload fields degrade to
 * safe fallbacks and the list never throws for a malformed payload.
 * Summaries never include a candidate body, proposed evidence text or table
 * rows, raw evidence text or table rows, a tenantId, a storage path, or any
 * other payload key. Loaded rows are never mutated; store failures bubble
 * unhidden.
 */
export async function loadRfpExtractionDeltaList(
  input: LoadRfpExtractionDeltaListInput
): Promise<LoadRfpExtractionDeltaListResult> {
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
    EXTRACTION_DELTA_ARTIFACT_TYPE
  );
  const artifacts = rows
    .filter((row) => row.type === EXTRACTION_DELTA_ARTIFACT_TYPE)
    .map((row) => toListItem(row));

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifacts,
    artifactCount: artifacts.length,
  };
}

/**
 * Load the EXACT extraction_delta artifact version named by the caller as a
 * sanitized delta detail. Validates nonblank projectId and artifactId before
 * any store call (deterministic programmer errors), gates on project
 * existence and rfp mode, then loads the artifact by exact
 * tenant/project/artifact id. A missing artifact reports artifact_not_found;
 * an artifact that is not extraction_delta at intake_package_review reports
 * artifact_not_extraction_delta with a lean payload-free summary; a payload
 * that is not a plain object, whose marker is not the extraction-delta
 * discriminator, or whose candidates array is malformed (not an array, or
 * holding a non-object entry) reports invalid_payload the same lean way. The
 * ok result carries the project and artifact summaries plus the whitelist
 * copy of the stored delta payload - locator-only evidence references, the
 * proposed evidence and review history surfaced for review, and never raw
 * evidence text, never persisted evidence table rows, never a tenantId,
 * never a storage path, never an arbitrary payload key, and never an alias
 * into the stored payload. Loaded rows are never mutated; store failures
 * bubble unhidden.
 */
export async function loadRfpExtractionDeltaDetail(
  input: LoadRfpExtractionDeltaDetailInput
): Promise<LoadRfpExtractionDeltaDetailResult> {
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
  if (artifact === null) return { status: "artifact_not_found" };
  if (
    artifact.type !== EXTRACTION_DELTA_ARTIFACT_TYPE ||
    artifact.stageId !== EXTRACTION_DELTA_STAGE_ID
  ) {
    return {
      status: "artifact_not_extraction_delta",
      artifact: toArtifactSummary(artifact),
    };
  }

  const payload = toRecord(artifact.payload);
  const candidates = payload.candidates;
  if (
    !isPlainRecord(artifact.payload) ||
    payload.payloadKind !== RFP_EXTRACTION_DELTA_PAYLOAD_KIND ||
    !Array.isArray(candidates) ||
    candidates.some((entry) => !isPlainRecord(entry))
  ) {
    return {
      status: "invalid_payload",
      artifact: toArtifactSummary(artifact),
    };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    artifact: toArtifactSummary(artifact),
    delta: toDetail(payload),
  };
}
