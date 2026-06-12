/**
 * RFP extraction-delta candidate drafting contract (provider-neutral).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Prepares the persisted non-BoQ RFP extraction evidence of ONE approved
 * input_package artifact version for an INJECTED extraction-delta
 * drafting executor and validates whatever comes back into explicit
 * delta candidate inputs shaped exactly like the extraction-delta draft
 * service's candidate input
 * (src/lib/projects/project-rfp-extraction-delta.ts, a type-only import;
 * the draft service itself is never imported at runtime and never called
 * here - this contract persists nothing). This module is the neutral
 * boundary between persisted Project evidence and a future drafting
 * executor: it imports no AI, LLM, provider, agent, coordinator, engine,
 * adapter, parser, OCR, pricing, SKU, catalog, configuration, or export
 * module, performs no drafting itself, and touches no artifact,
 * approval, evidence row, file, or stage. The executor may later be
 * AI-backed, but here it is just an injected function; its output is
 * never trusted and never final authority - recording an
 * extraction_delta draft and reviewing it are separate, later steps.
 *
 * AI extraction delta must not process BoQ: evidence rows whose stored
 * content.sourceFileRole is exactly "boq" are excluded from the executor
 * input, from the allowed candidate sourceFileId set, and from the
 * citable evidence id set. The two RFP extraction evidence kind literals
 * and the candidate kind/severity literal sets are restated locally
 * (keyed records the compiler locks to the type-only imports) so no
 * extraction, persistence, or draft-service module enters this graph.
 *
 * Gates in order, tenant scoped on every store call: project existence,
 * rfp mode, exact input_package artifact existence, input_package type
 * within the intake_package_review stage, approved status, nonempty
 * sourceFileIds, then at least one listed non-BoQ RFP extraction
 * evidence row stored for this exact package id. Each failing gate
 * returns a lean diagnostic (never a package payload, never a tenantId)
 * and never invokes the executor. The executor receives only whitelisted
 * copies: a lean project summary, a lean package artifact summary, the
 * trimmed requestedBy, the package id, the unique non-BoQ evidence
 * source-file ids in listed evidence order, and one whitelisted entry
 * per matching row (locator metadata plus the text body or a fresh rows
 * matrix - never a storage path, never an arbitrary content key, never
 * raw file bytes). An executor throw maps to drafting_failed with a
 * fixed error code; the thrown detail is never exposed. Executor output
 * must be an object with a candidates array (it may be empty: "no delta
 * candidates found" is valid); every violation is collected as a
 * deterministic candidates[index] message, and any violation returns
 * invalid_candidate_output with no candidates. Authority and review
 * fields the executor invents (id, reviewStatus, status, payload,
 * tenant, pricing, SKU, configuration, raw output, ...) never survive
 * the whitelist copy. The ok result is lean and serializable: sanitized
 * candidates plus identifier/count fields only - never a loaded evidence
 * body, never stored table rows, never the raw executor output. Inputs,
 * loaded rows, and executor input/output are never mutated; returned
 * arrays are fresh copies; store failures bubble to the caller unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import { listProjectEvidenceItems } from "@/lib/db/project-evidence-store";
import type {
  Project,
  ProjectArtifact,
  ProjectEvidenceItem,
} from "@/types/project";
import type {
  RfpExtractionDeltaArtifactSummary,
  RfpExtractionDeltaCandidateInput,
  RfpExtractionDeltaKind,
  RfpExtractionDeltaProjectSummary,
  RfpExtractionDeltaProposedEvidence,
  RfpExtractionDeltaSeverity,
} from "@/lib/projects/project-rfp-extraction-delta";

/** The only artifact type / stage accepted as the package input. */
const INPUT_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] = "input_package";
const INPUT_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";

/**
 * The two persisted RFP extraction evidence kinds draftable here. Defined
 * locally on purpose (exactly like the sibling drafting contract):
 * importing them would pull the extraction/persistence write modules into
 * this module graph.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/** The stored sourceFileRole AI extraction delta must never process. */
const BOQ_SOURCE_FILE_ROLE = "boq";

/** Fixed shape error for a malformed executor output root. */
const EXECUTOR_OUTPUT_SHAPE_ERROR =
  "Executor output must be an object with a candidates array.";

/**
 * The extraction-delta candidate literal sets, keyed records so the
 * compiler forces them to stay in lockstep with the type-only imported
 * delta types: a literal added or removed there breaks this module until
 * mirrored here. No runtime delta-service import is allowed, so the
 * values are restated.
 */
const RFP_EXTRACTION_DELTA_KIND_FLAGS: Record<RfpExtractionDeltaKind, true> = {
  missing_evidence: true,
  incorrect_extraction: true,
  table_reconstruction: true,
  suspicious_item: true,
};
const RFP_EXTRACTION_DELTA_SEVERITY_FLAGS: Record<
  RfpExtractionDeltaSeverity,
  true
> = {
  info: true,
  warning: true,
  blocking: true,
};

/** Kind of one draftable evidence row. */
export type RfpExtractionDeltaCandidateDraftingEvidenceKind =
  | typeof RFP_TEXT_CHUNK_EVIDENCE_KIND
  | typeof RFP_TABLE_EVIDENCE_KIND;

/** Lean serializable Project projection; tenantId is never surfaced. */
export type RfpExtractionDeltaCandidateDraftingProjectSummary =
  RfpExtractionDeltaProjectSummary;

/** Lean serializable package artifact summary; never an artifact payload. */
export type RfpExtractionDeltaCandidateDraftingArtifactSummary =
  RfpExtractionDeltaArtifactSummary;

/**
 * One sanitized candidate: exactly the explicit candidate input shape of
 * the extraction-delta draft service, ready to hand to it after human
 * review. Never persisted by this module.
 */
export type RfpExtractionDeltaDraftedCandidate =
  RfpExtractionDeltaCandidateInput;

/** The four whitelisted finite numeric metrics of one extracted document. */
export interface RfpExtractionDeltaCandidateDraftingDocumentMetrics {
  textCharCount: number;
  nonWhitespaceTextCharCount: number;
  tableCount: number;
  tableRowCount: number;
}

/**
 * One whitelisted text-chunk entry handed to the executor: identifiers
 * and locator metadata plus the stored text body.
 */
export interface RfpExtractionDeltaCandidateDraftingTextEvidence {
  evidenceId: string;
  evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  /** Present only when stored as a string on the evidence content. */
  sourceFileName?: string;
  /** Present only when stored as a string on the evidence content. */
  sourceFileRole?: string;
  chunkIndex: number;
  chunkCount: number;
  charCount: number;
  /** The stored chunk text body; "" when the stored field is not a string. */
  text: string;
  /** Present only when every stored metric is a finite number. */
  documentMetrics?: RfpExtractionDeltaCandidateDraftingDocumentMetrics;
}

/**
 * One whitelisted table entry handed to the executor: identifiers and
 * locator metadata plus a fresh rows matrix (never an alias of the
 * stored rows).
 */
export interface RfpExtractionDeltaCandidateDraftingTableEvidence {
  evidenceId: string;
  evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  /** Present only when stored as a string on the evidence content. */
  sourceFileName?: string;
  /** Present only when stored as a string on the evidence content. */
  sourceFileRole?: string;
  tableId: string;
  /** Present only when stored as a finite number on the evidence content. */
  pageNumber?: number;
  /** Present only when stored as a string on the evidence content. */
  sheetName?: string;
  rowCount: number;
  columnCount: number;
  /** Fresh matrix copy; malformed cells/rows/matrix degrade to ""/[]/[]. */
  rows: string[][];
}

/** One evidence entry as handed to the executor; copies, never aliases. */
export type RfpExtractionDeltaCandidateDraftingEvidence =
  | RfpExtractionDeltaCandidateDraftingTextEvidence
  | RfpExtractionDeltaCandidateDraftingTableEvidence;

/** Everything the injected executor receives; no tenantId, no storage path. */
export interface RfpExtractionDeltaCandidateDraftingExecutorInput {
  project: RfpExtractionDeltaCandidateDraftingProjectSummary;
  /** Lean summary of the approved package; never its payload. */
  inputPackage: RfpExtractionDeltaCandidateDraftingArtifactSummary;
  requestedBy: string;
  inputPackageArtifactId: string;
  /** Unique non-BoQ evidence source-file ids, in listed evidence order. */
  sourceFileIds: string[];
  /** Exactly the requested package id. */
  sourceArtifactIds: string[];
  /** One entry per matching non-BoQ row, in listed evidence order. */
  evidence: RfpExtractionDeltaCandidateDraftingEvidence[];
}

/**
 * The injected drafting dependency. This module never imports,
 * constructs, or names a real implementation; a future route wires one
 * in. Whatever it resolves with is validated and sanitized, never
 * trusted.
 */
export type RfpExtractionDeltaCandidateDraftingExecutor = (
  input: RfpExtractionDeltaCandidateDraftingExecutorInput
) => Promise<unknown>;

/** Input for {@link draftRfpExtractionDeltaCandidates}. */
export interface DraftRfpExtractionDeltaCandidatesInput {
  tenantId: string;
  projectId: string;
  /** The exact APPROVED input_package version to draft deltas against. */
  inputPackageArtifactId: string;
  requestedBy: string;
  executor: RfpExtractionDeltaCandidateDraftingExecutor;
}

/** Discriminated result of {@link draftRfpExtractionDeltaCandidates}. */
export type DraftRfpExtractionDeltaCandidatesResult =
  | { status: "not_found" }
  | {
      status: "wrong_mode";
      project: RfpExtractionDeltaCandidateDraftingProjectSummary;
    }
  | { status: "input_package_not_found" }
  | {
      status: "artifact_not_input_package";
      artifact: RfpExtractionDeltaCandidateDraftingArtifactSummary;
    }
  | {
      status: "input_package_not_approved";
      artifact: RfpExtractionDeltaCandidateDraftingArtifactSummary;
    }
  | {
      status: "input_package_has_no_source_files";
      artifact: RfpExtractionDeltaCandidateDraftingArtifactSummary;
    }
  | { status: "extraction_evidence_not_found"; inputPackageArtifactId: string }
  | { status: "drafting_failed"; error: "extraction_delta_drafting_failed" }
  | { status: "invalid_candidate_output"; errors: string[] }
  | {
      status: "ok";
      project: RfpExtractionDeltaCandidateDraftingProjectSummary;
      candidates: RfpExtractionDeltaDraftedCandidate[];
      candidateCount: number;
      /** Count of non-BoQ evidence rows handed to the executor. */
      evidenceCount: number;
      sourceFileIds: string[];
      sourceArtifactIds: string[];
    };

/** True for one of the four delta candidate kinds. */
function isRfpExtractionDeltaKind(
  value: string
): value is RfpExtractionDeltaKind {
  return Object.prototype.hasOwnProperty.call(
    RFP_EXTRACTION_DELTA_KIND_FLAGS,
    value
  );
}

/** True for one of the three delta candidate severities. */
function isRfpExtractionDeltaSeverity(
  value: string
): value is RfpExtractionDeltaSeverity {
  return Object.prototype.hasOwnProperty.call(
    RFP_EXTRACTION_DELTA_SEVERITY_FLAGS,
    value
  );
}

/** True for the only two evidence kinds this contract drafts from. */
function isRfpExtractionEvidenceKind(
  kind: string
): kind is RfpExtractionDeltaCandidateDraftingEvidenceKind {
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
 * Fresh string matrix copy of one rows value: a malformed cell degrades
 * to "", a malformed row to [], and a malformed matrix to [].
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
 * Whitelisted copy of the four stored document metrics, or undefined
 * (the entry omits the field) unless the stored value is a plain
 * non-array record whose four named metrics are all finite numbers.
 * Extra stored keys are never copied.
 */
function toDocumentMetrics(
  value: unknown
): RfpExtractionDeltaCandidateDraftingDocumentMetrics | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const textCharCount = record.textCharCount;
  const nonWhitespaceTextCharCount = record.nonWhitespaceTextCharCount;
  const tableCount = record.tableCount;
  const tableRowCount = record.tableRowCount;
  if (
    !isFiniteNumber(textCharCount) ||
    !isFiniteNumber(nonWhitespaceTextCharCount) ||
    !isFiniteNumber(tableCount) ||
    !isFiniteNumber(tableRowCount)
  ) {
    return undefined;
  }
  return {
    textCharCount,
    nonWhitespaceTextCharCount,
    tableCount,
    tableRowCount,
  };
}

/** Lean Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpExtractionDeltaCandidateDraftingProjectSummary {
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

/** Project one loaded artifact to a lean summary; arrays copied. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpExtractionDeltaCandidateDraftingArtifactSummary {
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

/** Fresh whitelisted text-chunk executor entry; never an alias. */
function toExecutorTextEvidence(
  item: ProjectEvidenceItem,
  inputPackageArtifactId: string
): RfpExtractionDeltaCandidateDraftingTextEvidence {
  const content = item.content;
  const sourceFileName = asOptionalString(content.sourceFileName);
  const sourceFileRole = asOptionalString(content.sourceFileRole);
  const documentMetrics = toDocumentMetrics(content.documentMetrics);
  return {
    evidenceId: item.id,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    sourceFileId: item.sourceFileId,
    inputPackageArtifactId,
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
    chunkIndex: asCount(content.chunkIndex),
    chunkCount: asCount(content.chunkCount),
    charCount: asCount(content.charCount),
    text: asString(content.text),
    ...(documentMetrics !== undefined ? { documentMetrics } : {}),
  };
}

/** Fresh whitelisted table executor entry; rows are a fresh matrix. */
function toExecutorTableEvidence(
  item: ProjectEvidenceItem,
  inputPackageArtifactId: string
): RfpExtractionDeltaCandidateDraftingTableEvidence {
  const content = item.content;
  const sourceFileName = asOptionalString(content.sourceFileName);
  const sourceFileRole = asOptionalString(content.sourceFileRole);
  const pageNumber = asOptionalNumber(content.pageNumber);
  const sheetName = asOptionalString(content.sheetName);
  return {
    evidenceId: item.id,
    evidenceKind: RFP_TABLE_EVIDENCE_KIND,
    sourceFileId: item.sourceFileId,
    inputPackageArtifactId,
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
    tableId: asString(content.tableId),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...(sheetName !== undefined ? { sheetName } : {}),
    rowCount: asCount(content.rowCount),
    columnCount: asCount(content.columnCount),
    rows: toTableRows(content.rows),
  };
}

/**
 * Whitelisted sanitized copy of one proposed evidence value, or undefined
 * (the candidate omits the field) when the proposal is missing, not a
 * plain object, or not one of the two RFP extraction kinds. Mirrors the
 * extraction-delta draft service's proposal whitelist exactly: arbitrary
 * proposal keys are never copied; a malformed proposal never throws; the
 * rows matrix is always a fresh copy. A proposal only, never final.
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

/** Outcome of one executor-output sanitization pass. */
interface SanitizedExecutorOutput {
  candidates: RfpExtractionDeltaDraftedCandidate[];
  errors: string[];
}

/**
 * Validate and sanitize untrusted executor output into extraction-delta
 * candidate input shapes. Collects every violation (deterministic
 * messages naming the offending candidates[index]) instead of stopping
 * at the first; when any error exists the candidates list is returned
 * empty. An empty candidates array is valid. Only whitelisted fields
 * survive: a known kind, a trimmed sourceFileId inside the non-BoQ
 * executor set, trimmed title/description, a valid optional severity (no
 * default is applied here - the draft service owns it), a finite 0..1
 * optional confidence, a trimmed nonblank optional rationale, trimmed
 * evidence ids (deduplicated preserving first-seen order, each one a
 * non-BoQ id handed to the executor), and a sanitized optional proposal.
 * Every other executor-supplied field (id, reviewStatus, accepted,
 * rejected, waived, status, artifact, payload, tenant, project, pricing,
 * SKU, configuration, raw output, ...) is dropped by whitelist copy.
 */
function sanitizeExecutorOutput(
  rawOutput: unknown,
  allowedSourceFileIds: ReadonlySet<string>,
  allowedEvidenceIds: ReadonlySet<string>
): SanitizedExecutorOutput {
  if (
    rawOutput === null ||
    typeof rawOutput !== "object" ||
    Array.isArray(rawOutput)
  ) {
    return { candidates: [], errors: [EXECUTOR_OUTPUT_SHAPE_ERROR] };
  }
  const rawCandidates = (rawOutput as Record<string, unknown>).candidates;
  if (!Array.isArray(rawCandidates)) {
    return { candidates: [], errors: [EXECUTOR_OUTPUT_SHAPE_ERROR] };
  }

  const errors: string[] = [];
  const candidates: RfpExtractionDeltaDraftedCandidate[] = [];
  rawCandidates.forEach((rawCandidate, index) => {
    if (
      rawCandidate === null ||
      typeof rawCandidate !== "object" ||
      Array.isArray(rawCandidate)
    ) {
      errors.push(`candidates[${index}] must be an object.`);
      return;
    }
    const candidate = rawCandidate as Record<string, unknown>;
    const before = errors.length;

    let kind: RfpExtractionDeltaKind | undefined;
    const rawKind = candidate.kind;
    if (typeof rawKind === "string" && isRfpExtractionDeltaKind(rawKind)) {
      kind = rawKind;
    } else {
      errors.push(`candidates[${index}].kind is invalid: ${String(rawKind)}.`);
    }

    const sourceFileId =
      typeof candidate.sourceFileId === "string"
        ? candidate.sourceFileId.trim()
        : "";
    if (sourceFileId === "") {
      errors.push(`candidates[${index}].sourceFileId is required.`);
    } else if (!allowedSourceFileIds.has(sourceFileId)) {
      errors.push(
        `candidates[${index}].sourceFileId is unknown: ${sourceFileId}.`
      );
    }

    const title =
      typeof candidate.title === "string" ? candidate.title.trim() : "";
    if (title === "") {
      errors.push(`candidates[${index}].title is required.`);
    }
    const description =
      typeof candidate.description === "string"
        ? candidate.description.trim()
        : "";
    if (description === "") {
      errors.push(`candidates[${index}].description is required.`);
    }

    let severity: RfpExtractionDeltaSeverity | undefined;
    const rawSeverity = candidate.severity;
    if (rawSeverity !== undefined) {
      if (
        typeof rawSeverity === "string" &&
        isRfpExtractionDeltaSeverity(rawSeverity)
      ) {
        severity = rawSeverity;
      } else {
        errors.push(
          `candidates[${index}].severity is invalid: ${String(rawSeverity)}.`
        );
      }
    }

    let confidence: number | undefined;
    const rawConfidence = candidate.confidence;
    if (rawConfidence !== undefined) {
      if (
        isFiniteNumber(rawConfidence) &&
        rawConfidence >= 0 &&
        rawConfidence <= 1
      ) {
        confidence = rawConfidence;
      } else {
        errors.push(
          `candidates[${index}].confidence must be a finite number between 0 and 1 inclusive.`
        );
      }
    }

    const rationale =
      typeof candidate.rationale === "string" &&
      candidate.rationale.trim() !== ""
        ? candidate.rationale.trim()
        : undefined;

    const evidenceIds: string[] = [];
    const seenEvidenceIds = new Set<string>();
    if (Array.isArray(candidate.evidenceIds)) {
      for (const rawId of candidate.evidenceIds) {
        const id = typeof rawId === "string" ? rawId.trim() : "";
        if (id === "" || seenEvidenceIds.has(id)) continue;
        seenEvidenceIds.add(id);
        evidenceIds.push(id);
      }
    }
    for (const id of evidenceIds) {
      if (!allowedEvidenceIds.has(id)) {
        errors.push(`candidates[${index}] cites unknown evidence ID: ${id}.`);
      }
    }

    const proposedEvidence = sanitizeProposedEvidence(
      candidate.proposedEvidence
    );

    if (errors.length > before || kind === undefined) return;
    candidates.push({
      kind,
      sourceFileId,
      title,
      description,
      ...(severity !== undefined ? { severity } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(rationale !== undefined ? { rationale } : {}),
      ...(evidenceIds.length > 0 ? { evidenceIds } : {}),
      ...(proposedEvidence !== undefined ? { proposedEvidence } : {}),
    });
  });

  return errors.length > 0 ? { candidates: [], errors } : { candidates, errors };
}

/**
 * Hand the persisted non-BoQ RFP extraction evidence of ONE approved
 * input_package version to the INJECTED executor and validate what it
 * returns into explicit extraction-delta candidate inputs. Throws
 * deterministic programmer errors before any store call: nonblank
 * projectId, inputPackageArtifactId, and requestedBy, and a function
 * executor. Gates in order, tenant scoped: project exists, rfp mode,
 * exact artifact exists, input_package type within the
 * intake_package_review stage, approved status, nonempty sourceFileIds -
 * each failure returns a lean diagnostic without listing evidence or
 * invoking the executor. Evidence is then listed once and filtered to
 * the two RFP extraction kinds stored for this exact package id whose
 * sourceFileRole is not exactly "boq"; zero matching rows return
 * extraction_evidence_not_found. The executor receives whitelisted
 * copies only; a throw maps to drafting_failed with a fixed error code
 * (the thrown detail is never exposed); invalid output returns
 * invalid_candidate_output listing every violation; an empty candidates
 * array is valid. On success the result is lean and serializable:
 * sanitized candidates plus identifier/count fields only. Persists
 * nothing, mutates nothing; store failures bubble unhidden.
 */
export async function draftRfpExtractionDeltaCandidates(
  input: DraftRfpExtractionDeltaCandidatesInput
): Promise<DraftRfpExtractionDeltaCandidatesResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (
    typeof input.inputPackageArtifactId !== "string" ||
    input.inputPackageArtifactId.trim() === ""
  ) {
    throw new Error("inputPackageArtifactId is required.");
  }
  if (
    typeof input.requestedBy !== "string" ||
    input.requestedBy.trim() === ""
  ) {
    throw new Error("requestedBy is required.");
  }
  if (typeof input.executor !== "function") {
    throw new Error("executor is required.");
  }
  const requestedBy = input.requestedBy.trim();
  const { tenantId, projectId, inputPackageArtifactId } = input;

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

  const listed = await listProjectEvidenceItems(tenantId, projectId);
  // Strict equality on the stored references: a missing, blank, or
  // non-string content.inputPackageArtifactId never matches the requested
  // nonblank package id, and only a sourceFileRole of exactly "boq"
  // excludes a row (AI extraction delta must not process BoQ).
  const matching = listed.filter(
    (item) =>
      isRfpExtractionEvidenceKind(item.kind) &&
      item.content.inputPackageArtifactId === inputPackageArtifactId &&
      item.content.sourceFileRole !== BOQ_SOURCE_FILE_ROLE
  );
  if (matching.length === 0) {
    return { status: "extraction_evidence_not_found", inputPackageArtifactId };
  }

  // Unique non-BoQ evidence source files in listed evidence order; also
  // the only sourceFileIds a candidate may name.
  const sourceFileIds: string[] = [];
  const allowedSourceFileIds = new Set<string>();
  for (const item of matching) {
    if (allowedSourceFileIds.has(item.sourceFileId)) continue;
    allowedSourceFileIds.add(item.sourceFileId);
    sourceFileIds.push(item.sourceFileId);
  }
  // The only evidence ids a candidate may cite.
  const allowedEvidenceIds = new Set<string>();
  for (const item of matching) allowedEvidenceIds.add(item.id);

  // The executor gets its own copies; mutating them never reaches the
  // loaded rows, this function's locals, or the returned result.
  let rawOutput: unknown;
  try {
    rawOutput = await input.executor({
      project: toProjectSummary(project),
      inputPackage: toArtifactSummary(inputPackage),
      requestedBy,
      inputPackageArtifactId,
      sourceFileIds: sourceFileIds.slice(),
      sourceArtifactIds: [inputPackageArtifactId],
      evidence: matching.map((item) =>
        item.kind === RFP_TEXT_CHUNK_EVIDENCE_KIND
          ? toExecutorTextEvidence(item, inputPackageArtifactId)
          : toExecutorTableEvidence(item, inputPackageArtifactId)
      ),
    });
  } catch {
    // The thrown detail (provider error, prompt, stack) is never surfaced.
    return {
      status: "drafting_failed",
      error: "extraction_delta_drafting_failed",
    };
  }

  const sanitized = sanitizeExecutorOutput(
    rawOutput,
    allowedSourceFileIds,
    allowedEvidenceIds
  );
  if (sanitized.errors.length > 0) {
    return { status: "invalid_candidate_output", errors: sanitized.errors };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    candidates: sanitized.candidates,
    candidateCount: sanitized.candidates.length,
    evidenceCount: matching.length,
    sourceFileIds: sourceFileIds.slice(),
    sourceArtifactIds: [inputPackageArtifactId],
  };
}
