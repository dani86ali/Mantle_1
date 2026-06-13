/**
 * RFP extraction-delta review persistence service (Stage 1A).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Persists engineer review decisions for the pending candidates of ONE
 * exact needs_review extraction_delta artifact version by creating ONE
 * new extraction_delta version whose candidates carry the decided review
 * statuses and a visible append-only review history; the reviewed
 * version itself stays immutable. Candidate review persistence ONLY:
 * decisions recorded here are never evidence authority - this service
 * cannot approve anything, cannot build or approve the final
 * evidence_package, and never applies an accepted proposal to persisted
 * evidence rows (both are later prompts). It is deterministic
 * Project-state assembly only: no AI or model call, no OCR or document
 * parsing, no file, evidence, approval, requirements, compliance, BoQ,
 * pricing, SKU, catalog, configuration, export, or HLD/proposal logic,
 * and no routes or UI. The review vocabularies, candidate shapes, and
 * the proposal whitelist are imported from the extraction-delta type
 * module so edit_accept proposals follow exactly the draft service's
 * whitelist; the two RFP extraction evidence kind literals are restated
 * locally (the compiler locks them to the imported reference types) so
 * no extraction or persistence write module enters this graph.
 *
 * Decision shapes are validated before any store call (deterministic
 * programmer errors naming decisions[index]); notes sanitize instead of
 * throwing. Gates in order, tenant scoped on every store call: project
 * existence, rfp mode, exact artifact existence, extraction_delta type
 * within the intake_package_review stage, needs_review status, and a
 * valid rfp_extraction_delta payload. Decision gates then run in order,
 * each collecting every offender in decision order: duplicate
 * candidateIds, unknown candidateIds, candidates no longer
 * pending_review, waive decisions without a nonblank note, and invalid
 * edit_accept edits (narrow display/proposal whitelist: title,
 * description, severity, confidence, rationale, proposedEvidence -
 * identity, provenance, status, history, and arbitrary keys are never
 * editable and never stored). Any failed gate persists nothing. On
 * success exactly one new needs_review extraction_delta version is
 * created at intake_package_review: candidates are fresh whitelisted
 * copies preserving existing review history, decided candidates get the
 * next review status and one appended history entry, and the payload
 * preserves the original draft metadata plus review summary/provenance
 * fields (reviewedBy, reviewedAt, decision and status counts, and the
 * reviewed artifact id/version). sourceFileIds copy the reviewed
 * artifact's list; sourceArtifactIds keep the original ids and add the
 * reviewed artifact id without duplicates. The ok result surfaces lean
 * serializable summaries only - never candidate bodies, never a
 * proposal, never a tenantId. Inputs, loaded payloads, and candidate
 * objects are never mutated; store failures bubble unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
  RFP_EXTRACTION_DELTA_KINDS,
  RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES,
  RFP_EXTRACTION_DELTA_REVIEW_ACTIONS,
  RFP_EXTRACTION_DELTA_REVIEW_STATUSES,
  RFP_EXTRACTION_DELTA_SEVERITIES,
  sanitizeRfpExtractionDeltaProposedEvidence,
  type RfpExtractionDeltaArtifactSummary,
  type RfpExtractionDeltaCandidate,
  type RfpExtractionDeltaEditedFields,
  type RfpExtractionDeltaEvidenceReference,
  type RfpExtractionDeltaKind,
  type RfpExtractionDeltaPayload,
  type RfpExtractionDeltaProjectSummary,
  type RfpExtractionDeltaProposalSource,
  type RfpExtractionDeltaProposedEvidenceInput,
  type RfpExtractionDeltaReviewAction,
  type RfpExtractionDeltaReviewHistoryEntry,
  type RfpExtractionDeltaReviewStatus,
  type RfpExtractionDeltaSeverity,
} from "@/lib/projects/project-rfp-extraction-delta";

/** The artifact type / stage this service reviews and creates. */
const EXTRACTION_DELTA_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "extraction_delta";
const EXTRACTION_DELTA_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/** The only artifact status decisions may be recorded against. */
const REVIEWABLE_ARTIFACT_STATUS: ProjectArtifact["status"] = "needs_review";

/** The only candidate review status a decision may target. */
const PENDING_REVIEW_STATUS: RfpExtractionDeltaReviewStatus = "pending_review";

/**
 * The two persisted RFP extraction evidence kinds a stored reference or
 * proposal may carry. Defined locally on purpose (exactly like the
 * sibling delta modules): importing them would pull the
 * extraction/persistence write modules into this review service.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/** The review status each action writes; no action re-pends a candidate. */
const REVIEW_ACTION_NEXT_STATUS: Record<
  RfpExtractionDeltaReviewAction,
  RfpExtractionDeltaReviewStatus
> = {
  accept: "accepted",
  reject: "rejected",
  edit_accept: "accepted",
  waive: "waived",
};

/** Caller-supplied edit_accept edits; whitelisted/sanitized before storage. */
export interface RfpExtractionDeltaReviewEditedFieldsInput {
  title?: string;
  description?: string;
  severity?: RfpExtractionDeltaSeverity;
  /** Finite and between 0 and 1 inclusive. */
  confidence?: number;
  rationale?: string;
  proposedEvidence?: RfpExtractionDeltaProposedEvidenceInput;
}

/** One engineer decision against one pending candidate. */
export interface RfpExtractionDeltaReviewDecisionInput {
  candidateId: string;
  action: RfpExtractionDeltaReviewAction;
  /** Required nonblank for waive; optional otherwise. */
  note?: string;
  /** edit_accept only; ignored for every other action. */
  editedFields?: RfpExtractionDeltaReviewEditedFieldsInput;
}

/** Input for {@link reviewRfpExtractionDeltaArtifact}. */
export interface ReviewRfpExtractionDeltaArtifactInput {
  tenantId: string;
  projectId: string;
  /** The exact needs_review extraction_delta version being decided. */
  extractionDeltaArtifactId: string;
  reviewedBy: string;
  /** May be empty: a review version recording zero decisions is valid. */
  decisions: RfpExtractionDeltaReviewDecisionInput[];
  /** Deterministic decision timestamp for tests; defaults to now. */
  decidedAt?: Date;
}

/**
 * The reviewed extraction_delta payload: the original draft metadata plus
 * review summary/provenance fields for UI display and later final
 * evidence-package assembly.
 */
export type RfpExtractionDeltaReviewedPayload = RfpExtractionDeltaPayload & {
  reviewedBy: string;
  /** ISO review timestamp; also each appended history entry's decidedAt. */
  reviewedAt: string;
  /** Decisions recorded by this review call. */
  reviewedDecisionCount: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  waivedCount: number;
  /** The exact artifact version these decisions were applied against. */
  sourceExtractionDeltaArtifactId: string;
  sourceExtractionDeltaArtifactVersion: number;
};

/** Identifier/count projection of the new payload; no candidate bodies. */
export interface RfpExtractionDeltaReviewPayloadSummary {
  payloadKind: typeof RFP_EXTRACTION_DELTA_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  proposalSource: RfpExtractionDeltaProposalSource;
  inputPackageArtifactId: string;
  candidateCount: number;
  evidenceReferenceCount: number;
  reviewedBy: string;
  reviewedAt: string;
  reviewedDecisionCount: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  waivedCount: number;
  sourceExtractionDeltaArtifactId: string;
  sourceExtractionDeltaArtifactVersion: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
}

/** One offending edit_accept decision and its first failing reason. */
export interface RfpExtractionDeltaInvalidEditDetail {
  candidateId: string;
  reason: string;
}

/** Discriminated result of {@link reviewRfpExtractionDeltaArtifact}. */
export type ReviewRfpExtractionDeltaArtifactResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpExtractionDeltaProjectSummary }
  | { status: "extraction_delta_not_found" }
  | {
      status: "artifact_not_extraction_delta";
      artifact: RfpExtractionDeltaArtifactSummary;
    }
  | {
      status: "extraction_delta_not_reviewable";
      artifact: RfpExtractionDeltaArtifactSummary;
    }
  | {
      status: "invalid_extraction_delta_payload";
      artifact: RfpExtractionDeltaArtifactSummary;
    }
  | { status: "duplicate_decision"; candidateIds: string[] }
  | { status: "decision_target_not_found"; candidateIds: string[] }
  | { status: "candidate_not_pending"; candidateIds: string[] }
  | { status: "waiver_note_required"; candidateIds: string[] }
  | { status: "invalid_edit"; edits: RfpExtractionDeltaInvalidEditDetail[] }
  | {
      status: "ok";
      artifact: RfpExtractionDeltaArtifactSummary;
      payloadSummary: RfpExtractionDeltaReviewPayloadSummary;
    };

/** One shape-validated decision; editedFields stays raw until the edit gate. */
interface SanitizedDecision {
  candidateId: string;
  action: RfpExtractionDeltaReviewAction;
  note?: string;
  editedFields?: unknown;
}

/** One payload candidate that passed the payload gate; record kept to copy. */
interface LoadedCandidate {
  id: string;
  kind: RfpExtractionDeltaKind;
  reviewStatus: RfpExtractionDeltaReviewStatus;
  record: Record<string, unknown>;
}

/** The preserved original draft metadata of one valid loaded payload. */
interface ParsedExtractionDeltaPayload {
  createdBy: string;
  createdAt: string;
  proposalSource: RfpExtractionDeltaProposalSource;
  inputPackageArtifactId: string;
  candidates: LoadedCandidate[];
}

/** Outcome of sanitizing one edit_accept editedFields value. */
type SanitizedEditOutcome =
  | { edits: RfpExtractionDeltaEditedFields }
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

/** True for a finite number value. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Read one string field; "" when missing or not a string. */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Read one count field; 0 when missing or not a finite number. */
function asCount(value: unknown): number {
  return isFiniteNumber(value) ? value : 0;
}

/** Read one optional numeric field; omitted when not finite. */
function asOptionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

/** Read one optional string field; omitted when not a string. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Lean wrong-mode Project projection; tenantId is never surfaced. */
function toProjectSummary(project: Project): RfpExtractionDeltaProjectSummary {
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
): RfpExtractionDeltaArtifactSummary {
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
 * Validate one decision's shape. Throws deterministic programmer errors
 * naming decisions[index] for a non-object decision, a blank candidateId,
 * or an unknown action. The note sanitizes instead of throwing (trimmed;
 * omitted when blank or not a string - waive's required note is a
 * discriminated gate, not a throw); editedFields is carried raw and
 * validated by the edit gate only for edit_accept decisions.
 */
function sanitizeDecision(decision: unknown, index: number): SanitizedDecision {
  if (!isPlainObject(decision)) {
    throw new Error(`decisions[${index}] must be an object.`);
  }
  const candidateId =
    typeof decision.candidateId === "string" ? decision.candidateId.trim() : "";
  if (candidateId === "") {
    throw new Error(`decisions[${index}].candidateId is required.`);
  }
  const action = decision.action;
  if (!isOneOf(RFP_EXTRACTION_DELTA_REVIEW_ACTIONS, action)) {
    throw new Error(
      `decisions[${index}].action must be one of ${RFP_EXTRACTION_DELTA_REVIEW_ACTIONS.join(" | ")}.`
    );
  }
  const note =
    typeof decision.note === "string" && decision.note.trim() !== ""
      ? decision.note.trim()
      : undefined;
  return {
    candidateId,
    action,
    ...(note !== undefined ? { note } : {}),
    ...(decision.editedFields !== undefined
      ? { editedFields: decision.editedFields }
      : {}),
  };
}

/**
 * Parse one loaded extraction_delta payload, or null when it is not a
 * valid rfp_extraction_delta payload: the discriminator, the original
 * draft metadata (nonblank createdBy/createdAt, a known proposalSource, a
 * nonblank inputPackageArtifactId), and a candidate array whose entries
 * each carry a nonblank id, a known kind, and a known review status.
 */
function parseExtractionDeltaPayload(
  payload: unknown
): ParsedExtractionDeltaPayload | null {
  if (!isPlainObject(payload)) return null;
  if (payload.payloadKind !== RFP_EXTRACTION_DELTA_PAYLOAD_KIND) return null;
  const createdBy = payload.createdBy;
  if (typeof createdBy !== "string" || createdBy.trim() === "") return null;
  const createdAt = payload.createdAt;
  if (typeof createdAt !== "string" || createdAt.trim() === "") return null;
  const proposalSource = payload.proposalSource;
  if (!isOneOf(RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES, proposalSource)) {
    return null;
  }
  const inputPackageArtifactId = payload.inputPackageArtifactId;
  if (
    typeof inputPackageArtifactId !== "string" ||
    inputPackageArtifactId.trim() === ""
  ) {
    return null;
  }
  if (!Array.isArray(payload.candidates)) return null;
  const candidates: LoadedCandidate[] = [];
  for (const rawCandidate of payload.candidates) {
    if (!isPlainObject(rawCandidate)) return null;
    const id = rawCandidate.id;
    if (typeof id !== "string" || id.trim() === "") return null;
    const kind = rawCandidate.kind;
    if (!isOneOf(RFP_EXTRACTION_DELTA_KINDS, kind)) return null;
    const reviewStatus = rawCandidate.reviewStatus;
    if (!isOneOf(RFP_EXTRACTION_DELTA_REVIEW_STATUSES, reviewStatus)) {
      return null;
    }
    candidates.push({ id, kind, reviewStatus, record: rawCandidate });
  }
  return {
    createdBy,
    createdAt,
    proposalSource,
    inputPackageArtifactId,
    candidates,
  };
}

/**
 * Fresh locator-only copy of one stored evidence reference through the
 * per-kind whitelist, or null for a malformed stored value (dropped). A
 * stored text body or table rows matrix could never survive this copy.
 */
function copyEvidenceReference(
  value: unknown
): RfpExtractionDeltaEvidenceReference | null {
  if (!isPlainObject(value)) return null;
  if (value.evidenceKind === RFP_TEXT_CHUNK_EVIDENCE_KIND) {
    return {
      evidenceId: asString(value.evidenceId),
      evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
      sourceFileId: asString(value.sourceFileId),
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
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      sourceFileId: asString(value.sourceFileId),
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

/**
 * Whitelisted fresh copy of one stored editedFields value; undefined when
 * not a plain object or when no whitelisted field survives. Used only to
 * preserve already-stored history entries.
 */
function copyStoredEditedFields(
  value: unknown
): RfpExtractionDeltaEditedFields | undefined {
  if (!isPlainObject(value)) return undefined;
  const title = asOptionalString(value.title);
  const description = asOptionalString(value.description);
  const rawSeverity = value.severity;
  const severity = isOneOf(RFP_EXTRACTION_DELTA_SEVERITIES, rawSeverity)
    ? rawSeverity
    : undefined;
  const confidence = asOptionalNumber(value.confidence);
  const rationale = asOptionalString(value.rationale);
  const proposedEvidence = sanitizeRfpExtractionDeltaProposedEvidence(
    value.proposedEvidence
  );
  const copied: RfpExtractionDeltaEditedFields = {
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
 * Whitelisted fresh copy of one stored review-history entry; null for a
 * malformed stored value (dropped). Existing visible history is preserved
 * by copying - never by aliasing the loaded entry objects.
 */
function copyReviewHistoryEntry(
  value: unknown
): RfpExtractionDeltaReviewHistoryEntry | null {
  if (!isPlainObject(value)) return null;
  const action = value.action;
  if (!isOneOf(RFP_EXTRACTION_DELTA_REVIEW_ACTIONS, action)) return null;
  const previousReviewStatus = value.previousReviewStatus;
  const nextReviewStatus = value.nextReviewStatus;
  if (
    !isOneOf(RFP_EXTRACTION_DELTA_REVIEW_STATUSES, previousReviewStatus) ||
    !isOneOf(RFP_EXTRACTION_DELTA_REVIEW_STATUSES, nextReviewStatus)
  ) {
    return null;
  }
  const note = asOptionalString(value.note);
  const editedFields = copyStoredEditedFields(value.editedFields);
  return {
    action,
    decidedBy: asString(value.decidedBy),
    decidedAt: asString(value.decidedAt),
    previousReviewStatus,
    nextReviewStatus,
    ...(note !== undefined ? { note } : {}),
    ...(editedFields !== undefined ? { editedFields } : {}),
  };
}

/**
 * Fresh whitelisted copy of one loaded candidate: identity and display
 * fields, locator-only evidence references, the sanitized proposal, and
 * every existing visible review-history entry, in stored order. Never
 * aliases the loaded payload; malformed optional stored fields degrade
 * instead of throwing.
 */
function copyCandidate(loaded: LoadedCandidate): RfpExtractionDeltaCandidate {
  const record = loaded.record;
  const rawSeverity = record.severity;
  const severity = isOneOf(RFP_EXTRACTION_DELTA_SEVERITIES, rawSeverity)
    ? rawSeverity
    : "warning";
  const rawConfidence = record.confidence;
  const confidence =
    isFiniteNumber(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1
      ? rawConfidence
      : undefined;
  const rawRationale = record.rationale;
  const rationale =
    typeof rawRationale === "string" && rawRationale.trim() !== ""
      ? rawRationale
      : undefined;
  const evidenceReferences: RfpExtractionDeltaEvidenceReference[] = [];
  if (Array.isArray(record.evidenceReferences)) {
    for (const reference of record.evidenceReferences) {
      const copied = copyEvidenceReference(reference);
      if (copied !== null) evidenceReferences.push(copied);
    }
  }
  const proposedEvidence = sanitizeRfpExtractionDeltaProposedEvidence(
    record.proposedEvidence
  );
  const reviewHistory: RfpExtractionDeltaReviewHistoryEntry[] = [];
  if (Array.isArray(record.reviewHistory)) {
    for (const entry of record.reviewHistory) {
      const copied = copyReviewHistoryEntry(entry);
      if (copied !== null) reviewHistory.push(copied);
    }
  }
  return {
    id: loaded.id,
    kind: loaded.kind,
    sourceFileId: asString(record.sourceFileId),
    title: asString(record.title),
    description: asString(record.description),
    severity,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(rationale !== undefined ? { rationale } : {}),
    reviewStatus: loaded.reviewStatus,
    ...(reviewHistory.length > 0 ? { reviewHistory } : {}),
    evidenceReferences,
    ...(proposedEvidence !== undefined ? { proposedEvidence } : {}),
  };
}

/**
 * Validate and sanitize one edit_accept editedFields value against the
 * narrow editable whitelist. title/description, when present, must be
 * nonblank strings (trimmed); severity must be a known severity;
 * confidence must be finite 0..1 inclusive. rationale and
 * proposedEvidence sanitize instead of failing: a blank or non-string
 * rationale and a malformed proposal are simply not edits. Arbitrary keys
 * (id, kind, sourceFileId, evidence references, statuses, history,
 * pricing/SKU/config/catalog fields, ...) are ignored and never stored.
 * An edit that edits nothing is invalid - the caller wanted accept.
 */
function sanitizeEditedFieldsInput(value: unknown): SanitizedEditOutcome {
  if (!isPlainObject(value)) {
    return { reason: "editedFields must be an object." };
  }
  const edits: RfpExtractionDeltaEditedFields = {};
  if (value.title !== undefined) {
    if (typeof value.title !== "string" || value.title.trim() === "") {
      return { reason: "editedFields.title must be a nonblank string." };
    }
    edits.title = value.title.trim();
  }
  if (value.description !== undefined) {
    if (
      typeof value.description !== "string" ||
      value.description.trim() === ""
    ) {
      return { reason: "editedFields.description must be a nonblank string." };
    }
    edits.description = value.description.trim();
  }
  if (value.severity !== undefined) {
    const rawSeverity = value.severity;
    if (!isOneOf(RFP_EXTRACTION_DELTA_SEVERITIES, rawSeverity)) {
      return {
        reason: `editedFields.severity must be one of ${RFP_EXTRACTION_DELTA_SEVERITIES.join(" | ")}.`,
      };
    }
    edits.severity = rawSeverity;
  }
  if (value.confidence !== undefined) {
    const rawConfidence = value.confidence;
    if (
      !isFiniteNumber(rawConfidence) ||
      rawConfidence < 0 ||
      rawConfidence > 1
    ) {
      return {
        reason:
          "editedFields.confidence must be a finite number between 0 and 1 inclusive.",
      };
    }
    edits.confidence = rawConfidence;
  }
  if (typeof value.rationale === "string" && value.rationale.trim() !== "") {
    edits.rationale = value.rationale.trim();
  }
  const proposedEvidence = sanitizeRfpExtractionDeltaProposedEvidence(
    value.proposedEvidence
  );
  if (proposedEvidence !== undefined) {
    edits.proposedEvidence = proposedEvidence;
  }
  if (Object.keys(edits).length === 0) {
    return {
      reason:
        "editedFields must edit at least one of title, description, severity, confidence, rationale, proposedEvidence.",
    };
  }
  return { edits };
}

/** Fresh copy of sanitized edits; the proposal is re-copied, never shared. */
function freshEditedFields(
  edits: RfpExtractionDeltaEditedFields
): RfpExtractionDeltaEditedFields {
  const proposedEvidence =
    edits.proposedEvidence !== undefined
      ? sanitizeRfpExtractionDeltaProposedEvidence(edits.proposedEvidence)
      : undefined;
  return {
    ...(edits.title !== undefined ? { title: edits.title } : {}),
    ...(edits.description !== undefined
      ? { description: edits.description }
      : {}),
    ...(edits.severity !== undefined ? { severity: edits.severity } : {}),
    ...(edits.confidence !== undefined
      ? { confidence: edits.confidence }
      : {}),
    ...(edits.rationale !== undefined ? { rationale: edits.rationale } : {}),
    ...(proposedEvidence !== undefined ? { proposedEvidence } : {}),
  };
}

/**
 * Apply one decision to one fresh pending candidate copy: set the next
 * review status, apply sanitized edit_accept fields onto the editable
 * surface only, and append one visible history entry after the already
 * copied existing entries. The applied proposal and the history entry's
 * editedFields proposal are separate fresh copies - nothing is shared.
 */
function decideCandidate(
  copied: RfpExtractionDeltaCandidate,
  decision: SanitizedDecision,
  edits: RfpExtractionDeltaEditedFields | undefined,
  decidedBy: string,
  decidedAtIso: string
): RfpExtractionDeltaCandidate {
  const nextReviewStatus = REVIEW_ACTION_NEXT_STATUS[decision.action];
  const entry: RfpExtractionDeltaReviewHistoryEntry = {
    action: decision.action,
    decidedBy,
    decidedAt: decidedAtIso,
    previousReviewStatus: copied.reviewStatus,
    nextReviewStatus,
    ...(decision.note !== undefined ? { note: decision.note } : {}),
    ...(edits !== undefined ? { editedFields: freshEditedFields(edits) } : {}),
  };
  const reviewHistory = (copied.reviewHistory ?? []).concat(entry);
  const confidence =
    edits?.confidence !== undefined ? edits.confidence : copied.confidence;
  const rationale =
    edits?.rationale !== undefined ? edits.rationale : copied.rationale;
  const proposedEvidence =
    edits?.proposedEvidence !== undefined
      ? sanitizeRfpExtractionDeltaProposedEvidence(edits.proposedEvidence)
      : copied.proposedEvidence;
  return {
    id: copied.id,
    kind: copied.kind,
    sourceFileId: copied.sourceFileId,
    title: edits?.title !== undefined ? edits.title : copied.title,
    description:
      edits?.description !== undefined ? edits.description : copied.description,
    severity: edits?.severity !== undefined ? edits.severity : copied.severity,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(rationale !== undefined ? { rationale } : {}),
    reviewStatus: nextReviewStatus,
    reviewHistory,
    evidenceReferences: copied.evidenceReferences,
    ...(proposedEvidence !== undefined ? { proposedEvidence } : {}),
  };
}

/**
 * Persist engineer review decisions for ONE exact needs_review
 * extraction_delta artifact version as ONE new extraction_delta version.
 * Validates nonblank projectId, extractionDeltaArtifactId, and
 * reviewedBy, an optional valid decidedAt Date, an array of decisions,
 * and every decision's candidateId/action shape before any store call
 * (deterministic programmer errors naming decisions[index]); reviewedBy
 * and decision candidateIds/notes are trimmed. Gates in order, tenant
 * scoped on every store call: project existence, rfp mode, exact
 * artifact existence, extraction_delta type within the
 * intake_package_review stage, needs_review status, then a valid
 * rfp_extraction_delta payload. Decision gates follow, each one
 * returning every offender in decision order before anything persists:
 * duplicate candidateIds, unknown candidateIds, candidates that are not
 * pending_review, waive decisions without a nonblank note, and invalid
 * edit_accept edits. On success exactly one new needs_review
 * extraction_delta version is created at intake_package_review:
 * undecided candidates are preserved as fresh whitelisted copies (status
 * and history untouched), decided candidates get the action's review
 * status, the sanitized edits where edit_accept applied them, and one
 * appended visible history entry; the payload preserves the original
 * draft metadata, recomputes the counts, stamps the review provenance
 * (reviewedBy, reviewedAt, reviewedDecisionCount, per-status counts, and
 * the reviewed artifact id/version), copies the reviewed artifact's
 * sourceFileIds, and extends its sourceArtifactIds with the reviewed
 * artifact id without duplicates. Review decisions recorded here are
 * candidate review metadata only - never final evidence authority. The
 * ok result surfaces lean artifact and payload summaries only - never a
 * candidate body or proposal. Nothing is mutated; store failures bubble.
 */
export async function reviewRfpExtractionDeltaArtifact(
  input: ReviewRfpExtractionDeltaArtifactInput
): Promise<ReviewRfpExtractionDeltaArtifactResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (
    typeof input.extractionDeltaArtifactId !== "string" ||
    input.extractionDeltaArtifactId.trim() === ""
  ) {
    throw new Error("extractionDeltaArtifactId is required.");
  }
  if (typeof input.reviewedBy !== "string" || input.reviewedBy.trim() === "") {
    throw new Error("reviewedBy is required.");
  }
  if (
    input.decidedAt !== undefined &&
    (!(input.decidedAt instanceof Date) ||
      Number.isNaN(input.decidedAt.getTime()))
  ) {
    throw new Error("decidedAt must be a valid Date.");
  }
  if (!Array.isArray(input.decisions)) {
    throw new Error("decisions must be an array.");
  }
  const reviewedBy = input.reviewedBy.trim();
  const { tenantId, projectId, extractionDeltaArtifactId } = input;
  const decisions = input.decisions.map((decision, index) =>
    sanitizeDecision(decision, index)
  );
  const decidedAtIso = (input.decidedAt ?? new Date()).toISOString();

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const reviewedArtifact = await getProjectArtifactById(
    tenantId,
    projectId,
    extractionDeltaArtifactId
  );
  if (reviewedArtifact === null) {
    return { status: "extraction_delta_not_found" };
  }
  if (
    reviewedArtifact.type !== EXTRACTION_DELTA_ARTIFACT_TYPE ||
    reviewedArtifact.stageId !== EXTRACTION_DELTA_STAGE_ID
  ) {
    return {
      status: "artifact_not_extraction_delta",
      artifact: toArtifactSummary(reviewedArtifact),
    };
  }
  if (reviewedArtifact.status !== REVIEWABLE_ARTIFACT_STATUS) {
    return {
      status: "extraction_delta_not_reviewable",
      artifact: toArtifactSummary(reviewedArtifact),
    };
  }
  const parsed = parseExtractionDeltaPayload(reviewedArtifact.payload);
  if (parsed === null) {
    return {
      status: "invalid_extraction_delta_payload",
      artifact: toArtifactSummary(reviewedArtifact),
    };
  }

  // Duplicate decisions for the same candidate fail the whole review;
  // offenders are reported deduped in decision order.
  const duplicateCandidateIds: string[] = [];
  const seenCandidateIds = new Set<string>();
  const seenDuplicates = new Set<string>();
  for (const decision of decisions) {
    if (!seenCandidateIds.has(decision.candidateId)) {
      seenCandidateIds.add(decision.candidateId);
      continue;
    }
    if (seenDuplicates.has(decision.candidateId)) continue;
    seenDuplicates.add(decision.candidateId);
    duplicateCandidateIds.push(decision.candidateId);
  }
  if (duplicateCandidateIds.length > 0) {
    return {
      status: "duplicate_decision",
      candidateIds: duplicateCandidateIds,
    };
  }

  const candidateById = new Map<string, LoadedCandidate>();
  for (const candidate of parsed.candidates) {
    candidateById.set(candidate.id, candidate);
  }
  const unknownCandidateIds = decisions
    .filter((decision) => !candidateById.has(decision.candidateId))
    .map((decision) => decision.candidateId);
  if (unknownCandidateIds.length > 0) {
    return {
      status: "decision_target_not_found",
      candidateIds: unknownCandidateIds,
    };
  }

  const notPendingCandidateIds = decisions
    .filter((decision) => {
      const target = candidateById.get(decision.candidateId);
      return (
        target !== undefined && target.reviewStatus !== PENDING_REVIEW_STATUS
      );
    })
    .map((decision) => decision.candidateId);
  if (notPendingCandidateIds.length > 0) {
    return {
      status: "candidate_not_pending",
      candidateIds: notPendingCandidateIds,
    };
  }

  const missingWaiverNoteCandidateIds = decisions
    .filter(
      (decision) => decision.action === "waive" && decision.note === undefined
    )
    .map((decision) => decision.candidateId);
  if (missingWaiverNoteCandidateIds.length > 0) {
    return {
      status: "waiver_note_required",
      candidateIds: missingWaiverNoteCandidateIds,
    };
  }

  const invalidEdits: RfpExtractionDeltaInvalidEditDetail[] = [];
  const editsByCandidateId = new Map<string, RfpExtractionDeltaEditedFields>();
  for (const decision of decisions) {
    if (decision.action !== "edit_accept") continue;
    const outcome = sanitizeEditedFieldsInput(decision.editedFields);
    if ("reason" in outcome) {
      invalidEdits.push({
        candidateId: decision.candidateId,
        reason: outcome.reason,
      });
      continue;
    }
    editsByCandidateId.set(decision.candidateId, outcome.edits);
  }
  if (invalidEdits.length > 0) {
    return { status: "invalid_edit", edits: invalidEdits };
  }

  const decisionByCandidateId = new Map<string, SanitizedDecision>();
  for (const decision of decisions) {
    decisionByCandidateId.set(decision.candidateId, decision);
  }
  const candidates: RfpExtractionDeltaCandidate[] = parsed.candidates.map(
    (loaded) => {
      const copied = copyCandidate(loaded);
      const decision = decisionByCandidateId.get(loaded.id);
      if (decision === undefined) return copied;
      return decideCandidate(
        copied,
        decision,
        editsByCandidateId.get(loaded.id),
        reviewedBy,
        decidedAtIso
      );
    }
  );

  let evidenceReferenceCount = 0;
  let pendingCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let waivedCount = 0;
  for (const candidate of candidates) {
    evidenceReferenceCount += candidate.evidenceReferences.length;
    if (candidate.reviewStatus === "pending_review") pendingCount += 1;
    else if (candidate.reviewStatus === "accepted") acceptedCount += 1;
    else if (candidate.reviewStatus === "rejected") rejectedCount += 1;
    else waivedCount += 1;
  }

  // Version provenance: keep the original source artifact ids and add the
  // reviewed extraction delta artifact id, first-seen order, no duplicates.
  const sourceArtifactIds: string[] = [];
  const seenSourceArtifactIds = new Set<string>();
  for (const artifactId of reviewedArtifact.sourceArtifactIds) {
    if (seenSourceArtifactIds.has(artifactId)) continue;
    seenSourceArtifactIds.add(artifactId);
    sourceArtifactIds.push(artifactId);
  }
  if (!seenSourceArtifactIds.has(extractionDeltaArtifactId)) {
    sourceArtifactIds.push(extractionDeltaArtifactId);
  }

  const payload: RfpExtractionDeltaReviewedPayload = {
    payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
    createdBy: parsed.createdBy,
    createdAt: parsed.createdAt,
    proposalSource: parsed.proposalSource,
    inputPackageArtifactId: parsed.inputPackageArtifactId,
    candidateCount: candidates.length,
    evidenceReferenceCount,
    reviewedBy,
    reviewedAt: decidedAtIso,
    reviewedDecisionCount: decisions.length,
    pendingCount,
    acceptedCount,
    rejectedCount,
    waivedCount,
    sourceExtractionDeltaArtifactId: extractionDeltaArtifactId,
    sourceExtractionDeltaArtifactVersion: reviewedArtifact.version,
    sourceFileIds: reviewedArtifact.sourceFileIds.slice(),
    sourceArtifactIds: sourceArtifactIds.slice(),
    candidates,
  };

  const stored = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: EXTRACTION_DELTA_STAGE_ID,
    type: EXTRACTION_DELTA_ARTIFACT_TYPE,
    status: "needs_review",
    payload,
    sourceFileIds: reviewedArtifact.sourceFileIds.slice(),
    sourceArtifactIds: sourceArtifactIds.slice(),
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(stored),
    payloadSummary: {
      payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
      createdBy: parsed.createdBy,
      createdAt: parsed.createdAt,
      proposalSource: parsed.proposalSource,
      inputPackageArtifactId: parsed.inputPackageArtifactId,
      candidateCount: candidates.length,
      evidenceReferenceCount,
      reviewedBy,
      reviewedAt: decidedAtIso,
      reviewedDecisionCount: decisions.length,
      pendingCount,
      acceptedCount,
      rejectedCount,
      waivedCount,
      sourceExtractionDeltaArtifactId: extractionDeltaArtifactId,
      sourceExtractionDeltaArtifactVersion: reviewedArtifact.version,
      sourceFileIds: reviewedArtifact.sourceFileIds.slice(),
      sourceArtifactIds: sourceArtifactIds.slice(),
    },
  };
}
