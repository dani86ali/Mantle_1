/**
 * RFP compliance-matrix drafting contract (Stage 4, provider-neutral).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Prepares approved upstream RFP artifacts for an INJECTED drafting executor and
 * validates whatever comes back into reviewable compliance-matrix draft rows shaped
 * exactly like the compliance_matrix payload contract
 * (src/lib/projects/project-rfp-compliance-matrix.ts, a type-only import). This module
 * is the neutral boundary between persisted Project state and a future drafting
 * executor: it imports no AI, LLM, provider, agent, coordinator, engine, adapter,
 * parser, pricing, SKU, catalog, configuration-decision, validation, export, route, or
 * UI module, drafts nothing itself, and persists NOTHING - no artifact, approval,
 * file, evidence row, or stage is created or updated here. Drafted rows carry no
 * runtime authority: a compliance_matrix artifact must still be created by a later
 * explicit service and human-approved before any downstream stage relies on it.
 *
 * It drafts from THREE approved artifacts read by exact id, tenant scoped: one
 * approved requirements_baseline (type requirements_baseline at stage
 * requirements_baseline_review, status approved, payloadKind rfp_requirements_baseline,
 * a nonempty requirements array), one approved evidence_package (type evidence_package
 * at stage intake_package_review, status approved, payloadKind rfp_evidence_package, a
 * valid evidence array - the ONLY approved evidence authority; no evidence store is
 * read), and OPTIONALLY one approved configuration_expansion (type
 * configuration_expansion at stage configuration_expansion_review, status approved, a
 * REVIEWED payload - never the configuration_expansion_draft marker - with a valid
 * acceptedLines array). Each failing gate returns a lean discriminated status and never
 * invokes the executor.
 *
 * The executor receives only fresh whitelisted copies: a lean project summary (never a
 * tenantId), lean artifact summaries (never a payload), the approved baseline
 * requirements (id/text/title/notes/category/priority plus locator-only evidence
 * references), the approved evidence-package entries as context (text body or a copied
 * rows matrix, never a storage path, a tenant id, a file path, a document-metrics
 * block, or an arbitrary payload key), the optional accepted configuration lines
 * (lineId/origin/sku/description plus
 * line/source identifiers ONLY - never a price, margin, discount, currency, catalog
 * lookup, SKU replacement, sourceRuleId, evidence, or rule field), the trimmed
 * requestedBy, and the unique source-file / source-artifact ids. Mutating the executor
 * input can never reach a loaded artifact or the returned result.
 *
 * Executor output is never trusted. It must be an object with a rows array holding
 * exactly one row per approved baseline requirement, each naming a known, non-duplicate
 * requirementId and a nonblank response; optional rationale/notes survive only when
 * nonblank after trim; optional evidenceIds map (trimmed, deduplicated) to locator-only
 * evidence_package references and absent/empty falls back to the requirement's baseline
 * references; optional configurationLineIds map (trimmed, deduplicated) to whitelisted
 * configuration references and are rejected when no config artifact was supplied; every
 * unknown id is rejected. Drafted rows carry deterministic ids (RFP-COMP-001,
 * RFP-COMP-002, ... in baseline order), copy requirementText/category/priority from the
 * baseline snapshot, set every complianceStatus to needs_review (never executor
 * supplied), and drop every executor-supplied authority/raw field by whitelist copy. An
 * executor throw maps to drafting_failed with a fixed error code (the thrown detail is
 * never exposed); invalid output returns invalid_draft_output listing every violation.
 * The ok result is lean and serializable - sanitized rows plus identifier/count fields
 * only. Inputs and loaded artifacts are never mutated; store failures bubble unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import { getProjectArtifactById } from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import type {
  RfpComplianceMatrixCategory,
  RfpComplianceMatrixPriority,
  RfpComplianceMatrixEvidenceReference,
  RfpComplianceMatrixConfigurationReference,
  RfpComplianceMatrixRow,
} from "@/lib/projects/project-rfp-compliance-matrix";

/** Approved requirements_baseline gate: type, stage, and payload discriminator. */
const REQUIREMENTS_BASELINE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "requirements_baseline";
const REQUIREMENTS_BASELINE_STAGE_ID: ProjectArtifact["stageId"] =
  "requirements_baseline_review";
const RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND = "rfp_requirements_baseline";

/** Approved evidence_package gate: type, stage, and payload discriminator. */
const EVIDENCE_PACKAGE_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "evidence_package";
const EVIDENCE_PACKAGE_STAGE_ID: ProjectArtifact["stageId"] =
  "intake_package_review";
const RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND = "rfp_evidence_package";

/** Approved configuration_expansion gate: type, stage, and the draft marker to reject. */
const CONFIGURATION_EXPANSION_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "configuration_expansion";
const CONFIGURATION_EXPANSION_STAGE_ID: ProjectArtifact["stageId"] =
  "configuration_expansion_review";
/** A reviewed expansion never carries this marker; a DRAFT does and is rejected. */
const CONFIGURATION_EXPANSION_DRAFT_PAYLOAD_KIND =
  "configuration_expansion_draft";

/**
 * The two locator-only evidence-reference kinds, declared locally exactly as the
 * upstream contracts declare them (importing the value would pull a coupled module
 * into this contract's runtime graph). Kept in sync with the baseline reference union.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/** Fixed shape error for a malformed executor output root. */
const EXECUTOR_OUTPUT_SHAPE_ERROR =
  "Executor output must be an object with a rows array.";

/**
 * The baseline category/priority literal sets, keyed records the compiler locks to the
 * type-only imported (re-exported baseline) unions: a literal added or removed there
 * breaks this module until mirrored here. No runtime baseline import is allowed, so the
 * values are restated.
 */
const RFP_REQUIREMENT_CATEGORY_FLAGS: Record<RfpComplianceMatrixCategory, true> = {
  technical: true,
  commercial: true,
  compliance: true,
  delivery: true,
  security: true,
  support: true,
  legal: true,
  other: true,
  boq_product: true,
  installation_configuration_testing: true,
  documentation: true,
  training_totk: true,
  schedule_duration: true,
  warranty_support: true,
  permits_site_access_safety: true,
  legal_regulatory_local_content: true,
  insurance: true,
  commercial_contractual: true,
  vendor_qualification_submittals: true,
  security_cybersecurity: true,
};
const RFP_REQUIREMENT_PRIORITY_FLAGS: Record<RfpComplianceMatrixPriority, true> = {
  mandatory: true,
  preferred: true,
  optional: true,
  informational: true,
  unknown: true,
};

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpComplianceMatrixDraftingProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpComplianceMatrixDraftingArtifactSummary {
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
 * One approved baseline requirement handed to the executor: the requirement snapshot
 * plus its locator-only evidence references. Never a raw evidence body or table rows.
 */
export interface RfpComplianceMatrixDraftingRequirement {
  id: string;
  text: string;
  category: RfpComplianceMatrixCategory;
  priority: RfpComplianceMatrixPriority;
  title?: string;
  notes?: string;
  evidenceReferences: RfpComplianceMatrixEvidenceReference[];
}

/** One whitelisted text-chunk evidence entry handed to the executor as context. */
export interface RfpComplianceMatrixDraftingTextEvidence {
  evidenceId: string;
  evidenceKind: typeof RFP_TEXT_CHUNK_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  chunkIndex: number;
  chunkCount: number;
  charCount: number;
  text: string;
}

/** One whitelisted table evidence entry handed to the executor as context. */
export interface RfpComplianceMatrixDraftingTableEvidence {
  evidenceId: string;
  evidenceKind: typeof RFP_TABLE_EVIDENCE_KIND;
  sourceFileId: string;
  inputPackageArtifactId: string;
  sourceFileName?: string;
  sourceFileRole?: string;
  tableId: string;
  pageNumber?: number;
  sheetName?: string;
  rowCount: number;
  columnCount: number;
  /** Fresh matrix copy; never an alias of the stored rows. */
  rows: string[][];
}

/** One approved evidence-package entry as handed to the executor; copies, never aliases. */
export type RfpComplianceMatrixDraftingEvidence =
  | RfpComplianceMatrixDraftingTextEvidence
  | RfpComplianceMatrixDraftingTableEvidence;

/**
 * One accepted configuration line handed to the executor: line/source identifiers and
 * descriptive fields ONLY. Never a price, margin, discount, currency, catalog lookup,
 * SKU replacement, sourceRuleId, evidence, or rule field, so configuration and pricing
 * authority stay with their own artifacts.
 */
export interface RfpComplianceMatrixDraftingConfigurationLine {
  lineId: string;
  origin?: "customer" | "expansion";
  sku?: string;
  description?: string;
  parentLineId?: string;
  parentLineNumber?: string;
  sourceFileId?: string;
  sourceRowNumber?: number;
  originalLineNumber?: string;
}

/** Everything the injected executor receives; no tenantId, no payload, no storage path. */
export interface RfpComplianceMatrixDraftingExecutorInput {
  project: RfpComplianceMatrixDraftingProjectSummary;
  requirementsBaseline: RfpComplianceMatrixDraftingArtifactSummary;
  evidencePackage: RfpComplianceMatrixDraftingArtifactSummary;
  /** Present only when a configuration_expansion artifact was supplied. */
  configurationExpansion?: RfpComplianceMatrixDraftingArtifactSummary;
  /** The approved baseline requirements, in baseline order. */
  requirements: RfpComplianceMatrixDraftingRequirement[];
  /** The approved evidence-package entries as drafting context, in payload order. */
  evidence: RfpComplianceMatrixDraftingEvidence[];
  /** Present only when a configuration_expansion artifact was supplied. */
  configurationLines?: RfpComplianceMatrixDraftingConfigurationLine[];
  requestedBy: string;
  /** Unique source-file ids behind the approved upstream artifacts, in first-seen order. */
  sourceFileIds: string[];
  /** The approved upstream artifact ids: baseline, evidence package, then config. */
  sourceArtifactIds: string[];
}

/**
 * The injected drafting dependency. This module never imports, constructs, or names a
 * real implementation; a future route wires one in. Whatever it resolves with is
 * validated and sanitized, never trusted.
 */
export type RfpComplianceMatrixDraftingExecutor = (
  input: RfpComplianceMatrixDraftingExecutorInput
) => Promise<unknown>;

/** Input for {@link draftRfpComplianceMatrixRows}. */
export interface DraftRfpComplianceMatrixRowsInput {
  tenantId: string;
  projectId: string;
  /** The exact APPROVED requirements_baseline artifact to draft rows for. */
  requirementsBaselineArtifactId: string;
  /** The exact APPROVED evidence_package artifact rows may cite evidence from. */
  evidencePackageArtifactId: string;
  /** Optional exact APPROVED configuration_expansion artifact rows may cite lines from. */
  configurationExpansionArtifactId?: string;
  requestedBy: string;
  executor: RfpComplianceMatrixDraftingExecutor;
}

/** Discriminated result of {@link draftRfpComplianceMatrixRows}. */
export type DraftRfpComplianceMatrixRowsResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpComplianceMatrixDraftingProjectSummary }
  | { status: "requirements_baseline_not_found" }
  | {
      status: "artifact_not_requirements_baseline";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | {
      status: "requirements_baseline_not_approved";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | {
      status: "invalid_requirements_baseline_payload";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | { status: "evidence_package_not_found" }
  | {
      status: "artifact_not_evidence_package";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | {
      status: "evidence_package_not_approved";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | {
      status: "invalid_evidence_package_payload";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | { status: "configuration_expansion_not_found" }
  | {
      status: "artifact_not_configuration_expansion";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | {
      status: "configuration_expansion_not_approved";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | {
      status: "invalid_configuration_expansion_payload";
      artifact: RfpComplianceMatrixDraftingArtifactSummary;
    }
  | { status: "drafting_failed"; error: "compliance_matrix_drafting_failed" }
  | { status: "invalid_draft_output"; errors: string[] }
  | {
      status: "ok";
      project: RfpComplianceMatrixDraftingProjectSummary;
      requirementsBaselineArtifactId: string;
      evidencePackageArtifactId: string;
      /** Present only when a configuration_expansion artifact was supplied. */
      configurationExpansionArtifactId?: string;
      rows: RfpComplianceMatrixRow[];
      rowCount: number;
      /** Count of approved baseline requirements (one row each). */
      requirementCount: number;
      /** Count of approved evidence-package entries handed to the executor. */
      evidenceCount: number;
      sourceFileIds: string[];
      sourceArtifactIds: string[];
    };

/** One approved baseline requirement after validation; the row snapshot authority. */
interface ParsedRequirement {
  id: string;
  text: string;
  category: RfpComplianceMatrixCategory;
  priority: RfpComplianceMatrixPriority;
  title?: string;
  notes?: string;
  /** The stored locator-only evidence-reference records, copied fresh on use. */
  evidenceReferenceRecords: Record<string, unknown>[];
}

function isRfpRequirementCategory(
  value: string
): value is RfpComplianceMatrixCategory {
  return Object.prototype.hasOwnProperty.call(
    RFP_REQUIREMENT_CATEGORY_FLAGS,
    value
  );
}

function isRfpRequirementPriority(
  value: string
): value is RfpComplianceMatrixPriority {
  return Object.prototype.hasOwnProperty.call(
    RFP_REQUIREMENT_PRIORITY_FLAGS,
    value
  );
}

/** True for a plain object record; arrays and null are not records. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A payload value as a plain record; {} when it is anything else. */
function toRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

/** Nonblank string check used for payload identifier fields. */
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
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** True for the only two evidence kinds an evidence-package entry may carry. */
function isRfpExtractionEvidenceKind(kind: string): boolean {
  return (
    kind === RFP_TEXT_CHUNK_EVIDENCE_KIND || kind === RFP_TABLE_EVIDENCE_KIND
  );
}

/** True when one stored locator-only evidence reference has the expected shape. */
function isValidEvidenceReferenceRecord(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (!isNonblankString(value.evidenceId)) return false;
  if (!isNonblankString(value.sourceFileId)) return false;
  if (!isNonblankString(value.inputPackageArtifactId)) return false;
  if (value.evidenceKind === RFP_TEXT_CHUNK_EVIDENCE_KIND) {
    return (
      typeof value.chunkIndex === "number" &&
      Number.isFinite(value.chunkIndex) &&
      typeof value.chunkCount === "number" &&
      Number.isFinite(value.chunkCount) &&
      typeof value.charCount === "number" &&
      Number.isFinite(value.charCount)
    );
  }
  if (value.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    return (
      isNonblankString(value.tableId) &&
      (value.pageNumber === undefined ||
        (typeof value.pageNumber === "number" &&
          Number.isFinite(value.pageNumber))) &&
      (value.sheetName === undefined || typeof value.sheetName === "string") &&
      typeof value.rowCount === "number" &&
      Number.isFinite(value.rowCount) &&
      typeof value.columnCount === "number" &&
      Number.isFinite(value.columnCount)
    );
  }
  return false;
}

/** Unique nonblank strings in first-seen order; fresh array, input untouched. */
function uniqueNonblankInOrder(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Trimmed nonblank ids, deduplicated preserving first-seen order; fresh array. */
function cleanIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Fresh string matrix copy; malformed cell/row/matrix degrade to "" / [] / []. */
function toRowsMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) =>
    Array.isArray(row) ? row.map((cell) => asString(cell)) : []
  );
}

/** Deterministic in-order row id: RFP-COMP-001, RFP-COMP-002, ... */
function toRowId(index: number): string {
  return `RFP-COMP-${String(index + 1).padStart(3, "0")}`;
}

/** Lean Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpComplianceMatrixDraftingProjectSummary {
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

/** Project one loaded artifact to a serializable summary; arrays copied, payload dropped. */
function toArtifactSummary(
  artifact: ProjectArtifact
): RfpComplianceMatrixDraftingArtifactSummary {
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
 * Fresh locator-only copy of one stored evidence-reference record through an explicit
 * per-kind whitelist: identifier, kind, position, and count fields only. A
 * non-whitelisted field (raw text body, rows matrix, storage path) is never carried.
 */
function copyEvidenceReference(
  raw: Record<string, unknown>
): RfpComplianceMatrixEvidenceReference {
  const evidenceId = asString(raw.evidenceId);
  const sourceFileId = asString(raw.sourceFileId);
  const inputPackageArtifactId = asString(raw.inputPackageArtifactId);
  if (raw.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(raw.pageNumber);
    const sheetName = asOptionalString(raw.sheetName);
    return {
      evidenceId,
      sourceFileId,
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      inputPackageArtifactId,
      tableId: asString(raw.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(raw.rowCount),
      columnCount: asCount(raw.columnCount),
    };
  }
  return {
    evidenceId,
    sourceFileId,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    inputPackageArtifactId,
    chunkIndex: asCount(raw.chunkIndex),
    chunkCount: asCount(raw.chunkCount),
    charCount: asCount(raw.charCount),
  };
}

/**
 * Build one fresh whitelisted executor evidence entry from a stored evidence-package
 * entry record. Copies identifiers, locator metadata, and the drafting body (text or a
 * copied rows matrix) through an explicit per-kind whitelist; malformed fields degrade
 * to safe fallbacks ("" / 0 / omitted optionals). A tenantId, storage path,
 * document-metrics block, or any other arbitrary payload key is never copied.
 */
function toExecutorEvidence(
  entry: Record<string, unknown>
): RfpComplianceMatrixDraftingEvidence {
  const sourceFileName = asOptionalString(entry.sourceFileName);
  const sourceFileRole = asOptionalString(entry.sourceFileRole);
  if (entry.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(entry.pageNumber);
    const sheetName = asOptionalString(entry.sheetName);
    return {
      evidenceId: asString(entry.evidenceId),
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      sourceFileId: asString(entry.sourceFileId),
      inputPackageArtifactId: asString(entry.inputPackageArtifactId),
      ...(sourceFileName !== undefined ? { sourceFileName } : {}),
      ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
      tableId: asString(entry.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(entry.rowCount),
      columnCount: asCount(entry.columnCount),
      rows: toRowsMatrix(entry.rows),
    };
  }
  return {
    evidenceId: asString(entry.evidenceId),
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    sourceFileId: asString(entry.sourceFileId),
    inputPackageArtifactId: asString(entry.inputPackageArtifactId),
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileRole !== undefined ? { sourceFileRole } : {}),
    chunkIndex: asCount(entry.chunkIndex),
    chunkCount: asCount(entry.chunkCount),
    charCount: asCount(entry.charCount),
    text: asString(entry.text),
  };
}

/**
 * Build one fresh whitelisted executor configuration line from a stored accepted-line
 * record: line/source identifiers and descriptive fields ONLY. A price, margin,
 * discount, currency, catalog lookup, SKU replacement, sourceRuleId, evidence, or rule
 * field is never copied, so configuration authority stays separate from pricing.
 */
function toExecutorConfigurationLine(
  raw: Record<string, unknown>
): RfpComplianceMatrixDraftingConfigurationLine {
  const origin =
    raw.origin === "customer" || raw.origin === "expansion"
      ? raw.origin
      : undefined;
  const sku = asOptionalString(raw.sku);
  const description = asOptionalString(raw.description);
  const parentLineId = asOptionalString(raw.parentLineId);
  const parentLineNumber = asOptionalString(raw.parentLineNumber);
  const sourceFileId = asOptionalString(raw.sourceFileId);
  const sourceRowNumber = asOptionalNumber(raw.sourceRowNumber);
  const originalLineNumber = asOptionalString(raw.originalLineNumber);
  return {
    lineId: asString(raw.lineId),
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

/** Fresh locator-only configuration reference: the line whitelist plus the artifact id. */
function toConfigurationReference(
  raw: Record<string, unknown>,
  configurationExpansionArtifactId: string
): RfpComplianceMatrixConfigurationReference {
  return {
    configurationExpansionArtifactId,
    ...toExecutorConfigurationLine(raw),
  };
}

/** One approved baseline requirement to its whitelisted executor entry; fresh references. */
function toExecutorRequirement(
  requirement: ParsedRequirement
): RfpComplianceMatrixDraftingRequirement {
  return {
    id: requirement.id,
    text: requirement.text,
    category: requirement.category,
    priority: requirement.priority,
    ...(requirement.title !== undefined ? { title: requirement.title } : {}),
    ...(requirement.notes !== undefined ? { notes: requirement.notes } : {}),
    evidenceReferences: requirement.evidenceReferenceRecords.map(
      copyEvidenceReference
    ),
  };
}

/**
 * Validate the untyped baseline requirements array enough that rows cannot invent
 * identity or copy a malformed snapshot: a nonempty array whose every entry is a plain
 * record with a nonblank unique id, nonblank text, a valid category and priority, and
 * an evidenceReferences array of plain records.
 */
function isValidBaselineRequirementList(
  value: unknown
): value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seenIds = new Set<string>();
  for (const entry of value) {
    if (!isPlainRecord(entry)) return false;
    if (!isNonblankString(entry.id) || seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    if (!isNonblankString(entry.text)) return false;
    if (
      typeof entry.category !== "string" ||
      !isRfpRequirementCategory(entry.category)
    ) {
      return false;
    }
    if (
      typeof entry.priority !== "string" ||
      !isRfpRequirementPriority(entry.priority)
    ) {
      return false;
    }
    if (!Array.isArray(entry.evidenceReferences)) return false;
    for (const reference of entry.evidenceReferences) {
      if (!isValidEvidenceReferenceRecord(reference)) return false;
    }
  }
  return true;
}

/**
 * Validate the untyped evidence-package evidence array enough that executor context and
 * citable ids cannot be invented: an array (possibly empty) whose every entry is a
 * plain record with a known evidenceKind, a nonblank unique evidenceId, a nonblank
 * sourceFileId, and a nonblank inputPackageArtifactId.
 */
function isValidEvidencePackageEntryList(
  value: unknown
): value is Record<string, unknown>[] {
  if (!Array.isArray(value)) return false;
  const seenEvidenceIds = new Set<string>();
  for (const entry of value) {
    if (!isPlainRecord(entry)) return false;
    if (!isRfpExtractionEvidenceKind(asString(entry.evidenceKind))) return false;
    if (!isNonblankString(entry.evidenceId)) return false;
    if (seenEvidenceIds.has(entry.evidenceId)) return false;
    seenEvidenceIds.add(entry.evidenceId);
    if (!isNonblankString(entry.sourceFileId)) return false;
    if (!isNonblankString(entry.inputPackageArtifactId)) return false;
  }
  return true;
}

/**
 * Validate the untyped reviewed configuration_expansion acceptedLines array enough that
 * citable line ids cannot be invented: an array (possibly empty) whose every entry is a
 * plain record with a nonblank unique lineId.
 */
function isValidAcceptedLineList(
  value: unknown
): value is Record<string, unknown>[] {
  if (!Array.isArray(value)) return false;
  const seenLineIds = new Set<string>();
  for (const entry of value) {
    if (!isPlainRecord(entry)) return false;
    if (!isNonblankString(entry.lineId)) return false;
    if (seenLineIds.has(entry.lineId)) return false;
    seenLineIds.add(entry.lineId);
  }
  return true;
}

/** Parse one validated baseline requirement record into its row snapshot authority. */
function parseRequirement(raw: Record<string, unknown>): ParsedRequirement {
  const title = trimmedNonblankOrUndefined(raw.title);
  const notes = trimmedNonblankOrUndefined(raw.notes);
  return {
    id: asString(raw.id),
    text: asString(raw.text),
    category: raw.category as RfpComplianceMatrixCategory,
    priority: raw.priority as RfpComplianceMatrixPriority,
    ...(title !== undefined ? { title } : {}),
    ...(notes !== undefined ? { notes } : {}),
    evidenceReferenceRecords: (raw.evidenceReferences as unknown[]).map((ref) =>
      ref as Record<string, unknown>
    ),
  };
}

/** Read-only context the executor-output sanitizer maps untrusted rows against. */
interface SanitizeContext {
  requirements: ParsedRequirement[];
  requirementIds: ReadonlySet<string>;
  packageEntryById: ReadonlyMap<string, Record<string, unknown>>;
  packageEvidenceIds: ReadonlySet<string>;
  hasConfig: boolean;
  configurationExpansionArtifactId: string;
  configLineById: ReadonlyMap<string, Record<string, unknown>>;
  configLineIds: ReadonlySet<string>;
}

/** One validated row before deterministic id/snapshot assembly; whitelist only. */
interface CleanedRow {
  requirementId: string;
  response: string;
  rationale?: string;
  notes?: string;
  evidenceIds: string[];
  configurationLineIds: string[];
}

/** Outcome of one executor-output sanitization pass. */
interface SanitizedExecutorOutput {
  rows: RfpComplianceMatrixRow[];
  errors: string[];
}

/**
 * Validate and sanitize untrusted executor output into reviewable compliance-matrix
 * rows. Collects every violation (deterministic rows[index] messages, then a message
 * per uncovered baseline requirement) instead of stopping at the first; when any error
 * exists the rows list is returned empty. Requires exactly one row per approved
 * baseline requirement (no unknown or duplicate requirementId), a nonblank response,
 * optional nonblank-after-trim rationale/notes, optional evidenceIds that resolve to
 * approved evidence_package ids (absent/empty falls back to the requirement's baseline
 * references), and optional configurationLineIds that resolve to approved accepted-line
 * ids (rejected when no config artifact was supplied). On success rows carry
 * deterministic RFP-COMP ids in baseline order, the baseline requirement snapshot
 * (text/category/priority), a needs_review complianceStatus, and fresh locator-only
 * references. Every other executor-supplied field is dropped by whitelist copy.
 */
function sanitizeExecutorOutput(
  rawOutput: unknown,
  context: SanitizeContext
): SanitizedExecutorOutput {
  if (!isPlainRecord(rawOutput)) {
    return { rows: [], errors: [EXECUTOR_OUTPUT_SHAPE_ERROR] };
  }
  const rawRows = rawOutput.rows;
  if (!Array.isArray(rawRows)) {
    return { rows: [], errors: [EXECUTOR_OUTPUT_SHAPE_ERROR] };
  }

  const errors: string[] = [];
  const rowByRequirementId = new Map<string, CleanedRow>();
  rawRows.forEach((rawRow, index) => {
    if (!isPlainRecord(rawRow)) {
      errors.push(`rows[${index}] must be an object.`);
      return;
    }
    const before = errors.length;

    const requirementId =
      typeof rawRow.requirementId === "string"
        ? rawRow.requirementId.trim()
        : "";
    if (requirementId === "") {
      errors.push(`rows[${index}].requirementId is required.`);
    } else if (!context.requirementIds.has(requirementId)) {
      errors.push(
        `rows[${index}] references an unknown requirement ID: ${requirementId}.`
      );
    } else if (rowByRequirementId.has(requirementId)) {
      errors.push(`rows[${index}] duplicates requirement ID: ${requirementId}.`);
    }

    const response =
      typeof rawRow.response === "string" ? rawRow.response.trim() : "";
    if (response === "") {
      errors.push(`rows[${index}].response is required.`);
    }

    const evidenceIds = cleanIdList(rawRow.evidenceIds);
    for (const id of evidenceIds) {
      if (!context.packageEvidenceIds.has(id)) {
        errors.push(`rows[${index}] cites unknown evidence ID: ${id}.`);
      }
    }

    const configurationLineIds = cleanIdList(rawRow.configurationLineIds);
    if (configurationLineIds.length > 0) {
      if (!context.hasConfig) {
        errors.push(
          `rows[${index}] cites configuration lines but no configuration_expansion artifact was supplied.`
        );
      } else {
        for (const id of configurationLineIds) {
          if (!context.configLineIds.has(id)) {
            errors.push(
              `rows[${index}] cites unknown configuration line ID: ${id}.`
            );
          }
        }
      }
    }

    if (errors.length > before) return;

    const rationale = trimmedNonblankOrUndefined(rawRow.rationale);
    const notes = trimmedNonblankOrUndefined(rawRow.notes);
    rowByRequirementId.set(requirementId, {
      requirementId,
      response,
      ...(rationale !== undefined ? { rationale } : {}),
      ...(notes !== undefined ? { notes } : {}),
      evidenceIds,
      configurationLineIds,
    });
  });

  // Every approved baseline requirement must have exactly one row.
  for (const requirement of context.requirements) {
    if (!rowByRequirementId.has(requirement.id)) {
      errors.push(`Missing compliance row for requirement ID: ${requirement.id}.`);
    }
  }

  if (errors.length > 0) return { rows: [], errors };

  // Build deterministic rows in baseline order; references are rebuilt fresh so no two
  // rows (or the loaded artifacts) ever share a reference object.
  const rows = context.requirements.map((requirement, index) => {
    const cleaned = rowByRequirementId.get(requirement.id) as CleanedRow;
    const evidenceReferences =
      cleaned.evidenceIds.length > 0
        ? cleaned.evidenceIds.map((id) =>
            copyEvidenceReference(
              context.packageEntryById.get(id) as Record<string, unknown>
            )
          )
        : requirement.evidenceReferenceRecords.map(copyEvidenceReference);
    const row: RfpComplianceMatrixRow = {
      id: toRowId(index),
      requirementId: requirement.id,
      requirementText: requirement.text,
      category: requirement.category,
      priority: requirement.priority,
      complianceStatus: "needs_review",
      response: cleaned.response,
      ...(cleaned.rationale !== undefined ? { rationale: cleaned.rationale } : {}),
      ...(cleaned.notes !== undefined ? { notes: cleaned.notes } : {}),
      evidenceReferences,
      ...(context.hasConfig && cleaned.configurationLineIds.length > 0
        ? {
            configurationReferences: cleaned.configurationLineIds.map((id) =>
              toConfigurationReference(
                context.configLineById.get(id) as Record<string, unknown>,
                context.configurationExpansionArtifactId
              )
            ),
          }
        : {}),
    };
    return row;
  });

  return { rows, errors: [] };
}

/**
 * Draft reviewable compliance-matrix rows from one approved requirements_baseline, one
 * approved evidence_package, and OPTIONALLY one approved configuration_expansion, using
 * the INJECTED executor. Throws deterministic programmer errors before any store call:
 * nonblank projectId, requirementsBaselineArtifactId, evidencePackageArtifactId, and
 * requestedBy; a nonblank configurationExpansionArtifactId when one is supplied; and a
 * function executor (artifact ids and requestedBy are trimmed for use). Gates in order,
 * tenant scoped: project exists and is rfp mode; the baseline artifact exists, is
 * requirements_baseline at requirements_baseline_review, is approved, and carries a
 * valid rfp_requirements_baseline payload with a nonempty requirements array; the
 * evidence_package artifact exists, is evidence_package at intake_package_review, is
 * approved, and carries a valid rfp_evidence_package payload; and, when supplied, the
 * configuration_expansion artifact exists, is configuration_expansion at
 * configuration_expansion_review, is approved, and carries a REVIEWED payload (never the
 * draft marker) with a valid acceptedLines array. Each failing gate returns a lean
 * summary and never calls the executor. The executor receives whitelisted copies only;
 * a throw maps to drafting_failed with a fixed error code (the thrown detail is never
 * exposed); invalid output returns invalid_draft_output listing every violation. On
 * success the result is lean and serializable: sanitized rows plus identifier/count
 * fields only. Persists nothing, mutates nothing; store failures bubble unhidden.
 */
export async function draftRfpComplianceMatrixRows(
  input: DraftRfpComplianceMatrixRowsInput
): Promise<DraftRfpComplianceMatrixRowsResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (
    typeof input.requirementsBaselineArtifactId !== "string" ||
    input.requirementsBaselineArtifactId.trim() === ""
  ) {
    throw new Error("requirementsBaselineArtifactId is required.");
  }
  if (
    typeof input.evidencePackageArtifactId !== "string" ||
    input.evidencePackageArtifactId.trim() === ""
  ) {
    throw new Error("evidencePackageArtifactId is required.");
  }
  if (
    typeof input.requestedBy !== "string" ||
    input.requestedBy.trim() === ""
  ) {
    throw new Error("requestedBy is required.");
  }
  const hasConfigInput = input.configurationExpansionArtifactId !== undefined;
  if (
    hasConfigInput &&
    (typeof input.configurationExpansionArtifactId !== "string" ||
      input.configurationExpansionArtifactId.trim() === "")
  ) {
    throw new Error("configurationExpansionArtifactId is required.");
  }
  if (typeof input.executor !== "function") {
    throw new Error("executor is required.");
  }

  const requestedBy = input.requestedBy.trim();
  const requirementsBaselineArtifactId =
    input.requirementsBaselineArtifactId.trim();
  const evidencePackageArtifactId = input.evidencePackageArtifactId.trim();
  const configurationExpansionArtifactId = hasConfigInput
    ? (input.configurationExpansionArtifactId as string).trim()
    : undefined;
  const { tenantId, projectId } = input;

  const project = await getProjectById(tenantId, projectId);
  if (project === null) return { status: "not_found" };
  if (project.mode !== "rfp") {
    return { status: "wrong_mode", project: toProjectSummary(project) };
  }

  // Approved requirements_baseline gate.
  const baseline = await getProjectArtifactById(
    tenantId,
    projectId,
    requirementsBaselineArtifactId
  );
  if (baseline === null) {
    return { status: "requirements_baseline_not_found" };
  }
  if (
    baseline.type !== REQUIREMENTS_BASELINE_ARTIFACT_TYPE ||
    baseline.stageId !== REQUIREMENTS_BASELINE_STAGE_ID
  ) {
    return {
      status: "artifact_not_requirements_baseline",
      artifact: toArtifactSummary(baseline),
    };
  }
  if (baseline.status !== "approved") {
    return {
      status: "requirements_baseline_not_approved",
      artifact: toArtifactSummary(baseline),
    };
  }
  const baselinePayload = toRecord(baseline.payload);
  if (
    baselinePayload.payloadKind !== RFP_REQUIREMENTS_BASELINE_PAYLOAD_KIND ||
    !isValidBaselineRequirementList(baselinePayload.requirements)
  ) {
    return {
      status: "invalid_requirements_baseline_payload",
      artifact: toArtifactSummary(baseline),
    };
  }

  // Approved evidence_package gate (the only approved evidence authority).
  const evidencePackage = await getProjectArtifactById(
    tenantId,
    projectId,
    evidencePackageArtifactId
  );
  if (evidencePackage === null) {
    return { status: "evidence_package_not_found" };
  }
  if (
    evidencePackage.type !== EVIDENCE_PACKAGE_ARTIFACT_TYPE ||
    evidencePackage.stageId !== EVIDENCE_PACKAGE_STAGE_ID
  ) {
    return {
      status: "artifact_not_evidence_package",
      artifact: toArtifactSummary(evidencePackage),
    };
  }
  if (evidencePackage.status !== "approved") {
    return {
      status: "evidence_package_not_approved",
      artifact: toArtifactSummary(evidencePackage),
    };
  }
  const evidencePackagePayload = toRecord(evidencePackage.payload);
  if (
    evidencePackagePayload.payloadKind !== RFP_EVIDENCE_PACKAGE_PAYLOAD_KIND ||
    !isValidEvidencePackageEntryList(evidencePackagePayload.evidence)
  ) {
    return {
      status: "invalid_evidence_package_payload",
      artifact: toArtifactSummary(evidencePackage),
    };
  }

  // Optional approved configuration_expansion gate (reviewed payload, never a draft).
  let configuration: ProjectArtifact | null = null;
  let acceptedLineRecords: Record<string, unknown>[] = [];
  if (configurationExpansionArtifactId !== undefined) {
    configuration = await getProjectArtifactById(
      tenantId,
      projectId,
      configurationExpansionArtifactId
    );
    if (configuration === null) {
      return { status: "configuration_expansion_not_found" };
    }
    if (
      configuration.type !== CONFIGURATION_EXPANSION_ARTIFACT_TYPE ||
      configuration.stageId !== CONFIGURATION_EXPANSION_STAGE_ID
    ) {
      return {
        status: "artifact_not_configuration_expansion",
        artifact: toArtifactSummary(configuration),
      };
    }
    if (configuration.status !== "approved") {
      return {
        status: "configuration_expansion_not_approved",
        artifact: toArtifactSummary(configuration),
      };
    }
    const configurationPayload = toRecord(configuration.payload);
    if (
      configurationPayload.payloadKind ===
        CONFIGURATION_EXPANSION_DRAFT_PAYLOAD_KIND ||
      !isValidAcceptedLineList(configurationPayload.acceptedLines)
    ) {
      return {
        status: "invalid_configuration_expansion_payload",
        artifact: toArtifactSummary(configuration),
      };
    }
    acceptedLineRecords = configurationPayload.acceptedLines;
  }

  // All gates passed: assemble the read-only drafting context.
  const parsedRequirements = (
    baselinePayload.requirements as Record<string, unknown>[]
  ).map(parseRequirement);
  const requirementIds = new Set<string>(
    parsedRequirements.map((requirement) => requirement.id)
  );

  const packageEntries =
    evidencePackagePayload.evidence as Record<string, unknown>[];
  const packageEntryById = new Map<string, Record<string, unknown>>();
  for (const entry of packageEntries) {
    packageEntryById.set(asString(entry.evidenceId), entry);
  }
  const packageEvidenceIds = new Set<string>(packageEntryById.keys());

  const baselineCitesOnlyPackageEvidence = parsedRequirements.every(
    (requirement) =>
      requirement.evidenceReferenceRecords.every((reference) =>
        packageEvidenceIds.has(asString(reference.evidenceId))
      )
  );
  if (!baselineCitesOnlyPackageEvidence) {
    return {
      status: "invalid_requirements_baseline_payload",
      artifact: toArtifactSummary(baseline),
    };
  }

  const configLineById = new Map<string, Record<string, unknown>>();
  for (const line of acceptedLineRecords) {
    configLineById.set(asString(line.lineId), line);
  }
  const configLineIds = new Set<string>(configLineById.keys());

  const sourceFileIds = uniqueNonblankInOrder([
    ...baseline.sourceFileIds,
    ...evidencePackage.sourceFileIds,
    ...(configuration !== null ? configuration.sourceFileIds : []),
  ]);
  const sourceArtifactIds = [
    requirementsBaselineArtifactId,
    evidencePackageArtifactId,
    ...(configurationExpansionArtifactId !== undefined
      ? [configurationExpansionArtifactId]
      : []),
  ];

  // The executor gets its own copies; mutating them never reaches the loaded artifacts,
  // this function's locals, or the returned result.
  let rawOutput: unknown;
  try {
    rawOutput = await input.executor({
      project: toProjectSummary(project),
      requirementsBaseline: toArtifactSummary(baseline),
      evidencePackage: toArtifactSummary(evidencePackage),
      ...(configuration !== null
        ? { configurationExpansion: toArtifactSummary(configuration) }
        : {}),
      requirements: parsedRequirements.map(toExecutorRequirement),
      evidence: packageEntries.map(toExecutorEvidence),
      ...(configuration !== null
        ? { configurationLines: acceptedLineRecords.map(toExecutorConfigurationLine) }
        : {}),
      requestedBy,
      sourceFileIds: sourceFileIds.slice(),
      sourceArtifactIds: sourceArtifactIds.slice(),
    });
  } catch {
    // The thrown detail (provider error, prompt, stack) is never surfaced.
    return {
      status: "drafting_failed",
      error: "compliance_matrix_drafting_failed",
    };
  }

  const sanitized = sanitizeExecutorOutput(rawOutput, {
    requirements: parsedRequirements,
    requirementIds,
    packageEntryById,
    packageEvidenceIds,
    hasConfig: configuration !== null,
    configurationExpansionArtifactId: configurationExpansionArtifactId ?? "",
    configLineById,
    configLineIds,
  });
  if (sanitized.errors.length > 0) {
    return { status: "invalid_draft_output", errors: sanitized.errors };
  }

  return {
    status: "ok",
    project: toProjectSummary(project),
    requirementsBaselineArtifactId,
    evidencePackageArtifactId,
    ...(configurationExpansionArtifactId !== undefined
      ? { configurationExpansionArtifactId }
      : {}),
    rows: sanitized.rows,
    rowCount: sanitized.rows.length,
    requirementCount: parsedRequirements.length,
    evidenceCount: packageEntries.length,
    sourceFileIds: sourceFileIds.slice(),
    sourceArtifactIds: sourceArtifactIds.slice(),
  };
}
