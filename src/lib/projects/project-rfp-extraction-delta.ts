/**
 * RFP extraction-delta candidate draft service (Stage 1A foundation).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Records extraction-delta candidates against ONE approved input_package
 * artifact version as ONE reviewable extraction_delta draft - the
 * provider-neutral candidate boundary deterministic checks, engineers, or
 * a later AI executor propose extraction corrections through. Every
 * stored candidate is a pending proposal and never authority: this
 * service cannot accept, apply, replace, validate, approve, price, or
 * configure anything, and the only review status it can write is
 * "pending_review" (delta-review decisions and final evidence-package
 * approval are later prompts). It is deterministic Project-state
 * assembly only: no AI or model call, no OCR, no document parsing, no
 * file or storage reads, no evidence persistence, no evidence-package
 * assembly, no approvals, no routes or UI, and no SKU, catalog, pricing,
 * or configuration logic. The two RFP extraction evidence kind literals
 * are defined locally so this module never pulls the extraction or
 * persistence write modules into its graph. Candidates are validated
 * before any store call (deterministic programmer errors naming
 * candidates[index]) and sanitized through explicit per-field whitelists;
 * cited persisted evidence rows become locator-only references (ids,
 * positions, and counts - never the stored text body or table rows), and
 * proposedEvidence is copied through a per-kind whitelist with fresh row
 * matrices. Gates in order, tenant scoped on every store call: project
 * existence, rfp mode, exact input_package artifact existence,
 * input_package type within the intake_package_review stage, approved
 * status, nonempty sourceFileIds, every candidate sourceFileId inside the
 * package, and every cited evidence id loadable, of an RFP extraction
 * kind, and stored for this exact package id. On success exactly one
 * needs_review extraction_delta version is created at
 * intake_package_review; its payload never carries a package payload
 * field, a tenantId, an arbitrary evidence or proposal key, raw file
 * bytes, raw AI output, or a thrown error. Returned summaries are lean
 * and serializable (ISO dates, copied arrays, identifiers and counts; the
 * full payload is never surfaced). Inputs, loaded rows, and artifacts are
 * never mutated; store failures bubble to the caller unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import { getProjectEvidenceItemById } from "@/lib/db/project-evidence-store";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";

/** Payload discriminator stamped on every extraction_delta draft payload. */
export const RFP_EXTRACTION_DELTA_PAYLOAD_KIND = "rfp_extraction_delta";

/** The closed candidate-kind vocabulary of one extraction delta. */
export const RFP_EXTRACTION_DELTA_KINDS = [
  "missing_evidence",
  "incorrect_extraction",
  "table_reconstruction",
  "suspicious_item",
] as const;

/** Kind of one delta candidate. */
export type RfpExtractionDeltaKind =
  (typeof RFP_EXTRACTION_DELTA_KINDS)[number];

/** Who proposed the candidates; a provenance label, never an executor. */
export const RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES = [
  "deterministic",
  "ai",
  "engineer",
] as const;

/** Provenance of one draft's candidates. */
export type RfpExtractionDeltaProposalSource =
  (typeof RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES)[number];

/** The closed candidate severity vocabulary. */
export const RFP_EXTRACTION_DELTA_SEVERITIES = [
  "info",
  "warning",
  "blocking",
] as const;

/** Severity of one delta candidate; defaults to "warning". */
export type RfpExtractionDeltaSeverity =
  (typeof RFP_EXTRACTION_DELTA_SEVERITIES)[number];

const DEFAULT_SEVERITY: RfpExtractionDeltaSeverity = "warning";

/** The artifact type / stage this service creates. */
const EXTRACTION_DELTA_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "extraction_delta";
const EXTRACTION_DELTA_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/** The only artifact type / stage accepted as the package input. */
const INPUT_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] = "input_package";
const INPUT_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/**
 * The two persisted RFP extraction evidence kinds a candidate may cite.
 * Defined locally on purpose: importing them would pull the
 * extraction/persistence write modules into this draft service.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/** Kind of one citable persisted RFP extraction evidence row. */
type CitableEvidenceKind =
  | typeof RFP_TEXT_CHUNK_EVIDENCE_KIND
  | typeof RFP_TABLE_EVIDENCE_KIND;

/** Caller-proposed replacement text chunk; a proposal only, never final. */
export interface RfpExtractionDeltaProposedTextEvidenceInput {
  evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
  text?: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  chunkIndex?: number;
  chunkCount?: number;
  charCount?: number;
}

/** Caller-proposed replacement table; a proposal only, never final. */
export interface RfpExtractionDeltaProposedTableEvidenceInput {
  evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
  tableId?: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  sheetName?: string;
  pageNumber?: number;
  rowCount?: number;
  columnCount?: number;
  rows?: string[][];
}

/** One caller-proposed evidence body, sanitized before storage. */
export type RfpExtractionDeltaProposedEvidenceInput =
  | RfpExtractionDeltaProposedTextEvidenceInput
  | RfpExtractionDeltaProposedTableEvidenceInput;

/** One caller-supplied delta candidate; validated before any store call. */
export interface RfpExtractionDeltaCandidateInput {
  kind: RfpExtractionDeltaKind;
  /** Must be one of the approved input package's sourceFileIds. */
  sourceFileId: string;
  title: string;
  description: string;
  /** Defaults to "warning" when omitted. */
  severity?: RfpExtractionDeltaSeverity;
  /** Finite and between 0 and 1 inclusive when present. */
  confidence?: number;
  rationale?: string;
  /** Ids of persisted evidence rows this candidate cites. */
  evidenceIds?: string[];
  proposedEvidence?: RfpExtractionDeltaProposedEvidenceInput;
}

/** Input for {@link createRfpExtractionDeltaDraft}. */
export interface CreateRfpExtractionDeltaDraftInput {
  tenantId: string;
  projectId: string;
  /** The exact APPROVED input_package version the candidates are against. */
  inputPackageArtifactId: string;
  createdBy: string;
  proposalSource: RfpExtractionDeltaProposalSource;
  /** May be empty: "no delta candidates found" is a valid draft. */
  candidates: RfpExtractionDeltaCandidateInput[];
}

/** Locator-only reference to one persisted text-chunk evidence row. */
export interface RfpExtractionDeltaTextEvidenceReference {
  evidenceId: string;
  evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  chunkIndex: number;
  chunkCount: number;
  charCount: number;
}

/** Locator-only reference to one persisted table evidence row. */
export interface RfpExtractionDeltaTableEvidenceReference {
  evidenceId: string;
  evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  tableId: string;
  /** Present only when the stored content field is a finite number. */
  pageNumber?: number;
  /** Present only when the stored content field is a string. */
  sheetName?: string;
  rowCount: number;
  columnCount: number;
}

/** A locator only - never the stored text body or table rows. */
export type RfpExtractionDeltaEvidenceReference =
  | RfpExtractionDeltaTextEvidenceReference
  | RfpExtractionDeltaTableEvidenceReference;

/** Sanitized stored copy of one proposed text chunk. */
export interface RfpExtractionDeltaProposedTextEvidence {
  evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
  /** The proposed text body; "" when the proposal field is not a string. */
  text: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  chunkIndex?: number;
  chunkCount?: number;
  charCount?: number;
}

/** Sanitized stored copy of one proposed table; rows are a fresh matrix. */
export interface RfpExtractionDeltaProposedTableEvidence {
  evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
  tableId?: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  sheetName?: string;
  pageNumber?: number;
  rowCount?: number;
  columnCount?: number;
  /** Fresh matrix copy; malformed cells/rows/matrix degrade to ""/[]/[]. */
  rows: string[][];
}

/** Whitelisted sanitized proposal copy; a proposal only, never final. */
export type RfpExtractionDeltaProposedEvidence =
  | RfpExtractionDeltaProposedTextEvidence
  | RfpExtractionDeltaProposedTableEvidence;

/** One stored pending candidate. The review decision is a later prompt. */
export interface RfpExtractionDeltaCandidate {
  /** Deterministic in candidate order: RFP-DELTA-001, RFP-DELTA-002, ... */
  id: string;
  kind: RfpExtractionDeltaKind;
  sourceFileId: string;
  title: string;
  description: string;
  severity: RfpExtractionDeltaSeverity;
  confidence?: number;
  rationale?: string;
  /** The only review status this service can write. */
  reviewStatus: "pending_review";
  /** Locator-only references to cited rows, in candidate citation order. */
  evidenceReferences: RfpExtractionDeltaEvidenceReference[];
  proposedEvidence?: RfpExtractionDeltaProposedEvidence;
}

/** The extraction_delta draft artifact payload. */
export type RfpExtractionDeltaPayload = {
  payloadKind: typeof RFP_EXTRACTION_DELTA_PAYLOAD_KIND;
  createdBy: string;
  /** ISO creation timestamp. */
  createdAt: string;
  proposalSource: RfpExtractionDeltaProposalSource;
  inputPackageArtifactId: string;
  candidateCount: number;
  evidenceReferenceCount: number;
  /** Copied from the approved input package, order preserved. */
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  /** Pending candidates with deterministic ids, in candidate order. */
  candidates: RfpExtractionDeltaCandidate[];
};

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpExtractionDeltaProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied arrays, no payload. */
export interface RfpExtractionDeltaArtifactSummary {
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

/** Lean serializable evidence-row projection; content is never surfaced. */
export interface RfpExtractionDeltaEvidenceSummary {
  id: string;
  projectId: string;
  sourceFileId: string;
  kind: string;
  extractedAt: string;
  retainUntil: string;
}

/** Identifier/count projection of the created payload; no candidate bodies. */
export interface RfpExtractionDeltaPayloadSummary {
  payloadKind: typeof RFP_EXTRACTION_DELTA_PAYLOAD_KIND;
  createdBy: string;
  createdAt: string;
  proposalSource: RfpExtractionDeltaProposalSource;
  inputPackageArtifactId: string;
  candidateCount: number;
  evidenceReferenceCount: number;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
}

/** Discriminated result of {@link createRfpExtractionDeltaDraft}. */
export type CreateRfpExtractionDeltaDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpExtractionDeltaProjectSummary }
  | { status: "input_package_not_found" }
  | {
      status: "artifact_not_input_package";
      artifact: RfpExtractionDeltaArtifactSummary;
    }
  | {
      status: "input_package_not_approved";
      artifact: RfpExtractionDeltaArtifactSummary;
    }
  | {
      status: "input_package_has_no_source_files";
      artifact: RfpExtractionDeltaArtifactSummary;
    }
  | {
      status: "candidate_source_file_not_in_package";
      /** Every offending candidate sourceFileId, deduped in candidate order. */
      sourceFileIds: string[];
    }
  | { status: "evidence_not_found"; missingEvidenceIds: string[] }
  | {
      status: "evidence_not_rfp_extraction";
      evidence: RfpExtractionDeltaEvidenceSummary[];
    }
  | {
      status: "evidence_not_for_input_package";
      evidence: RfpExtractionDeltaEvidenceSummary[];
    }
  | {
      status: "ok";
      artifact: RfpExtractionDeltaArtifactSummary;
      payloadSummary: RfpExtractionDeltaPayloadSummary;
    };

/** One validated, sanitized candidate before evidence resolution. */
interface SanitizedCandidate {
  kind: RfpExtractionDeltaKind;
  sourceFileId: string;
  title: string;
  description: string;
  severity: RfpExtractionDeltaSeverity;
  confidence?: number;
  rationale?: string;
  evidenceIds: string[];
  proposedEvidence?: RfpExtractionDeltaProposedEvidence;
}

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

/** True for the only two evidence kinds a candidate may cite. */
function isRfpExtractionEvidenceKind(
  kind: string
): kind is CitableEvidenceKind {
  return (
    kind === RFP_TEXT_CHUNK_EVIDENCE_KIND || kind === RFP_TABLE_EVIDENCE_KIND
  );
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

/**
 * Fresh string matrix copy of one proposed rows value: a malformed cell
 * degrades to "", a malformed row to [], and a malformed matrix to [].
 */
function toTableRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => (typeof cell === "string" ? cell : ""))
      : []
  );
}

/** Deterministic candidate id for one 1-based candidate position. */
function toCandidateId(position: number): string {
  return `RFP-DELTA-${String(position).padStart(3, "0")}`;
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

/** Lean diagnostic projection of one loaded evidence row; no content. */
function toEvidenceSummary(
  item: ProjectEvidenceItem
): RfpExtractionDeltaEvidenceSummary {
  return {
    id: item.id,
    projectId: item.projectId,
    sourceFileId: item.sourceFileId,
    kind: item.kind,
    extractedAt: item.extractedAt.toISOString(),
    retainUntil: item.retainUntil.toISOString(),
  };
}

/**
 * Locator-only reference to one loaded evidence row: identifier and
 * position/count fields read through per-kind whitelists. The stored text
 * body and table rows are never copied into a reference.
 */
function toEvidenceReference(
  item: ProjectEvidenceItem,
  inputPackageArtifactId: string
): RfpExtractionDeltaEvidenceReference {
  const content = item.content;
  if (item.kind === RFP_TEXT_CHUNK_EVIDENCE_KIND) {
    return {
      evidenceId: item.id,
      evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
      sourceFileId: item.sourceFileId,
      inputPackageArtifactId,
      chunkIndex: asCount(content.chunkIndex),
      chunkCount: asCount(content.chunkCount),
      charCount: asCount(content.charCount),
    };
  }
  const pageNumber = asOptionalNumber(content.pageNumber);
  const sheetName = asOptionalString(content.sheetName);
  return {
    evidenceId: item.id,
    evidenceKind: RFP_TABLE_EVIDENCE_KIND,
    sourceFileId: item.sourceFileId,
    inputPackageArtifactId,
    tableId: asString(content.tableId),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...(sheetName !== undefined ? { sheetName } : {}),
    rowCount: asCount(content.rowCount),
    columnCount: asCount(content.columnCount),
  };
}

/**
 * Whitelisted sanitized copy of one proposed evidence value, or undefined
 * (the candidate omits the field) when the proposal is missing, not a
 * plain object, or not one of the two RFP extraction kinds. Arbitrary
 * proposal keys are never copied; a malformed proposal never throws.
 */
function sanitizeProposedEvidence(
  value: unknown
): RfpExtractionDeltaProposedEvidence | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.evidenceKind === RFP_TEXT_CHUNK_EVIDENCE_KIND) {
    const sourceFileName = asOptionalString(record.sourceFileName);
    const sourceFileRole = asOptionalString(record.sourceFileRole);
    const chunkIndex = asOptionalNumber(record.chunkIndex);
    const chunkCount = asOptionalNumber(record.chunkCount);
    const charCount = asOptionalNumber(record.charCount);
    return {
      evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
      text: asString(record.text),
      ...(sourceFileName !== undefined ? { sourceFileName } : {}),
      ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
      ...(chunkIndex !== undefined ? { chunkIndex } : {}),
      ...(chunkCount !== undefined ? { chunkCount } : {}),
      ...(charCount !== undefined ? { charCount } : {}),
    };
  }
  if (record.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const tableId = asOptionalString(record.tableId);
    const sourceFileName = asOptionalString(record.sourceFileName);
    const sourceFileRole = asOptionalString(record.sourceFileRole);
    const sheetName = asOptionalString(record.sheetName);
    const pageNumber = asOptionalNumber(record.pageNumber);
    const rowCount = asOptionalNumber(record.rowCount);
    const columnCount = asOptionalNumber(record.columnCount);
    return {
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      ...(tableId !== undefined ? { tableId } : {}),
      ...(sourceFileName !== undefined ? { sourceFileName } : {}),
      ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(rowCount !== undefined ? { rowCount } : {}),
      ...(columnCount !== undefined ? { columnCount } : {}),
      rows: toTableRows(record.rows),
    };
  }
  return undefined;
}

/**
 * Validate and sanitize one candidate. Throws deterministic programmer
 * errors naming candidates[index] for a non-object candidate, an unknown
 * kind, a blank sourceFileId/title/description, an unknown severity, or a
 * non-finite/out-of-range confidence. Rationale, evidenceIds, and
 * proposedEvidence sanitize instead of throwing: rationale is trimmed and
 * omitted when blank or not a string; evidenceIds drops non-string and
 * blank entries, trims, and dedupes preserving first-seen order; a
 * missing or malformed proposedEvidence is omitted.
 */
function sanitizeCandidate(candidate: unknown, index: number): SanitizedCandidate {
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    throw new Error(`candidates[${index}] must be an object.`);
  }
  const record = candidate as Record<string, unknown>;
  const kind = record.kind;
  if (!isOneOf(RFP_EXTRACTION_DELTA_KINDS, kind)) {
    throw new Error(
      `candidates[${index}].kind must be one of ${RFP_EXTRACTION_DELTA_KINDS.join(" | ")}.`
    );
  }
  const sourceFileId =
    typeof record.sourceFileId === "string" ? record.sourceFileId.trim() : "";
  if (sourceFileId === "") {
    throw new Error(`candidates[${index}].sourceFileId is required.`);
  }
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (title === "") {
    throw new Error(`candidates[${index}].title is required.`);
  }
  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  if (description === "") {
    throw new Error(`candidates[${index}].description is required.`);
  }
  let severity: RfpExtractionDeltaSeverity = DEFAULT_SEVERITY;
  const rawSeverity = record.severity;
  if (rawSeverity !== undefined) {
    if (!isOneOf(RFP_EXTRACTION_DELTA_SEVERITIES, rawSeverity)) {
      throw new Error(
        `candidates[${index}].severity must be one of ${RFP_EXTRACTION_DELTA_SEVERITIES.join(" | ")}.`
      );
    }
    severity = rawSeverity;
  }
  let confidence: number | undefined;
  const rawConfidence = record.confidence;
  if (rawConfidence !== undefined) {
    if (
      !isFiniteNumber(rawConfidence) ||
      rawConfidence < 0 ||
      rawConfidence > 1
    ) {
      throw new Error(
        `candidates[${index}].confidence must be a finite number between 0 and 1 inclusive.`
      );
    }
    confidence = rawConfidence;
  }
  const rationale =
    typeof record.rationale === "string" && record.rationale.trim() !== ""
      ? record.rationale.trim()
      : undefined;
  const evidenceIds: string[] = [];
  const seenEvidenceIds = new Set<string>();
  if (Array.isArray(record.evidenceIds)) {
    for (const rawId of record.evidenceIds) {
      if (typeof rawId !== "string") continue;
      const evidenceId = rawId.trim();
      if (evidenceId === "" || seenEvidenceIds.has(evidenceId)) continue;
      seenEvidenceIds.add(evidenceId);
      evidenceIds.push(evidenceId);
    }
  }
  const proposedEvidence = sanitizeProposedEvidence(record.proposedEvidence);
  return {
    kind,
    sourceFileId,
    title,
    description,
    severity,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(rationale !== undefined ? { rationale } : {}),
    evidenceIds,
    ...(proposedEvidence !== undefined ? { proposedEvidence } : {}),
  };
}

/**
 * Create ONE reviewable extraction_delta draft artifact version recording
 * pending delta candidates against ONE approved input_package version.
 * Validates nonblank projectId, inputPackageArtifactId, and createdBy, a
 * known proposalSource, an array of candidates, and every candidate field
 * before any store call (deterministic programmer errors naming
 * candidates[index]); createdBy is stored trimmed and candidates may be
 * empty ("no delta candidates found"). Gates in order, tenant scoped on
 * every store call: project existence, rfp mode, exact artifact
 * existence, input_package type within the intake_package_review stage,
 * approved status, nonempty sourceFileIds, every candidate sourceFileId
 * inside the package (offenders deduped in candidate order), then every
 * unique cited evidence id loaded once in candidate citation order and
 * required to exist, be an RFP extraction kind, and be stored for this
 * exact package id - any failed gate creates nothing. On success exactly
 * one needs_review extraction_delta version is created at
 * intake_package_review whose sourceFileIds copy the package list in
 * order and whose sourceArtifactIds are exactly the package id; the
 * payload carries the discriminator, trimmed createdBy, ISO createdAt,
 * proposalSource, counts, the copied id arrays, and the pending
 * candidates with deterministic ids (RFP-DELTA-001, ...), locator-only
 * evidence references, and sanitized proposals. Every candidate stays
 * reviewStatus "pending_review" - this service never accepts, applies, or
 * approves a proposal. The ok result surfaces lean artifact and payload
 * summaries only - never the full payload. Nothing is mutated; store
 * failures bubble.
 */
export async function createRfpExtractionDeltaDraft(
  input: CreateRfpExtractionDeltaDraftInput
): Promise<CreateRfpExtractionDeltaDraftResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (
    typeof input.inputPackageArtifactId !== "string" ||
    input.inputPackageArtifactId.trim() === ""
  ) {
    throw new Error("inputPackageArtifactId is required.");
  }
  if (typeof input.createdBy !== "string" || input.createdBy.trim() === "") {
    throw new Error("createdBy is required.");
  }
  if (!isOneOf(RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES, input.proposalSource)) {
    throw new Error(
      `proposalSource must be one of ${RFP_EXTRACTION_DELTA_PROPOSAL_SOURCES.join(" | ")}.`
    );
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error("candidates must be an array.");
  }
  const createdBy = input.createdBy.trim();
  const proposalSource = input.proposalSource;
  const { tenantId, projectId, inputPackageArtifactId } = input;
  const sanitized = input.candidates.map((candidate, index) =>
    sanitizeCandidate(candidate, index)
  );

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  const inputPackage = await getProjectArtifactById(
    tenantId,
    projectId,
    inputPackageArtifactId
  );
  if (inputPackage === null) return { status: "input_package_not_found" };
  if (
    inputPackage.type !== INPUT_PACKAGE_ARTIFACT_TYPE ||
    inputPackage.stageId !== INPUT_PACKAGE_STAGE_ID
  ) {
    return {
      status: "artifact_not_input_package",
      artifact: toArtifactSummary(inputPackage),
    };
  }
  if (inputPackage.status !== "approved") {
    return {
      status: "input_package_not_approved",
      artifact: toArtifactSummary(inputPackage),
    };
  }
  if (inputPackage.sourceFileIds.length === 0) {
    return {
      status: "input_package_has_no_source_files",
      artifact: toArtifactSummary(inputPackage),
    };
  }

  // Every candidate must point inside the approved package; offenders are
  // reported deduped in candidate order, and nothing is read or created.
  const packageFileIds = new Set<string>();
  for (const fileId of inputPackage.sourceFileIds) packageFileIds.add(fileId);
  const offendingSourceFileIds: string[] = [];
  const seenOffending = new Set<string>();
  for (const candidate of sanitized) {
    if (packageFileIds.has(candidate.sourceFileId)) continue;
    if (seenOffending.has(candidate.sourceFileId)) continue;
    seenOffending.add(candidate.sourceFileId);
    offendingSourceFileIds.push(candidate.sourceFileId);
  }
  if (offendingSourceFileIds.length > 0) {
    return {
      status: "candidate_source_file_not_in_package",
      sourceFileIds: offendingSourceFileIds,
    };
  }

  // Load every unique cited evidence id exactly once, in candidate citation
  // order, only after all package gates passed.
  const citedEvidenceIds: string[] = [];
  const seenCited = new Set<string>();
  for (const candidate of sanitized) {
    for (const evidenceId of candidate.evidenceIds) {
      if (seenCited.has(evidenceId)) continue;
      seenCited.add(evidenceId);
      citedEvidenceIds.push(evidenceId);
    }
  }
  const loadedById = new Map<string, ProjectEvidenceItem>();
  const loadedInCitationOrder: ProjectEvidenceItem[] = [];
  const missingEvidenceIds: string[] = [];
  for (const evidenceId of citedEvidenceIds) {
    const item = await getProjectEvidenceItemById(
      tenantId,
      projectId,
      evidenceId
    );
    if (item === null) {
      missingEvidenceIds.push(evidenceId);
      continue;
    }
    loadedById.set(evidenceId, item);
    loadedInCitationOrder.push(item);
  }
  if (missingEvidenceIds.length > 0) {
    return { status: "evidence_not_found", missingEvidenceIds };
  }
  const nonExtraction = loadedInCitationOrder.filter(
    (item) => !isRfpExtractionEvidenceKind(item.kind)
  );
  if (nonExtraction.length > 0) {
    return {
      status: "evidence_not_rfp_extraction",
      evidence: nonExtraction.map(toEvidenceSummary),
    };
  }
  // Strict equality on the stored content reference: a missing, blank, or
  // non-string content.inputPackageArtifactId never matches the requested
  // nonblank package id.
  const wrongPackage = loadedInCitationOrder.filter(
    (item) => item.content.inputPackageArtifactId !== inputPackageArtifactId
  );
  if (wrongPackage.length > 0) {
    return {
      status: "evidence_not_for_input_package",
      evidence: wrongPackage.map(toEvidenceSummary),
    };
  }

  const candidates: RfpExtractionDeltaCandidate[] = [];
  let evidenceReferenceCount = 0;
  for (let index = 0; index < sanitized.length; index += 1) {
    const candidate = sanitized[index];
    const evidenceReferences: RfpExtractionDeltaEvidenceReference[] = [];
    for (const evidenceId of candidate.evidenceIds) {
      const item = loadedById.get(evidenceId);
      if (item === undefined) continue; // unreachable after the gates above
      evidenceReferences.push(toEvidenceReference(item, inputPackageArtifactId));
    }
    evidenceReferenceCount += evidenceReferences.length;
    candidates.push({
      id: toCandidateId(index + 1),
      kind: candidate.kind,
      sourceFileId: candidate.sourceFileId,
      title: candidate.title,
      description: candidate.description,
      severity: candidate.severity,
      ...(candidate.confidence !== undefined
        ? { confidence: candidate.confidence }
        : {}),
      ...(candidate.rationale !== undefined
        ? { rationale: candidate.rationale }
        : {}),
      reviewStatus: "pending_review",
      evidenceReferences,
      ...(candidate.proposedEvidence !== undefined
        ? { proposedEvidence: candidate.proposedEvidence }
        : {}),
    });
  }

  const createdAt = new Date().toISOString();
  const payload: RfpExtractionDeltaPayload = {
    payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
    createdBy,
    createdAt,
    proposalSource,
    inputPackageArtifactId,
    candidateCount: candidates.length,
    evidenceReferenceCount,
    sourceFileIds: inputPackage.sourceFileIds.slice(),
    sourceArtifactIds: [inputPackageArtifactId],
    candidates,
  };

  const stored = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: EXTRACTION_DELTA_STAGE_ID,
    type: EXTRACTION_DELTA_ARTIFACT_TYPE,
    status: "needs_review",
    payload,
    sourceFileIds: inputPackage.sourceFileIds.slice(),
    sourceArtifactIds: [inputPackageArtifactId],
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(stored),
    payloadSummary: {
      payloadKind: RFP_EXTRACTION_DELTA_PAYLOAD_KIND,
      createdBy,
      createdAt,
      proposalSource,
      inputPackageArtifactId,
      candidateCount: candidates.length,
      evidenceReferenceCount,
      sourceFileIds: inputPackage.sourceFileIds.slice(),
      sourceArtifactIds: [inputPackageArtifactId],
    },
  };
}
