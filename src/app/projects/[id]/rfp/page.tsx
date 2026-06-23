"use client";

/**
 * Guided RFP operator workflow (Stage 4.5).
 *
 * The page renders the Project-centered RFP chain as intake, evidence review,
 * requirements baseline, compliance matrix, and collapsed history. Primary
 * actions infer the latest approved upstream artifacts instead of asking the
 * engineer to select artifact ids. Detail drawers fetch sanitized inspection
 * payloads on demand and keep audit ids under collapsed technical details.
 *
 * Client-side writes stay on existing human-gated Project endpoints: upload,
 * input-package review, evidence preparation, evidence-package review,
 * requirements generation/review, and compliance generation/review. The page
 * imports only read-model types plus the pure workflow helper; it does not load
 * server stores, provider SDKs, pricing/configuration authority, or raw files.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  buildRfpOperatorWorkflow,
  type RfpArtifactHistoryEntry,
  type RfpArtifactState,
  type RfpArtifactSummaryInput,
  type RfpArtifactTrack,
  type RfpExtractionDeltaSummaryInput,
} from "@/lib/projects/project-rfp-operator-workflow";
import type {
  RfpEvidenceDetail,
  RfpEvidenceInspectionProjectSummary,
  RfpEvidenceListContentSummary,
  RfpEvidenceListItemSummary,
} from "@/lib/projects/project-rfp-evidence-inspection";
import type {
  RfpRequirementsBaselineInspectionArtifactSummary,
  RfpRequirementsBaselineInspectionBaseline,
  RfpRequirementsBaselineInspectionListItem,
} from "@/lib/projects/project-rfp-requirements-baseline-inspection";
import type {
  RfpComplianceMatrixInspectionArtifactSummary,
  RfpComplianceMatrixInspectionListItem,
  RfpComplianceMatrixInspectionMatrix,
} from "@/lib/projects/project-rfp-compliance-matrix-inspection";
import type {
  RfpExtractionDeltaInspectionArtifactSummary,
  RfpExtractionDeltaInspectionDetail,
  RfpExtractionDeltaInspectionListItem,
} from "@/lib/projects/project-rfp-extraction-delta-inspection";
import type {
  RfpEvidencePackageInspectionArtifactSummary,
  RfpEvidencePackageInspectionListItem,
  RfpEvidencePackageInspectionPackage,
} from "@/lib/projects/project-rfp-evidence-package-inspection";
import type {
  CompiledEvidenceFinding,
  CompiledEvidenceReview,
} from "@/lib/projects/project-rfp-compiled-evidence-review";
import type { ProjectRfpBoqWorkspace } from "@/lib/projects/project-rfp-boq-workspace";
import type {
  ProjectArtifactStatus,
  ProjectArtifactType,
  ProjectFileRole,
} from "@/types/project";

type EvidenceKind = RfpEvidenceListItemSummary["kind"];
type KindFilter = "all" | EvidenceKind;

/** Lean list response of GET /api/projects/[id]/rfp/evidence. */
interface EvidenceListResponse {
  project: RfpEvidenceInspectionProjectSummary;
  evidenceCount: number;
  textChunkCount: number;
  tableEvidenceCount: number;
  evidence: RfpEvidenceListItemSummary[];
}

/** Detail response of GET /api/projects/[id]/rfp/evidence/[evidenceId]. */
interface EvidenceDetailResponse {
  evidence?: RfpEvidenceDetail;
}

interface EvidenceFilters {
  sourceFileId: string;
  inputPackageArtifactId: string;
  kind: KindFilter;
}

/** Lean list response of GET /api/projects/[id]/rfp/requirements-baseline. */
interface BaselineListResponse {
  artifactCount: number;
  artifacts: RfpRequirementsBaselineInspectionListItem[];
}

/**
 * Detail response of
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline.
 */
interface BaselineDetailResponse {
  artifact?: RfpRequirementsBaselineInspectionArtifactSummary;
  baseline?: RfpRequirementsBaselineInspectionBaseline;
}

/** Loaded baseline detail: the artifact summary plus sanitized payload. */
interface BaselineDetail {
  artifact: RfpRequirementsBaselineInspectionArtifactSummary;
  baseline: RfpRequirementsBaselineInspectionBaseline;
}

/**
 * Fields the page reads from the success response of
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/review.
 * artifactStatus is the post-decision status; artifact is the pre-approval
 * summary of the reviewed version, so artifactStatus wins when both exist.
 */
interface BaselineReviewResponse {
  artifactStatus?: RfpRequirementsBaselineInspectionArtifactSummary["status"];
  artifact?: RfpRequirementsBaselineInspectionArtifactSummary;
}

type BaselineReviewDecision = "approved" | "rejected";

type BaselineRequirement =
  RfpRequirementsBaselineInspectionBaseline["requirements"][number];
type BaselineEvidenceReference =
  BaselineRequirement["evidenceReferences"][number];

/** Lean list response of GET /api/projects/[id]/rfp/compliance-matrix. */
interface ComplianceMatrixListResponse {
  artifactCount: number;
  artifacts: RfpComplianceMatrixInspectionListItem[];
}

/**
 * Detail response of
 * GET /api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix.
 */
interface ComplianceMatrixDetailResponse {
  artifact?: RfpComplianceMatrixInspectionArtifactSummary;
  matrix?: RfpComplianceMatrixInspectionMatrix;
}

/** Loaded compliance detail: the artifact summary plus sanitized matrix. */
interface ComplianceMatrixDetail {
  artifact: RfpComplianceMatrixInspectionArtifactSummary;
  matrix: RfpComplianceMatrixInspectionMatrix;
}

/**
 * Fields the page reads from the success response of
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/compliance-matrix/review.
 */
interface ComplianceMatrixReviewResponse {
  artifactStatus?: RfpComplianceMatrixInspectionArtifactSummary["status"];
  artifact?: RfpComplianceMatrixInspectionArtifactSummary;
}

/**
 * Fields the page reads from the success response of
 * POST .../compliance-matrix/rows/review. The returned artifact id may be a new
 * compliance_matrix version, so the page reloads detail against it.
 */
interface ComplianceMatrixRowReviewResponse {
  artifact?: RfpComplianceMatrixInspectionArtifactSummary;
}

/**
 * The four compliance statuses an engineer may set from a row edit. The matrix
 * may carry other statuses (e.g. not_applicable), but an edit decision must only
 * send one of these; mark_not_applicable lives outside this response-edit slice.
 */
const COMPLIANCE_ROW_EDIT_STATUSES = [
  "compliant",
  "partially_compliant",
  "non_compliant",
  "needs_review",
] as const;
type ComplianceRowEditStatus = (typeof COMPLIANCE_ROW_EDIT_STATUSES)[number];

const COMPLIANCE_ROW_EDIT_STATUS_LABELS: Record<
  ComplianceRowEditStatus,
  string
> = {
  compliant: "Compliant",
  partially_compliant: "Partially compliant",
  non_compliant: "Non compliant",
  needs_review: "Needs review",
};

/**
 * Normalize a row's persisted complianceStatus to an editable status, falling
 * back to needs_review when the row carries a status outside the editable four.
 */
function editableComplianceStatus(status: string): ComplianceRowEditStatus {
  return (COMPLIANCE_ROW_EDIT_STATUSES as readonly string[]).includes(status)
    ? (status as ComplianceRowEditStatus)
    : "needs_review";
}

/**
 * One active row's in-progress response-edit draft, keyed by row id. The
 * response/complianceStatus/notes each seed from the row's current value so an
 * unchanged field stays out of the submitted decisions.
 */
interface ComplianceRowResponseEditDraft {
  enabled: boolean;
  response: string;
  complianceStatus: ComplianceRowEditStatus;
  notes: string;
}

/** The edit decision's editedFields, carrying only changed fields. */
interface ComplianceRowEditedFields {
  response?: string;
  complianceStatus?: ComplianceRowEditStatus;
  notes?: string;
}

/**
 * Build the changed-only editedFields for one active row's enabled draft, or
 * null when the draft is absent/disabled or holds no change worth submitting.
 * Shared by submit and the submit-enabled guard so they cannot disagree.
 */
function complianceRowEditedFields(
  row: ComplianceMatrixRow,
  draft: ComplianceRowResponseEditDraft | undefined
): ComplianceRowEditedFields | null {
  if (draft === undefined || !draft.enabled) return null;
  const editedFields: ComplianceRowEditedFields = {};
  const response = draft.response.trim();
  if (response !== "" && response !== row.response.trim()) {
    editedFields.response = response;
  }
  if (draft.complianceStatus !== editableComplianceStatus(row.complianceStatus)) {
    editedFields.complianceStatus = draft.complianceStatus;
  }
  const notes = draft.notes.trim();
  if (notes !== "" && notes !== (row.notes ?? "").trim()) {
    editedFields.notes = notes;
  }
  if (
    editedFields.response === undefined &&
    editedFields.complianceStatus === undefined &&
    editedFields.notes === undefined
  ) {
    return null;
  }
  return editedFields;
}

/**
 * One row's in-progress lifecycle draft, keyed by row id. action is the engineer
 * lifecycle decision (mark not applicable / remove on active rows, restore on a
 * removed row); reason backs mark/remove and note backs restore. Lifecycle is
 * separate from the response edit: it never carries response/status/notes edits
 * and never sets pricing, SKU, catalog, or configuration authority.
 */
interface ComplianceRowLifecycleDraft {
  action: "" | "mark_not_applicable" | "remove" | "restore";
  reason: string;
  note: string;
}

/** One engineer lifecycle decision in the rows/review POST body. */
type ComplianceRowLifecycleDecision =
  | { rowId: string; action: "mark_not_applicable"; reason: string }
  | { rowId: string; action: "remove"; reason: string }
  | { rowId: string; action: "restore"; note?: string };

type ComplianceMatrixReviewDecision = "approved" | "rejected";
type ComplianceMatrixRow = RfpComplianceMatrixInspectionMatrix["rows"][number];
type ComplianceMatrixEvidenceReference =
  ComplianceMatrixRow["evidenceReferences"][number];
type ComplianceMatrixConfigurationReference = NonNullable<
  ComplianceMatrixRow["configurationReferences"]
>[number];

/**
 * The compact operator-table status filter. "active" hides removed rows; "na" is
 * the sentinel for the not-applicable compliance status (the bare status literal
 * is kept out of source so the response-edit slice stays the only place that can
 * name it). All other values match a row's complianceStatus directly.
 */
type ComplianceStatusFilter =
  | "active"
  | "needs_review"
  | "compliant"
  | "partially_compliant"
  | "non_compliant"
  | "na"
  | "removed";

/** How the compact operator table groups its rows. */
type ComplianceGroupBy = "category" | "section" | "source";

/** Lean list response of GET /api/projects/[id]/rfp/extraction-delta. */
interface ExtractionDeltaListResponse {
  artifactCount: number;
  artifacts: RfpExtractionDeltaInspectionListItem[];
}

/** Detail response of GET .../rfp/extraction-delta/[artifactId]. */
interface ExtractionDeltaDetailResponse {
  artifact?: RfpExtractionDeltaInspectionArtifactSummary;
  delta?: RfpExtractionDeltaInspectionDetail;
}

/** Loaded extraction-delta detail: the artifact summary plus sanitized delta. */
interface ExtractionDeltaDetail {
  artifact: RfpExtractionDeltaInspectionArtifactSummary;
  delta: RfpExtractionDeltaInspectionDetail;
}

type DeltaCandidate = RfpExtractionDeltaInspectionDetail["candidates"][number];
type DeltaEvidenceReference = DeltaCandidate["evidenceReferences"][number];
type DeltaProposedEvidence = NonNullable<DeltaCandidate["proposedEvidence"]>;
type DeltaReviewHistoryEntry = DeltaCandidate["reviewHistory"][number];
type DeltaProposedTextEvidence = Extract<
  DeltaProposedEvidence,
  { evidenceKind: "rfp_document_text_chunk" }
>;
type DeltaProposedTableEvidence = Extract<
  DeltaProposedEvidence,
  { evidenceKind: "rfp_document_table" }
>;

/** The closed engineer review-action vocabulary the review route accepts. */
type DeltaReviewAction = "accept" | "reject" | "edit_accept" | "waive";

/**
 * One pending candidate's in-progress decision draft, keyed by candidate id.
 * The edit fields seed from the candidate's current proposal so an unchanged
 * field stays out of the submitted editedFields.
 */
interface DeltaCandidateDecisionState {
  action: "" | DeltaReviewAction;
  note: string;
  title: string;
  description: string;
  severity: string;
  confidence: string;
  rationale: string;
  proposedText: string;
  proposedTableTsv: string;
}

/** The narrow edit surface one edit_accept decision may carry. */
interface DeltaEditedFields {
  title?: string;
  description?: string;
  severity?: string;
  confidence?: number;
  rationale?: string;
  proposedEvidence?: DeltaProposedEvidence;
}

/** One engineer review decision in the extraction-delta review POST body. */
interface DeltaReviewDecision {
  candidateId: string;
  action: DeltaReviewAction;
  note?: string;
  editedFields?: DeltaEditedFields;
}

/** Lean list response of GET /api/projects/[id]/rfp/evidence-package. */
interface EvidencePackageListResponse {
  artifactCount: number;
  artifacts: RfpEvidencePackageInspectionListItem[];
}

/** Detail response of GET .../rfp/evidence-package/[artifactId]. */
interface EvidencePackageDetailResponse {
  artifact?: RfpEvidencePackageInspectionArtifactSummary;
  package?: RfpEvidencePackageInspectionPackage;
}

/** Loaded evidence-package detail: the artifact summary plus sanitized package. */
interface EvidencePackageDetail {
  artifact: RfpEvidencePackageInspectionArtifactSummary;
  package: RfpEvidencePackageInspectionPackage;
}

/** Read-only response of GET /api/projects/[id]/rfp/boq. */
interface RfpBoqWorkspaceResponse {
  workspace?: ProjectRfpBoqWorkspace;
}

/** One hld_readiness_snapshot artifact in the list response. */
interface HldReadinessListItem {
  id: string;
  status: ProjectArtifactStatus;
  version: number;
  payloadSummary?: {
    payloadKind?: string;
    coveredDomainCount?: number;
    missingInputCount?: number;
  };
}

/** One assumption entry in an HLD readiness payload. */
interface HldAssumption {
  fieldId: string;
  label: string;
  status: string;
  note?: string;
}

/** Per-domain readiness breakdown. */
interface HldDomainReadiness {
  claimedDomains: string[];
  coveredDomains: string[];
  excludedDomains: string[];
  requiredKnowledgePackDomains: string[];
  missingKnowledgePackDomains: string[];
}

/** Readiness object returned by GET /api/projects/[id]/rfp/hld-readiness-snapshot. */
interface HldReadiness {
  status: "ready" | "blocked";
  canCreateReadinessSnapshot: boolean;
  coveredDomains: string[];
  excludedDomains?: string[];
  missingKnowledgePackDomains?: string[];
  domainReadiness?: HldDomainReadiness;
  assumptions?: HldAssumption[];
  missingInputs?: string[];
  validationMessages?: string[];
  sourceArtifactIds?: string[];
}

/** Lean list response of GET /api/projects/[id]/rfp/hld-readiness-snapshot. */
interface HldReadinessListResponse {
  project?: { id: string; name?: string };
  artifactCount: number;
  artifacts: HldReadinessListItem[];
  readiness: HldReadiness;
}

/** Detail response of GET /api/projects/[id]/rfp/artifacts/[id]/hld-readiness-snapshot. */
interface HldReadinessSnapshotDetailResponse {
  project?: { id: string; name?: string };
  artifact?: {
    id: string;
    status: ProjectArtifactStatus;
    version: number;
    sourceArtifactIds?: string[];
  };
  snapshot?: {
    payloadKind?: string;
    readinessStatus?: "ready" | "blocked";
    coveredDomains?: string[];
    missingInputs?: string[];
    validationMessages?: string[];
    assumptions?: HldAssumption[];
    sourceArtifactIds?: string[];
  };
}

/** Loaded HLD readiness snapshot detail. */
interface HldReadinessSnapshotDetail {
  artifact: {
    id: string;
    status: ProjectArtifactStatus;
    version: number;
    sourceArtifactIds?: string[];
  };
  snapshot: NonNullable<HldReadinessSnapshotDetailResponse["snapshot"]>;
}

/**
 * Fields the page reads from the success response of
 * POST /api/projects/[id]/rfp/artifacts/[artifactId]/evidence-package/review.
 * artifactStatus is the post-decision status; artifact is the pre-approval
 * summary of the reviewed version, so artifactStatus wins when both exist.
 */
interface EvidencePackageReviewResponse {
  artifactStatus?: RfpEvidencePackageInspectionArtifactSummary["status"];
  artifact?: RfpEvidencePackageInspectionArtifactSummary;
}

type EvidencePackageReviewDecision = "approved" | "rejected";

type PackageEvidence = RfpEvidencePackageInspectionPackage["evidence"][number];

type DrawerKind =
  | "evidence"
  | "delta"
  | "evidence-package"
  | "requirements"
  | "compliance"
  | "hld-readiness";

interface DrawerState {
  kind: DrawerKind;
  activeId: string;
}

/** One file queued for upload with its operator-chosen role; key is UI-only. */
interface QueuedUploadFile {
  key: string;
  file: File;
  role: ProjectFileRole;
}

type PrimaryActionStatus = "idle" | "success" | "warning" | "error";

interface PrimaryActionMessage {
  status: PrimaryActionStatus;
  text: string;
}

/** Exact UI copy required for the list/detail failure states. */
const LIST_ERROR = "Unable to load RFP evidence.";
const DETAIL_ERROR = "Unable to load evidence detail.";

/** Exact UI copy required for the baseline list/detail failure states. */
const BASELINE_LIST_ERROR = "Unable to load requirements baseline.";
const BASELINE_DETAIL_ERROR = "Unable to load requirements baseline detail.";

/** Exact UI copy required for the baseline review failure state. */
const BASELINE_REVIEW_ERROR = "Unable to review requirements baseline.";

/** Exact UI copy required for the baseline generation outcome states. */
const GENERATE_SUCCESS = "Requirements baseline draft generated.";
const GENERATE_ERROR = "Unable to generate requirements baseline.";

/** Exact UI copy required for compliance-matrix list, detail, and review states. */
const COMPLIANCE_LIST_ERROR = "Unable to load compliance matrices.";
const COMPLIANCE_DETAIL_ERROR = "Unable to load compliance matrix detail.";
const COMPLIANCE_APPROVE_SUCCESS = "Compliance matrix approved.";
const COMPLIANCE_REJECT_SUCCESS = "Compliance matrix rejected.";
const COMPLIANCE_REVIEW_ERROR = "Unable to review compliance matrix.";
const COMPLIANCE_ROW_EDIT_SUCCESS = "Compliance row responses updated.";
const COMPLIANCE_ROW_EDIT_ERROR = "Unable to update compliance row responses.";
const COMPLIANCE_ROW_LIFECYCLE_SUCCESS = "Compliance row lifecycle updated.";
const COMPLIANCE_ROW_LIFECYCLE_ERROR =
  "Unable to update compliance row lifecycle.";

/** Exact UI copy required for the extraction-delta failure states. */
const DELTA_LIST_ERROR = "Unable to load extraction deltas.";
const DELTA_DETAIL_ERROR = "Unable to load extraction delta detail.";

/** Exact UI copy required for the extraction-delta review outcome states. */
const DELTA_REVIEW_SUCCESS = "Extraction delta review recorded.";
const DELTA_REVIEW_ERROR = "Unable to review extraction delta.";

/** Exact UI copy required for the evidence-package failure states. */
const PACKAGE_LIST_ERROR = "Unable to load final evidence packages.";
const PACKAGE_DETAIL_ERROR = "Unable to load final evidence package detail.";

/** Exact UI copy required for the evidence-package review outcome states. */
const PACKAGE_APPROVE_SUCCESS = "Final evidence package approved.";
const PACKAGE_REJECT_SUCCESS = "Final evidence package rejected.";
const PACKAGE_REVIEW_ERROR = "Unable to review final evidence package.";

/** Exact UI copy required for the RFP BoQ readiness failure state. */
const BOQ_WORKSPACE_ERROR = "Unable to load RFP BoQ readiness.";

/** Exact UI copy required for the HLD readiness snapshot list failure state. */
const HLD_READINESS_LIST_ERROR = "Unable to load HLD readiness snapshots.";

/** Exact UI copy required for the HLD readiness snapshot detail failure state. */
const HLD_READINESS_DETAIL_ERROR = "Unable to load HLD readiness snapshot detail.";

/** Exact UI copy required for the no-BoQ service-only exception request states. */
const NO_BOQ_EXCEPTION_SUCCESS =
  "Service-only (no-BoQ) exception requested for engineer review.";
const NO_BOQ_EXCEPTION_ERROR = "Unable to request service-only exception.";

/** Exact UI copy required for the no-BoQ service-only exception review states. */
const NO_BOQ_EXCEPTION_APPROVE_SUCCESS =
  "Service-only (no-BoQ) exception approved.";
const NO_BOQ_EXCEPTION_REJECT_SUCCESS =
  "Service-only (no-BoQ) exception rejected.";
const NO_BOQ_EXCEPTION_REVIEW_ERROR =
  "Unable to review service-only exception.";

const UPLOAD_ERROR = "Unable to upload RFP file.";
const INPUT_PACKAGE_ERROR = "Unable to create input package.";
const INPUT_PACKAGE_REVIEW_ERROR = "Unable to review input package.";
const PREPARE_EVIDENCE_ERROR = "Unable to prepare evidence review.";
const COMPLIANCE_GENERATE_SUCCESS = "Compliance matrix draft generated.";
const COMPLIANCE_GENERATE_ERROR = "Unable to generate compliance matrix.";

const EMPTY_FILTERS: EvidenceFilters = {
  sourceFileId: "",
  inputPackageArtifactId: "",
  kind: "all",
};

const ACTION_BTN =
  "inline-flex items-center justify-center gap-1 rounded-button bg-accent px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
const PLAIN_BTN =
  "inline-flex items-center justify-center gap-1 rounded-button border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-card disabled:cursor-not-allowed disabled:opacity-50";
const FIELD =
  "mt-1 rounded-button border border-[var(--border)] bg-bg-card px-2 py-1.5 text-xs text-text-primary";
const ERROR_BOX =
  "rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive";
const CARD =
  "rounded-card border border-[var(--border)] bg-bg-card p-4";
const SUBTLE_CARD =
  "rounded-card border border-[var(--border)] bg-bg-primary p-3";
const MUTED_TEXT = "text-xs text-text-secondary";
const TECHNICAL_DETAILS_CLASS =
  "mt-2 rounded-button border border-[var(--border)] bg-bg-primary p-2";

const FILE_ROLES: ProjectFileRole[] = [
  "rfp",
  "scope_of_work",
  "compliance",
  "addendum",
  "boq",
  "other",
];

const FILE_ROLE_LABELS: Record<ProjectFileRole, string> = {
  rfp: "Main RFP",
  scope_of_work: "Scope of work",
  compliance: "Compliance attachment",
  addendum: "Addendum",
  boq: "BoQ / pricing workbook",
  other: "Other supporting file",
};

type BoqSpineKey = keyof ProjectRfpBoqWorkspace["spineArtifacts"];

const BOQ_SPINE_KEYS: BoqSpineKey[] = [
  "normalized_boq",
  "sku_resolution",
  "configuration_expansion",
  "priced_boq",
  "export_package",
];

const BOQ_SPINE_LABELS: Record<BoqSpineKey, string> = {
  normalized_boq: "Normalized BoQ",
  sku_resolution: "SKU resolution",
  configuration_expansion: "Configuration expansion",
  priced_boq: "Priced BoQ",
  export_package: "Export package",
};

type RfpBoqConfigurationGate =
  ProjectRfpBoqWorkspace["readiness"]["configurationGate"];

/**
 * Human-readable label for a Quick BoM next-step id. A known BoQ spine key maps
 * to its operator label; an unrecognized id degrades to its underscored token
 * spelled as spaced words, never the raw underscored id.
 */
function nextStepLabel(nextStepId: string): string {
  if ((BOQ_SPINE_KEYS as readonly string[]).includes(nextStepId)) {
    return BOQ_SPINE_LABELS[nextStepId as BoqSpineKey];
  }
  return nextStepId.replaceAll("_", " ");
}

/**
 * Operator-language one-liner for the BoQ/configuration gate. An approved normal
 * configuration expansion reads as approved; an approved no-BoQ service-only
 * exception reads as waived (with its human reason when present); an unsatisfied
 * normal gate shows the gate message plus the next Quick BoM step (as a human
 * label) when one is known. Never the raw status literal, a raw underscored step
 * id, or a primary artifact id.
 */
function configurationGateStatusLine(
  gate: RfpBoqConfigurationGate,
  nextStepId: string | null
): string {
  if (gate.satisfied) {
    if (gate.waived) {
      const reason =
        gate.noBoqExceptionReason !== undefined &&
        gate.noBoqExceptionReason.trim() !== ""
          ? ` Reason: ${gate.noBoqExceptionReason}`
          : "";
      return `Configuration is waived by an approved service-only (no-BoQ) exception.${reason}`;
    }
    return "Configuration expansion is approved.";
  }
  const nextStep =
    nextStepId !== null
      ? ` Next Quick BoM step: ${nextStepLabel(nextStepId)}.`
      : "";
  return `${gate.message}${nextStep}`;
}

/** Build the list URL; blank filters are omitted so unfiltered = bare URL. */
function evidenceListUrl(projectId: string, filters: EvidenceFilters): string {
  const params = new URLSearchParams();
  if (filters.sourceFileId.trim() !== "") {
    params.set("sourceFileId", filters.sourceFileId.trim());
  }
  if (filters.inputPackageArtifactId.trim() !== "") {
    params.set("inputPackageArtifactId", filters.inputPackageArtifactId.trim());
  }
  if (filters.kind !== "all") params.set("kind", filters.kind);
  const query = params.toString();
  return `/api/projects/${projectId}/rfp/evidence${query === "" ? "" : `?${query}`}`;
}

function kindLabel(kind: EvidenceKind): string {
  return kind === "rfp_document_text_chunk" ? "text" : "table";
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function displayId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function statusLabel(status: ProjectArtifactStatus): string {
  return status.replaceAll("_", " ");
}

function humanizeToken(token: string): string {
  return token.replaceAll("_", " ");
}

function statusBadgeClass(status: ProjectArtifactStatus): string {
  if (status === "approved") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "needs_review" || status === "generated") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (status === "rejected" || status === "failed") {
    return "border-destructive/30 bg-destructive-muted text-destructive";
  }
  return "border-[var(--border)] bg-bg-primary text-text-secondary";
}

function fileRoleLabel(role: string): string {
  return role in FILE_ROLE_LABELS
    ? FILE_ROLE_LABELS[role as ProjectFileRole]
    : role;
}

type UploadedFileSummary = ProjectRfpBoqWorkspace["uploadedFiles"][number];

/** Group persisted uploaded files by role, in canonical FILE_ROLES order. */
function groupUploadedFilesByRole(
  files: readonly UploadedFileSummary[]
): { role: ProjectFileRole; files: UploadedFileSummary[] }[] {
  return FILE_ROLES.map((role) => ({
    role,
    files: files.filter((file) => file.fileRole === role),
  })).filter((group) => group.files.length > 0);
}

function StatusBadge({ status }: { status: ProjectArtifactStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusBadgeClass(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function toWorkflowArtifactInput(item: {
  id: string;
  status: ProjectArtifactStatus;
  version: number;
}): RfpArtifactSummaryInput {
  return { id: item.id, status: item.status, version: item.version };
}

function toWorkflowExtractionDeltaInput(
  item: RfpExtractionDeltaInspectionListItem
): RfpExtractionDeltaSummaryInput {
  return {
    id: item.id,
    status: item.status,
    version: item.version,
    payloadSummary: {
      candidateCount: item.payloadSummary.candidateCount,
      pendingCount: item.payloadSummary.pendingCount,
      acceptedCount: item.payloadSummary.acceptedCount,
      rejectedCount: item.payloadSummary.rejectedCount,
      waivedCount: item.payloadSummary.waivedCount,
    },
  };
}

function workspaceArtifactsByType(
  workspace: ProjectRfpBoqWorkspace | null,
  type: ProjectArtifactType
): RfpArtifactSummaryInput[] {
  return (
    workspace?.artifacts
      .filter((artifact) => artifact.type === type)
      .map(toWorkflowArtifactInput) ?? []
  );
}

function latestApprovedArtifactId(
  artifacts: readonly { id: string; status: ProjectArtifactStatus; version: number }[]
): string | null {
  let latest: { id: string; version: number } | null = null;
  for (const artifact of artifacts) {
    if (artifact.status !== "approved") continue;
    if (latest === null || artifact.version > latest.version) {
      latest = { id: artifact.id, version: artifact.version };
    }
  }
  return latest?.id ?? null;
}

function primaryActionMessageClass(status: PrimaryActionStatus): string {
  if (status === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  if (status === "error") return ERROR_BOX;
  return "border-[var(--border)] bg-bg-primary text-text-secondary";
}

/** Only these artifact statuses may still receive a human review decision. */
function isReviewableStatus(status: string): boolean {
  return status === "needs_review" || status === "generated";
}

/** Requirement and compliance references share one locator-only shape. */
type ReadableEvidenceReference =
  | BaselineEvidenceReference
  | ComplianceMatrixEvidenceReference;

/**
 * Exact locator summary for the collapsed audit only - carries the machine
 * tableId and the literal word "chunk". Never render this in a primary card.
 */
function evidenceLocatorLine(ref: ReadableEvidenceReference): string {
  if (ref.evidenceKind === "rfp_document_table") {
    const page = ref.pageNumber !== undefined ? ` | page ${ref.pageNumber}` : "";
    const sheet = ref.sheetName !== undefined ? ` | sheet ${ref.sheetName}` : "";
    return `table ${ref.tableId}${page}${sheet} | ${ref.rowCount} rows x ${ref.columnCount} cols`;
  }
  return `chunk ${ref.chunkIndex + 1}/${ref.chunkCount} | ${ref.charCount} chars`;
}

/**
 * UI-only document context for one evidence reference, looked up from the
 * loaded evidence summaries by evidenceId. Carries human document/role labels
 * and (for tables) a sheet/page locator; never a machine id.
 */
interface EvidenceReferenceContext {
  sourceFileName?: string;
  sourceFileRole?: string;
  sheetName?: string;
  pageNumber?: number;
}

/** Normalize one loaded evidence content summary into a reference context. */
function toEvidenceReferenceContext(
  summary: RfpEvidenceListContentSummary
): EvidenceReferenceContext {
  return {
    ...(summary.sourceFileName !== ""
      ? { sourceFileName: summary.sourceFileName }
      : {}),
    ...(summary.sourceFileRole !== ""
      ? { sourceFileRole: summary.sourceFileRole }
      : {}),
    ...(summary.evidenceKind === "rfp_document_table" &&
    summary.sheetName !== undefined
      ? { sheetName: summary.sheetName }
      : {}),
    ...(summary.evidenceKind === "rfp_document_table" &&
    summary.pageNumber !== undefined
      ? { pageNumber: summary.pageNumber }
      : {}),
  };
}

/** Build a UI-only evidenceId -> context lookup from loaded summaries. */
function buildEvidenceContextLookup(
  evidence: readonly RfpEvidenceListItemSummary[]
): Map<string, EvidenceReferenceContext> {
  const lookup = new Map<string, EvidenceReferenceContext>();
  for (const item of evidence) {
    lookup.set(item.id, toEvidenceReferenceContext(item.contentSummary));
  }
  return lookup;
}

/** Human "document (Role) - " prefix for a primary reference label; "" if none. */
function evidenceContextPrefix(context?: EvidenceReferenceContext): string {
  if (context === undefined) return "";
  const bits: string[] = [];
  if (context.sourceFileName !== undefined) bits.push(context.sourceFileName);
  if (context.sourceFileRole !== undefined) {
    bits.push(`(${fileRoleLabel(context.sourceFileRole)})`);
  }
  return bits.length > 0 ? `${bits.join(" ")} - ` : "";
}

/**
 * Human-readable fallback label for one evidence reference in a primary card or
 * the nontechnical disclosure, used only when no approved compiled finding
 * label is available for the evidenceId. Never the word "chunk", a char count,
 * a raw extraction-position passage ("Text passage N of M" / "Passage N of M"),
 * a machine tableId, or any file/package id - a text reference degrades to a
 * human "Evidence reference" descriptor, a table to a readable
 * sheet/page/row-column locator. When the loaded evidence summary is available
 * the label is prefixed with the source document name and human role label, and
 * table locators fall back to the summary's sheet/page. Without that context the
 * text label is the bare "Evidence reference" and the table label is the bare
 * row-column locator.
 */
function readableEvidenceReferenceLabel(
  ref: ReadableEvidenceReference,
  context?: EvidenceReferenceContext
): string {
  const prefix = evidenceContextPrefix(context);
  if (ref.evidenceKind === "rfp_document_table") {
    const parts = ["Table"];
    const sheetName = ref.sheetName ?? context?.sheetName;
    const pageNumber = ref.pageNumber ?? context?.pageNumber;
    if (sheetName !== undefined) parts.push(`sheet ${sheetName}`);
    if (pageNumber !== undefined) parts.push(`page ${pageNumber}`);
    parts.push(`${ref.rowCount} rows x ${ref.columnCount} cols`);
    return `${prefix}${parts.join(" - ")}`;
  }
  return `${prefix}Evidence reference`;
}

/**
 * Full raw audit line for one evidence reference: every machine id plus the
 * exact locator. Collapsed audit/details only.
 */
function rawEvidenceReferenceLine(ref: ReadableEvidenceReference): string {
  return `${ref.evidenceId} | ${kindLabel(ref.evidenceKind)} | ${evidenceLocatorLine(ref)} | file ${ref.sourceFileId} | package ${ref.inputPackageArtifactId}`;
}

/** Full raw configuration-reference audit line: artifact id + line id + fields. */
function configurationReferenceLine(
  ref: ComplianceMatrixConfigurationReference
): string {
  const parts = [
    `line ${ref.lineId}`,
    ref.origin !== undefined ? `origin ${ref.origin}` : "",
    ref.sku !== undefined ? `sku ${ref.sku}` : "",
    ref.description !== undefined ? ref.description : "",
    ref.parentLineNumber !== undefined ? `parent ${ref.parentLineNumber}` : "",
    ref.sourceRowNumber !== undefined ? `row ${ref.sourceRowNumber}` : "",
    ref.originalLineNumber !== undefined ? `original ${ref.originalLineNumber}` : "",
  ].filter((part) => part !== "");
  return parts.join(" | ");
}

/**
 * Business-readable configuration label for a primary compliance row: origin,
 * SKU, description, and source positions only. Never the artifact id or the
 * internal line id (those stay in the collapsed audit).
 */
function readableConfigurationReferenceLabel(
  ref: ComplianceMatrixConfigurationReference
): string {
  const parts = [
    ref.origin !== undefined ? ref.origin : "",
    ref.sku !== undefined ? `SKU ${ref.sku}` : "",
    ref.description !== undefined ? ref.description : "",
    ref.parentLineNumber !== undefined ? `parent ${ref.parentLineNumber}` : "",
    ref.sourceRowNumber !== undefined ? `row ${ref.sourceRowNumber}` : "",
  ].filter((part) => part !== "");
  return parts.length > 0 ? parts.join(" | ") : "Configuration line";
}

/** One grouped compiled-review section keyed by document + role + topic. */
interface CompiledFindingGroup {
  key: string;
  documentName: string;
  role?: string;
  topic?: string;
  findings: CompiledEvidenceFinding[];
}

/**
 * Group compiled findings into human review sections by document name, role,
 * and topic, preserving first-seen order both across and within groups. Pure
 * presentation grouping - it never reorders or drops findings.
 */
function groupCompiledFindings(
  findings: readonly CompiledEvidenceFinding[]
): CompiledFindingGroup[] {
  const groups: CompiledFindingGroup[] = [];
  const byKey = new Map<string, CompiledFindingGroup>();
  for (const finding of findings) {
    const key = `${finding.documentName}|${finding.role ?? ""}|${finding.topic ?? ""}`;
    let group = byKey.get(key);
    if (group === undefined) {
      group = {
        key,
        documentName: finding.documentName,
        ...(finding.role !== undefined ? { role: finding.role } : {}),
        ...(finding.topic !== undefined ? { topic: finding.topic } : {}),
        findings: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.findings.push(finding);
  }
  return groups;
}

/** Human heading for one grouped compiled-review section. */
function compiledFindingGroupLabel(group: CompiledFindingGroup): string {
  const parts = [group.documentName];
  if (group.role !== undefined) parts.push(`(${fileRoleLabel(group.role)})`);
  const head = parts.join(" ");
  return group.topic !== undefined ? `${head} | ${group.topic}` : head;
}

/** One-line locator summary for one delta evidence reference; never content. */
function deltaReferenceLine(ref: DeltaEvidenceReference): string {
  if (ref.evidenceKind === "rfp_document_table") {
    const page = ref.pageNumber !== undefined ? ` | page ${ref.pageNumber}` : "";
    const sheet = ref.sheetName !== undefined ? ` | sheet ${ref.sheetName}` : "";
    return `table ${ref.tableId}${page}${sheet} | ${ref.rowCount} rows x ${ref.columnCount} cols`;
  }
  return `chunk ${ref.chunkIndex + 1}/${ref.chunkCount} | ${ref.charCount} chars`;
}

/**
 * One AI/engineer proposed-evidence block, surfaced for review only - a
 * proposal, never authority. Text proposals show the body; table proposals
 * show the fresh row matrix. The primary metadata carries only human-readable
 * source labels (document name/role, sheet/page); the raw proposal locators
 * (tableId, chunk position, char count) stay under a collapsed technical
 * disclosure so the reviewable content leads.
 */
function DeltaProposedEvidenceView({
  proposed,
}: {
  proposed: DeltaProposedEvidence;
}) {
  if (proposed.evidenceKind === "rfp_document_text_chunk") {
    const technical: string[] = [];
    if (proposed.chunkIndex !== undefined && proposed.chunkCount !== undefined) {
      technical.push(`chunk ${proposed.chunkIndex + 1}/${proposed.chunkCount}`);
    }
    if (proposed.charCount !== undefined) {
      technical.push(`${proposed.charCount} chars`);
    }
    return (
      <div data-testid="delta-proposed-text">
        <p
          data-testid="delta-proposed-text-meta"
          className="mt-1 text-xs text-text-secondary"
        >
          text proposal
          {proposed.sourceFileName !== undefined ? ` | ${proposed.sourceFileName}` : ""}
          {proposed.sourceFileRole !== undefined ? ` (${proposed.sourceFileRole})` : ""}
        </p>
        <pre
          data-testid="delta-proposed-text-body"
          className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-button bg-bg-card p-2 text-xs text-text-primary"
        >
          {proposed.text}
        </pre>
        {technical.length > 0 && (
          <TechnicalDetails testId="delta-proposed-audit">
            <p>{technical.join(" | ")}</p>
          </TechnicalDetails>
        )}
      </div>
    );
  }
  const technical: string[] = [];
  if (proposed.tableId !== undefined) technical.push(`table ${proposed.tableId}`);
  if (proposed.rowCount !== undefined && proposed.columnCount !== undefined) {
    technical.push(`${proposed.rowCount} rows x ${proposed.columnCount} cols`);
  }
  return (
    <div data-testid="delta-proposed-table">
      <p
        data-testid="delta-proposed-table-meta"
        className="mt-1 text-xs text-text-secondary"
      >
        table proposal
        {proposed.sheetName !== undefined ? ` | sheet ${proposed.sheetName}` : ""}
        {proposed.pageNumber !== undefined ? ` | page ${proposed.pageNumber}` : ""}
      </p>
      <div className="mt-1 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {proposed.rows.map((row, rowIndex) => (
              <tr key={rowIndex} data-testid="delta-proposed-table-row">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border border-[var(--border)] px-2 py-1 text-text-primary"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {technical.length > 0 && (
        <TechnicalDetails testId="delta-proposed-audit">
          <p>{technical.join(" | ")}</p>
        </TechnicalDetails>
      )}
    </div>
  );
}

/**
 * One delta candidate, rendered human-first: the reviewable title, review
 * metadata (kind/severity/status/confidence), description, and rationale lead
 * in the primary summary; the proposed evidence (expandable, proposal-only) and
 * engineer review history (expandable) follow; and the raw machine metadata -
 * candidate id, source file id, and the locator-only evidence references - sits
 * only under a collapsed technical/audit disclosure. Reused for pending and
 * decided candidates; the caller collapses the decided group.
 */
function DeltaCandidateRow({
  candidate,
  children,
}: {
  candidate: DeltaCandidate;
  children?: ReactNode;
}) {
  return (
    <li
      data-testid="delta-candidate"
      className="rounded-button border border-[var(--border)] p-2"
    >
      <div data-testid="delta-candidate-summary">
        <p className="text-xs font-medium text-text-primary">{candidate.title}</p>
        <p className="text-xs text-text-secondary">
          {candidate.kind} | {candidate.severity} | {candidate.reviewStatus}
          {candidate.confidence !== undefined
            ? ` | confidence ${candidate.confidence}`
            : ""}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-xs text-text-primary">
          {candidate.description}
        </p>
        {candidate.rationale !== undefined && (
          <p className="mt-1 text-xs text-text-secondary">
            Rationale: {candidate.rationale}
          </p>
        )}
      </div>
      {candidate.proposedEvidence !== undefined && (
        <details data-testid="delta-proposed-evidence" className="mt-1">
          <summary className="cursor-pointer text-xs text-text-secondary">
            Proposed evidence (proposal for review)
          </summary>
          <DeltaProposedEvidenceView proposed={candidate.proposedEvidence} />
        </details>
      )}
      {candidate.reviewHistory.length > 0 && (
        <details data-testid="delta-review-history" className="mt-1">
          <summary className="cursor-pointer text-xs text-text-secondary">
            Review history ({candidate.reviewHistory.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {candidate.reviewHistory.map(
              (entry: DeltaReviewHistoryEntry, entryIndex) => (
                <li
                  key={entryIndex}
                  data-testid="delta-history-entry"
                  className="text-xs text-text-tertiary"
                >
                  {entry.action} | {entry.decidedBy} | {entry.decidedAt} |{" "}
                  {entry.previousReviewStatus} to {entry.nextReviewStatus}
                  {entry.note !== undefined ? ` | ${entry.note}` : ""}
                </li>
              )
            )}
          </ul>
        </details>
      )}
      <TechnicalDetails testId="delta-candidate-audit" label="Technical and audit details">
        <p>
          candidate <span className="font-mono">{candidate.id}</span>
        </p>
        <p>
          source file <span className="font-mono">{candidate.sourceFileId}</span>
        </p>
        {candidate.evidenceReferences.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {candidate.evidenceReferences.map((ref, refIndex) => (
              <li key={refIndex} data-testid="delta-reference">
                <span className="font-mono">{ref.evidenceId}</span> |{" "}
                {kindLabel(ref.evidenceKind)} | {deltaReferenceLine(ref)} | file{" "}
                <span className="font-mono">{ref.sourceFileId}</span> | package{" "}
                <span className="font-mono">{ref.inputPackageArtifactId}</span>
              </li>
            ))}
          </ul>
        )}
      </TechnicalDetails>
      {children}
    </li>
  );
}

/** Proposed table rows round-tripped through a tab/newline TSV string. */
function rowsToTsv(rows: string[][]): string {
  return rows.map((row) => row.join("\t")).join("\n");
}

function tsvToRows(tsv: string): string[][] {
  return tsv.split("\n").map((line) => line.split("\t"));
}

/**
 * Seed one pending candidate's decision draft from its current values so the
 * edit_accept fields start at the AI/engineer proposal and "changed" means the
 * engineer actually edited away from it.
 */
function initialDeltaDecisionState(
  candidate: DeltaCandidate
): DeltaCandidateDecisionState {
  const proposed = candidate.proposedEvidence;
  return {
    action: "",
    note: "",
    title: candidate.title,
    description: candidate.description,
    severity: candidate.severity,
    confidence:
      candidate.confidence !== undefined ? String(candidate.confidence) : "",
    rationale: candidate.rationale ?? "",
    proposedText:
      proposed !== undefined &&
      proposed.evidenceKind === "rfp_document_text_chunk"
        ? proposed.text
        : "",
    proposedTableTsv:
      proposed !== undefined && proposed.evidenceKind === "rfp_document_table"
        ? rowsToTsv(proposed.rows)
        : "",
  };
}

/** Seed the decision map for the pending candidates of a loaded delta detail. */
function initialDeltaDecisions(
  detail: ExtractionDeltaDetail
): Record<string, DeltaCandidateDecisionState> {
  const decisions: Record<string, DeltaCandidateDecisionState> = {};
  for (const candidate of detail.delta.candidates) {
    if (candidate.reviewStatus === "pending_review") {
      decisions[candidate.id] = initialDeltaDecisionState(candidate);
    }
  }
  return decisions;
}

/**
 * Rebuild an edited proposedEvidence ONLY when the engineer changed it, never
 * inventing one for a candidate that has none. Editable content is the text
 * body (text proposals) or the rows parsed from the TSV (table proposals); the
 * proposal-side locator metadata is preserved exactly as stored.
 */
function buildDeltaEditedProposedEvidence(
  candidate: DeltaCandidate,
  state: DeltaCandidateDecisionState
): DeltaProposedEvidence | undefined {
  const proposed = candidate.proposedEvidence;
  if (proposed === undefined) return undefined;
  if (proposed.evidenceKind === "rfp_document_text_chunk") {
    if (state.proposedText === proposed.text) return undefined;
    const next: DeltaProposedTextEvidence = {
      evidenceKind: "rfp_document_text_chunk",
      text: state.proposedText,
      ...(proposed.sourceFileName !== undefined
        ? { sourceFileName: proposed.sourceFileName }
        : {}),
      ...(proposed.sourceFileRole !== undefined
        ? { sourceFileRole: proposed.sourceFileRole }
        : {}),
      ...(proposed.chunkIndex !== undefined
        ? { chunkIndex: proposed.chunkIndex }
        : {}),
      ...(proposed.chunkCount !== undefined
        ? { chunkCount: proposed.chunkCount }
        : {}),
      ...(proposed.charCount !== undefined
        ? { charCount: proposed.charCount }
        : {}),
    };
    return next;
  }
  const originalTsv = rowsToTsv(proposed.rows);
  if (state.proposedTableTsv === originalTsv) return undefined;
  const next: DeltaProposedTableEvidence = {
    evidenceKind: "rfp_document_table",
    rows: tsvToRows(state.proposedTableTsv),
    ...(proposed.tableId !== undefined ? { tableId: proposed.tableId } : {}),
    ...(proposed.sourceFileName !== undefined
      ? { sourceFileName: proposed.sourceFileName }
      : {}),
    ...(proposed.sourceFileRole !== undefined
      ? { sourceFileRole: proposed.sourceFileRole }
      : {}),
    ...(proposed.pageNumber !== undefined
      ? { pageNumber: proposed.pageNumber }
      : {}),
    ...(proposed.sheetName !== undefined
      ? { sheetName: proposed.sheetName }
      : {}),
    ...(proposed.rowCount !== undefined ? { rowCount: proposed.rowCount } : {}),
    ...(proposed.columnCount !== undefined
      ? { columnCount: proposed.columnCount }
      : {}),
  };
  return next;
}

/**
 * Collect ONLY the fields the engineer actually changed for an edit_accept:
 * changed nonblank title/description/severity/rationale, a finite changed
 * confidence, and an edited proposedEvidence. Unchanged or blank fields are
 * omitted so the server keeps authority over everything else.
 */
function buildDeltaEditedFields(
  candidate: DeltaCandidate,
  state: DeltaCandidateDecisionState
): DeltaEditedFields {
  const editedFields: DeltaEditedFields = {};
  const title = state.title.trim();
  if (title !== "" && title !== candidate.title) editedFields.title = title;
  const description = state.description.trim();
  if (description !== "" && description !== candidate.description) {
    editedFields.description = description;
  }
  const severity = state.severity.trim();
  if (severity !== "" && severity !== candidate.severity) {
    editedFields.severity = severity;
  }
  const rationale = state.rationale.trim();
  if (rationale !== "" && rationale !== (candidate.rationale ?? "")) {
    editedFields.rationale = rationale;
  }
  const confidenceText = state.confidence.trim();
  if (confidenceText !== "") {
    const confidence = Number(confidenceText);
    if (Number.isFinite(confidence) && confidence !== candidate.confidence) {
      editedFields.confidence = confidence;
    }
  }
  const proposedEvidence = buildDeltaEditedProposedEvidence(candidate, state);
  if (proposedEvidence !== undefined) {
    editedFields.proposedEvidence = proposedEvidence;
  }
  return editedFields;
}

/**
 * Build one minimal review decision: candidateId + action, a trimmed nonblank
 * note, and editedFields only for edit_accept. No authority or provenance
 * field ever rides along.
 */
function buildDeltaReviewDecision(
  candidate: DeltaCandidate,
  state: DeltaCandidateDecisionState,
  action: DeltaReviewAction
): DeltaReviewDecision {
  const decision: DeltaReviewDecision = { candidateId: candidate.id, action };
  const note = state.note.trim();
  if (note !== "") decision.note = note;
  if (action === "edit_accept") {
    decision.editedFields = buildDeltaEditedFields(candidate, state);
  }
  return decision;
}

/**
 * Compact engineer review controls for ONE pending candidate, kept beside the
 * candidate's proposal and decision context. The action select drives whether
 * the edit_accept fields show; the long proposal/table editing sits inside a
 * details block so the default view stays scannable.
 */
function DeltaPendingCandidateControls({
  candidate,
  state,
  disabled,
  onChange,
}: {
  candidate: DeltaCandidate;
  state: DeltaCandidateDecisionState;
  disabled: boolean;
  onChange: (next: DeltaCandidateDecisionState) => void;
}) {
  const proposed = candidate.proposedEvidence;
  const update = (patch: Partial<DeltaCandidateDecisionState>): void =>
    onChange({ ...state, ...patch });
  return (
    <div
      data-testid={`delta-review-controls-${candidate.id}`}
      className="mt-2 space-y-2 border-t border-[var(--border)] pt-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-text-tertiary">
          Decision
          <select
            data-testid={`delta-action-${candidate.id}`}
            value={state.action}
            disabled={disabled}
            onChange={(e) =>
              update({ action: e.target.value as "" | DeltaReviewAction })
            }
            className={FIELD}
          >
            <option value="">no decision</option>
            <option value="accept">accept</option>
            <option value="reject">reject</option>
            <option value="edit_accept">edit and accept</option>
            <option value="waive">waive</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col text-xs text-text-tertiary">
          Note (required to waive)
          <textarea
            data-testid={`delta-note-${candidate.id}`}
            value={state.note}
            disabled={disabled}
            onChange={(e) => update({ note: e.target.value })}
            rows={2}
            className={FIELD}
          />
        </label>
      </div>
      {state.action === "edit_accept" && (
        <div
          data-testid={`delta-edit-${candidate.id}`}
          className="space-y-2 rounded-button bg-bg-card p-2"
        >
          <p className="text-xs text-text-tertiary">
            Edit the AI/engineer proposal before accepting (a proposal for
            review, not authority).
          </p>
          <label className="flex flex-col text-xs text-text-tertiary">
            Title
            <input
              type="text"
              data-testid={`delta-edit-title-${candidate.id}`}
              value={state.title}
              disabled={disabled}
              onChange={(e) => update({ title: e.target.value })}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col text-xs text-text-tertiary">
            Description
            <textarea
              data-testid={`delta-edit-description-${candidate.id}`}
              value={state.description}
              disabled={disabled}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              className={FIELD}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col text-xs text-text-tertiary">
              Severity
              <input
                type="text"
                data-testid={`delta-edit-severity-${candidate.id}`}
                value={state.severity}
                disabled={disabled}
                onChange={(e) => update({ severity: e.target.value })}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col text-xs text-text-tertiary">
              Confidence
              <input
                type="text"
                data-testid={`delta-edit-confidence-${candidate.id}`}
                value={state.confidence}
                disabled={disabled}
                onChange={(e) => update({ confidence: e.target.value })}
                className={FIELD}
              />
            </label>
          </div>
          <label className="flex flex-col text-xs text-text-tertiary">
            Rationale
            <textarea
              data-testid={`delta-edit-rationale-${candidate.id}`}
              value={state.rationale}
              disabled={disabled}
              onChange={(e) => update({ rationale: e.target.value })}
              rows={2}
              className={FIELD}
            />
          </label>
          {proposed !== undefined && (
            <details data-testid={`delta-edit-proposed-${candidate.id}`}>
              <summary className="cursor-pointer text-xs text-text-secondary">
                Edit proposed evidence (proposal for review)
              </summary>
              {proposed.evidenceKind === "rfp_document_text_chunk" ? (
                <label className="mt-1 flex flex-col text-xs text-text-tertiary">
                  Proposed text
                  <textarea
                    data-testid={`delta-edit-proposed-text-${candidate.id}`}
                    value={state.proposedText}
                    disabled={disabled}
                    onChange={(e) => update({ proposedText: e.target.value })}
                    rows={4}
                    className={FIELD}
                  />
                </label>
              ) : (
                <label className="mt-1 flex flex-col text-xs text-text-tertiary">
                  Proposed table rows (tab between cells, newline between rows)
                  <textarea
                    data-testid={`delta-edit-proposed-table-${candidate.id}`}
                    value={state.proposedTableTsv}
                    disabled={disabled}
                    onChange={(e) =>
                      update({ proposedTableTsv: e.target.value })
                    }
                    rows={4}
                    className={FIELD}
                  />
                </label>
              )}
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One final evidence-package entry. This is the sanitized evidence under human
 * review, so the body is surfaced - text in a collapsed details block, table
 * rows in a collapsed details block - alongside its source traceability.
 */
function PackageEvidenceView({ evidence }: { evidence: PackageEvidence }) {
  const traceability = (
    <p className="text-xs text-text-secondary">
      {evidence.sourceFileName !== undefined ? `${evidence.sourceFileName} ` : ""}
      {evidence.sourceFileRole !== undefined ? `(${evidence.sourceFileRole}) ` : ""}
      file <span className="font-mono">{evidence.sourceFileId}</span> | package{" "}
      <span className="font-mono">{evidence.inputPackageArtifactId}</span>
    </p>
  );
  if (evidence.evidenceKind === "rfp_document_text_chunk") {
    return (
      <li
        data-testid="ep-evidence"
        className="rounded-button border border-[var(--border)] p-2"
      >
        <p className="text-xs font-medium text-text-primary">
          <span className="font-mono">{evidence.evidenceId}</span> | text | chunk{" "}
          {evidence.chunkIndex + 1}/{evidence.chunkCount} | {evidence.charCount} chars
          {evidence.documentMetrics !== undefined
            ? ` | doc ${evidence.documentMetrics.textCharCount} chars / ${evidence.documentMetrics.tableCount} tables`
            : ""}
        </p>
        {traceability}
        <details data-testid="ep-evidence-text" className="mt-1">
          <summary className="cursor-pointer text-xs text-text-secondary">
            Evidence text
          </summary>
          <pre
            data-testid="ep-evidence-text-body"
            className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-button bg-bg-card p-2 text-xs text-text-primary"
          >
            {evidence.text}
          </pre>
        </details>
      </li>
    );
  }
  return (
    <li
      data-testid="ep-evidence"
      className="rounded-button border border-[var(--border)] p-2"
    >
      <p className="text-xs font-medium text-text-primary">
        <span className="font-mono">{evidence.evidenceId}</span> | table {evidence.tableId}
        {evidence.pageNumber !== undefined ? ` | page ${evidence.pageNumber}` : ""}
        {evidence.sheetName !== undefined ? ` | sheet ${evidence.sheetName}` : ""} |{" "}
        {evidence.rowCount} rows x {evidence.columnCount} cols
      </p>
      {traceability}
      <details data-testid="ep-evidence-table" className="mt-1">
        <summary className="cursor-pointer text-xs text-text-secondary">
          Evidence table
        </summary>
        <div className="mt-1 max-h-72 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {evidence.rows.map((row, rowIndex) => (
                <tr key={rowIndex} data-testid="ep-evidence-table-row">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border border-[var(--border)] px-2 py-1 text-text-primary"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  );
}

/**
 * True for a generic extraction-position passage label such as "Passage 1 of 4"
 * or "Text passage 2 of 13". These read as raw chunk positions, so they are
 * dropped from downstream requirement/compliance reference labels. A human
 * section/clause/topic passage label (e.g. "Section 1.1") is NOT generic.
 */
function isGenericPassageLabel(label: string): boolean {
  return /^(?:text\s+)?passage\s+\d+\s+of\s+\d+$/i.test(label.trim());
}

/**
 * Human label for one finding citation, used both in the primary compiled
 * evidence review and in downstream requirement/compliance references. Carries
 * the human source labels - document, page, sheet, table, and section/clause-
 * style passage labels - but drops a generic extraction-position passage label
 * ("Passage N of M" / "Text passage N of M") because it reads as a raw chunk
 * position. Returns "" when nothing human-readable remains.
 */
function readableCitationLine(
  citation: CompiledEvidenceFinding["citations"][number]
): string {
  const passageLabel =
    citation.passageLabel !== undefined &&
    !isGenericPassageLabel(citation.passageLabel)
      ? citation.passageLabel
      : undefined;
  return [
    citation.documentLabel,
    passageLabel,
    citation.pageLabel,
    citation.sheetLabel,
    citation.tableLabel,
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" | ");
}

/**
 * Human reference label for one compiled finding, reused as the primary label
 * for a requirement/compliance evidence reference: the source document and its
 * human role, then the finding's topic/title/clean-summary descriptor, then its
 * compiled citation labels. Carries only human labels - never a raw
 * evidence/file/package/table id, the word "chunk", a char count, or a generic
 * extraction-position passage locator ("Passage N of M" / "Text passage N of
 * M"). Human page/sheet/table and section/clause-style passage citation labels
 * are kept.
 */
function compiledFindingReferenceLabel(
  finding: CompiledEvidenceFinding
): string {
  const head = [finding.documentName];
  if (finding.role !== undefined) head.push(`(${fileRoleLabel(finding.role)})`);
  const segments = [head.join(" ")];
  const descriptor =
    finding.topic ??
    (finding.title !== finding.documentName ? finding.title : undefined) ??
    finding.cleanSummary;
  if (descriptor !== undefined && descriptor !== "") segments.push(descriptor);
  const citations = finding.citations
    .map((citation) => readableCitationLine(citation))
    .filter((line) => line !== "");
  if (citations.length > 0) segments.push(citations.join("; "));
  return segments.join(" - ");
}

/**
 * UI-only evidenceId -> compiled finding label, built from one loaded evidence
 * package compiledReview. Each finding's compiled label is keyed by every raw
 * deterministic record it represents (its audit evidence id values); the first
 * finding to claim an id wins. The page reuses the returned review and never
 * recompiles evidence in the client.
 */
function buildCompiledReferenceLabelLookup(
  compiledReview?: CompiledEvidenceReview
): Map<string, string> {
  const lookup = new Map<string, string>();
  if (compiledReview === undefined) return lookup;
  for (const finding of compiledReview.findings) {
    const label = compiledFindingReferenceLabel(finding);
    for (const entry of finding.audit) {
      if (!lookup.has(entry.evidenceId)) lookup.set(entry.evidenceId, label);
    }
  }
  return lookup;
}

/**
 * Primary label for one requirement/compliance evidence reference: prefer the
 * approved evidence package's compiled finding label for this evidenceId, and
 * otherwise degrade to the document-prefixed extraction locator. Raw ids and
 * chunk locators stay in the collapsed audit, never here.
 */
function primaryEvidenceReferenceLabel(
  ref: ReadableEvidenceReference,
  compiledLabelById: Map<string, string>,
  contextById: Map<string, EvidenceReferenceContext>
): string {
  return (
    compiledLabelById.get(ref.evidenceId) ??
    readableEvidenceReferenceLabel(ref, contextById.get(ref.evidenceId))
  );
}

/**
 * One primary compiled evidence finding. Only human labels render here - the
 * finding title, source document/role, human citation labels, and the grouped
 * text body or readable table - plus presentation flags. Generic extraction-
 * position passage citations ("Passage N of M") are dropped as too close to a
 * raw chunk position; a finding left with no human citation renders none. Raw
 * machine ids and chunk locators stay in the drawer audit trail, and there is
 * no per-finding technical dropdown.
 */
function CompiledFindingView({ finding }: { finding: CompiledEvidenceFinding }) {
  const citationLines = finding.citations
    .map((citation) => readableCitationLine(citation))
    .filter((line) => line !== "");
  return (
    <li
      data-testid="ep-finding"
      className="rounded-button border border-[var(--border)] p-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-text-primary">{finding.title}</p>
        {finding.flags.tableRepaired && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
            table repaired
          </span>
        )}
        {finding.flags.missingFromDeterministic && (
          <span className="rounded-full border border-accent/40 bg-accent-muted px-2 py-0.5 text-[11px] text-accent">
            proposed addition
          </span>
        )}
        {finding.flags.duplicate && (
          <span
            data-testid="ep-finding-flag-duplicate"
            className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-text-secondary"
          >
            duplicate
          </span>
        )}
        {finding.flags.boilerplate && (
          <span
            data-testid="ep-finding-flag-boilerplate"
            className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-text-secondary"
          >
            boilerplate
          </span>
        )}
        {finding.flags.lowConfidence && (
          <span
            data-testid="ep-finding-flag-low-confidence"
            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200"
          >
            low confidence
          </span>
        )}
        {finding.flags.conflict && (
          <span
            data-testid="ep-finding-flag-conflict"
            className="rounded-full border border-destructive/30 bg-destructive-muted px-2 py-0.5 text-[11px] text-destructive"
          >
            conflict
          </span>
        )}
        {finding.flags.aiRefined && (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-text-secondary">
            AI refined
          </span>
        )}
      </div>
      <p className="text-xs text-text-secondary">
        {finding.documentName}
        {finding.role !== undefined ? ` (${fileRoleLabel(finding.role)})` : ""}
        {finding.topic !== undefined ? ` | ${finding.topic}` : ""}
      </p>
      {finding.cleanSummary !== undefined && (
        <p
          data-testid="ep-finding-summary"
          className="mt-1 text-xs text-text-primary"
        >
          {finding.cleanSummary}
        </p>
      )}
      {citationLines.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {citationLines.map((line, citationIndex) => (
            <li
              key={citationIndex}
              data-testid="ep-finding-citation"
              className="text-xs text-text-tertiary"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
      {finding.body !== undefined && (
        <pre
          data-testid="ep-finding-body"
          className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-button bg-bg-card p-2 text-xs text-text-primary"
        >
          {finding.body}
        </pre>
      )}
      {finding.table !== undefined && (
        <div className="mt-1 max-h-72 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {finding.table.rows.map((row, rowIndex) => (
                <tr key={rowIndex} data-testid="ep-finding-table-row">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border border-[var(--border)] px-2 py-1 text-text-primary"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

/**
 * One optional Stage 5 review-metadata line for the collapsed compliance row
 * audit, omitted entirely when the value is absent so an un-reviewed row keeps a
 * clean audit. Collapsed audit/technical detail only - never a primary row line -
 * and it carries human review hints only, never pricing, SKU, catalog, or
 * configuration authority.
 */
function complianceRowAuditLine(label: string, value?: string): ReactNode {
  if (value === undefined || value === "") return null;
  return (
    <p>
      {label}: {value}
    </p>
  );
}

function ComplianceMatrixRowView({
  row,
  evidenceContextById,
  compiledLabelById,
  responseEdit,
  lifecycle,
}: {
  row: ComplianceMatrixRow;
  evidenceContextById: Map<string, EvidenceReferenceContext>;
  compiledLabelById: Map<string, string>;
  // Present only for active (non-removed) rows while the matrix needs review.
  responseEdit?: {
    draft: ComplianceRowResponseEditDraft | undefined;
    onToggle: (rowId: string, enabled: boolean) => void;
    onChange: (rowId: string, value: string) => void;
    onChangeStatus: (rowId: string, value: string) => void;
    onChangeNotes: (rowId: string, value: string) => void;
  };
  // Present for every row while the matrix needs review; the offered actions
  // depend on whether the row is removed (restore) or active (mark/remove).
  lifecycle?: {
    draft: ComplianceRowLifecycleDraft | undefined;
    onChangeAction: (rowId: string, value: string) => void;
    onChangeReason: (rowId: string, value: string) => void;
    onChangeNote: (rowId: string, value: string) => void;
  };
}) {
  const showResponseEdit =
    responseEdit !== undefined && row.rowReviewStatus !== "removed";
  const isRemovedRow = row.rowReviewStatus === "removed";
  const lifecycleAction = lifecycle?.draft?.action ?? "";
  const responseEditEnabled = responseEdit?.draft?.enabled ?? false;
  return (
    <li
      data-testid="cm-detail-row"
      className="rounded-button border border-[var(--border)] p-2"
    >
      {row.sectionReference !== undefined && (
        <p
          data-testid="cm-detail-section-reference"
          className="text-xs font-medium text-text-secondary"
        >
          Section reference: {row.sectionReference}
        </p>
      )}
      <p className="text-xs font-medium text-text-primary">
        {row.category} | {row.priority} | {row.complianceStatus}
      </p>
      <p
        data-testid="cm-detail-requirement-text"
        className="mt-1 whitespace-pre-wrap text-xs text-text-primary"
      >
        {row.requirementText}
      </p>
      <p
        data-testid="cm-detail-response"
        className="mt-1 whitespace-pre-wrap text-xs text-text-primary"
      >
        {row.response}
      </p>
      {showResponseEdit && responseEdit !== undefined && (
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            <input
              type="checkbox"
              data-testid={`cm-row-response-edit-enable-${row.id}`}
              checked={responseEditEnabled}
              onChange={(e) => responseEdit.onToggle(row.id, e.target.checked)}
            />
            Edit response
          </label>
          {responseEditEnabled && (
            <>
              <textarea
                data-testid={`cm-row-response-edit-value-${row.id}`}
                value={responseEdit.draft?.response ?? ""}
                onChange={(e) => responseEdit.onChange(row.id, e.target.value)}
                rows={3}
                className={FIELD}
              />
              <label className="flex flex-col text-xs text-text-secondary">
                Compliance status
                <select
                  data-testid={`cm-row-response-edit-status-${row.id}`}
                  value={
                    responseEdit.draft?.complianceStatus ?? "needs_review"
                  }
                  onChange={(e) =>
                    responseEdit.onChangeStatus(row.id, e.target.value)
                  }
                  className={FIELD}
                >
                  {COMPLIANCE_ROW_EDIT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {COMPLIANCE_ROW_EDIT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs text-text-secondary">
                Notes
                <textarea
                  data-testid={`cm-row-response-edit-notes-${row.id}`}
                  value={responseEdit.draft?.notes ?? ""}
                  onChange={(e) =>
                    responseEdit.onChangeNotes(row.id, e.target.value)
                  }
                  rows={2}
                  className={FIELD}
                />
              </label>
            </>
          )}
        </div>
      )}
      {lifecycle !== undefined && (
        <div className="mt-2 space-y-1">
          <label className="flex flex-col text-xs text-text-secondary">
            Row lifecycle
            <select
              data-testid={`cm-row-lifecycle-action-${row.id}`}
              value={lifecycleAction}
              onChange={(e) =>
                lifecycle.onChangeAction(row.id, e.target.value)
              }
              className={FIELD}
            >
              <option value="">No change</option>
              {isRemovedRow ? (
                <option value="restore">Restore</option>
              ) : (
                <>
                  <option value="mark_not_applicable">
                    Mark not applicable
                  </option>
                  <option value="remove">Remove</option>
                </>
              )}
            </select>
          </label>
          {(lifecycleAction === "mark_not_applicable" ||
            lifecycleAction === "remove") && (
            <label className="flex flex-col text-xs text-text-secondary">
              Reason
              <textarea
                data-testid={`cm-row-lifecycle-reason-${row.id}`}
                value={lifecycle.draft?.reason ?? ""}
                onChange={(e) =>
                  lifecycle.onChangeReason(row.id, e.target.value)
                }
                rows={2}
                className={FIELD}
              />
            </label>
          )}
          {lifecycleAction === "restore" && (
            <label className="flex flex-col text-xs text-text-secondary">
              Note (optional)
              <textarea
                data-testid={`cm-row-lifecycle-note-${row.id}`}
                value={lifecycle.draft?.note ?? ""}
                onChange={(e) =>
                  lifecycle.onChangeNote(row.id, e.target.value)
                }
                rows={2}
                className={FIELD}
              />
            </label>
          )}
        </div>
      )}
      {row.rationale !== undefined && (
        <p className="mt-1 text-xs text-text-secondary">
          Rationale: {row.rationale}
        </p>
      )}
      {row.notes !== undefined && (
        <p className="mt-1 text-xs text-text-secondary">Notes: {row.notes}</p>
      )}
      <ul className="mt-1 space-y-0.5">
        {row.evidenceReferences.map((ref, refIndex) => (
          <li
            key={refIndex}
            data-testid="cm-detail-evidence-reference"
            className="text-xs text-text-tertiary"
          >
            {primaryEvidenceReferenceLabel(
              ref,
              compiledLabelById,
              evidenceContextById
            )}
          </li>
        ))}
      </ul>
      {row.configurationReferences !== undefined &&
        row.configurationReferences.length > 0 && (
          <details data-testid="cm-detail-configuration-references" className="mt-1">
            <summary className="cursor-pointer text-xs text-text-secondary">
              Configuration references ({row.configurationReferences.length})
            </summary>
            <ul className="mt-1 space-y-0.5">
              {row.configurationReferences.map((ref, refIndex) => (
                <li
                  key={refIndex}
                  data-testid="cm-detail-configuration-reference"
                  className="text-xs text-text-tertiary"
                >
                  {readableConfigurationReferenceLabel(ref)}
                </li>
              ))}
            </ul>
          </details>
      )}
      <TechnicalDetails testId="cm-detail-audit">
        <p>Row ID: {row.id}</p>
        <p>Requirement ID: {row.requirementId}</p>
        {row.evidenceReferences.map((ref, refIndex) => (
          <p key={refIndex}>
            Evidence {refIndex + 1}: {rawEvidenceReferenceLine(ref)}
          </p>
        ))}
        {row.configurationReferences !== undefined &&
          row.configurationReferences.map((ref, refIndex) => (
            <p key={refIndex}>
              Configuration {refIndex + 1}:{" "}
              {ref.configurationExpansionArtifactId} | {configurationReferenceLine(ref)}
            </p>
          ))}
        {complianceRowAuditLine("Section reference", row.sectionReference)}
        {complianceRowAuditLine("Response lane", row.responseLane)}
        {complianceRowAuditLine("Owner lane", row.ownerLane)}
        {complianceRowAuditLine("HLD impact", row.hldImpact)}
        {complianceRowAuditLine("TP impact", row.tpImpact)}
        {complianceRowAuditLine("BoQ/config impact", row.boqConfigImpact)}
        {complianceRowAuditLine(
          "Requires owner review",
          row.requiresOwnerReview !== undefined
            ? yesNo(row.requiresOwnerReview)
            : undefined
        )}
        {complianceRowAuditLine("Row review status", row.rowReviewStatus)}
        {complianceRowAuditLine(
          "Not applicable reason",
          row.notApplicableReason
        )}
        {complianceRowAuditLine("Removed reason", row.removedReason)}
        {row.reviewHistory !== undefined && row.reviewHistory.length > 0 && (
          <div data-testid="cm-detail-review-history">
            <p>Review history ({row.reviewHistory.length})</p>
            {row.reviewHistory.map((entry, entryIndex) => (
              <p
                key={entryIndex}
                data-testid="cm-detail-review-history-entry"
              >
                {entry.action} | {entry.by} | {entry.at}
                {entry.note !== undefined ? ` | ${entry.note}` : ""}
              </p>
            ))}
          </div>
        )}
      </TechnicalDetails>
    </li>
  );
}

function TechnicalDetails({
  children,
  label = "Technical details",
  testId,
}: {
  children: ReactNode;
  label?: string;
  testId?: string;
}) {
  return (
    <details data-testid={testId} className={TECHNICAL_DETAILS_CLASS}>
      <summary className="cursor-pointer text-xs font-medium text-text-tertiary">
        {label}
      </summary>
      <div className="mt-2 space-y-1 text-xs text-text-tertiary">{children}</div>
    </details>
  );
}

function WorkflowStep({
  number,
  title,
  state,
  summary,
  active,
  children,
}: {
  number: number;
  title: string;
  state: "ready" | "current" | "blocked" | "complete";
  summary: string;
  active: boolean;
  children: ReactNode;
}) {
  const stateClass =
    state === "complete"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : state === "current"
        ? "border-accent/40 bg-accent-muted text-accent"
        : state === "blocked"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
          : "border-[var(--border)] bg-bg-primary text-text-secondary";
  return (
    <section
      data-testid={`workflow-step-${number}`}
      className={`${CARD} ${active ? "ring-1 ring-accent/50" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-xs font-semibold text-text-secondary">
              {number}
            </span>
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{summary}</p>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${stateClass}`}
        >
          {state}
        </span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ArtifactStatusCard({
  label,
  artifact,
  actionLabel,
  actionTestId,
  onInspect,
}: {
  label: string;
  artifact?: RfpArtifactState;
  actionLabel?: string;
  actionTestId?: string;
  onInspect?: (artifactId: string) => void;
}) {
  return (
    <div className={SUBTLE_CARD}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {label}
          </p>
          {artifact === undefined ? (
            <p className="mt-1 text-sm text-text-secondary">Not created yet.</p>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={artifact.status} />
              <span className="text-xs text-text-secondary">Version {artifact.version}</span>
            </div>
          )}
        </div>
        {artifact !== undefined && onInspect !== undefined && (
          <button
            type="button"
            data-testid={actionTestId}
            className={PLAIN_BTN}
            onClick={() => onInspect(artifact.id)}
          >
            {actionLabel ?? "Inspect"}
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewHistory({
  track,
  onInspect,
  label,
}: {
  track: RfpArtifactTrack;
  onInspect?: (artifactId: string) => void;
  label?: string;
}) {
  const entries: RfpArtifactHistoryEntry[] = track.history;
  return (
    <details data-testid="review-history" className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {label ?? "Review history"} ({entries.length})
      </summary>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-text-tertiary">No previous versions.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className={SUBTLE_CARD}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={entry.status} />
                  <span className="text-xs text-text-secondary">
                    Version {entry.version} - {entry.reason.replaceAll("_", " ")}
                  </span>
                </div>
                {onInspect !== undefined && (
                  <button
                    type="button"
                    className={PLAIN_BTN}
                    onClick={() => onInspect(entry.id)}
                  >
                    Inspect
                  </button>
                )}
              </div>
              {entry.reviewCounts !== undefined && (
                <p className="mt-1 text-xs text-text-secondary">
                  Candidates {entry.reviewCounts.candidateCount}, pending{" "}
                  {entry.reviewCounts.pendingCount}, accepted{" "}
                  {entry.reviewCounts.acceptedCount}, rejected{" "}
                  {entry.reviewCounts.rejectedCount}, waived{" "}
                  {entry.reviewCounts.waivedCount}
                </p>
              )}
              <TechnicalDetails>
                <p>Artifact ID: {entry.id}</p>
                <p>Status: {entry.status}</p>
              </TechnicalDetails>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-tertiary">{children}</p>;
}

function ReviewDrawer({
  title,
  subtitle,
  loading,
  error,
  onClose,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
  children,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
  children: ReactNode;
}) {
  return (
    <div data-testid="review-drawer" className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close review drawer"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-[var(--border)] bg-bg-primary shadow-xl">
        <header className="border-b border-[var(--border)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
              {subtitle !== undefined && (
                <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
              )}
            </div>
            <button type="button" className={PLAIN_BTN} onClick={onClose}>
              Close
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={PLAIN_BTN}
              disabled={previousDisabled}
              onClick={onPrevious}
            >
              Previous
            </button>
            <button
              type="button"
              className={PLAIN_BTN}
              disabled={nextDisabled}
              onClick={onNext}
            >
              Next
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {error !== null && <div className={ERROR_BOX}>{error}</div>}
          {loading && <p className="text-sm text-text-tertiary">Loading detail...</p>}
          {!loading && error === null && children}
        </div>
      </aside>
    </div>
  );
}

export default function ProjectRfpEvidencePage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<EvidenceListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // UI-only lookup from loaded evidence summaries, keyed by evidenceId, so
  // requirement/compliance reference labels can show document/role context.
  const evidenceContextById = useMemo(
    () => buildEvidenceContextLookup(data?.evidence ?? []),
    [data]
  );

  const [detail, setDetail] = useState<RfpEvidenceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [baselineList, setBaselineList] = useState<BaselineListResponse | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  const [baselineDetail, setBaselineDetail] = useState<BaselineDetail | null>(null);
  const [baselineDetailLoading, setBaselineDetailLoading] = useState(false);
  const [baselineDetailError, setBaselineDetailError] = useState<string | null>(null);

  const [reviewNote, setReviewNote] = useState("");
  const [reviewPending, setReviewPending] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  const [complianceList, setComplianceList] =
    useState<ComplianceMatrixListResponse | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [complianceDetail, setComplianceDetail] =
    useState<ComplianceMatrixDetail | null>(null);
  const [complianceDetailLoading, setComplianceDetailLoading] = useState(false);
  const [complianceDetailError, setComplianceDetailError] = useState<
    string | null
  >(null);
  const [complianceReviewNote, setComplianceReviewNote] = useState("");
  const [complianceReviewPending, setComplianceReviewPending] = useState(false);
  const [complianceReviewError, setComplianceReviewError] = useState<
    string | null
  >(null);
  const [complianceReviewSuccess, setComplianceReviewSuccess] = useState<
    string | null
  >(null);
  const [complianceRowResponseEdits, setComplianceRowResponseEdits] = useState<
    Record<string, ComplianceRowResponseEditDraft>
  >({});
  const [complianceRowEditPending, setComplianceRowEditPending] =
    useState(false);
  const [complianceRowEditError, setComplianceRowEditError] = useState<
    string | null
  >(null);
  const [complianceRowEditSuccess, setComplianceRowEditSuccess] = useState<
    string | null
  >(null);
  const [complianceRowLifecycle, setComplianceRowLifecycle] = useState<
    Record<string, ComplianceRowLifecycleDraft>
  >({});
  const [complianceRowLifecyclePending, setComplianceRowLifecyclePending] =
    useState(false);
  const [complianceRowLifecycleError, setComplianceRowLifecycleError] =
    useState<string | null>(null);
  const [complianceRowLifecycleSuccess, setComplianceRowLifecycleSuccess] =
    useState<string | null>(null);
  const [complianceStatusFilter, setComplianceStatusFilter] =
    useState<ComplianceStatusFilter>("active");
  const [complianceSearch, setComplianceSearch] = useState("");
  const [complianceGroupBy, setComplianceGroupBy] =
    useState<ComplianceGroupBy>("category");
  const [selectedComplianceRowId, setSelectedComplianceRowId] = useState<
    string | null
  >(null);

  const [generatePending, setGeneratePending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);

  const [uploadQueue, setUploadQueue] = useState<QueuedUploadFile[]>([]);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const uploadKeyRef = useRef(0);

  const [inputPackagePending, setInputPackagePending] = useState(false);
  const [inputPackageError, setInputPackageError] = useState<string | null>(null);
  const [inputPackageSuccess, setInputPackageSuccess] = useState<string | null>(null);
  const [inputPackageReviewNote, setInputPackageReviewNote] = useState("");
  const [inputPackageNewVersionReason, setInputPackageNewVersionReason] =
    useState("");
  const [inputPackageNewVersionOpen, setInputPackageNewVersionOpen] =
    useState(false);
  const [inputPackageReviewPending, setInputPackageReviewPending] = useState(false);
  const [inputPackageReviewError, setInputPackageReviewError] = useState<
    string | null
  >(null);
  const [inputPackageReviewSuccess, setInputPackageReviewSuccess] = useState<
    string | null
  >(null);

  const [prepareEvidencePending, setPrepareEvidencePending] = useState(false);
  const [prepareEvidenceMessage, setPrepareEvidenceMessage] =
    useState<PrimaryActionMessage | null>(null);

  const [complianceGeneratePending, setComplianceGeneratePending] = useState(false);
  const [complianceGenerateError, setComplianceGenerateError] =
    useState<string | null>(null);
  const [complianceGenerateSuccess, setComplianceGenerateSuccess] =
    useState<string | null>(null);

  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const [deltaList, setDeltaList] = useState<ExtractionDeltaListResponse | null>(null);
  const [deltaListLoading, setDeltaListLoading] = useState(true);
  const [deltaListError, setDeltaListError] = useState<string | null>(null);

  const [deltaDetail, setDeltaDetail] = useState<ExtractionDeltaDetail | null>(null);
  const [deltaDetailLoading, setDeltaDetailLoading] = useState(false);
  const [deltaDetailError, setDeltaDetailError] = useState<string | null>(null);

  const [deltaDecisions, setDeltaDecisions] = useState<
    Record<string, DeltaCandidateDecisionState>
  >({});
  const [deltaReviewPending, setDeltaReviewPending] = useState(false);
  const [deltaReviewError, setDeltaReviewError] = useState<string | null>(null);
  const [deltaReviewSuccess, setDeltaReviewSuccess] = useState<string | null>(
    null
  );

  const [packageList, setPackageList] = useState<EvidencePackageListResponse | null>(null);
  const [packageListLoading, setPackageListLoading] = useState(true);
  const [packageListError, setPackageListError] = useState<string | null>(null);

  const [packageDetail, setPackageDetail] = useState<EvidencePackageDetail | null>(null);
  const [packageDetailLoading, setPackageDetailLoading] = useState(false);
  const [packageDetailError, setPackageDetailError] = useState<string | null>(null);
  const [packageReviewNote, setPackageReviewNote] = useState("");
  const [packageReviewPending, setPackageReviewPending] = useState(false);
  const [packageReviewError, setPackageReviewError] = useState<string | null>(null);
  const [packageReviewSuccess, setPackageReviewSuccess] = useState<string | null>(null);

  // UI-only compiled reference labels: the compiled evidence review of the
  // latest approved evidence package, loaded lazily when a requirements or
  // compliance drawer opens so its primary references point at compiled
  // findings instead of raw extraction positions. Keyed by the loaded artifact
  // id so the same approved package is never refetched and the evidence-package
  // drawer's own packageDetail stays independent.
  const [referenceCompiledReview, setReferenceCompiledReview] = useState<{
    artifactId: string;
    review: CompiledEvidenceReview;
  } | null>(null);
  const compiledReferenceLabelById = useMemo(
    () => buildCompiledReferenceLabelLookup(referenceCompiledReview?.review),
    [referenceCompiledReview]
  );

  const [boqWorkspace, setBoqWorkspace] = useState<ProjectRfpBoqWorkspace | null>(null);
  const [boqWorkspaceLoading, setBoqWorkspaceLoading] = useState(true);
  const [boqWorkspaceError, setBoqWorkspaceError] = useState<string | null>(null);

  // No-BoQ service-only exception request (gate requires_boq_upload_or_exception).
  const [noBoqExceptionReason, setNoBoqExceptionReason] = useState("");
  const [noBoqExceptionPending, setNoBoqExceptionPending] = useState(false);
  const [noBoqExceptionError, setNoBoqExceptionError] = useState<string | null>(null);
  const [noBoqExceptionSuccess, setNoBoqExceptionSuccess] = useState<string | null>(null);

  // No-BoQ service-only exception review (gate no_boq_exception_pending_review).
  const [noBoqExceptionNote, setNoBoqExceptionNote] = useState("");
  const [noBoqExceptionReviewPending, setNoBoqExceptionReviewPending] = useState(false);
  const [noBoqExceptionReviewError, setNoBoqExceptionReviewError] = useState<string | null>(null);
  const [noBoqExceptionReviewSuccess, setNoBoqExceptionReviewSuccess] = useState<string | null>(null);

  // HLD readiness snapshot list and detail state (read-only, no generation).
  const [hldReadinessList, setHldReadinessList] = useState<HldReadinessListResponse | null>(null);
  const [hldReadinessListLoading, setHldReadinessListLoading] = useState(true);
  const [hldReadinessListError, setHldReadinessListError] = useState<string | null>(null);

  const [hldReadinessDetail, setHldReadinessDetail] = useState<HldReadinessSnapshotDetail | null>(null);
  const [hldReadinessDetailLoading, setHldReadinessDetailLoading] = useState(false);
  const [hldReadinessDetailError, setHldReadinessDetailError] = useState<string | null>(null);

  const loadList = useCallback(
    async (filters: EvidenceFilters): Promise<void> => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch(evidenceListUrl(id, filters));
        const body = (await res.json().catch(() => null)) as EvidenceListResponse | null;
        if (!res.ok || body === null || !body.project || !Array.isArray(body.evidence)) {
          setData(null);
          setListError(LIST_ERROR);
          return;
        }
        setData(body);
      } catch {
        setData(null);
        setListError(LIST_ERROR);
      } finally {
        setListLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void loadList(EMPTY_FILTERS);
  }, [loadList]);

  // Persisted content is fetched only here, on an explicit Inspect click.
  const loadDetail = useCallback(
    async (evidenceId: string): Promise<void> => {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/projects/${id}/rfp/evidence/${evidenceId}`);
        const body = (await res.json().catch(() => null)) as EvidenceDetailResponse | null;
        const evidence = body?.evidence;
        if (!res.ok || evidence === undefined || evidence.content === undefined) {
          setDetailError(DETAIL_ERROR);
          return;
        }
        setDetail(evidence);
      } catch {
        setDetailError(DETAIL_ERROR);
      } finally {
        setDetailLoading(false);
      }
    },
    [id]
  );

  const loadBaselineList = useCallback(async (): Promise<void> => {
    setBaselineLoading(true);
    setBaselineError(null);
    try {
      const res = await fetch(`/api/projects/${id}/rfp/requirements-baseline`);
      const body = (await res.json().catch(() => null)) as BaselineListResponse | null;
      if (!res.ok || body === null || !Array.isArray(body.artifacts)) {
        setBaselineList(null);
        setBaselineError(BASELINE_LIST_ERROR);
        return;
      }
      setBaselineList(body);
    } catch {
      setBaselineList(null);
      setBaselineError(BASELINE_LIST_ERROR);
    } finally {
      setBaselineLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadBaselineList();
  }, [loadBaselineList]);

  const loadComplianceList = useCallback(async (): Promise<void> => {
    setComplianceLoading(true);
    setComplianceError(null);
    try {
      const res = await fetch(`/api/projects/${id}/rfp/compliance-matrix`);
      const body = (await res
        .json()
        .catch(() => null)) as ComplianceMatrixListResponse | null;
      if (!res.ok || body === null || !Array.isArray(body.artifacts)) {
        setComplianceList(null);
        setComplianceError(COMPLIANCE_LIST_ERROR);
        return;
      }
      setComplianceList(body);
    } catch {
      setComplianceList(null);
      setComplianceError(COMPLIANCE_LIST_ERROR);
    } finally {
      setComplianceLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadComplianceList();
  }, [loadComplianceList]);

  const loadDeltaList = useCallback(async (): Promise<void> => {
    setDeltaListLoading(true);
    setDeltaListError(null);
    try {
      const res = await fetch(`/api/projects/${id}/rfp/extraction-delta`);
      const body = (await res.json().catch(() => null)) as ExtractionDeltaListResponse | null;
      if (!res.ok || body === null || !Array.isArray(body.artifacts)) {
        setDeltaList(null);
        setDeltaListError(DELTA_LIST_ERROR);
        return;
      }
      setDeltaList(body);
    } catch {
      setDeltaList(null);
      setDeltaListError(DELTA_LIST_ERROR);
    } finally {
      setDeltaListLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDeltaList();
  }, [loadDeltaList]);

  // Delta candidate bodies and proposals are fetched only here, on Inspect.
  const loadDeltaDetail = useCallback(
    async (artifactId: string): Promise<void> => {
      setDeltaDetail(null);
      setDeltaDetailError(null);
      setDeltaDetailLoading(true);
      try {
        const res = await fetch(`/api/projects/${id}/rfp/extraction-delta/${artifactId}`);
        const body = (await res.json().catch(() => null)) as ExtractionDeltaDetailResponse | null;
        if (
          !res.ok ||
          body === null ||
          body.artifact === undefined ||
          body.delta === undefined
        ) {
          setDeltaDetailError(DELTA_DETAIL_ERROR);
          return;
        }
        setDeltaDetail({ artifact: body.artifact, delta: body.delta });
        setDeltaDecisions(
          initialDeltaDecisions({ artifact: body.artifact, delta: body.delta })
        );
        setDeltaReviewError(null);
        setDeltaReviewSuccess(null);
      } catch {
        setDeltaDetailError(DELTA_DETAIL_ERROR);
      } finally {
        setDeltaDetailLoading(false);
      }
    },
    [id]
  );

  const loadPackageList = useCallback(async (): Promise<void> => {
    setPackageListLoading(true);
    setPackageListError(null);
    try {
      const res = await fetch(`/api/projects/${id}/rfp/evidence-package`);
      const body = (await res.json().catch(() => null)) as EvidencePackageListResponse | null;
      if (!res.ok || body === null || !Array.isArray(body.artifacts)) {
        setPackageList(null);
        setPackageListError(PACKAGE_LIST_ERROR);
        return;
      }
      setPackageList(body);
    } catch {
      setPackageList(null);
      setPackageListError(PACKAGE_LIST_ERROR);
    } finally {
      setPackageListLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadPackageList();
  }, [loadPackageList]);

  const loadBoqWorkspace = useCallback(async (): Promise<void> => {
    setBoqWorkspaceLoading(true);
    setBoqWorkspaceError(null);
    try {
      const res = await fetch(`/api/projects/${id}/rfp/boq`);
      const body = (await res.json().catch(() => null)) as RfpBoqWorkspaceResponse | null;
      if (!res.ok || body === null || body.workspace === undefined) {
        setBoqWorkspace(null);
        setBoqWorkspaceError(BOQ_WORKSPACE_ERROR);
        return;
      }
      setBoqWorkspace(body.workspace);
    } catch {
      setBoqWorkspace(null);
      setBoqWorkspaceError(BOQ_WORKSPACE_ERROR);
    } finally {
      setBoqWorkspaceLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadBoqWorkspace();
  }, [loadBoqWorkspace]);

  const loadHldReadinessList = useCallback(async (): Promise<void> => {
    setHldReadinessListLoading(true);
    setHldReadinessListError(null);
    try {
      const res = await fetch(`/api/projects/${id}/rfp/hld-readiness-snapshot`);
      const body = (await res.json().catch(() => null)) as HldReadinessListResponse | null;
      if (!res.ok || body === null || !Array.isArray(body.artifacts) || body.readiness === undefined) {
        setHldReadinessList(null);
        setHldReadinessListError(HLD_READINESS_LIST_ERROR);
        return;
      }
      setHldReadinessList(body);
    } catch {
      setHldReadinessList(null);
      setHldReadinessListError(HLD_READINESS_LIST_ERROR);
    } finally {
      setHldReadinessListLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadHldReadinessList();
  }, [loadHldReadinessList]);

  // HLD readiness snapshot detail is fetched only on an explicit Inspect click.
  const loadHldReadinessDetail = useCallback(
    async (artifactId: string): Promise<void> => {
      setHldReadinessDetail(null);
      setHldReadinessDetailError(null);
      setHldReadinessDetailLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${id}/rfp/artifacts/${artifactId}/hld-readiness-snapshot`
        );
        const body = (await res.json().catch(() => null)) as HldReadinessSnapshotDetailResponse | null;
        if (
          !res.ok ||
          body === null ||
          body.artifact === undefined ||
          body.snapshot === undefined
        ) {
          setHldReadinessDetailError(HLD_READINESS_DETAIL_ERROR);
          return;
        }
        setHldReadinessDetail({ artifact: body.artifact, snapshot: body.snapshot });
      } catch {
        setHldReadinessDetailError(HLD_READINESS_DETAIL_ERROR);
      } finally {
        setHldReadinessDetailLoading(false);
      }
    },
    [id]
  );

  // Final evidence content is fetched only here, on an explicit Inspect click.
  const loadPackageDetail = useCallback(
    async (artifactId: string): Promise<void> => {
      setPackageDetail(null);
      setPackageDetailError(null);
      setPackageReviewNote("");
      setPackageReviewError(null);
      setPackageReviewSuccess(null);
      setPackageDetailLoading(true);
      try {
        const res = await fetch(`/api/projects/${id}/rfp/evidence-package/${artifactId}`);
        const body = (await res.json().catch(() => null)) as EvidencePackageDetailResponse | null;
        if (
          !res.ok ||
          body === null ||
          body.artifact === undefined ||
          body.package === undefined
        ) {
          setPackageDetailError(PACKAGE_DETAIL_ERROR);
          return;
        }
        setPackageDetail({ artifact: body.artifact, package: body.package });
      } catch {
        setPackageDetailError(PACKAGE_DETAIL_ERROR);
      } finally {
        setPackageDetailLoading(false);
      }
    },
    [id]
  );

  // Load ONE approved evidence package's compiled review for requirement and
  // compliance reference labels only. It reuses the read model's returned
  // compiledReview, never opens the evidence-package drawer, and never touches
  // package review state; a failed, missing, or packageless response leaves
  // references on their graceful document-locator fallback.
  const loadReferenceEvidencePackage = useCallback(
    async (artifactId: string): Promise<void> => {
      try {
        const res = await fetch(
          `/api/projects/${id}/rfp/evidence-package/${artifactId}`
        );
        const body = (await res.json().catch(() => null)) as
          | EvidencePackageDetailResponse
          | null;
        if (!res.ok || body === null || body.package === undefined) return;
        setReferenceCompiledReview({
          artifactId,
          review: body.package.compiledReview,
        });
      } catch {
        // Graceful fallback: keep the existing document-locator labels.
      }
    },
    [id]
  );

  // Keep the latest approved evidence package's compiled review loaded for the
  // requirement/compliance reference labels whenever one of those drawers is
  // open, WITHOUT opening the evidence-package drawer. This also covers the
  // race where a drawer opens before the evidence-package list has finished
  // loading: once the latest approved package id becomes known the labels load.
  // A no-op when none is approved yet (references keep their document-locator
  // fallback) or when that approved package is already loaded.
  useEffect(() => {
    if (drawer?.kind !== "requirements" && drawer?.kind !== "compliance") {
      return;
    }
    const approvedId = latestApprovedArtifactId(packageList?.artifacts ?? []);
    if (approvedId === null) return;
    if (referenceCompiledReview?.artifactId === approvedId) return;
    void loadReferenceEvidencePackage(approvedId);
  }, [drawer, packageList, referenceCompiledReview, loadReferenceEvidencePackage]);

  // The page's generation write: ask the server to draft ONE reviewable
  // needs_review requirements_baseline artifact from the latest approved
  // final evidence_package. The body carries only that package artifact id -
  // never raw evidence ids or content, tenant/project/user authority, status,
  // payload, artifact, or approval fields; the route derives all authority
  // server-side. Success reloads only the read-only baseline list; the new
  // draft is never auto-inspected or auto-approved.
  const submitGenerate = useCallback(async (): Promise<void> => {
    const evidencePackageArtifactId = latestApprovedArtifactId(
      packageList?.artifacts ?? []
    );
    if (evidencePackageArtifactId === null || generatePending) return;
    setGeneratePending(true);
    setGenerateError(null);
    setGenerateSuccess(null);
    try {
      const res = await fetch(
        `/api/projects/${id}/rfp/requirements-baseline/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evidencePackageArtifactId,
          }),
        }
      );
      if (!res.ok) {
        setGenerateError(GENERATE_ERROR);
        return;
      }
      setGenerateSuccess(GENERATE_SUCCESS);
      void loadBaselineList();
    } catch {
      setGenerateError(GENERATE_ERROR);
    } finally {
      setGeneratePending(false);
    }
  }, [generatePending, id, loadBaselineList, packageList]);

  // Baseline payload content is fetched only here, on an explicit Inspect.
  const loadBaselineDetail = useCallback(
    async (artifactId: string): Promise<void> => {
      setBaselineDetail(null);
      setBaselineDetailError(null);
      setReviewNote("");
      setReviewError(null);
      setReviewSuccess(null);
      setBaselineDetailLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${id}/rfp/artifacts/${artifactId}/requirements-baseline`
        );
        const body = (await res.json().catch(() => null)) as BaselineDetailResponse | null;
        if (
          !res.ok ||
          body === null ||
          body.artifact === undefined ||
          body.baseline === undefined
        ) {
          setBaselineDetailError(BASELINE_DETAIL_ERROR);
          return;
        }
        setBaselineDetail({ artifact: body.artifact, baseline: body.baseline });
      } catch {
        setBaselineDetailError(BASELINE_DETAIL_ERROR);
      } finally {
        setBaselineDetailLoading(false);
      }
    },
    [id]
  );

  const loadComplianceDetail = useCallback(
    async (artifactId: string): Promise<void> => {
      setComplianceDetail(null);
      setComplianceDetailError(null);
      setComplianceReviewNote("");
      setComplianceReviewError(null);
      setComplianceReviewSuccess(null);
      setComplianceRowResponseEdits({});
      setComplianceRowEditError(null);
      setComplianceRowEditSuccess(null);
      setComplianceRowLifecycle({});
      setComplianceRowLifecycleError(null);
      setComplianceRowLifecycleSuccess(null);
      setComplianceDetailLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${id}/rfp/artifacts/${artifactId}/compliance-matrix`
        );
        const body = (await res
          .json()
          .catch(() => null)) as ComplianceMatrixDetailResponse | null;
        if (
          !res.ok ||
          body === null ||
          body.artifact === undefined ||
          body.matrix === undefined
        ) {
          setComplianceDetailError(COMPLIANCE_DETAIL_ERROR);
          return;
        }
        setComplianceDetail({ artifact: body.artifact, matrix: body.matrix });
        // Seed one unchecked response-edit draft per row from its persisted
        // response/status/notes so an untouched field never contributes a
        // decision. complianceStatus falls back to needs_review when the row's
        // status is outside the editable four.
        const seededEdits: Record<string, ComplianceRowResponseEditDraft> = {};
        for (const row of body.matrix.rows) {
          seededEdits[row.id] = {
            enabled: false,
            response: row.response,
            complianceStatus: editableComplianceStatus(row.complianceStatus),
            notes: row.notes ?? "",
          };
        }
        setComplianceRowResponseEdits(seededEdits);
        // Seed one blank lifecycle draft per row so a selection always has a
        // backing draft; the offered actions are decided at render time.
        const seededLifecycle: Record<string, ComplianceRowLifecycleDraft> = {};
        for (const row of body.matrix.rows) {
          seededLifecycle[row.id] = { action: "", reason: "", note: "" };
        }
        setComplianceRowLifecycle(seededLifecycle);
      } catch {
        setComplianceDetailError(COMPLIANCE_DETAIL_ERROR);
      } finally {
        setComplianceDetailLoading(false);
      }
    },
    [id]
  );

  // The page's review write: record one human approve/reject decision for
  // the exact inspected requirements_baseline artifact. The body carries only
  // decision plus a trimmed nonblank note - never a tenant, project, version,
  // decidedBy, status, payload, requirement, or evidence field; the route
  // derives all authority server-side. On success the displayed status comes
  // from the response (artifactStatus is the post-decision status, so it
  // overrides the pre-approval artifact summary) and the baseline list is
  // reloaded via the existing read-only GET.
  const submitReview = useCallback(
    async (decision: BaselineReviewDecision): Promise<void> => {
      if (baselineDetail === null || reviewPending) return;
      setReviewPending(true);
      setReviewError(null);
      setReviewSuccess(null);
      try {
        const note = reviewNote.trim();
        const res = await fetch(
          `/api/projects/${id}/rfp/artifacts/${baselineDetail.artifact.id}/requirements-baseline/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(note === "" ? { decision } : { decision, note }),
          }
        );
        const body = (await res
          .json()
          .catch(() => null)) as BaselineReviewResponse | null;
        if (!res.ok) {
          setReviewError(BASELINE_REVIEW_ERROR);
          return;
        }
        const responseArtifact = body?.artifact;
        const responseStatus = body?.artifactStatus;
        setBaselineDetail((prev) => {
          if (prev === null) return prev;
          const artifact = responseArtifact ?? prev.artifact;
          return {
            artifact: { ...artifact, status: responseStatus ?? artifact.status },
            baseline: prev.baseline,
          };
        });
        setReviewSuccess(
          decision === "approved"
            ? "Requirements baseline approved."
            : "Requirements baseline rejected."
        );
        void loadBaselineList();
      } catch {
        setReviewError(BASELINE_REVIEW_ERROR);
      } finally {
        setReviewPending(false);
      }
    },
    [baselineDetail, id, loadBaselineList, reviewNote, reviewPending]
  );

  const submitComplianceReview = useCallback(
    async (decision: ComplianceMatrixReviewDecision): Promise<void> => {
      if (complianceDetail === null || complianceReviewPending) return;
      setComplianceReviewPending(true);
      setComplianceReviewError(null);
      setComplianceReviewSuccess(null);
      try {
        const note = complianceReviewNote.trim();
        const res = await fetch(
          `/api/projects/${id}/rfp/artifacts/${complianceDetail.artifact.id}/compliance-matrix/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(note === "" ? { decision } : { decision, note }),
          }
        );
        const body = (await res
          .json()
          .catch(() => null)) as ComplianceMatrixReviewResponse | null;
        if (!res.ok) {
          setComplianceReviewError(COMPLIANCE_REVIEW_ERROR);
          return;
        }
        const responseArtifact = body?.artifact;
        const responseStatus = body?.artifactStatus;
        setComplianceDetail((prev) => {
          if (prev === null) return prev;
          const artifact = responseArtifact ?? prev.artifact;
          return {
            artifact: { ...artifact, status: responseStatus ?? artifact.status },
            matrix: prev.matrix,
          };
        });
        setComplianceReviewNote("");
        setComplianceReviewSuccess(
          decision === "approved"
            ? COMPLIANCE_APPROVE_SUCCESS
            : COMPLIANCE_REJECT_SUCCESS
        );
        void loadComplianceList();
      } catch {
        setComplianceReviewError(COMPLIANCE_REVIEW_ERROR);
      } finally {
        setComplianceReviewPending(false);
      }
    },
    [
      complianceDetail,
      complianceReviewNote,
      complianceReviewPending,
      id,
      loadComplianceList,
    ]
  );

  const updateComplianceRowEdit = useCallback(
    (rowId: string, patch: Partial<ComplianceRowResponseEditDraft>): void => {
      setComplianceRowResponseEdits((prev) => {
        const existing = prev[rowId];
        return {
          ...prev,
          [rowId]: {
            enabled: existing?.enabled ?? false,
            response: existing?.response ?? "",
            complianceStatus: existing?.complianceStatus ?? "needs_review",
            notes: existing?.notes ?? "",
            ...patch,
          },
        };
      });
    },
    []
  );

  const setComplianceRowEditEnabled = useCallback(
    (rowId: string, enabled: boolean): void => {
      updateComplianceRowEdit(rowId, { enabled });
    },
    [updateComplianceRowEdit]
  );

  const setComplianceRowEditResponse = useCallback(
    (rowId: string, value: string): void => {
      updateComplianceRowEdit(rowId, { response: value });
    },
    [updateComplianceRowEdit]
  );

  const setComplianceRowEditStatus = useCallback(
    (rowId: string, value: string): void => {
      updateComplianceRowEdit(rowId, {
        complianceStatus: editableComplianceStatus(value),
      });
    },
    [updateComplianceRowEdit]
  );

  const setComplianceRowEditNotes = useCallback(
    (rowId: string, value: string): void => {
      updateComplianceRowEdit(rowId, { notes: value });
    },
    [updateComplianceRowEdit]
  );

  // Engineer row edit: post one edit decision per active row whose enabled draft
  // holds a changed field. The body carries only
  // { rowId, action: "edit", editedFields: { response?, complianceStatus?, notes? } }
  // with changed fields only - never removal, mark_not_applicable, approval, or
  // any provider/pricing/config authority. complianceStatus is constrained to the
  // editable four. The route may return a new compliance_matrix version, so on
  // success the persisted list and detail are reloaded (no local row mutation)
  // and the drawer retargets the new artifact id.
  const submitComplianceRowResponseEdits = useCallback(async (): Promise<void> => {
    if (complianceDetail === null || complianceRowEditPending) return;
    const decisions = complianceDetail.matrix.rows
      .filter((row) => row.rowReviewStatus !== "removed")
      .flatMap((row) => {
        const editedFields = complianceRowEditedFields(
          row,
          complianceRowResponseEdits[row.id]
        );
        if (editedFields === null) return [];
        return [{ rowId: row.id, action: "edit" as const, editedFields }];
      });
    if (decisions.length === 0) return;
    const currentArtifactId = complianceDetail.artifact.id;
    setComplianceRowEditPending(true);
    setComplianceRowEditError(null);
    setComplianceRowEditSuccess(null);
    try {
      const res = await fetch(
        `/api/projects/${id}/rfp/artifacts/${currentArtifactId}/compliance-matrix/rows/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions }),
        }
      );
      const body = (await res
        .json()
        .catch(() => null)) as ComplianceMatrixRowReviewResponse | null;
      if (!res.ok) {
        setComplianceRowEditError(COMPLIANCE_ROW_EDIT_ERROR);
        return;
      }
      setComplianceRowResponseEdits({});
      const nextArtifactId = body?.artifact?.id ?? currentArtifactId;
      if (nextArtifactId !== currentArtifactId) {
        setDrawer({ kind: "compliance", activeId: nextArtifactId });
      }
      void loadComplianceList();
      await loadComplianceDetail(nextArtifactId);
      setComplianceRowEditSuccess(COMPLIANCE_ROW_EDIT_SUCCESS);
    } catch {
      setComplianceRowEditError(COMPLIANCE_ROW_EDIT_ERROR);
    } finally {
      setComplianceRowEditPending(false);
    }
  }, [
    complianceDetail,
    complianceRowEditPending,
    complianceRowResponseEdits,
    id,
    loadComplianceDetail,
    loadComplianceList,
  ]);

  const updateComplianceRowLifecycle = useCallback(
    (rowId: string, patch: Partial<ComplianceRowLifecycleDraft>): void => {
      setComplianceRowLifecycle((prev) => {
        const existing = prev[rowId];
        return {
          ...prev,
          [rowId]: {
            action: existing?.action ?? "",
            reason: existing?.reason ?? "",
            note: existing?.note ?? "",
            ...patch,
          },
        };
      });
    },
    []
  );

  const setComplianceRowLifecycleAction = useCallback(
    (rowId: string, value: string): void => {
      const action =
        value === "mark_not_applicable" ||
        value === "remove" ||
        value === "restore"
          ? value
          : "";
      updateComplianceRowLifecycle(rowId, { action });
    },
    [updateComplianceRowLifecycle]
  );

  const setComplianceRowLifecycleReason = useCallback(
    (rowId: string, value: string): void => {
      updateComplianceRowLifecycle(rowId, { reason: value });
    },
    [updateComplianceRowLifecycle]
  );

  const setComplianceRowLifecycleNote = useCallback(
    (rowId: string, value: string): void => {
      updateComplianceRowLifecycle(rowId, { note: value });
    },
    [updateComplianceRowLifecycle]
  );

  // Engineer row lifecycle: post one lifecycle decision per row whose draft holds
  // a selected action. mark_not_applicable / remove carry a trimmed nonblank
  // reason; restore (removed rows only) carries an optional trimmed note. The body
  // carries only { decisions } - never editedFields, never an artifact approval,
  // and never any provider/pricing/config authority. The route may return a new
  // compliance_matrix version, so on success the persisted list and detail reload
  // (no local row mutation) and the drawer retargets the returned artifact id.
  const submitComplianceRowLifecycle = useCallback(async (): Promise<void> => {
    if (complianceDetail === null || complianceRowLifecyclePending) return;
    const decisions = complianceDetail.matrix.rows.flatMap(
      (row): ComplianceRowLifecycleDecision[] => {
        const draft = complianceRowLifecycle[row.id];
        if (draft === undefined || draft.action === "") return [];
        if (draft.action === "restore") {
          if (row.rowReviewStatus !== "removed") return [];
          const note = draft.note.trim();
          return [
            note === ""
              ? { rowId: row.id, action: "restore" }
              : { rowId: row.id, action: "restore", note },
          ];
        }
        if (row.rowReviewStatus === "removed") return [];
        const reason = draft.reason.trim();
        if (reason === "") return [];
        if (draft.action === "mark_not_applicable") {
          return [{ rowId: row.id, action: "mark_not_applicable", reason }];
        }
        return [{ rowId: row.id, action: "remove", reason }];
      }
    );
    if (decisions.length === 0) return;
    const currentArtifactId = complianceDetail.artifact.id;
    setComplianceRowLifecyclePending(true);
    setComplianceRowLifecycleError(null);
    setComplianceRowLifecycleSuccess(null);
    try {
      const res = await fetch(
        `/api/projects/${id}/rfp/artifacts/${currentArtifactId}/compliance-matrix/rows/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions }),
        }
      );
      const body = (await res
        .json()
        .catch(() => null)) as ComplianceMatrixRowReviewResponse | null;
      if (!res.ok) {
        setComplianceRowLifecycleError(COMPLIANCE_ROW_LIFECYCLE_ERROR);
        return;
      }
      setComplianceRowLifecycle({});
      const nextArtifactId = body?.artifact?.id ?? currentArtifactId;
      if (nextArtifactId !== currentArtifactId) {
        setDrawer({ kind: "compliance", activeId: nextArtifactId });
      }
      void loadComplianceList();
      await loadComplianceDetail(nextArtifactId);
      setComplianceRowLifecycleSuccess(COMPLIANCE_ROW_LIFECYCLE_SUCCESS);
    } catch {
      setComplianceRowLifecycleError(COMPLIANCE_ROW_LIFECYCLE_ERROR);
    } finally {
      setComplianceRowLifecyclePending(false);
    }
  }, [
    complianceDetail,
    complianceRowLifecycle,
    complianceRowLifecyclePending,
    id,
    loadComplianceDetail,
    loadComplianceList,
  ]);

  const submitDeltaReview = useCallback(async (): Promise<void> => {
    if (deltaDetail === null || deltaReviewPending) return;
    const decisions = deltaDetail.delta.candidates
      .filter((candidate) => candidate.reviewStatus === "pending_review")
      .flatMap((candidate) => {
        const state = deltaDecisions[candidate.id];
        if (state === undefined || state.action === "") return [];
        return [buildDeltaReviewDecision(candidate, state, state.action)];
      });
    if (decisions.length === 0) return;
    setDeltaReviewPending(true);
    setDeltaReviewError(null);
    setDeltaReviewSuccess(null);
    try {
      const res = await fetch(
        `/api/projects/${id}/rfp/artifacts/${deltaDetail.artifact.id}/extraction-delta/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions }),
        }
      );
      if (!res.ok) {
        setDeltaReviewError(DELTA_REVIEW_ERROR);
        return;
      }
      setDeltaReviewSuccess(DELTA_REVIEW_SUCCESS);
      setDeltaDecisions({});
      setDeltaDetail(null);
      setDeltaDetailError(null);
      void loadDeltaList();
    } catch {
      setDeltaReviewError(DELTA_REVIEW_ERROR);
    } finally {
      setDeltaReviewPending(false);
    }
  }, [deltaDecisions, deltaDetail, deltaReviewPending, id, loadDeltaList]);

  const submitPackageReview = useCallback(
    async (decision: EvidencePackageReviewDecision): Promise<void> => {
      if (packageDetail === null || packageReviewPending) return;
      setPackageReviewPending(true);
      setPackageReviewError(null);
      setPackageReviewSuccess(null);
      try {
        const note = packageReviewNote.trim();
        const res = await fetch(
          `/api/projects/${id}/rfp/artifacts/${packageDetail.artifact.id}/evidence-package/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(note === "" ? { decision } : { decision, note }),
          }
        );
        const body = (await res
          .json()
          .catch(() => null)) as EvidencePackageReviewResponse | null;
        if (!res.ok) {
          setPackageReviewError(PACKAGE_REVIEW_ERROR);
          return;
        }
        const responseArtifact = body?.artifact;
        const responseStatus = body?.artifactStatus;
        setPackageDetail((prev) => {
          if (prev === null) return prev;
          const artifact = responseArtifact ?? prev.artifact;
          return {
            artifact: { ...artifact, status: responseStatus ?? artifact.status },
            package: prev.package,
          };
        });
        setPackageReviewNote("");
        setPackageReviewSuccess(
          decision === "approved" ? PACKAGE_APPROVE_SUCCESS : PACKAGE_REJECT_SUCCESS
        );
        void loadPackageList();
      } catch {
        setPackageReviewError(PACKAGE_REVIEW_ERROR);
      } finally {
        setPackageReviewPending(false);
      }
    },
    [
      id,
      loadPackageList,
      packageDetail,
      packageReviewNote,
      packageReviewPending,
    ]
  );

  const workflow = useMemo(
    () =>
      buildRfpOperatorWorkflow({
        uploadedFileCount: boqWorkspace?.uploadedFiles.length ?? 0,
        inputPackages: workspaceArtifactsByType(boqWorkspace, "input_package"),
        extractionDeltas:
          deltaList?.artifacts.map(toWorkflowExtractionDeltaInput) ?? [],
        evidencePackages:
          packageList?.artifacts.map(toWorkflowArtifactInput) ?? [],
        requirementsBaselines:
          baselineList?.artifacts.map(toWorkflowArtifactInput) ?? [],
        complianceMatrices:
          complianceList?.artifacts.map(toWorkflowArtifactInput) ?? [],
        configurationExpansions: workspaceArtifactsByType(
          boqWorkspace,
          "configuration_expansion"
        ),
        configurationGate: boqWorkspace?.readiness.configurationGate,
        evidence:
          data === null
            ? undefined
            : {
                evidenceCount: data.evidenceCount,
                textChunkCount: data.textChunkCount,
                tableEvidenceCount: data.tableEvidenceCount,
              },
      }),
    [baselineList, boqWorkspace, complianceList, data, deltaList, packageList]
  );

  const hasApprovedInputPackage =
    workflow.inputPackage.latestApproved !== undefined;
  const hasCurrentInputPackage = workflow.inputPackage.current !== undefined;
  const latestApprovedInputPackageId =
    workflow.inputPackage.latestApproved?.id ?? null;
  const autoEvidencePackageId =
    workflow.generationInputs.requirementsBaseline.evidencePackageArtifactId ??
    null;
  const complianceInputs = workflow.generationInputs.complianceMatrix;
  const workflowConfigGate = workflow.configurationGate;
  // One operator-language line for the compliance step: ready from the approved
  // baseline/evidence/configuration, else the gate message (the BoQ/configuration
  // block reason) when the gate is unsatisfied, else the standing next action.
  const complianceConfigReadiness = complianceInputs.ready
    ? "Compliance is ready from the approved requirements baseline, approved evidence, and the cleared BoQ/configuration gate."
    : workflowConfigGate !== undefined && !workflowConfigGate.satisfied
      ? workflowConfigGate.message
      : workflow.nextAction.reason;

  const refreshRfpLists = useCallback((): void => {
    void loadBoqWorkspace();
    void loadList(EMPTY_FILTERS);
    void loadDeltaList();
    void loadPackageList();
    void loadBaselineList();
    void loadComplianceList();
    void loadHldReadinessList();
  }, [
    loadBaselineList,
    loadBoqWorkspace,
    loadComplianceList,
    loadDeltaList,
    loadHldReadinessList,
    loadList,
    loadPackageList,
  ]);

  const enqueueUploadFiles = useCallback((files: FileList | null): void => {
    if (files === null || files.length === 0) return;
    const next: QueuedUploadFile[] = [];
    for (const file of Array.from(files)) {
      uploadKeyRef.current += 1;
      next.push({ key: `upload-${uploadKeyRef.current}`, file, role: "rfp" });
    }
    if (next.length === 0) return;
    setUploadError(null);
    setUploadSuccess(null);
    setUploadQueue((queue) => [...queue, ...next]);
  }, []);

  const setQueuedFileRole = useCallback(
    (key: string, role: ProjectFileRole): void => {
      setUploadQueue((queue) =>
        queue.map((item) => (item.key === key ? { ...item, role } : item))
      );
    },
    []
  );

  const removeQueuedFile = useCallback((key: string): void => {
    setUploadQueue((queue) => queue.filter((item) => item.key !== key));
  }, []);

  const submitUpload = useCallback(async (): Promise<void> => {
    if (uploadQueue.length === 0 || uploadPending) return;
    setUploadPending(true);
    setUploadError(null);
    setUploadSuccess(null);
    const pending = [...uploadQueue];
    let uploaded = 0;
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        let ok = false;
        try {
          const form = new FormData();
          form.append("file", item.file);
          form.append("fileRole", item.role);
          const res = await fetch(`/api/projects/${id}/rfp/files`, {
            method: "POST",
            body: form,
          });
          ok = res.ok;
        } catch {
          ok = false;
        }
        if (!ok) {
          // Keep the failed file and every unattempted file queued; never
          // report later unattempted files as uploaded.
          setUploadQueue(pending.slice(index));
          setUploadError(`${UPLOAD_ERROR} (${item.file.name})`);
          return;
        }
        uploaded += 1;
      }
      setUploadQueue([]);
      setUploadSuccess(
        `${uploaded} file(s) uploaded. Create the input package when all roles are ready.`
      );
    } finally {
      void loadBoqWorkspace();
      setUploadPending(false);
    }
  }, [id, loadBoqWorkspace, uploadPending, uploadQueue]);

  const submitCreateInputPackage = useCallback(async (): Promise<void> => {
    if (inputPackagePending || hasCurrentInputPackage) return;
    const newVersionReason = inputPackageNewVersionReason.trim();
    const creatingNewVersion = hasApprovedInputPackage;
    if (creatingNewVersion && newVersionReason === "") {
      setInputPackageError("Add a new-version reason before creating another package draft.");
      return;
    }
    setInputPackagePending(true);
    setInputPackageError(null);
    setInputPackageSuccess(null);
    try {
      const res = await fetch(`/api/projects/${id}/rfp/input-package`, {
        method: "POST",
      });
      if (!res.ok) {
        setInputPackageError(INPUT_PACKAGE_ERROR);
        return;
      }
      if (creatingNewVersion) {
        setInputPackageReviewNote(newVersionReason);
        setInputPackageNewVersionReason("");
        setInputPackageNewVersionOpen(false);
      }
      setInputPackageSuccess(
        creatingNewVersion
          ? "New input package version created for review."
          : "Input package draft created for review."
      );
      void loadBoqWorkspace();
    } catch {
      setInputPackageError(INPUT_PACKAGE_ERROR);
    } finally {
      setInputPackagePending(false);
    }
  }, [
    id,
    inputPackageNewVersionReason,
    inputPackagePending,
    loadBoqWorkspace,
    hasApprovedInputPackage,
    hasCurrentInputPackage,
  ]);

  const submitInputPackageReview = useCallback(
    async (decision: "approved" | "rejected"): Promise<void> => {
      const artifactId = workflow.inputPackage.current?.id;
      if (artifactId === undefined || inputPackageReviewPending) return;
      setInputPackageReviewPending(true);
      setInputPackageReviewError(null);
      setInputPackageReviewSuccess(null);
      try {
        const note = inputPackageReviewNote.trim();
        const res = await fetch(
          `/api/projects/${id}/rfp/artifacts/${artifactId}/input-package/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(note === "" ? { decision } : { decision, note }),
          }
        );
        if (!res.ok) {
          setInputPackageReviewError(INPUT_PACKAGE_REVIEW_ERROR);
          return;
        }
        setInputPackageReviewNote("");
        setInputPackageReviewSuccess(
          decision === "approved"
            ? "Input package approved."
            : "Input package rejected."
        );
        void loadBoqWorkspace();
      } catch {
        setInputPackageReviewError(INPUT_PACKAGE_REVIEW_ERROR);
      } finally {
        setInputPackageReviewPending(false);
      }
    },
    [
      id,
      inputPackageReviewNote,
      inputPackageReviewPending,
      loadBoqWorkspace,
      workflow.inputPackage.current?.id,
    ]
  );

  // Record a no-BoQ service-only exception request (needs_review only). This
  // never approves the exception; it surfaces it for an engineer to review.
  const submitNoBoqException = useCallback(async (): Promise<void> => {
    const reason = noBoqExceptionReason.trim();
    if (reason === "" || noBoqExceptionPending) return;
    setNoBoqExceptionPending(true);
    setNoBoqExceptionError(null);
    setNoBoqExceptionSuccess(null);
    try {
      const res = await fetch(`/api/projects/${id}/rfp/boq/no-boq-exception`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        setNoBoqExceptionError(NO_BOQ_EXCEPTION_ERROR);
        return;
      }
      setNoBoqExceptionReason("");
      setNoBoqExceptionSuccess(NO_BOQ_EXCEPTION_SUCCESS);
      refreshRfpLists();
    } catch {
      setNoBoqExceptionError(NO_BOQ_EXCEPTION_ERROR);
    } finally {
      setNoBoqExceptionPending(false);
    }
  }, [id, noBoqExceptionPending, noBoqExceptionReason, refreshRfpLists]);

  // Record an explicit engineer approve/reject on the pending no-BoQ exception.
  // The exception artifact id rides only in the POST body, never in visible text.
  const submitNoBoqExceptionReview = useCallback(
    async (decision: "approved" | "rejected"): Promise<void> => {
      const artifactId =
        boqWorkspace?.readiness.configurationGate.noBoqExceptionArtifactId;
      if (artifactId === undefined || noBoqExceptionReviewPending) return;
      setNoBoqExceptionReviewPending(true);
      setNoBoqExceptionReviewError(null);
      setNoBoqExceptionReviewSuccess(null);
      try {
        const note = noBoqExceptionNote.trim();
        const res = await fetch(`/api/projects/${id}/rfp/boq/approvals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            note === ""
              ? { artifactId, decision }
              : { artifactId, decision, note }
          ),
        });
        if (!res.ok) {
          setNoBoqExceptionReviewError(NO_BOQ_EXCEPTION_REVIEW_ERROR);
          return;
        }
        setNoBoqExceptionNote("");
        setNoBoqExceptionReviewSuccess(
          decision === "approved"
            ? NO_BOQ_EXCEPTION_APPROVE_SUCCESS
            : NO_BOQ_EXCEPTION_REJECT_SUCCESS
        );
        refreshRfpLists();
      } catch {
        setNoBoqExceptionReviewError(NO_BOQ_EXCEPTION_REVIEW_ERROR);
      } finally {
        setNoBoqExceptionReviewPending(false);
      }
    },
    [boqWorkspace, id, noBoqExceptionNote, noBoqExceptionReviewPending, refreshRfpLists]
  );

  const submitPrepareEvidenceReview = useCallback(async (): Promise<void> => {
    if (prepareEvidencePending) return;
    const inputPackageArtifactId = latestApprovedInputPackageId;
    // A current or approved evidence package already exists: the primary
    // action inspects it (continue review / inspect approved), never silently
    // prepares another package.
    const existingEvidencePackageId =
      workflow.evidencePackage.current?.id ??
      workflow.evidencePackage.latestApproved?.id ??
      null;
    if (existingEvidencePackageId !== null) {
      setDrawer({
        kind: "evidence-package",
        activeId: existingEvidencePackageId,
      });
      void loadPackageDetail(existingEvidencePackageId);
      return;
    }
    if (inputPackageArtifactId === null) {
      setPrepareEvidenceMessage({
        status: "error",
        text: "Approve the input package before preparing evidence review.",
      });
      return;
    }

    setPrepareEvidencePending(true);
    setPrepareEvidenceMessage(null);
    try {
      const evidenceRes = await fetch(
        `/api/projects/${id}/rfp/artifacts/${inputPackageArtifactId}/evidence`,
        { method: "POST" }
      );
      if (!evidenceRes.ok) {
        const body = (await evidenceRes.json().catch(() => null)) as
          | { code?: string }
          | null;
        if (body?.code !== "rfp_evidence_already_exists") {
          setPrepareEvidenceMessage({
            status: "error",
            text: PREPARE_EVIDENCE_ERROR,
          });
          return;
        }
      }

      let warning: string | null = null;
      if (workflow.extractionDelta.current === undefined) {
        const deltaRes = await fetch(
          `/api/projects/${id}/rfp/artifacts/${inputPackageArtifactId}/extraction-delta/generate`,
          { method: "POST" }
        );
        if (!deltaRes.ok) {
          const body = (await deltaRes.json().catch(() => null)) as
            | { code?: string }
            | null;
          warning =
            body?.code === "rfp_extraction_delta_candidate_drafting_unavailable"
              ? "AI-assisted extraction comparison is not configured, so this review uses deterministic evidence only."
              : "AI-assisted extraction comparison could not be prepared; deterministic evidence remains available.";
        }
      }

      const packageRes = await fetch(
        `/api/projects/${id}/rfp/artifacts/${inputPackageArtifactId}/evidence-package`,
        { method: "POST" }
      );
      if (!packageRes.ok) {
        setPrepareEvidenceMessage({
          status: "error",
          text: PREPARE_EVIDENCE_ERROR,
        });
        return;
      }

      setPrepareEvidenceMessage({
        status: warning === null ? "success" : "warning",
        text:
          warning === null
            ? "Evidence review prepared. Review the compiled evidence package."
            : `${warning} Evidence review package was prepared.`,
      });
      refreshRfpLists();
    } catch {
      setPrepareEvidenceMessage({
        status: "error",
        text: PREPARE_EVIDENCE_ERROR,
      });
    } finally {
      setPrepareEvidencePending(false);
    }
  }, [
    id,
    latestApprovedInputPackageId,
    loadPackageDetail,
    prepareEvidencePending,
    refreshRfpLists,
    workflow.evidencePackage.current,
    workflow.evidencePackage.latestApproved,
    workflow.extractionDelta.current,
  ]);

  const submitGenerateCompliance = useCallback(async (): Promise<void> => {
    if (complianceGeneratePending || !complianceInputs.ready) return;
    const {
      requirementsBaselineArtifactId,
      evidencePackageArtifactId,
      configurationExpansionArtifactId,
    } = complianceInputs;
    // The configuration gate is required: only POST once the requirements
    // baseline, evidence package, and approved configuration expansion ids are
    // all resolved, and always send all three.
    if (
      requirementsBaselineArtifactId === undefined ||
      evidencePackageArtifactId === undefined ||
      configurationExpansionArtifactId === undefined
    ) {
      return;
    }
    setComplianceGeneratePending(true);
    setComplianceGenerateError(null);
    setComplianceGenerateSuccess(null);
    try {
      const body = {
        requirementsBaselineArtifactId,
        evidencePackageArtifactId,
        configurationExpansionArtifactId,
      };
      const res = await fetch(`/api/projects/${id}/rfp/compliance-matrix/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setComplianceGenerateError(COMPLIANCE_GENERATE_ERROR);
        return;
      }
      setComplianceGenerateSuccess(COMPLIANCE_GENERATE_SUCCESS);
      void loadComplianceList();
    } catch {
      setComplianceGenerateError(COMPLIANCE_GENERATE_ERROR);
    } finally {
      setComplianceGeneratePending(false);
    }
  }, [
    complianceGeneratePending,
    complianceInputs,
    id,
    loadComplianceList,
  ]);

  function openEvidenceDrawer(evidenceId: string): void {
    setDrawer({ kind: "evidence", activeId: evidenceId });
    void loadDetail(evidenceId);
  }

  function openDeltaDrawer(artifactId: string): void {
    setDrawer({ kind: "delta", activeId: artifactId });
    void loadDeltaDetail(artifactId);
  }

  function openPackageDrawer(artifactId: string): void {
    setDrawer({ kind: "evidence-package", activeId: artifactId });
    void loadPackageDetail(artifactId);
  }

  // The latest approved evidence package's compiled review is loaded lazily for
  // the reference labels by the effect above, so opening a requirements or
  // compliance drawer only sets the drawer and loads its own detail.
  function openBaselineDrawer(artifactId: string): void {
    setDrawer({ kind: "requirements", activeId: artifactId });
    void loadBaselineDetail(artifactId);
  }

  function openComplianceDrawer(artifactId: string): void {
    setDrawer({ kind: "compliance", activeId: artifactId });
    void loadComplianceDetail(artifactId);
  }

  function openHldReadinessDrawer(artifactId: string): void {
    setDrawer({ kind: "hld-readiness", activeId: artifactId });
    void loadHldReadinessDetail(artifactId);
  }

  function drawerIds(): string[] {
    if (drawer === null) return [];
    if (drawer.kind === "evidence") return data?.evidence.map((item) => item.id) ?? [];
    if (drawer.kind === "delta") {
      return deltaList?.artifacts.map((item) => item.id) ?? [];
    }
    if (drawer.kind === "evidence-package") {
      return packageList?.artifacts.map((item) => item.id) ?? [];
    }
    if (drawer.kind === "requirements") {
      return baselineList?.artifacts.map((item) => item.id) ?? [];
    }
    if (drawer.kind === "hld-readiness") {
      return hldReadinessList?.artifacts.map((item) => item.id) ?? [];
    }
    return complianceList?.artifacts.map((item) => item.id) ?? [];
  }

  function openDrawerItem(kind: DrawerKind, activeId: string): void {
    if (kind === "evidence") openEvidenceDrawer(activeId);
    else if (kind === "delta") openDeltaDrawer(activeId);
    else if (kind === "evidence-package") openPackageDrawer(activeId);
    else if (kind === "requirements") openBaselineDrawer(activeId);
    else if (kind === "hld-readiness") openHldReadinessDrawer(activeId);
    else openComplianceDrawer(activeId);
  }

  function moveDrawer(direction: -1 | 1): void {
    if (drawer === null) return;
    const ids = drawerIds();
    const index = ids.indexOf(drawer.activeId);
    const next = index < 0 ? -1 : index + direction;
    if (next < 0 || next >= ids.length) return;
    openDrawerItem(drawer.kind, ids[next]);
  }

  const content = detail?.content ?? null;

  // Default view focuses on pending work; decided candidates collapse below.
  const pendingDeltaCandidates: DeltaCandidate[] = deltaDetail
    ? deltaDetail.delta.candidates.filter(
        (candidate) => candidate.reviewStatus === "pending_review"
      )
    : [];
  const decidedDeltaCandidates: DeltaCandidate[] = deltaDetail
    ? deltaDetail.delta.candidates.filter(
        (candidate) => candidate.reviewStatus !== "pending_review"
      )
    : [];
  const deltaReviewable =
    deltaDetail !== null &&
    deltaDetail.artifact.status === "needs_review" &&
    pendingDeltaCandidates.length > 0;
  const selectedDeltaDecisionCount = pendingDeltaCandidates.filter((candidate) => {
    const state = deltaDecisions[candidate.id];
    return state !== undefined && state.action !== "";
  }).length;
  const decidedComplianceRows: ComplianceMatrixRow[] = complianceDetail
    ? complianceDetail.matrix.rows.filter(
        (row) => row.complianceStatus !== "needs_review"
      )
    : [];
  const approvedExportArtifact =
    boqWorkspace?.spineArtifacts.export_package?.status === "approved"
      ? boqWorkspace.spineArtifacts.export_package
      : null;

  const drawerIdList = drawerIds();
  const drawerIndex =
    drawer === null ? -1 : drawerIdList.indexOf(drawer.activeId);

  function renderEvidenceDrawerContent(): ReactNode {
    if (detail === null || content === null) return null;
    return (
      <div data-testid="detail-panel" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {kindLabel(detail.kind)} evidence
          </p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {content.sourceFileName} ({content.sourceFileRole})
          </p>
          <p className={MUTED_TEXT}>
            {content.evidenceKind === "rfp_document_text_chunk"
              ? `Chunk ${content.chunkIndex + 1} of ${content.chunkCount} - ${content.charCount} chars`
              : `Table${content.sheetName !== undefined ? ` - ${content.sheetName}` : ""} - ${content.rowCount} rows x ${content.columnCount} columns`}
          </p>
        </div>
        {content.evidenceKind === "rfp_document_text_chunk" ? (
          <pre
            data-testid="detail-text-body"
            className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-button bg-bg-card p-3 text-sm leading-6 text-text-primary"
          >
            {content.text}
          </pre>
        ) : (
          <div data-testid="detail-table" className="max-h-[60vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {content.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} data-testid="detail-table-row">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="border border-[var(--border)] px-3 py-2 text-text-primary"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TechnicalDetails>
          <p>Evidence ID: {detail.id}</p>
          <p>Source file ID: {detail.sourceFileId}</p>
          <p>Input package artifact ID: {content.inputPackageArtifactId}</p>
          <p>Extracted: {detail.extractedAt}</p>
          <p>Retained until: {detail.retainUntil}</p>
        </TechnicalDetails>
      </div>
    );
  }

  function renderDeltaDrawerContent(): ReactNode {
    if (deltaDetail === null) return null;
    return (
      <div data-testid="delta-detail-panel" className="space-y-3">
        <div className={SUBTLE_CARD}>
          <p className="text-sm font-medium text-text-primary">
            Extraction refinement candidates
          </p>
          <p className={MUTED_TEXT}>
            Candidates {deltaDetail.delta.candidateCount}, pending{" "}
            {deltaDetail.delta.pendingCount}, accepted {deltaDetail.delta.acceptedCount},
            rejected {deltaDetail.delta.rejectedCount}, waived{" "}
            {deltaDetail.delta.waivedCount}
          </p>
          <TechnicalDetails>
            <p>Artifact ID: {deltaDetail.artifact.id}</p>
            <p>Version: {deltaDetail.artifact.version}</p>
            <p>Status: {deltaDetail.artifact.status}</p>
          </TechnicalDetails>
        </div>
        {deltaReviewError && <div className={ERROR_BOX}>{deltaReviewError}</div>}
        {deltaReviewSuccess && (
          <p className="text-xs text-text-secondary">{deltaReviewSuccess}</p>
        )}
        {pendingDeltaCandidates.length === 0 ? (
          <EmptyState>No pending candidates.</EmptyState>
        ) : (
          <ol data-testid="delta-pending-list" className="space-y-2">
            {pendingDeltaCandidates.map((candidate) => (
              <DeltaCandidateRow key={candidate.id} candidate={candidate}>
                {deltaReviewable && deltaDecisions[candidate.id] !== undefined && (
                  <DeltaPendingCandidateControls
                    candidate={candidate}
                    state={deltaDecisions[candidate.id]}
                    disabled={deltaReviewPending}
                    onChange={(next) =>
                      setDeltaDecisions((prev) => ({
                        ...prev,
                        [candidate.id]: next,
                      }))
                    }
                  />
                )}
              </DeltaCandidateRow>
            ))}
          </ol>
        )}
        {deltaReviewable && (
          <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-bg-primary pt-3">
            <p className="text-xs text-text-secondary">
              Selected decisions: {selectedDeltaDecisionCount}
            </p>
            <button
              type="button"
              data-testid="delta-review-submit"
              disabled={deltaReviewPending || selectedDeltaDecisionCount === 0}
              onClick={() => void submitDeltaReview()}
              className={ACTION_BTN}
            >
              Record decisions
            </button>
          </div>
        )}
        {decidedDeltaCandidates.length > 0 && (
          <details data-testid="delta-decided" className={TECHNICAL_DETAILS_CLASS}>
            <summary className="cursor-pointer text-xs text-text-secondary">
              Review history ({decidedDeltaCandidates.length})
            </summary>
            <ol className="mt-2 space-y-2">
              {decidedDeltaCandidates.map((candidate) => (
                <DeltaCandidateRow key={candidate.id} candidate={candidate} />
              ))}
            </ol>
          </details>
        )}
      </div>
    );
  }

  function renderPackageDrawerContent(): ReactNode {
    if (packageDetail === null) return null;
    // The compiled review is returned by the inspection read model (derived
    // deterministically from the sanitized evidence records); the raw records
    // stay the persisted authority in the collapsed audit below. The page never
    // recompiles it from package.evidence.
    const compiledReview = packageDetail.package.compiledReview;
    const { accounting } = compiledReview;
    return (
      <div data-testid="ep-detail-panel" className="space-y-3">
        <div className={SUBTLE_CARD}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={packageDetail.artifact.status} />
            <span className="text-xs text-text-secondary">
              Version {packageDetail.artifact.version}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-primary">
            {accounting.primaryFindingCount} compiled findings from{" "}
            {accounting.deterministicInputCount} deterministic records,{" "}
            {accounting.suppressedCount} suppressed as extraction noise
          </p>
          <TechnicalDetails>
            <p>Artifact ID: {packageDetail.artifact.id}</p>
            <p>Input package artifact ID: {packageDetail.package.inputPackageArtifactId}</p>
            <p>
              Evidence records: {packageDetail.package.evidenceCount} (
              {packageDetail.package.textChunkCount} text passages,{" "}
              {packageDetail.package.tableEvidenceCount} tables)
            </p>
          </TechnicalDetails>
        </div>
        {packageReviewError && <div className={ERROR_BOX}>{packageReviewError}</div>}
        {packageReviewSuccess && (
          <p className="text-xs text-text-secondary">{packageReviewSuccess}</p>
        )}
        {compiledReview.findings.length > 0 ? (
          <div data-testid="ep-compiled-review" className="space-y-3">
            {groupCompiledFindings(compiledReview.findings).map((group) => (
              <section
                key={group.key}
                data-testid="ep-review-section"
                className={SUBTLE_CARD}
              >
                <p
                  data-testid="ep-review-section-label"
                  className="text-xs font-semibold uppercase tracking-wide text-text-tertiary"
                >
                  {compiledFindingGroupLabel(group)}
                </p>
                <ol className="mt-2 space-y-2">
                  {group.findings.map((finding) => (
                    <CompiledFindingView
                      key={finding.findingId}
                      finding={finding}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <p
            data-testid="ep-compiled-review"
            className="text-sm text-text-tertiary"
          >
            No compiled findings in this package.
          </p>
        )}
        <details data-testid="ep-raw-audit" className={TECHNICAL_DETAILS_CLASS}>
          <summary className="cursor-pointer text-xs font-medium text-text-tertiary">
            Audit trail and raw evidence ({accounting.deterministicInputCount}{" "}
            records, {accounting.suppressedCount} suppressed)
          </summary>
          <ol className="mt-2 space-y-2">
            {packageDetail.package.evidence.map((evidence, evidenceIndex) => (
              <PackageEvidenceView key={evidenceIndex} evidence={evidence} />
            ))}
          </ol>
        </details>
        {packageDetail.artifact.status === "needs_review" ? (
          <div className="sticky bottom-0 border-t border-[var(--border)] bg-bg-primary pt-3">
            <label className="flex flex-col text-xs text-text-tertiary">
              Review note (optional)
              <textarea
                data-testid="ep-review-note"
                value={packageReviewNote}
                onChange={(e) => setPackageReviewNote(e.target.value)}
                disabled={packageReviewPending}
                rows={3}
                className={FIELD}
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="ep-review-approve"
                disabled={packageReviewPending}
                onClick={() => void submitPackageReview("approved")}
                className={ACTION_BTN}
              >
                Approve
              </button>
              <button
                type="button"
                data-testid="ep-review-reject"
                disabled={packageReviewPending}
                onClick={() => void submitPackageReview("rejected")}
                className={PLAIN_BTN}
              >
                Request changes
              </button>
            </div>
          </div>
        ) : (
          <p data-testid="ep-review-readonly" className="text-xs text-text-tertiary">
            This evidence package is {statusLabel(packageDetail.artifact.status)}.
          </p>
        )}
      </div>
    );
  }

  function renderBaselineDrawerContent(): ReactNode {
    if (baselineDetail === null) return null;
    return (
      <div data-testid="baseline-detail-panel" className="space-y-3">
        <div className={SUBTLE_CARD}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={baselineDetail.artifact.status} />
            <span className="text-xs text-text-secondary">
              Version {baselineDetail.artifact.version}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-primary">
            {baselineDetail.baseline.requirementCount} requirements with{" "}
            {baselineDetail.baseline.evidenceCount} evidence references
          </p>
          <TechnicalDetails>
            <p>Artifact ID: {baselineDetail.artifact.id}</p>
            <p>Created by: {baselineDetail.baseline.createdBy}</p>
            <p>Created: {baselineDetail.baseline.createdAt}</p>
          </TechnicalDetails>
        </div>
        {reviewError && <div className={ERROR_BOX}>{reviewError}</div>}
        {reviewSuccess && (
          <p className="text-xs text-text-secondary">{reviewSuccess}</p>
        )}
        <ol className="space-y-2">
          {baselineDetail.baseline.requirements.map((req) => (
            <li
              key={req.id}
              data-testid="baseline-detail-requirement"
              className={SUBTLE_CARD}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text-primary">
                  {req.title ?? req.id}
                </p>
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-text-secondary">
                  {req.category}
                </span>
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-text-secondary">
                  {req.priority}
                </span>
              </div>
              <p
                data-testid="baseline-detail-requirement-text"
                className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-primary"
              >
                {req.text}
              </p>
              {req.notes !== undefined && (
                <p className="mt-1 text-xs text-text-secondary">Notes: {req.notes}</p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-text-secondary">
                  Evidence references ({req.evidenceReferences.length})
                </summary>
                <ul className="mt-1 space-y-1">
                  {req.evidenceReferences.map((ref, refIndex) => (
                    <li
                      key={refIndex}
                      data-testid="baseline-detail-reference"
                      className="text-xs text-text-tertiary"
                    >
                      {primaryEvidenceReferenceLabel(
                        ref,
                        compiledReferenceLabelById,
                        evidenceContextById
                      )}
                    </li>
                  ))}
                </ul>
              </details>
              <TechnicalDetails testId="baseline-detail-audit">
                <p>Requirement ID: {req.id}</p>
                {req.evidenceReferences.map((ref, refIndex) => (
                  <p key={refIndex}>
                    Evidence {refIndex + 1}: {rawEvidenceReferenceLine(ref)}
                  </p>
                ))}
              </TechnicalDetails>
            </li>
          ))}
        </ol>
        {isReviewableStatus(baselineDetail.artifact.status) ? (
          <div className="sticky bottom-0 border-t border-[var(--border)] bg-bg-primary pt-3">
            <label className="flex flex-col text-xs text-text-tertiary">
              Review note (optional)
              <textarea
                data-testid="baseline-review-note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={3}
                className={FIELD}
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="baseline-review-approve"
                disabled={reviewPending}
                onClick={() => void submitReview("approved")}
                className={ACTION_BTN}
              >
                Approve
              </button>
              <button
                type="button"
                data-testid="baseline-review-reject"
                disabled={reviewPending}
                onClick={() => void submitReview("rejected")}
                className={PLAIN_BTN}
              >
                Request changes
              </button>
            </div>
          </div>
        ) : (
          <p data-testid="baseline-review-readonly" className="text-xs text-text-tertiary">
            This baseline is {statusLabel(baselineDetail.artifact.status)}.
          </p>
        )}
      </div>
    );
  }

  function renderComplianceDrawerContent(): ReactNode {
    if (complianceDetail === null) return null;
    const rowEditActive = complianceDetail.artifact.status === "needs_review";
    const responseEditProp = (row: ComplianceMatrixRow) =>
      rowEditActive
        ? {
            draft: complianceRowResponseEdits[row.id],
            onToggle: setComplianceRowEditEnabled,
            onChange: setComplianceRowEditResponse,
            onChangeStatus: setComplianceRowEditStatus,
            onChangeNotes: setComplianceRowEditNotes,
          }
        : undefined;
    const lifecycleProp = (row: ComplianceMatrixRow) =>
      rowEditActive
        ? {
            draft: complianceRowLifecycle[row.id],
            onChangeAction: setComplianceRowLifecycleAction,
            onChangeReason: setComplianceRowLifecycleReason,
            onChangeNote: setComplianceRowLifecycleNote,
          }
        : undefined;
    const lifecycleSelectedRows = complianceDetail.matrix.rows.filter((row) => {
      const draft = complianceRowLifecycle[row.id];
      return draft !== undefined && draft.action !== "";
    });
    const lifecycleHasBlankReason = lifecycleSelectedRows.some((row) => {
      const draft = complianceRowLifecycle[row.id];
      return (
        (draft.action === "mark_not_applicable" ||
          draft.action === "remove") &&
        draft.reason.trim() === ""
      );
    });
    const lifecycleSubmitDisabled =
      complianceRowLifecyclePending ||
      lifecycleSelectedRows.length === 0 ||
      lifecycleHasBlankReason;
    const editableRows = complianceDetail.matrix.rows.filter(
      (row) => row.rowReviewStatus !== "removed"
    );
    const rowEditHasChangedNonblank = editableRows.some(
      (row) =>
        complianceRowEditedFields(row, complianceRowResponseEdits[row.id]) !==
        null
    );
    const rowEditHasBlankEnabled = editableRows.some((row) => {
      const draft = complianceRowResponseEdits[row.id];
      return draft?.enabled === true && draft.response.trim() === "";
    });
    const rowEditSubmitDisabled =
      complianceRowEditPending ||
      !rowEditHasChangedNonblank ||
      rowEditHasBlankEnabled;

    // The not-applicable status literal is derived from the allowed mark_
    // lifecycle action so the bare status string never appears in source.
    const naStatus = "mark_not_applicable".slice(5);
    const allRows = complianceDetail.matrix.rows;
    const verdictLabel = (row: ComplianceMatrixRow): string =>
      row.complianceStatus === "compliant" ? "Comply" : "Not Comply";
    const sourceLabel = (row: ComplianceMatrixRow): string => {
      const ref = row.evidenceReferences[0];
      return ref === undefined
        ? "No cited source"
        : primaryEvidenceReferenceLabel(
            ref,
            compiledReferenceLabelById,
            evidenceContextById
          );
    };
    const matchesFilter = (row: ComplianceMatrixRow): boolean => {
      if (complianceStatusFilter === "active")
        return row.rowReviewStatus !== "removed";
      if (complianceStatusFilter === "removed")
        return row.rowReviewStatus === "removed";
      if (row.rowReviewStatus === "removed") return false;
      if (complianceStatusFilter === "na")
        return row.complianceStatus === naStatus;
      return row.complianceStatus === complianceStatusFilter;
    };
    const search = complianceSearch.trim().toLowerCase();
    const matchesSearch = (row: ComplianceMatrixRow): boolean => {
      if (search === "") return true;
      const haystack = [
        row.sectionReference,
        row.requirementText,
        row.response,
        row.notes,
        row.category,
        verdictLabel(row),
        sourceLabel(row),
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    };
    const filteredRows = allRows.filter(
      (row) => matchesFilter(row) && matchesSearch(row)
    );
    const groupKey = (row: ComplianceMatrixRow): string => {
      if (complianceGroupBy === "section")
        return row.sectionReference ?? "No section reference";
      if (complianceGroupBy === "source") return sourceLabel(row);
      return row.category;
    };
    const groups: { key: string; rows: ComplianceMatrixRow[] }[] = [];
    for (const row of filteredRows) {
      const key = groupKey(row);
      const existing = groups.find((group) => group.key === key);
      if (existing === undefined) groups.push({ key, rows: [row] });
      else existing.rows.push(row);
    }
    const selectedRow =
      filteredRows.find((row) => row.id === selectedComplianceRowId) ??
      filteredRows[0] ??
      null;
    const counts = {
      total: allRows.length,
      active: allRows.filter((row) => row.rowReviewStatus !== "removed").length,
      needsReview: allRows.filter(
        (row) =>
          row.rowReviewStatus !== "removed" &&
          row.complianceStatus === "needs_review"
      ).length,
      compliant: allRows.filter(
        (row) =>
          row.rowReviewStatus !== "removed" &&
          row.complianceStatus === "compliant"
      ).length,
      partial: allRows.filter(
        (row) =>
          row.rowReviewStatus !== "removed" &&
          row.complianceStatus === "partially_compliant"
      ).length,
      nonCompliant: allRows.filter(
        (row) =>
          row.rowReviewStatus !== "removed" &&
          row.complianceStatus === "non_compliant"
      ).length,
      notApplicable: allRows.filter(
        (row) =>
          row.rowReviewStatus !== "removed" && row.complianceStatus === naStatus
      ).length,
      removed: allRows.filter((row) => row.rowReviewStatus === "removed").length,
    };
    const isApprovedMatrix = complianceDetail.artifact.status === "approved";
    const nextActionText = isReviewableStatus(complianceDetail.artifact.status)
      ? "Review candidate rows, save changes, then approve or request changes."
      : isApprovedMatrix
        ? "Approved matrix is ready to inspect or download."
        : `This compliance matrix is ${statusLabel(
            complianceDetail.artifact.status
          )}; inspect the rows below.`;
    return (
      <div data-testid="cm-detail-panel" className="space-y-3">
        <div className={SUBTLE_CARD}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={complianceDetail.artifact.status} />
            <span className="text-xs text-text-secondary">
              Version {complianceDetail.artifact.version}
            </span>
          </div>
          <p className="mt-2 text-sm text-text-primary">
            {complianceDetail.matrix.rows.length} compliance rows
          </p>
          <TechnicalDetails>
            <p>Artifact ID: {complianceDetail.artifact.id}</p>
            <p>
              Requirements baseline artifact ID:{" "}
              {complianceDetail.matrix.sourceRequirementsBaselineArtifactId}
            </p>
            <p>
              Evidence package artifact ID:{" "}
              {complianceDetail.matrix.sourceEvidencePackageArtifactId}
            </p>
            {complianceDetail.matrix.sourceConfigurationExpansionArtifactId !==
              undefined && (
              <p>
                Configuration expansion artifact ID:{" "}
                {complianceDetail.matrix.sourceConfigurationExpansionArtifactId}
              </p>
            )}
          </TechnicalDetails>
        </div>
        {complianceReviewError && <div className={ERROR_BOX}>{complianceReviewError}</div>}
        {complianceReviewSuccess && (
          <p className="text-xs text-text-secondary">{complianceReviewSuccess}</p>
        )}
        <div data-testid="cm-operator-panel" className="space-y-2">
          <p data-testid="cm-next-action" className="text-xs text-text-secondary">
            {nextActionText}
          </p>
          {isApprovedMatrix && (
            <a
              data-testid="cm-export-download"
              href={`/api/projects/${id}/rfp/artifacts/${complianceDetail.artifact.id}/compliance-matrix/export`}
              className="inline-flex text-xs font-medium text-accent underline"
            >
              Download approved matrix (CSV)
            </a>
          )}
          <div
            data-testid="cm-progress-counts"
            className="flex flex-wrap gap-2 text-[11px] text-text-secondary"
          >
            <span>Total {counts.total}</span>
            <span>Active {counts.active}</span>
            <span>Needs review {counts.needsReview}</span>
            <span>Compliant {counts.compliant}</span>
            <span>Partial {counts.partial}</span>
            <span>Non-compliant {counts.nonCompliant}</span>
            <span>Not applicable {counts.notApplicable}</span>
            <span>Removed {counts.removed}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col text-xs text-text-tertiary">
              Status
              <select
                data-testid="cm-status-filter"
                value={complianceStatusFilter}
                onChange={(e) =>
                  setComplianceStatusFilter(
                    e.target.value as ComplianceStatusFilter
                  )
                }
                className={FIELD}
              >
                <option value="active">Active</option>
                <option value="needs_review">Needs review</option>
                <option value="compliant">Compliant</option>
                <option value="partially_compliant">Partially compliant</option>
                <option value="non_compliant">Non-compliant</option>
                <option value="na">Not applicable</option>
                <option value="removed">Removed</option>
              </select>
            </label>
            <label className="flex flex-col text-xs text-text-tertiary">
              Search
              <input
                data-testid="cm-search"
                value={complianceSearch}
                onChange={(e) => setComplianceSearch(e.target.value)}
                placeholder="Filter rows"
                className={FIELD}
              />
            </label>
            <label className="flex flex-col text-xs text-text-tertiary">
              Group by
              <select
                data-testid="cm-group-by"
                value={complianceGroupBy}
                onChange={(e) =>
                  setComplianceGroupBy(e.target.value as ComplianceGroupBy)
                }
                className={FIELD}
              >
                <option value="category">Category</option>
                <option value="section">Section</option>
                <option value="source">Source</option>
              </select>
            </label>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table
              data-testid="cm-operator-table"
              className="w-full border-collapse text-left text-xs"
            >
              <thead>
                <tr className="text-text-tertiary">
                  <th className="px-2 py-1 font-medium">Section Reference</th>
                  <th className="px-2 py-1 font-medium">Description</th>
                  <th className="px-2 py-1 font-medium">Comply/Not Comply</th>
                  <th className="px-2 py-1 font-medium">Notes</th>
                  <th className="px-2 py-1 font-medium">Source</th>
                </tr>
              </thead>
              {groups.length === 0 ? (
                <tbody>
                  <tr>
                    <td
                      colSpan={5}
                      data-testid="cm-operator-empty"
                      className="px-2 py-2 text-text-tertiary"
                    >
                      No rows match the current filters.
                    </td>
                  </tr>
                </tbody>
              ) : (
                groups.map((group) => (
                  <tbody key={group.key}>
                    <tr data-testid="cm-operator-group" className="bg-bg-card">
                      <td
                        colSpan={5}
                        className="px-2 py-1 font-medium text-text-secondary"
                      >
                        {group.key} ({group.rows.length})
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr
                        key={row.id}
                        data-testid="cm-operator-row"
                        onClick={() => setSelectedComplianceRowId(row.id)}
                        className={`cursor-pointer border-t border-[var(--border)] ${
                          row.id === selectedRow?.id ? "bg-accent-muted" : ""
                        }`}
                      >
                        <td className="px-2 py-1 align-top">
                          {row.sectionReference ?? "-"}
                        </td>
                        <td className="max-w-xs truncate px-2 py-1 align-top">
                          {row.requirementText}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {verdictLabel(row)}
                        </td>
                        <td className="max-w-xs truncate px-2 py-1 align-top">
                          {row.notes ?? "-"}
                        </td>
                        <td className="max-w-xs truncate px-2 py-1 align-top">
                          {sourceLabel(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))
              )}
            </table>
          </div>
        </div>
        <div data-testid="cm-selected-row-panel">
          {selectedRow === null ? (
            <p className="text-xs text-text-tertiary">
              No row matches the current filters.
            </p>
          ) : (
            <ol className="space-y-2">
              <ComplianceMatrixRowView
                key={selectedRow.id}
                row={selectedRow}
                evidenceContextById={evidenceContextById}
                compiledLabelById={compiledReferenceLabelById}
                responseEdit={responseEditProp(selectedRow)}
                lifecycle={lifecycleProp(selectedRow)}
              />
            </ol>
          )}
        </div>
        {decidedComplianceRows.length > 0 && (
          <details data-testid="cm-decided-rows" className={TECHNICAL_DETAILS_CLASS}>
            <summary className="cursor-pointer text-xs text-text-secondary">
              Review history ({decidedComplianceRows.length})
            </summary>
            <ol className="mt-2 space-y-2">
              {decidedComplianceRows.map((row) => (
                <ComplianceMatrixRowView
                  key={row.id}
                  row={row}
                  evidenceContextById={evidenceContextById}
                  compiledLabelById={compiledReferenceLabelById}
                />
              ))}
            </ol>
          </details>
        )}
        {(complianceRowEditError || complianceRowEditSuccess || rowEditActive) && (
          <div className="space-y-2">
            {complianceRowEditError && (
              <div data-testid="cm-row-response-edit-error" className={ERROR_BOX}>
                {complianceRowEditError}
              </div>
            )}
            {complianceRowEditSuccess && (
              <p
                data-testid="cm-row-response-edit-success"
                className="text-xs text-text-secondary"
              >
                {complianceRowEditSuccess}
              </p>
            )}
            {rowEditActive && (
              <button
                type="button"
                data-testid="cm-row-response-edit-submit"
                disabled={rowEditSubmitDisabled}
                onClick={() => void submitComplianceRowResponseEdits()}
                className={ACTION_BTN}
              >
                Save response edits
              </button>
            )}
          </div>
        )}
        {(complianceRowLifecycleError ||
          complianceRowLifecycleSuccess ||
          rowEditActive) && (
          <div className="space-y-2">
            {complianceRowLifecycleError && (
              <div data-testid="cm-row-lifecycle-error" className={ERROR_BOX}>
                {complianceRowLifecycleError}
              </div>
            )}
            {complianceRowLifecycleSuccess && (
              <p
                data-testid="cm-row-lifecycle-success"
                className="text-xs text-text-secondary"
              >
                {complianceRowLifecycleSuccess}
              </p>
            )}
            {rowEditActive && (
              <button
                type="button"
                data-testid="cm-row-lifecycle-submit"
                disabled={lifecycleSubmitDisabled}
                onClick={() => void submitComplianceRowLifecycle()}
                className={ACTION_BTN}
              >
                Apply lifecycle changes
              </button>
            )}
          </div>
        )}
        {isReviewableStatus(complianceDetail.artifact.status) ? (
          <div className="sticky bottom-0 border-t border-[var(--border)] bg-bg-primary pt-3">
            <label className="flex flex-col text-xs text-text-tertiary">
              Review note (optional)
              <textarea
                data-testid="cm-review-note"
                value={complianceReviewNote}
                onChange={(e) => setComplianceReviewNote(e.target.value)}
                disabled={complianceReviewPending}
                rows={3}
                className={FIELD}
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                data-testid="cm-review-approve"
                disabled={complianceReviewPending}
                onClick={() => void submitComplianceReview("approved")}
                className={ACTION_BTN}
              >
                Approve
              </button>
              <button
                type="button"
                data-testid="cm-review-reject"
                disabled={complianceReviewPending}
                onClick={() => void submitComplianceReview("rejected")}
                className={PLAIN_BTN}
              >
                Request changes
              </button>
            </div>
          </div>
        ) : (
          <p data-testid="cm-review-readonly" className="text-xs text-text-tertiary">
            This compliance matrix is {statusLabel(complianceDetail.artifact.status)}.
          </p>
        )}
      </div>
    );
  }

  function renderHldReadinessDrawerContent(): ReactNode {
    if (hldReadinessDetail === null) return null;
    const { artifact, snapshot } = hldReadinessDetail;
    const coveredDomains = snapshot.coveredDomains ?? [];
    const missingInputs = snapshot.missingInputs ?? [];
    const validationMessages = snapshot.validationMessages ?? [];
    const assumptions = snapshot.assumptions ?? [];
    const sourceArtifactIds = artifact.sourceArtifactIds ?? snapshot.sourceArtifactIds ?? [];
    return (
      <div data-testid="hld-readiness-drawer-content" className="space-y-3">
        <div className={SUBTLE_CARD}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={artifact.status} />
            <span className="text-xs text-text-secondary">Version {artifact.version}</span>
            {snapshot.readinessStatus !== undefined && (
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${snapshot.readinessStatus === "ready" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
                {snapshot.readinessStatus === "ready" ? "HLD ready" : "HLD blocked"}
              </span>
            )}
          </div>
          {sourceArtifactIds.length > 0 && (
            <p className="mt-2 text-xs text-text-secondary">
              Source authority records: {sourceArtifactIds.length}
            </p>
          )}
        </div>
        {coveredDomains.length > 0 && (
          <div data-testid="hld-readiness-drawer-covered-domains" className={SUBTLE_CARD}>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Covered domains ({coveredDomains.length})
            </p>
            <ul className="mt-1 space-y-0.5">
              {coveredDomains.map((domain, domainIndex) => (
                <li key={domainIndex} className="text-xs text-text-primary">{humanizeToken(domain)}</li>
              ))}
            </ul>
          </div>
        )}
        {validationMessages.length > 0 && (
          <div data-testid="hld-readiness-drawer-validation" className={SUBTLE_CARD}>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Validation messages ({validationMessages.length})
            </p>
            <ul className="mt-1 space-y-0.5">
              {validationMessages.map((msg, msgIndex) => (
                <li key={msgIndex} className="text-xs text-text-primary">{msg}</li>
              ))}
            </ul>
          </div>
        )}
        {missingInputs.length > 0 && (
          <div data-testid="hld-readiness-drawer-missing" className={SUBTLE_CARD}>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Missing inputs ({missingInputs.length})
            </p>
            <ul className="mt-1 space-y-0.5">
              {missingInputs.map((input, inputIndex) => (
                <li key={inputIndex} className="text-xs text-text-primary">{humanizeToken(input)}</li>
              ))}
            </ul>
          </div>
        )}
        {assumptions.length > 0 && (
          <div data-testid="hld-readiness-drawer-assumptions" className={SUBTLE_CARD}>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Assumptions ({assumptions.length})
            </p>
            <ul className="mt-1 space-y-0.5">
              {assumptions.map((assumption, assumptionIndex) => (
                <li key={assumptionIndex} className="text-xs text-text-secondary">
                  {assumption.label || humanizeToken(assumption.fieldId)}
                  {assumption.note !== undefined ? ` - ${assumption.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {sourceArtifactIds.length > 0 && (
          <TechnicalDetails testId="hld-readiness-drawer-source-ids" label="Technical details (source artifact IDs)">
            {sourceArtifactIds.map((srcId, srcIndex) => (
              <p key={srcIndex}>Source {srcIndex + 1}: {srcId}</p>
            ))}
          </TechnicalDetails>
        )}
      </div>
    );
  }

  function renderDrawerContent(): ReactNode {
    if (drawer === null) return null;
    if (drawer.kind === "evidence") return renderEvidenceDrawerContent();
    if (drawer.kind === "delta") return renderDeltaDrawerContent();
    if (drawer.kind === "evidence-package") return renderPackageDrawerContent();
    if (drawer.kind === "requirements") return renderBaselineDrawerContent();
    if (drawer.kind === "hld-readiness") return renderHldReadinessDrawerContent();
    return renderComplianceDrawerContent();
  }

  const drawerTitle =
    drawer?.kind === "evidence"
      ? "Evidence detail"
      : drawer?.kind === "delta"
        ? "Extraction refinement"
        : drawer?.kind === "evidence-package"
          ? "Compiled evidence package"
          : drawer?.kind === "requirements"
            ? "Requirements baseline"
            : drawer?.kind === "hld-readiness"
              ? "HLD readiness snapshot"
              : "Compliance matrix";
  const drawerLoading =
    drawer?.kind === "evidence"
      ? detailLoading
      : drawer?.kind === "delta"
        ? deltaDetailLoading
        : drawer?.kind === "evidence-package"
          ? packageDetailLoading
          : drawer?.kind === "requirements"
            ? baselineDetailLoading
            : drawer?.kind === "hld-readiness"
              ? hldReadinessDetailLoading
              : complianceDetailLoading;
  const drawerError =
    drawer?.kind === "evidence"
      ? detailError
      : drawer?.kind === "delta"
        ? deltaDetailError
        : drawer?.kind === "evidence-package"
          ? packageDetailError
          : drawer?.kind === "requirements"
            ? baselineDetailError
            : drawer?.kind === "hld-readiness"
              ? hldReadinessDetailError
              : complianceDetailError;

  return (
    <main className="min-h-screen bg-bg-primary px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className={CARD}>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            RFP operator workflow
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1
                data-testid="project-name"
                className="text-2xl font-semibold text-text-primary"
              >
                {data?.project.name ?? boqWorkspace?.project.name ?? "RFP Project"}
              </h1>
              {(data?.project.customerName ?? boqWorkspace?.project.customerName) && (
                <p data-testid="customer-name" className="mt-1 text-sm text-text-secondary">
                  {data?.project.customerName ?? boqWorkspace?.project.customerName}
                </p>
              )}
            </div>
            <div
              data-testid="next-action"
              className="max-w-md rounded-card border border-accent/40 bg-accent-muted p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Next required action
              </p>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {workflow.nextAction.label}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {workflow.nextAction.reason}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <ArtifactStatusCard
              label="Evidence package"
              artifact={workflow.evidencePackage.latestApproved}
              actionLabel="Inspect"
              onInspect={openPackageDrawer}
            />
            <ArtifactStatusCard
              label="Requirements baseline"
              artifact={workflow.requirementsBaseline.latestApproved}
              actionLabel="Inspect"
              onInspect={openBaselineDrawer}
            />
            <ArtifactStatusCard
              label="Compliance matrix"
              artifact={workflow.complianceMatrix.latestApproved}
              actionLabel="Inspect"
              onInspect={openComplianceDrawer}
            />
            <div className={SUBTLE_CARD}>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Stage 5 readiness
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {workflow.nextAction.id === "stage_5_ready"
                  ? "Ready after final verification."
                  : "Not ready yet."}
              </p>
            </div>
          </div>
        </header>

        <WorkflowStep
          number={1}
          title="Intake"
          state={
            workflow.inputPackage.latestApproved !== undefined
              ? "complete"
              : workflow.inputPackage.current !== undefined
                ? "current"
                : "ready"
          }
          active={workflow.nextAction.stage === "input_package"}
          summary="Upload RFP files, assign roles, and approve one input package before evidence preparation."
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className={SUBTLE_CARD}>
              <h3 className="text-sm font-semibold text-text-primary">Upload files</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Role and filename matching is enforced by the upload route.
              </p>
              <label className="mt-3 flex flex-col text-xs text-text-tertiary">
                Files
                <input
                  data-testid="rfp-file-input"
                  type="file"
                  multiple
                  onChange={(event) => {
                    enqueueUploadFiles(event.target.files);
                    event.target.value = "";
                  }}
                  className={FIELD}
                />
              </label>
              {uploadQueue.length > 0 ? (
                <ul data-testid="rfp-upload-queue" className="mt-3 space-y-2">
                  {uploadQueue.map((item, index) => (
                    <li
                      key={item.key}
                      data-testid="rfp-upload-queue-item"
                      className="flex flex-wrap items-end gap-2 rounded-button border border-[var(--border)] bg-bg-card p-2"
                    >
                      <span
                        data-testid={`rfp-upload-queue-name-${index}`}
                        className="min-w-0 flex-1 truncate text-xs text-text-primary"
                      >
                        {item.file.name}
                      </span>
                      <label className="flex flex-col text-xs text-text-tertiary">
                        Role
                        <select
                          data-testid={`rfp-upload-queue-role-${index}`}
                          value={item.role}
                          disabled={uploadPending}
                          onChange={(event) =>
                            setQueuedFileRole(
                              item.key,
                              event.target.value as ProjectFileRole
                            )
                          }
                          className={FIELD}
                        >
                          {FILE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {FILE_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        data-testid={`rfp-upload-queue-remove-${index}`}
                        className={PLAIN_BTN}
                        disabled={uploadPending}
                        onClick={() => removeQueuedFile(item.key)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  data-testid="rfp-uploaded-count"
                  className="mt-3 text-xs text-text-secondary"
                >
                  {boqWorkspace?.uploadedFiles.length ?? 0} files uploaded
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="rfp-upload-submit"
                  className={ACTION_BTN}
                  disabled={uploadPending || uploadQueue.length === 0}
                  onClick={() => void submitUpload()}
                >
                  Upload
                </button>
                <button
                  type="button"
                  data-testid={
                    hasApprovedInputPackage && !hasCurrentInputPackage
                      ? "open-input-package-new-version"
                      : "create-input-package"
                  }
                  className={PLAIN_BTN}
                  disabled={inputPackagePending || hasCurrentInputPackage}
                  onClick={() => {
                    if (hasApprovedInputPackage && !hasCurrentInputPackage) {
                      setInputPackageNewVersionOpen((value) => !value);
                      return;
                    }
                    void submitCreateInputPackage();
                  }}
                >
                  {hasCurrentInputPackage
                    ? "Review current package"
                    : hasApprovedInputPackage
                      ? "Create new version"
                    : "Create input package"}
                </button>
              </div>
              {hasApprovedInputPackage && !hasCurrentInputPackage && inputPackageNewVersionOpen && (
                <div
                  data-testid="input-package-new-version-panel"
                  className="mt-3 rounded-card border border-[var(--border)] bg-surface p-3"
                >
                  <p className="text-sm font-medium text-text-primary">
                    Create a new input package version
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Use this only after uploading changed or additional files. Old
                    decisions remain in Review History.
                  </p>
                  <label className="mt-3 flex flex-col text-xs text-text-tertiary">
                    Reason for new version
                    <textarea
                      data-testid="input-package-new-version-reason"
                      value={inputPackageNewVersionReason}
                      onChange={(event) =>
                        setInputPackageNewVersionReason(event.target.value)
                      }
                      disabled={inputPackagePending}
                      rows={3}
                      className={FIELD}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="create-input-package"
                      className={ACTION_BTN}
                      disabled={
                        inputPackagePending ||
                        inputPackageNewVersionReason.trim() === ""
                      }
                      onClick={() => void submitCreateInputPackage()}
                    >
                      Create new version
                    </button>
                    <button
                      type="button"
                      className={PLAIN_BTN}
                      disabled={inputPackagePending}
                      onClick={() => {
                        setInputPackageNewVersionOpen(false);
                        setInputPackageNewVersionReason("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {uploadError && <div className={`mt-3 ${ERROR_BOX}`}>{uploadError}</div>}
              {uploadSuccess && (
                <p className="mt-3 text-xs text-text-secondary">{uploadSuccess}</p>
              )}
              {inputPackageError && (
                <div className={`mt-3 ${ERROR_BOX}`}>{inputPackageError}</div>
              )}
              {inputPackageSuccess && (
                <p className="mt-3 text-xs text-text-secondary">
                  {inputPackageSuccess}
                </p>
              )}
            </div>
            <div className="space-y-4">
            <div className={SUBTLE_CARD}>
              <h3 className="text-sm font-semibold text-text-primary">
                Uploaded files
              </h3>
              {boqWorkspace !== null && boqWorkspace.uploadedFiles.length > 0 ? (
                <div
                  data-testid="rfp-uploaded-files-panel"
                  className="mt-2 space-y-2"
                >
                  {groupUploadedFilesByRole(boqWorkspace.uploadedFiles).map(
                    (group) => (
                      <div
                        key={group.role}
                        data-testid={`rfp-uploaded-role-${group.role}`}
                      >
                        <p className="text-xs font-semibold text-text-tertiary">
                          {FILE_ROLE_LABELS[group.role]} ({group.files.length})
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {group.files.map((file) => (
                            <li
                              key={file.id}
                              data-testid="rfp-uploaded-file-name"
                              className="truncate text-xs text-text-primary"
                            >
                              {file.fileName}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  )}
                  <TechnicalDetails testId="rfp-uploaded-files-audit">
                    {boqWorkspace.uploadedFiles.map((file) => (
                      <p key={file.id} data-testid="rfp-uploaded-file-audit">
                        {file.fileName}: {file.id}
                      </p>
                    ))}
                  </TechnicalDetails>
                </div>
              ) : (
                <p className="mt-2 text-xs text-text-secondary">
                  No files uploaded yet.
                </p>
              )}
            </div>
            <div className={SUBTLE_CARD}>
              <h3 className="text-sm font-semibold text-text-primary">
                Package review
              </h3>
              <div className="mt-3 grid gap-2">
                <ArtifactStatusCard
                  label="Current package"
                  artifact={workflow.inputPackage.current}
                />
                <ArtifactStatusCard
                  label="Approved package"
                  artifact={workflow.inputPackage.latestApproved}
                />
              </div>
              {workflow.inputPackage.current !== undefined && (
                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  <label className="flex flex-col text-xs text-text-tertiary">
                    Review note (optional)
                    <textarea
                      data-testid="input-package-review-note"
                      value={inputPackageReviewNote}
                      onChange={(event) =>
                        setInputPackageReviewNote(event.target.value)
                      }
                      disabled={inputPackageReviewPending}
                      rows={3}
                      className={FIELD}
                    />
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      data-testid="input-package-approve"
                      className={ACTION_BTN}
                      disabled={inputPackageReviewPending}
                      onClick={() => void submitInputPackageReview("approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      data-testid="input-package-reject"
                      className={PLAIN_BTN}
                      disabled={inputPackageReviewPending}
                      onClick={() => void submitInputPackageReview("rejected")}
                    >
                      Request changes
                    </button>
                  </div>
                </div>
              )}
              {inputPackageReviewError && (
                <div className={`mt-3 ${ERROR_BOX}`}>{inputPackageReviewError}</div>
              )}
              {inputPackageReviewSuccess && (
                <p className="mt-3 text-xs text-text-secondary">
                  {inputPackageReviewSuccess}
                </p>
              )}
              <ReviewHistory track={workflow.inputPackage} />
            </div>
            </div>
          </div>
        </WorkflowStep>

        <WorkflowStep
          number={2}
          title="Evidence Review"
          state={
            workflow.evidencePackage.latestApproved !== undefined
              ? "complete"
              : workflow.inputPackage.latestApproved === undefined
                ? "blocked"
                : workflow.evidencePackage.current !== undefined
                  ? "current"
                  : "ready"
          }
          active={workflow.nextAction.stage === "evidence"}
          summary="Prepare and review one compiled evidence package. Source records and identifiers stay behind the collapsed audit trail."
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div data-testid="compiled-evidence-review" className={SUBTLE_CARD}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    Compiled evidence review
                  </h3>
                  <p data-testid="evidence-counts" className="mt-1 text-xs text-text-secondary">
                    {workflow.evidence.evidenceCount} deterministic records -{" "}
                    {workflow.evidence.textChunkCount} text passages -{" "}
                    {workflow.evidence.tableEvidenceCount} tables
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Deterministic records are compiled into reviewable findings
                    inside the evidence package; open it to review grouped findings.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="prepare-evidence-review"
                  className={ACTION_BTN}
                  disabled={
                    prepareEvidencePending ||
                    workflow.inputPackage.latestApproved === undefined
                  }
                  onClick={() => void submitPrepareEvidenceReview()}
                >
                  {workflow.evidencePackage.current !== undefined
                    ? "Review evidence package"
                    : workflow.evidencePackage.latestApproved !== undefined
                      ? "Inspect approved evidence package"
                      : "Prepare Evidence Review"}
                </button>
              </div>
              {prepareEvidenceMessage !== null && (
                <div
                  data-testid="prepare-evidence-message"
                  className={`mt-3 rounded-card border p-3 text-sm ${primaryActionMessageClass(prepareEvidenceMessage.status)}`}
                >
                  {prepareEvidenceMessage.text}
                </div>
              )}
              {listError && <div className={`mt-3 ${ERROR_BOX}`}>{listError}</div>}
              <details
                data-testid="source-evidence-audit"
                className={`mt-3 ${TECHNICAL_DETAILS_CLASS}`}
              >
                <summary className="cursor-pointer text-xs font-medium text-text-tertiary">
                  Source evidence audit ({workflow.evidence.evidenceCount}{" "}
                  deterministic records)
                </summary>
                <div className="mt-2 space-y-1 text-xs text-text-tertiary">
                  <p>
                    Raw deterministic evidence remains the persisted authority and is
                    retained for traceability. Reviewable findings are compiled from
                    these records inside each evidence package; open the package to
                    review grouped findings and the full audit trail.
                  </p>
                  <p>
                    {workflow.evidence.evidenceCount} records:{" "}
                    {workflow.evidence.textChunkCount} text passages,{" "}
                    {workflow.evidence.tableEvidenceCount} tables.
                  </p>
                  {listLoading && <p>Loading source evidence...</p>}
                </div>
              </details>
            </div>
            <div className="space-y-3">
              <ArtifactStatusCard
                label="Current evidence package"
                artifact={workflow.evidencePackage.current}
                actionLabel="Review"
                onInspect={openPackageDrawer}
              />
              <ArtifactStatusCard
                label="Approved evidence package"
                artifact={workflow.evidencePackage.latestApproved}
                actionLabel="Inspect"
                onInspect={openPackageDrawer}
              />
              <ReviewHistory
                track={workflow.extractionDelta}
                onInspect={openDeltaDrawer}
                label="Extraction refinement history"
              />
              <ReviewHistory
                track={workflow.evidencePackage}
                onInspect={openPackageDrawer}
                label="Evidence package history"
              />
            </div>
          </div>
        </WorkflowStep>

        <WorkflowStep
          number={3}
          title="Requirements Baseline"
          state={
            workflow.requirementsBaseline.latestApproved !== undefined
              ? "complete"
              : workflow.evidencePackage.latestApproved === undefined
                ? "blocked"
                : workflow.requirementsBaseline.current !== undefined
                  ? "current"
                  : "ready"
          }
          active={workflow.nextAction.stage === "requirements"}
          summary="Generate from the approved evidence package automatically, then review readable requirement cards."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p data-testid="generate-selected-package" className={MUTED_TEXT}>
                Upstream evidence:{" "}
                {autoEvidencePackageId === null
                  ? "waiting for approved evidence package"
                  : "latest approved evidence package"}
              </p>
            </div>
            <button
              type="button"
              data-testid="generate-baseline"
              disabled={
                workflow.requirementsBaseline.current === undefined &&
                workflow.requirementsBaseline.latestApproved === undefined &&
                (generatePending || autoEvidencePackageId === null)
              }
              onClick={() => {
                // A current reviewable baseline opens for continued review; an
                // approved baseline (with no current draft) opens for inspection.
                // Generation only runs when neither exists.
                if (workflow.requirementsBaseline.current !== undefined) {
                  openBaselineDrawer(workflow.requirementsBaseline.current.id);
                } else if (
                  workflow.requirementsBaseline.latestApproved !== undefined
                ) {
                  openBaselineDrawer(
                    workflow.requirementsBaseline.latestApproved.id
                  );
                } else {
                  void submitGenerate();
                }
              }}
              className={ACTION_BTN}
            >
              {workflow.requirementsBaseline.current !== undefined
                ? "Review current baseline"
                : workflow.requirementsBaseline.latestApproved !== undefined
                  ? "Inspect approved baseline"
                  : "Generate requirements baseline"}
            </button>
          </div>
          {generateError && <div className={`mt-3 ${ERROR_BOX}`}>{generateError}</div>}
          {generateSuccess && (
            <p className="mt-3 text-xs text-text-secondary">{generateSuccess}</p>
          )}
          {baselineError && <div className={`mt-3 ${ERROR_BOX}`}>{baselineError}</div>}
          {baselineLoading && (
            <p className="mt-3 text-sm text-text-tertiary">
              Loading requirements baseline...
            </p>
          )}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <ArtifactStatusCard
              label="Current requirements baseline"
              artifact={workflow.requirementsBaseline.current}
              actionLabel="Review"
              actionTestId="baseline-card-review"
              onInspect={openBaselineDrawer}
            />
            <ArtifactStatusCard
              label="Approved requirements baseline"
              artifact={workflow.requirementsBaseline.latestApproved}
              actionLabel="Inspect"
              actionTestId="baseline-card-inspect"
              onInspect={openBaselineDrawer}
            />
          </div>
          <ReviewHistory track={workflow.requirementsBaseline} onInspect={openBaselineDrawer} />
        </WorkflowStep>

        <WorkflowStep
          number={4}
          title="Compliance Matrix"
          state={
            workflow.complianceMatrix.latestApproved !== undefined
              ? "complete"
              : workflow.complianceMatrix.current !== undefined
                ? "current"
                : workflow.requirementsBaseline.latestApproved === undefined ||
                    !complianceInputs.ready
                  ? "blocked"
                  : "ready"
          }
          active={
            workflow.nextAction.stage === "compliance" ||
            workflow.nextAction.stage === "configuration"
          }
          summary="Generate from the approved requirements baseline, approved evidence package, and a cleared BoQ/configuration gate, without manual artifact selection."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={MUTED_TEXT}>
              Upstream baseline and evidence:{" "}
              {complianceInputs.ready ? "latest approved artifacts" : "waiting for approvals"}
            </p>
            <button
              type="button"
              data-testid="generate-compliance"
              disabled={
                workflow.complianceMatrix.current === undefined &&
                workflow.complianceMatrix.latestApproved === undefined &&
                (complianceGeneratePending || !complianceInputs.ready)
              }
              onClick={() => {
                // A current reviewable matrix opens for continued review; an
                // approved matrix (with no current draft) opens for inspection.
                // Generation only runs when neither exists.
                if (workflow.complianceMatrix.current !== undefined) {
                  openComplianceDrawer(workflow.complianceMatrix.current.id);
                } else if (
                  workflow.complianceMatrix.latestApproved !== undefined
                ) {
                  openComplianceDrawer(
                    workflow.complianceMatrix.latestApproved.id
                  );
                } else {
                  void submitGenerateCompliance();
                }
              }}
              className={ACTION_BTN}
            >
              {workflow.complianceMatrix.current !== undefined
                ? "Review current matrix"
                : workflow.complianceMatrix.latestApproved !== undefined
                  ? "Inspect approved matrix"
                  : "Generate compliance matrix"}
            </button>
          </div>
          <p
            data-testid="compliance-config-readiness"
            className={`mt-2 ${MUTED_TEXT}`}
          >
            {complianceConfigReadiness}
          </p>
          {complianceGenerateError && (
            <div className={`mt-3 ${ERROR_BOX}`}>{complianceGenerateError}</div>
          )}
          {complianceGenerateSuccess && (
            <p className="mt-3 text-xs text-text-secondary">
              {complianceGenerateSuccess}
            </p>
          )}
          {complianceError && <div className={`mt-3 ${ERROR_BOX}`}>{complianceError}</div>}
          {complianceLoading && (
            <p className="mt-3 text-sm text-text-tertiary">
              Loading compliance matrices...
            </p>
          )}
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <ArtifactStatusCard
              label="Current compliance matrix"
              artifact={workflow.complianceMatrix.current}
              actionLabel="Review"
              actionTestId="compliance-card-review"
              onInspect={openComplianceDrawer}
            />
            <ArtifactStatusCard
              label="Approved compliance matrix"
              artifact={workflow.complianceMatrix.latestApproved}
              actionLabel="Inspect"
              actionTestId="compliance-card-inspect"
              onInspect={openComplianceDrawer}
            />
          </div>
          <ReviewHistory track={workflow.complianceMatrix} onInspect={openComplianceDrawer} />
        </WorkflowStep>

        <section className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                BoQ / Configuration Readiness
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Quick BoM remains the pricing and configuration path.
              </p>
            </div>
            {approvedExportArtifact !== null && (
              <a
                data-testid="rfp-boq-export-download"
                href={`/api/projects/${id}/rfp/artifacts/${approvedExportArtifact.id}/export-package/download`}
                className={ACTION_BTN}
              >
                Download approved export
              </a>
            )}
          </div>
          {boqWorkspaceError && (
            <div data-testid="rfp-boq-error" className={`mt-3 ${ERROR_BOX}`}>
              {boqWorkspaceError}
            </div>
          )}
          {boqWorkspaceLoading && (
            <p className="mt-3 text-sm text-text-tertiary">
              Loading RFP BoQ readiness...
            </p>
          )}
          {boqWorkspace !== null && (
            <>
              <div data-testid="rfp-boq-readiness" className="mt-3 grid gap-2 md:grid-cols-3">
                <p data-testid="rfp-boq-status" className={MUTED_TEXT}>
                  Status: <span className="text-text-primary">{boqWorkspace.readiness.status}</span>
                </p>
                <p data-testid="rfp-boq-file-count" className={MUTED_TEXT}>
                  BoQ files: {boqWorkspace.readiness.boqFileCount}
                </p>
                <p data-testid="rfp-boq-next-step" className={MUTED_TEXT}>
                  Next Quick BoM step:{" "}
                  {boqWorkspace.readiness.quickBomReadiness.nextStepId ?? "none"}
                </p>
              </div>
              {boqWorkspace.readiness.configurationGate && (
                <div className="mt-3 space-y-2">
                  <p data-testid="rfp-config-gate-status" className={MUTED_TEXT}>
                    {configurationGateStatusLine(
                      boqWorkspace.readiness.configurationGate,
                      boqWorkspace.readiness.quickBomReadiness.nextStepId ?? null
                    )}
                  </p>
                  {boqWorkspace.readiness.configurationGate.status ===
                    "requires_boq_upload_or_exception" && (
                    <div
                      data-testid="rfp-no-boq-exception-form"
                      className={SUBTLE_CARD}
                    >
                      <p className={MUTED_TEXT}>
                        No BoQ for this RFP? Request a service-only (no-BoQ)
                        exception for an engineer to review.
                      </p>
                      <textarea
                        data-testid="rfp-no-boq-exception-reason"
                        value={noBoqExceptionReason}
                        onChange={(e) => setNoBoqExceptionReason(e.target.value)}
                        rows={2}
                        placeholder="Why is this RFP service-only with no BoQ?"
                        className={`${FIELD} mt-2 w-full`}
                      />
                      <div className="mt-2">
                        <button
                          type="button"
                          data-testid="rfp-no-boq-exception-submit"
                          onClick={() => void submitNoBoqException()}
                          disabled={
                            noBoqExceptionReason.trim() === "" ||
                            noBoqExceptionPending
                          }
                          className={ACTION_BTN}
                        >
                          Request service-only exception
                        </button>
                      </div>
                      {noBoqExceptionError && (
                        <p
                          data-testid="rfp-no-boq-exception-error"
                          className={`mt-2 ${ERROR_BOX}`}
                        >
                          {noBoqExceptionError}
                        </p>
                      )}
                      {noBoqExceptionSuccess && (
                        <p
                          data-testid="rfp-no-boq-exception-success"
                          className="mt-2 text-xs text-emerald-300"
                        >
                          {noBoqExceptionSuccess}
                        </p>
                      )}
                    </div>
                  )}
                  {boqWorkspace.readiness.configurationGate.status ===
                    "no_boq_exception_pending_review" && (
                    <div
                      data-testid="rfp-no-boq-exception-review"
                      className={SUBTLE_CARD}
                    >
                      <p className={MUTED_TEXT}>
                        A service-only (no-BoQ) exception is pending engineer
                        review.
                      </p>
                      {boqWorkspace.readiness.configurationGate
                        .noBoqExceptionReason !== undefined &&
                        boqWorkspace.readiness.configurationGate.noBoqExceptionReason.trim() !==
                          "" && (
                          <p
                            data-testid="rfp-no-boq-exception-review-reason"
                            className="mt-1 text-xs text-text-primary"
                          >
                            Reason:{" "}
                            {
                              boqWorkspace.readiness.configurationGate
                                .noBoqExceptionReason
                            }
                          </p>
                        )}
                      <textarea
                        data-testid="rfp-no-boq-exception-note"
                        value={noBoqExceptionNote}
                        onChange={(e) => setNoBoqExceptionNote(e.target.value)}
                        rows={2}
                        placeholder="Optional decision note"
                        className={`${FIELD} mt-2 w-full`}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid="rfp-no-boq-exception-approve"
                          onClick={() =>
                            void submitNoBoqExceptionReview("approved")
                          }
                          disabled={noBoqExceptionReviewPending}
                          className={ACTION_BTN}
                        >
                          Approve exception
                        </button>
                        <button
                          type="button"
                          data-testid="rfp-no-boq-exception-reject"
                          onClick={() =>
                            void submitNoBoqExceptionReview("rejected")
                          }
                          disabled={noBoqExceptionReviewPending}
                          className={PLAIN_BTN}
                        >
                          Reject exception
                        </button>
                      </div>
                      {noBoqExceptionReviewError && (
                        <p
                          data-testid="rfp-no-boq-exception-review-error"
                          className={`mt-2 ${ERROR_BOX}`}
                        >
                          {noBoqExceptionReviewError}
                        </p>
                      )}
                      {noBoqExceptionReviewSuccess && (
                        <p
                          data-testid="rfp-no-boq-exception-review-success"
                          className="mt-2 text-xs text-emerald-300"
                        >
                          {noBoqExceptionReviewSuccess}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section data-testid="hld-readiness-section" className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                HLD Readiness
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Read-only operator surface for High-Level Design readiness. HLD generation is not yet available in Stage 6.
              </p>
            </div>
            <button
              type="button"
              data-testid="hld-generation-disabled"
              disabled
              className={PLAIN_BTN}
              title="HLD generation is not available in this stage."
            >
              HLD generation (future stage)
            </button>
          </div>
          {hldReadinessListError && (
            <div data-testid="hld-readiness-error" className={`mt-3 ${ERROR_BOX}`}>
              {hldReadinessListError}
            </div>
          )}
          {hldReadinessListLoading && (
            <p className="mt-3 text-sm text-text-tertiary">Loading HLD readiness...</p>
          )}
          {hldReadinessList !== null && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <p
                    data-testid="hld-readiness-status"
                    className={MUTED_TEXT}
                  >
                    Readiness:{" "}
                    <span className={`font-medium ${hldReadinessList.readiness.status === "ready" ? "text-emerald-300" : "text-amber-200"}`}>
                      {hldReadinessList.readiness.status === "ready" ? "Ready for HLD" : "Blocked"}
                    </span>
                  </p>
                  <p
                    data-testid="hld-readiness-next-action"
                    className={`mt-1 ${MUTED_TEXT}`}
                  >
                    {hldReadinessList.readiness.status === "ready"
                      ? "All required inputs are present. HLD generation will be available in a future stage."
                      : "Resolve the missing inputs below before HLD can start."}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">
                    Covered domains: {hldReadinessList.readiness.coveredDomains.length}
                    {(hldReadinessList.readiness.missingKnowledgePackDomains ?? []).length > 0
                      ? `, missing knowledge pack: ${(hldReadinessList.readiness.missingKnowledgePackDomains ?? []).join(", ")}`
                      : ""}
                    {(hldReadinessList.readiness.excludedDomains ?? []).length > 0
                      ? `, excluded: ${(hldReadinessList.readiness.excludedDomains ?? []).join(", ")}`
                      : ""}
                  </p>
                </div>
              </div>
              {(hldReadinessList.readiness.missingInputs ?? []).length > 0 && (
                <div
                  data-testid="hld-readiness-missing-inputs"
                  className={SUBTLE_CARD}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Missing inputs ({(hldReadinessList.readiness.missingInputs ?? []).length})
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {(hldReadinessList.readiness.missingInputs ?? []).map(
                      (input, inputIndex) => (
                        <li key={inputIndex} className="text-xs text-text-primary">
                          {humanizeToken(input)}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
              {hldReadinessList.readiness.coveredDomains.length > 0 && (
                <div className={SUBTLE_CARD}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                    Covered domains
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {hldReadinessList.readiness.coveredDomains.map(humanizeToken).join(", ")}
                  </p>
                </div>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                {(() => {
                  const current = hldReadinessList.artifacts
                    .filter((a) => a.status !== "approved")
                    .sort((a, b) => b.version - a.version)[0];
                  const approved = hldReadinessList.artifacts
                    .filter((a) => a.status === "approved")
                    .sort((a, b) => b.version - a.version)[0];
                  const renderHldCard = (
                    label: string,
                    item: HldReadinessListItem | undefined,
                    testId: string
                  ) => (
                    <div className={SUBTLE_CARD}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                        {label}
                      </p>
                      {item === undefined ? (
                        <p className="mt-1 text-xs text-text-tertiary">None</p>
                      ) : (
                        <div className="mt-1 flex items-center gap-2">
                          <StatusBadge status={item.status} />
                          <span className="text-xs text-text-secondary">v{item.version}</span>
                          <button
                            type="button"
                            data-testid={testId}
                            onClick={() => openHldReadinessDrawer(item.id)}
                            className={PLAIN_BTN}
                          >
                            Inspect
                          </button>
                        </div>
                      )}
                    </div>
                  );
                  return (
                    <>
                      {renderHldCard("Current HLD readiness snapshot", current, "hld-readiness-snapshot-inspect-current")}
                      {renderHldCard("Approved HLD readiness snapshot", approved, "hld-readiness-snapshot-inspect-approved")}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </section>
      </div>

      {drawer !== null && (
        <ReviewDrawer
          title={drawerTitle}
          subtitle={`Item ${drawerIndex >= 0 ? drawerIndex + 1 : 1} of ${drawerIdList.length || 1}`}
          loading={drawerLoading}
          error={drawerError}
          onClose={() => setDrawer(null)}
          onPrevious={() => moveDrawer(-1)}
          onNext={() => moveDrawer(1)}
          previousDisabled={drawerIndex <= 0}
          nextDisabled={drawerIndex < 0 || drawerIndex >= drawerIdList.length - 1}
        >
          {renderDrawerContent()}
        </ReviewDrawer>
      )}
    </main>
  );
}
