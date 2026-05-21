/**
 * Canonical Project-state types.
 * Source of truth: C:\Pre-Sales\bomatic_planning\MVP_CANONICAL_PROJECT_STATE.md
 *
 * The Project aggregate is the primary product object; intake, pipeline,
 * estimate, BoM, proposal, and export are its inputs/stages/artifacts. (section 2)
 * These types are intentionally INDEPENDENT of the legacy coordinator engine
 * pipeline types in src/coordinator/types.ts - do not import from there.
 */

/** Supported MVP workflows. RFI is out of scope. (section 2) */
export type ProjectMode = "quick_bom" | "rfp";

/** Role of an uploaded file; manually correctable during Intake review. (section 5) */
export type ProjectFileRole =
  | "rfp"
  | "boq"
  | "scope_of_work"
  | "compliance"
  | "addendum"
  | "other";

/** Stage lifecycle status. (section 13) */
export type ProjectStageStatus =
  | "not_started"
  | "blocked"
  | "in_progress"
  | "needs_review"
  | "approved"
  | "rejected"
  | "not_applicable";

/** Artifact lifecycle status. (section 14) */
export type ProjectArtifactStatus =
  | "missing"
  | "generated"
  | "needs_review"
  | "approved"
  | "stale"
  | "failed"
  | "not_applicable";

/** Versioned artifact kinds. No LLD artifact in MVP. (section 15) */
export type ProjectArtifactType =
  | "input_package"
  | "normalized_boq"
  | "sku_resolution"
  | "priced_boq"
  | "requirements_baseline"
  | "compliance_matrix"
  | "hld_design_delta"
  | "technical_proposal"
  | "export_package";

/**
 * Canonical stage identifiers, derived and unified from the Quick BoM (section 11)
 * and RFP (section 12) workflows. Ordering is hardcoded in TypeScript and
 * materialized per Project. Quick BoM materializes RFP-only stages as
 * `not_applicable`. No LLD. (section 13)
 */
export type ProjectStageId =
  | "intake_package_review"
  | "boq_format_validation"
  | "sku_resolution"
  | "requirements_baseline_review"
  | "compliance_matrix_review"
  | "hld_design_delta_review"
  | "boq_pricing_review"
  | "proposal_review"
  | "export_approval";

/** A Project chooses exactly one pricing mode. (section 9) */
export type PricingMode = "margin" | "markup";

/** The two locked BoQ/BoM input layouts. (section 6, section 7) */
export type BoqInputFormat = "format_1_line_item" | "format_2_number_part_qty";

/**
 * Normalized internal BoQ line. Both accepted upload formats map into this
 * shape before any downstream processing. Customer line order, line numbers,
 * and parent/child hierarchy are preserved; the uploaded workbook stays the
 * legal source evidence. (section 7)
 */
export interface CanonicalBoqLine {
  sourceFormat: BoqInputFormat;
  sourceFileId: string;
  sourceSheetName?: string;
  sourceRowNumber: number;
  originalLineNumber: string;
  sku: string;
  description: string;
  quantity: number;
  parentLineNumber?: string;
  originalCells: Record<string, string>;
}

/**
 * Current resolution state of a BoQ line's SKU - the row's state, not how a
 * match was produced (that lives on the suggestion's `source`). Pricing runs
 * only on rows with status `accepted`. (section 8)
 */
export type SkuResolutionStatus =
  | "needs_review"
  | "accepted"
  | "rejected"
  | "unresolved";

/** A candidate SKU match. AI may suggest; it must never silently apply. (section 8) */
export interface SkuResolutionSuggestion {
  suggestedSku: string;
  description?: string;
  source: "exact" | "normalized" | "fuzzy" | "ai";
  confidence?: number;
  rationale?: string;
}

/**
 * Human-gated resolution outcome for one BoQ line. The source file/row pair
 * maps the decision back to its exact CanonicalBoqLine. (section 8)
 */
export interface SkuResolutionDecision {
  sourceFileId: string;
  sourceRowNumber: number;
  originalLineNumber: string;
  originalSku: string;
  status: SkuResolutionStatus;
  suggestions: SkuResolutionSuggestion[];
  acceptedSku?: string;
  decidedBy?: string;
  decidedAt?: Date;
  note?: string;
}

/** Deterministic pricing config: SAR-only, VAT default 15%, 2-decimal. (section 9) */
export interface ProjectPricingConfig {
  currency: "SAR";
  mode: PricingMode;
  /** Margin or markup percentage applied per the chosen `mode`. */
  ratePercent: number;
  /** VAT percentage. Default 15 for Saudi projects. */
  vatRatePercent: number;
  /** Currency values round to this many decimals. Default 2. */
  roundingDecimals: number;
}

/** An uploaded source file; retained >= 1 year, auto-deletion deferred. (section 4, section 5) */
export interface ProjectFile {
  id: string;
  projectId: string;
  fileRole: ProjectFileRole;
  fileName: string;
  /** Object-storage reference or path; files are not stored inline. */
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt: Date;
  retainUntil: Date;
  /** Set when an engineer manually corrects a misclassified role. */
  roleCorrectedBy?: string;
}

/** Extracted evidence derived from a source file; retained >= 1 year. (section 4) */
export interface ProjectEvidenceItem {
  id: string;
  projectId: string;
  sourceFileId: string;
  kind: string;
  content: Record<string, unknown>;
  extractedAt: Date;
  retainUntil: Date;
}

/** A materialized stage instance for a Project. (section 3, section 13) */
export interface ProjectStage {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  /** Hardcoded ordering position materialized per Project. */
  order: number;
  status: ProjectStageStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A versioned artifact. Payloads are JSONB; large generated files use a
 * `filePath` reference. Manual edits create new versions; approved versions
 * freeze; upstream changes mark downstream artifacts stale. (section 3, section 16)
 */
export interface ProjectArtifact {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  type: ProjectArtifactType;
  status: ProjectArtifactStatus;
  version: number;
  payload: Record<string, unknown>;
  /** Reference to a large generated file, when not stored inline. */
  filePath?: string;
  sourceFileIds: string[];
  sourceArtifactIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Per stage/artifact approval pointing to an exact artifact version. (section 16) */
export interface ProjectApproval {
  id: string;
  projectId: string;
  stageId: ProjectStageId;
  artifactId: string;
  artifactVersion: number;
  decision: "approved" | "rejected";
  decidedBy: string;
  decidedAt: Date;
  note?: string;
}

/**
 * The primary product object: one Project aggregate with a versioned
 * artifact/approval model - not one mutable JSON blob. (section 2, section 3)
 */
export interface Project {
  id: string;
  tenantId: string;
  name: string;
  customerName?: string;
  /** Immutable after creation. (section 2) */
  mode: ProjectMode;
  /** Chosen during the pricing stage; one mode per Project. (section 9) */
  pricingConfig?: ProjectPricingConfig;
  files: ProjectFile[];
  evidence: ProjectEvidenceItem[];
  stages: ProjectStage[];
  artifacts: ProjectArtifact[];
  approvals: ProjectApproval[];
  createdAt: Date;
  updatedAt: Date;
}
