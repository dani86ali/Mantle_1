/**
 * RFP compliance-matrix artifact PAYLOAD CONTRACT (Stage 4, slice 1).
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md (section 12).
 * Canonical shapes: src/types/project.ts.
 *
 * Pure TypeScript contract for ONE reviewable compliance_matrix artifact version a
 * LATER service drafts from approved upstream artifacts: an approved
 * requirements_baseline, an approved evidence_package, and optionally an approved
 * configuration_expansion. It defines the payload, row, and reference shapes plus
 * pure deep-copy/summary helpers ONLY: it drafts nothing, reads no store, creates
 * or approves no artifact, calls no AI/model, performs no OCR, and makes no SKU,
 * catalog, pricing, configuration, or compliance decision. Rows are NOT generated
 * here; the deterministic row-id convention (RFP-COMP-001, RFP-COMP-002, ...) is
 * documented for the drafting service. Optional Stage 5 engineer-owned review
 * metadata (section reference, response/owner lanes, advisory HLD/TP/BoQ-config
 * impact hints, an owner-review flag, a per-row review status, not-applicable
 * and removed reasons, and a review-event history) is human-owned contract data
 * only: it is computed nowhere here and encodes no pricing, SKU, catalog, or
 * configuration decision. Every evidence reference is a locator-only
 * snapshot (ids, kind, counts, positions) - never raw evidence text or table rows;
 * every configuration reference carries line/source identifiers and descriptive
 * fields only - never a price, margin, discount, currency, catalog-lookup, or
 * replacement-authority field, so configuration and pricing authority stay with
 * their own artifacts. Helpers deep-copy through explicit whitelists, omit absent
 * optionals, and never mutate their input.
 *
 * Category/priority and the locator-only evidence-reference shape are reused from
 * the requirements-baseline contract via a TYPE-ONLY import: with isolatedModules
 * it is erased at compile time, so this module pulls no DB, persistence, or service
 * code into its runtime graph.
 */
import type {
  RfpRequirementCategory,
  RfpRequirementPriority,
  RfpRequirementEvidenceReference,
} from "@/lib/projects/project-rfp-requirements-baseline";

/** Payload discriminator stamped on every compliance_matrix draft payload. */
export const RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND = "rfp_compliance_matrix";

/** Requirement category snapshot; the requirements-baseline category union. */
export type RfpComplianceMatrixCategory = RfpRequirementCategory;
/** Requirement priority snapshot; the requirements-baseline priority union. */
export type RfpComplianceMatrixPriority = RfpRequirementPriority;
/** Locator-only evidence reference; the requirements-baseline reference union. */
export type RfpComplianceMatrixEvidenceReference = RfpRequirementEvidenceReference;

/** Reviewable per-requirement compliance outcome; a fresh draft defaults to needs_review. */
export const RFP_COMPLIANCE_STATUSES = [
  "compliant",
  "partially_compliant",
  "non_compliant",
  "not_applicable",
  "needs_review",
] as const;
export type RfpComplianceStatus = (typeof RFP_COMPLIANCE_STATUSES)[number];

/**
 * The two evidence-reference kinds, declared locally exactly as the upstream
 * services declare them (importing the value would pull a coupled module into this
 * contract's runtime graph). Kept in sync with the baseline reference union.
 */
const RFP_TEXT_CHUNK_EVIDENCE_KIND = "rfp_document_text_chunk";
const RFP_TABLE_EVIDENCE_KIND = "rfp_document_table";

/**
 * Locator-only reference to one approved configuration_expansion line that backs a
 * compliance response: the source artifact id, the within-expansion line id, and
 * line/source identifiers plus descriptive (origin/sku/description) fields ONLY. It
 * NEVER carries a price, margin, discount, currency, catalog-lookup, or
 * replacement-authority field.
 */
export interface RfpComplianceMatrixConfigurationReference {
  configurationExpansionArtifactId: string;
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

/** Whitelisted configuration-reference keys, copied when present. */
const CONFIGURATION_REFERENCE_KEYS = [
  "configurationExpansionArtifactId",
  "lineId",
  "origin",
  "sku",
  "description",
  "parentLineId",
  "parentLineNumber",
  "sourceFileId",
  "sourceRowNumber",
  "originalLineNumber",
] as const;

/**
 * Review/owner lanes a compliance row can be routed to during Stage 5 review.
 * Generic organizational lanes ONLY; they encode no pricing, SKU, catalog, or
 * configuration authority. Reused for both responseLane and ownerLane.
 */
export const RFP_COMPLIANCE_REVIEW_LANES = [
  "technical",
  "commercial",
  "legal",
  "project_delivery",
  "security",
  "safety",
  "vendor",
  "customer",
  "other",
] as const;
export type RfpComplianceReviewLane = (typeof RFP_COMPLIANCE_REVIEW_LANES)[number];

/**
 * Advisory downstream-impact hint an engineer records on a row (HLD, TP, or
 * BoQ/config). It is a human review flag ONLY: this contract computes no HLD, TP,
 * or BoQ/config impact and makes no pricing, SKU, catalog, or configuration
 * decision from it.
 */
export const RFP_COMPLIANCE_IMPACT_LEVELS = [
  "none",
  "potential",
  "required",
  "owner_review_required",
] as const;
export type RfpComplianceImpactLevel =
  (typeof RFP_COMPLIANCE_IMPACT_LEVELS)[number];

/** Per-row review lifecycle state, distinct from the compliance outcome. */
export const RFP_COMPLIANCE_ROW_REVIEW_STATUSES = [
  "pending",
  "reviewed",
  "removed",
] as const;
export type RfpComplianceRowReviewStatus =
  (typeof RFP_COMPLIANCE_ROW_REVIEW_STATUSES)[number];

/** Engineer review actions recorded, in order, in a row's review history. */
export const RFP_COMPLIANCE_REVIEW_ACTIONS = [
  "edited",
  "status_changed",
  "marked_not_applicable",
  "removed",
  "restored",
  "owner_review_requested",
] as const;
export type RfpComplianceReviewAction =
  (typeof RFP_COMPLIANCE_REVIEW_ACTIONS)[number];

/**
 * One engineer review event in a row's audit trail: WHAT was done, WHEN, and by
 * WHOM, plus an optional human note. Human-owned contract data ONLY; it carries no
 * row body and no pricing, SKU, catalog, or configuration authority.
 */
export interface RfpComplianceMatrixReviewEvent {
  action: RfpComplianceReviewAction;
  /** ISO timestamp the engineer recorded the action at. */
  at: string;
  /** Engineer who performed the action (id/email snapshot). */
  by: string;
  note?: string;
}

/** Whitelisted review-event keys, copied when present; extra keys are dropped. */
const REVIEW_EVENT_KEYS = ["action", "at", "by", "note"] as const;

/**
 * One reviewable compliance-matrix row: a requirement snapshot from the approved
 * requirements_baseline plus the human-reviewable compliance response and its
 * locator-only references. The drafting service assigns the deterministic id
 * (RFP-COMP-001, ...); rows are NOT generated in this module.
 */
export interface RfpComplianceMatrixRow {
  /** Deterministic in-order id by convention: RFP-COMP-001, RFP-COMP-002, ... */
  id: string;
  /** Requirement id snapshot from the approved requirements_baseline (RFP-REQ-001, ...). */
  requirementId: string;
  requirementText: string;
  category: RfpComplianceMatrixCategory;
  priority: RfpComplianceMatrixPriority;
  /** Human-reviewable compliance outcome; needs_review until an engineer decides. */
  complianceStatus: RfpComplianceStatus;
  response: string;
  rationale?: string;
  notes?: string;
  /** Locator-only evidence references backing the response; never raw text/rows. */
  evidenceReferences: RfpComplianceMatrixEvidenceReference[];
  /** Optional locator-only configuration_expansion references; never pricing/authority. */
  configurationReferences?: RfpComplianceMatrixConfigurationReference[];
  /**
   * Optional Stage 5 engineer-owned review metadata. Every field below is
   * human-supplied contract data: this module computes none of it, and none of it
   * encodes pricing, SKU, catalog, or configuration authority. The HLD/TP/BoQ
   * impact fields are advisory review hints only - no HLD, TP, or BoQ/config is
   * computed here. Absent fields are omitted by the copy helper (never emitted as
   * undefined); removed/not_applicable reasons are preserved, never auto-deleted.
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

/** Whitelisted scalar row keys (references are deep-copied separately). */
const ROW_SCALAR_KEYS = [
  "id",
  "requirementId",
  "requirementText",
  "category",
  "priority",
  "complianceStatus",
  "response",
  "rationale",
  "notes",
  "sectionReference",
  "responseLane",
  "ownerLane",
  "hldImpact",
  "tpImpact",
  "boqConfigImpact",
  "requiresOwnerReview",
  "rowReviewStatus",
  "notApplicableReason",
  "removedReason",
] as const;

/** The compliance_matrix draft artifact payload. */
export type RfpComplianceMatrixPayload = {
  payloadKind: typeof RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND;
  /** The approved requirements_baseline the rows snapshot requirements from. */
  sourceRequirementsBaselineArtifactId: string;
  /** The approved evidence_package the evidence references point into. */
  sourceEvidencePackageArtifactId: string;
  /** The approved configuration_expansion, when configuration context is cited. */
  sourceConfigurationExpansionArtifactId?: string;
  createdBy: string;
  /** ISO creation timestamp. */
  createdAt: string;
  /** Unique source files behind the rows, in first-seen order. */
  sourceFileIds: string[];
  /** Unique approved upstream artifact ids behind the rows, in first-seen order. */
  sourceArtifactIds: string[];
  rows: RfpComplianceMatrixRow[];
};

/** Whitelisted scalar payload keys (id arrays and rows are copied separately). */
const PAYLOAD_SCALAR_KEYS = [
  "sourceRequirementsBaselineArtifactId",
  "sourceEvidencePackageArtifactId",
  "sourceConfigurationExpansionArtifactId",
  "createdBy",
  "createdAt",
] as const;

/** Identifier/count projection of a compliance_matrix payload; no row bodies. */
export interface RfpComplianceMatrixPayloadSummary {
  payloadKind: typeof RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND;
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
  /** Count of rows per compliance status; every status key is present. */
  statusCounts: Record<RfpComplianceStatus, number>;
}

/** Copy only the listed keys whose value is defined; a fresh, alias-free object. */
function pickDefined<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[]
): Pick<T, K> {
  const result: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return result as Pick<T, K>;
}

/** A fresh status-count record with every compliance status initialized to 0. */
function emptyStatusCounts(): Record<RfpComplianceStatus, number> {
  const counts = {} as Record<RfpComplianceStatus, number>;
  for (const status of RFP_COMPLIANCE_STATUSES) counts[status] = 0;
  return counts;
}

/**
 * Fresh locator-only copy of one evidence reference through an explicit per-kind
 * whitelist; identifier, kind, position, and count fields only. A non-whitelisted
 * field (e.g. a raw text body or rows matrix) is never carried.
 */
function copyEvidenceReference(
  reference: RfpComplianceMatrixEvidenceReference
): RfpComplianceMatrixEvidenceReference {
  if (reference.evidenceKind === RFP_TABLE_EVIDENCE_KIND) {
    return pickDefined(reference, [
      "evidenceId",
      "sourceFileId",
      "evidenceKind",
      "inputPackageArtifactId",
      "tableId",
      "pageNumber",
      "sheetName",
      "rowCount",
      "columnCount",
    ]);
  }
  return pickDefined(reference, [
    "evidenceId",
    "sourceFileId",
    "evidenceKind",
    "inputPackageArtifactId",
    "chunkIndex",
    "chunkCount",
    "charCount",
  ]);
}

/** Fresh deep copy of one row; references are copied through their whitelists. */
function copyRow(row: RfpComplianceMatrixRow): RfpComplianceMatrixRow {
  return {
    ...pickDefined(row, ROW_SCALAR_KEYS),
    evidenceReferences: row.evidenceReferences.map(copyEvidenceReference),
    ...(row.configurationReferences !== undefined
      ? {
          configurationReferences: row.configurationReferences.map((reference) =>
            pickDefined(reference, CONFIGURATION_REFERENCE_KEYS)
          ),
        }
      : {}),
    ...(row.reviewHistory !== undefined
      ? {
          reviewHistory: row.reviewHistory.map((event) =>
            pickDefined(event, REVIEW_EVENT_KEYS)
          ),
        }
      : {}),
  };
}

/**
 * Deep copy of a whole compliance_matrix payload: the discriminator is re-stamped,
 * scalar fields are whitelisted, the source-id arrays are fresh slices, and every
 * row/reference is rebuilt through its whitelist. Mutating the result can never
 * reach the input payload.
 */
export function copyRfpComplianceMatrixPayload(
  payload: RfpComplianceMatrixPayload
): RfpComplianceMatrixPayload {
  return {
    payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
    ...pickDefined(payload, PAYLOAD_SCALAR_KEYS),
    sourceFileIds: payload.sourceFileIds.slice(),
    sourceArtifactIds: payload.sourceArtifactIds.slice(),
    rows: payload.rows.map(copyRow),
  };
}

/**
 * Lean identifier/count projection of a compliance_matrix payload: row ids,
 * requirement ids (one per row, in row order), the source-id arrays, and a
 * per-status row count with every status key present. Arrays are fresh copies and
 * the input payload is never mutated; no row body, response, or reference surfaces.
 */
export function buildRfpComplianceMatrixPayloadSummary(
  payload: RfpComplianceMatrixPayload
): RfpComplianceMatrixPayloadSummary {
  const statusCounts = emptyStatusCounts();
  for (const row of payload.rows) statusCounts[row.complianceStatus] += 1;
  return {
    payloadKind: RFP_COMPLIANCE_MATRIX_PAYLOAD_KIND,
    ...pickDefined(payload, PAYLOAD_SCALAR_KEYS),
    rowCount: payload.rows.length,
    rowIds: payload.rows.map((row) => row.id),
    requirementIds: payload.rows.map((row) => row.requirementId),
    sourceFileIds: payload.sourceFileIds.slice(),
    sourceArtifactIds: payload.sourceArtifactIds.slice(),
    statusCounts,
  };
}
