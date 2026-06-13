/**
 * RFP compliance-matrix draft create service (Stage 4, slice 3).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 * Canonical shapes: src/types/project.ts.
 *
 * Creates ONE reviewable compliance_matrix artifact version (status
 * needs_review) from already-sanitized draft rows plus the exact APPROVED
 * upstream artifact ids the rows snapshot from. This service decides nothing:
 * no AI or model call, no compliance classification or approval, no OCR, no
 * arithmetic, and no SKU, catalog, pricing, replacement, or configuration
 * logic. It treats the supplied rows as UNTRUSTED candidate input - never as
 * authority - and rebuilds every stored field from approved Project state, then
 * records a single review draft. The drafting executor (a separate, neutral
 * boundary) produced the candidate rows; here they are re-validated and
 * re-sanitized before persistence, and the created artifact must still be
 * human-approved before any downstream stage relies on it.
 *
 * It drafts from THREE approved artifacts read by exact id, tenant scoped: one
 * approved requirements_baseline (type requirements_baseline at stage
 * requirements_baseline_review, status approved, payloadKind
 * rfp_requirements_baseline, a nonempty requirements array), one approved
 * evidence_package (type evidence_package at stage intake_package_review, status
 * approved, payloadKind rfp_evidence_package, a valid evidence array - the ONLY
 * approved evidence authority; no evidence store is read), and OPTIONALLY one
 * approved configuration_expansion (type configuration_expansion at stage
 * configuration_expansion_review, status approved, a REVIEWED payload - never
 * the configuration_expansion_draft marker - with a valid acceptedLines array).
 * Each failing gate returns a lean discriminated status (never a payload, tenant
 * id, file path, raw evidence body, table rows, pricing, catalog, replacement,
 * or config-authority internal) and creates nothing.
 *
 * Rows are validated as exactly one row per approved baseline requirement, in
 * baseline order, each carrying the deterministic id (RFP-COMP-001, ... in
 * baseline order), the matching requirementId, a needs_review complianceStatus
 * (any other status is rejected; the service accepts no model/user-supplied
 * compliance authority), and a nonblank response. requirementText/category/
 * priority are rebuilt from the approved baseline snapshot, not from the row.
 * Evidence references are rebuilt from the approved evidence_package payload by
 * evidenceId (locator-only - never raw text, never table rows); configuration
 * references are rebuilt from the approved acceptedLines by lineId through a
 * descriptive whitelist (never a price, margin, discount, currency, catalog
 * lookup, SKU replacement, sourceRuleId, evidence, rule, or quantity field), and
 * are rejected entirely when no configuration_expansion artifact was supplied.
 * Collected deterministic row errors return invalid_compliance_matrix_rows and
 * create nothing. On success exactly one needs_review compliance_matrix version
 * is created at compliance_matrix_review; the result is lean and serializable -
 * a payload helper summary plus identifier/count fields, no row bodies. Inputs
 * and loaded artifacts are never mutated; store failures bubble unhidden.
 */
import { getProjectById } from "@/lib/db/project-store";
import {
  createProjectArtifactVersion,
  getProjectArtifactById,
} from "@/lib/db/project-artifact-store";
import type { Project, ProjectArtifact } from "@/types/project";
import {
  RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
  buildRfpComplianceMatrixPayloadSummary,
  type RfpComplianceMatrixCategory,
  type RfpComplianceMatrixPriority,
  type RfpComplianceMatrixEvidenceReference,
  type RfpComplianceMatrixConfigurationReference,
  type RfpComplianceMatrixRow,
  type RfpComplianceMatrixPayload,
  type RfpComplianceMatrixPayloadSummary,
} from "@/lib/projects/project-rfp-compliance-matrix";

/** The artifact type / stage this service creates. */
const COMPLIANCE_MATRIX_ARTIFACT_TYPE: ProjectArtifact["type"] =
  "compliance_matrix";
const COMPLIANCE_MATRIX_STAGE_ID: ProjectArtifact["stageId"] =
  "compliance_matrix_review";

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

/** The only reviewable compliance outcome a fresh draft row may carry. */
const NEEDS_REVIEW_COMPLIANCE_STATUS = "needs_review";

/**
 * The two locator-only evidence-reference kinds, declared locally exactly as the
 * upstream contracts declare them (importing the value would pull a coupled
 * module into this service's graph). Kept in sync with the baseline reference union.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/**
 * The baseline category/priority literal sets, keyed records the compiler locks to
 * the type-only imported (re-exported baseline) unions: a literal added or removed
 * there breaks this service until mirrored here. No runtime baseline import is
 * allowed, so the values are restated.
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
};
const RFP_REQUIREMENT_PRIORITY_FLAGS: Record<RfpComplianceMatrixPriority, true> = {
  mandatory: true,
  preferred: true,
  optional: true,
  informational: true,
  unknown: true,
};

/** Input for {@link createRfpComplianceMatrixDraft}. */
export interface CreateRfpComplianceMatrixDraftInput {
  tenantId: string;
  projectId: string;
  createdBy: string;
  /** The exact APPROVED requirements_baseline the rows snapshot requirements from. */
  sourceRequirementsBaselineArtifactId: string;
  /** The exact APPROVED evidence_package the evidence references point into. */
  sourceEvidencePackageArtifactId: string;
  /** Optional exact APPROVED configuration_expansion rows may cite lines from. */
  sourceConfigurationExpansionArtifactId?: string;
  /** Already-drafted candidate rows; re-validated and rebuilt, never trusted. */
  rows: RfpComplianceMatrixRow[];
}

/** Lean serializable Project projection; tenantId is never surfaced. */
export interface RfpComplianceMatrixDraftProjectSummary {
  id: string;
  name: string;
  customerName?: string;
  mode: Project["mode"];
  createdAt: string;
  updatedAt: string;
}

/** Serializable artifact summary: ISO dates, copied source arrays, no payload. */
export interface RfpComplianceMatrixDraftArtifactSummary {
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

/** Discriminated result of {@link createRfpComplianceMatrixDraft}. */
export type CreateRfpComplianceMatrixDraftResult =
  | { status: "not_found" }
  | { status: "wrong_mode"; project: RfpComplianceMatrixDraftProjectSummary }
  | { status: "requirements_baseline_not_found" }
  | {
      status: "artifact_not_requirements_baseline";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | {
      status: "requirements_baseline_not_approved";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | {
      status: "invalid_requirements_baseline_payload";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | { status: "evidence_package_not_found" }
  | {
      status: "artifact_not_evidence_package";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | {
      status: "evidence_package_not_approved";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | {
      status: "invalid_evidence_package_payload";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | { status: "configuration_expansion_not_found" }
  | {
      status: "artifact_not_configuration_expansion";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | {
      status: "configuration_expansion_not_approved";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | {
      status: "invalid_configuration_expansion_payload";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
    }
  | { status: "invalid_compliance_matrix_rows"; errors: string[] }
  | {
      status: "ok";
      artifact: RfpComplianceMatrixDraftArtifactSummary;
      payloadSummary: RfpComplianceMatrixPayloadSummary;
    };

/** One approved baseline requirement after validation; the row snapshot authority. */
interface ParsedRequirement {
  id: string;
  text: string;
  category: RfpComplianceMatrixCategory;
  priority: RfpComplianceMatrixPriority;
}

/** Read-only context the untrusted rows are validated and rebuilt against. */
interface RowBuildContext {
  requirements: ParsedRequirement[];
  requirementIds: ReadonlySet<string>;
  packageEntryById: ReadonlyMap<string, Record<string, unknown>>;
  packageEvidenceIds: ReadonlySet<string>;
  hasConfig: boolean;
  configurationExpansionArtifactId: string;
  configLineById: ReadonlyMap<string, Record<string, unknown>>;
  configLineIds: ReadonlySet<string>;
}

/** One validated row's reusable fields before deterministic assembly. */
interface CleanedRow {
  response: string;
  rationale?: string;
  notes?: string;
  evidenceIds: string[];
  configurationLineIds: string[];
}

/** Outcome of one row validation/sanitization pass. */
interface SanitizedRows {
  rows: RfpComplianceMatrixRow[];
  errors: string[];
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
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

/** True for the only two evidence kinds an evidence-package entry may carry. */
function isRfpExtractionEvidenceKind(kind: string): boolean {
  return (
    kind === RFP_TEXT_CHUNK_EVIDENCE_KIND || kind === RFP_TABLE_EVIDENCE_KIND
  );
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

/** Deterministic in-order row id: RFP-COMP-001, RFP-COMP-002, ... */
function toRowId(index: number): string {
  return `RFP-COMP-${String(index + 1).padStart(3, "0")}`;
}

/** Lean Project projection; tenantId is never surfaced. */
function toProjectSummary(
  project: Project
): RfpComplianceMatrixDraftProjectSummary {
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
): RfpComplianceMatrixDraftArtifactSummary {
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
 * Build one fresh locator-only evidence reference from a stored evidence-package
 * entry record through an explicit per-kind whitelist: identifier, kind, position,
 * and count fields only. A non-whitelisted field (raw text body, rows matrix,
 * storage reference) is never carried.
 */
function buildEvidenceReference(
  entry: Record<string, unknown>
): RfpComplianceMatrixEvidenceReference {
  const evidenceId = asString(entry.evidenceId);
  const sourceFileId = asString(entry.sourceFileId);
  const inputPackageArtifactId = asString(entry.inputPackageArtifactId);
  if (entry.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    const pageNumber = asOptionalNumber(entry.pageNumber);
    const sheetName = asOptionalString(entry.sheetName);
    return {
      evidenceId,
      sourceFileId,
      evidenceKind: RFP_TABLE_EVIDENCE_KIND,
      inputPackageArtifactId,
      tableId: asString(entry.tableId),
      ...(pageNumber !== undefined ? { pageNumber } : {}),
      ...(sheetName !== undefined ? { sheetName } : {}),
      rowCount: asCount(entry.rowCount),
      columnCount: asCount(entry.columnCount),
    };
  }
  return {
    evidenceId,
    sourceFileId,
    evidenceKind: RFP_TEXT_CHUNK_EVIDENCE_KIND,
    inputPackageArtifactId,
    chunkIndex: asCount(entry.chunkIndex),
    chunkCount: asCount(entry.chunkCount),
    charCount: asCount(entry.charCount),
  };
}

/**
 * Build one fresh locator-only configuration reference from a stored accepted-line
 * record: the configuration artifact id plus line/source identifiers and
 * descriptive fields ONLY. A price, margin, discount, currency, catalog lookup,
 * SKU replacement, sourceRuleId, evidence, rule, or quantity field is never copied,
 * so configuration authority stays separate from pricing.
 */
function buildConfigurationReference(
  raw: Record<string, unknown>,
  configurationExpansionArtifactId: string
): RfpComplianceMatrixConfigurationReference {
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
    configurationExpansionArtifactId,
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

/**
 * Validate the untyped baseline requirements array enough that rows cannot invent
 * identity or copy a malformed snapshot: a nonempty array whose every entry is a
 * plain record with a nonblank unique id, nonblank text, a valid category and
 * priority, and an evidenceReferences array.
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
  }
  return true;
}

/**
 * Validate the untyped evidence-package evidence array enough that citable ids
 * cannot be invented: an array (possibly empty) whose every entry is a plain record
 * with a known evidenceKind, a nonblank unique evidenceId, a nonblank sourceFileId,
 * and a nonblank inputPackageArtifactId.
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
 * Validate the untyped reviewed configuration_expansion acceptedLines array enough
 * that citable line ids cannot be invented: an array (possibly empty) whose every
 * entry is a plain record with a nonblank unique lineId.
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
  return {
    id: asString(raw.id),
    text: asString(raw.text),
    category: raw.category as RfpComplianceMatrixCategory,
    priority: raw.priority as RfpComplianceMatrixPriority,
  };
}

/**
 * Validate the untrusted supplied rows against the approved upstream artifacts and
 * rebuild them into reviewable compliance-matrix rows. Collects every violation
 * (deterministic rows[index] messages, then a message per uncovered baseline
 * requirement) instead of stopping at the first; when any error exists the rows
 * list is returned empty and nothing is created. Requires exactly one row per
 * approved baseline requirement in baseline order, the deterministic row id, the
 * matching requirementId, a needs_review complianceStatus, a nonblank response, an
 * evidenceReferences array citing only approved evidence_package ids, and (only when
 * a config artifact was supplied) configurationReferences citing only approved
 * accepted-line ids. On success rows carry deterministic RFP-COMP ids in baseline
 * order, the baseline requirement snapshot (text/category/priority), a needs_review
 * status, and fresh locator-only references rebuilt from approved state.
 */
function validateAndBuildRows(
  rawRows: readonly unknown[],
  context: RowBuildContext
): SanitizedRows {
  const errors: string[] = [];
  const { requirements } = context;
  const seenRequirementIds = new Set<string>();
  const cleaned: (CleanedRow | null)[] = requirements.map(() => null);

  const rowCount = Math.max(rawRows.length, requirements.length);
  for (let index = 0; index < rowCount; index += 1) {
    if (index >= requirements.length) {
      errors.push(`rows[${index}] has no corresponding baseline requirement.`);
      continue;
    }
    const requirement = requirements[index];
    if (index >= rawRows.length) {
      errors.push(`Missing compliance row for requirement ID: ${requirement.id}.`);
      continue;
    }
    const rawRow = rawRows[index];
    if (!isPlainRecord(rawRow)) {
      errors.push(`rows[${index}] must be an object.`);
      continue;
    }
    const before = errors.length;

    const expectedRowId = toRowId(index);
    if (rawRow.id !== expectedRowId) {
      errors.push(`rows[${index}].id must be ${expectedRowId}.`);
    }

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
    } else if (seenRequirementIds.has(requirementId)) {
      errors.push(
        `rows[${index}] duplicates requirement ID: ${requirementId}.`
      );
    } else if (requirementId !== requirement.id) {
      errors.push(
        `rows[${index}] is out of order: expected ${requirement.id} but found ${requirementId}.`
      );
    } else {
      seenRequirementIds.add(requirementId);
    }

    if (rawRow.complianceStatus !== NEEDS_REVIEW_COMPLIANCE_STATUS) {
      errors.push(
        `rows[${index}].complianceStatus must be ${NEEDS_REVIEW_COMPLIANCE_STATUS}.`
      );
    }

    const response =
      typeof rawRow.response === "string" ? rawRow.response.trim() : "";
    if (response === "") {
      errors.push(`rows[${index}].response is required.`);
    }

    const evidenceIds: string[] = [];
    if (!Array.isArray(rawRow.evidenceReferences)) {
      errors.push(`rows[${index}].evidenceReferences must be an array.`);
    } else {
      rawRow.evidenceReferences.forEach((reference, refIndex) => {
        const evidenceId =
          isPlainRecord(reference) && typeof reference.evidenceId === "string"
            ? reference.evidenceId.trim()
            : "";
        if (evidenceId === "") {
          errors.push(
            `rows[${index}].evidenceReferences[${refIndex}] must cite an evidence ID.`
          );
        } else if (!context.packageEvidenceIds.has(evidenceId)) {
          errors.push(
            `rows[${index}].evidenceReferences[${refIndex}] cites unknown evidence ID: ${evidenceId}.`
          );
        } else {
          evidenceIds.push(evidenceId);
        }
      });
    }

    const configurationLineIds: string[] = [];
    if (rawRow.configurationReferences !== undefined) {
      if (!context.hasConfig) {
        errors.push(
          `rows[${index}] cites configuration references but no configuration_expansion artifact was supplied.`
        );
      } else if (!Array.isArray(rawRow.configurationReferences)) {
        errors.push(`rows[${index}].configurationReferences must be an array.`);
      } else {
        rawRow.configurationReferences.forEach((reference, refIndex) => {
          const lineId =
            isPlainRecord(reference) && typeof reference.lineId === "string"
              ? reference.lineId.trim()
              : "";
          if (lineId === "") {
            errors.push(
              `rows[${index}].configurationReferences[${refIndex}] must cite a line ID.`
            );
          } else if (!context.configLineIds.has(lineId)) {
            errors.push(
              `rows[${index}].configurationReferences[${refIndex}] cites unknown configuration line ID: ${lineId}.`
            );
          } else {
            configurationLineIds.push(lineId);
          }
        });
      }
    }

    if (errors.length > before) continue;

    const rationale = trimmedNonblankOrUndefined(rawRow.rationale);
    const notes = trimmedNonblankOrUndefined(rawRow.notes);
    cleaned[index] = {
      response,
      ...(rationale !== undefined ? { rationale } : {}),
      ...(notes !== undefined ? { notes } : {}),
      evidenceIds,
      configurationLineIds,
    };
  }

  if (errors.length > 0) return { rows: [], errors };

  // Build deterministic rows in baseline order; every reference is rebuilt fresh
  // from approved state so no row aliases an input row or a loaded artifact.
  const rows = requirements.map((requirement, index) => {
    const clean = cleaned[index] as CleanedRow;
    const evidenceReferences = uniqueNonblankInOrder(clean.evidenceIds).map((id) =>
      buildEvidenceReference(
        context.packageEntryById.get(id) as Record<string, unknown>
      )
    );
    const row: RfpComplianceMatrixRow = {
      id: toRowId(index),
      requirementId: requirement.id,
      requirementText: requirement.text,
      category: requirement.category,
      priority: requirement.priority,
      complianceStatus: NEEDS_REVIEW_COMPLIANCE_STATUS,
      response: clean.response,
      ...(clean.rationale !== undefined ? { rationale: clean.rationale } : {}),
      ...(clean.notes !== undefined ? { notes: clean.notes } : {}),
      evidenceReferences,
      ...(context.hasConfig && clean.configurationLineIds.length > 0
        ? {
            configurationReferences: uniqueNonblankInOrder(
              clean.configurationLineIds
            ).map((id) =>
              buildConfigurationReference(
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
 * Create ONE reviewable compliance_matrix draft artifact version (status
 * needs_review) from already-sanitized candidate rows and the exact approved
 * upstream artifact ids the rows snapshot from. Throws deterministic programmer
 * errors before any store call: nonblank projectId, createdBy,
 * sourceRequirementsBaselineArtifactId, and sourceEvidencePackageArtifactId; a
 * nonblank sourceConfigurationExpansionArtifactId when one is supplied; and a
 * nonempty rows array (createdBy and the source artifact ids are trimmed for use).
 * Gates in order, tenant scoped: project exists and is rfp mode; the baseline
 * artifact exists, is requirements_baseline at requirements_baseline_review, is
 * approved, and carries a valid rfp_requirements_baseline payload with a nonempty
 * requirements array; the evidence_package artifact exists, is evidence_package at
 * intake_package_review, is approved, and carries a valid rfp_evidence_package
 * payload; and, when supplied, the configuration_expansion artifact exists, is
 * configuration_expansion at configuration_expansion_review, is approved, and
 * carries a REVIEWED payload (never the draft marker) with a valid acceptedLines
 * array. Each failing gate returns a lean summary and creates nothing. The supplied
 * rows are re-validated and rebuilt from approved state; collected errors return
 * invalid_compliance_matrix_rows and create nothing. On success exactly one
 * needs_review compliance_matrix version is created at compliance_matrix_review
 * whose sourceFileIds are the first-seen union of the approved upstream files and
 * whose sourceArtifactIds are [baseline, evidence package, optional config]; the
 * result carries a lean artifact summary and a payload-helper summary. Nothing is
 * mutated; store failures bubble.
 */
export async function createRfpComplianceMatrixDraft(
  input: CreateRfpComplianceMatrixDraftInput
): Promise<CreateRfpComplianceMatrixDraftResult> {
  if (typeof input.projectId !== "string" || input.projectId.trim() === "") {
    throw new Error("projectId is required.");
  }
  if (typeof input.createdBy !== "string" || input.createdBy.trim() === "") {
    throw new Error("createdBy is required.");
  }
  if (
    typeof input.sourceRequirementsBaselineArtifactId !== "string" ||
    input.sourceRequirementsBaselineArtifactId.trim() === ""
  ) {
    throw new Error("sourceRequirementsBaselineArtifactId is required.");
  }
  if (
    typeof input.sourceEvidencePackageArtifactId !== "string" ||
    input.sourceEvidencePackageArtifactId.trim() === ""
  ) {
    throw new Error("sourceEvidencePackageArtifactId is required.");
  }
  const hasConfigInput =
    input.sourceConfigurationExpansionArtifactId !== undefined;
  if (
    hasConfigInput &&
    (typeof input.sourceConfigurationExpansionArtifactId !== "string" ||
      input.sourceConfigurationExpansionArtifactId.trim() === "")
  ) {
    throw new Error("sourceConfigurationExpansionArtifactId is required.");
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw new Error("At least one compliance-matrix row is required.");
  }

  const createdBy = input.createdBy.trim();
  const requirementsBaselineArtifactId =
    input.sourceRequirementsBaselineArtifactId.trim();
  const evidencePackageArtifactId =
    input.sourceEvidencePackageArtifactId.trim();
  const configurationExpansionArtifactId = hasConfigInput
    ? (input.sourceConfigurationExpansionArtifactId as string).trim()
    : undefined;
  const rawRows = input.rows as readonly unknown[];
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

  // All gates passed: assemble the read-only validation/build context.
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

  const configLineById = new Map<string, Record<string, unknown>>();
  for (const line of acceptedLineRecords) {
    configLineById.set(asString(line.lineId), line);
  }
  const configLineIds = new Set<string>(configLineById.keys());

  const sanitized = validateAndBuildRows(rawRows, {
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
    return {
      status: "invalid_compliance_matrix_rows",
      errors: sanitized.errors,
    };
  }

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

  const createdAt = new Date().toISOString();
  const payload: RfpComplianceMatrixPayload = {
    payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
    sourceRequirementsBaselineArtifactId: requirementsBaselineArtifactId,
    sourceEvidencePackageArtifactId: evidencePackageArtifactId,
    ...(configurationExpansionArtifactId !== undefined
      ? { sourceConfigurationExpansionArtifactId: configurationExpansionArtifactId }
      : {}),
    createdBy,
    createdAt,
    sourceFileIds: sourceFileIds.slice(),
    sourceArtifactIds: sourceArtifactIds.slice(),
    rows: sanitized.rows,
  };

  const stored = await createProjectArtifactVersion({
    projectId,
    tenantId,
    stageId: COMPLIANCE_MATRIX_STAGE_ID,
    type: COMPLIANCE_MATRIX_ARTIFACT_TYPE,
    status: "needs_review",
    payload,
    sourceFileIds: payload.sourceFileIds.slice(),
    sourceArtifactIds: payload.sourceArtifactIds.slice(),
  });

  return {
    status: "ok",
    artifact: toArtifactSummary(stored),
    payloadSummary: buildRfpComplianceMatrixPayloadSummary(payload),
  };
}
