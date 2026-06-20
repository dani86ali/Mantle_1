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

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  compileCompiledEvidenceReview,
  type CompiledEvidenceFinding,
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

type ComplianceMatrixReviewDecision = "approved" | "rejected";
type ComplianceMatrixRow = RfpComplianceMatrixInspectionMatrix["rows"][number];
type ComplianceMatrixEvidenceReference =
  ComplianceMatrixRow["evidenceReferences"][number];
type ComplianceMatrixConfigurationReference = NonNullable<
  ComplianceMatrixRow["configurationReferences"]
>[number];

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
  | "compliance";

interface DrawerState {
  kind: DrawerKind;
  activeId: string;
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

function idList(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function displayId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function statusLabel(status: ProjectArtifactStatus): string {
  return status.replaceAll("_", " ");
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

/** One-line locator summary for one evidence reference; never content. */
function referenceLine(ref: BaselineEvidenceReference): string {
  if (ref.evidenceKind === "rfp_document_table") {
    const page = ref.pageNumber !== undefined ? ` | page ${ref.pageNumber}` : "";
    const sheet = ref.sheetName !== undefined ? ` | sheet ${ref.sheetName}` : "";
    return `table ${ref.tableId}${page}${sheet} | ${ref.rowCount} rows x ${ref.columnCount} cols`;
  }
  return `chunk ${ref.chunkIndex + 1}/${ref.chunkCount} | ${ref.charCount} chars`;
}

/** One-line locator summary for one compliance evidence reference. */
function complianceReferenceLine(
  ref: ComplianceMatrixEvidenceReference
): string {
  if (ref.evidenceKind === "rfp_document_table") {
    const page = ref.pageNumber !== undefined ? ` | page ${ref.pageNumber}` : "";
    const sheet = ref.sheetName !== undefined ? ` | sheet ${ref.sheetName}` : "";
    return `table ${ref.tableId}${page}${sheet} | ${ref.rowCount} rows x ${ref.columnCount} cols`;
  }
  return `chunk ${ref.chunkIndex + 1}/${ref.chunkCount} | ${ref.charCount} chars`;
}

function complianceStatusCounts(
  item: RfpComplianceMatrixInspectionListItem
): string {
  const counts = item.payloadSummary.statusCounts;
  return [
    `pending ${counts.needs_review}`,
    `compliant ${counts.compliant}`,
    `partial ${counts.partially_compliant}`,
    `non-compliant ${counts.non_compliant}`,
    `not applicable ${counts.not_applicable}`,
  ].join(" | ");
}

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
 * show the fresh row matrix. Both carry their proposal-side metadata.
 */
function DeltaProposedEvidenceView({
  proposed,
}: {
  proposed: DeltaProposedEvidence;
}) {
  if (proposed.evidenceKind === "rfp_document_text_chunk") {
    return (
      <div data-testid="delta-proposed-text">
        <p className="mt-1 text-xs text-text-secondary">
          text proposal
          {proposed.sourceFileName !== undefined ? ` | ${proposed.sourceFileName}` : ""}
          {proposed.sourceFileRole !== undefined ? ` (${proposed.sourceFileRole})` : ""}
          {proposed.chunkIndex !== undefined && proposed.chunkCount !== undefined
            ? ` | chunk ${proposed.chunkIndex + 1}/${proposed.chunkCount}`
            : ""}
          {proposed.charCount !== undefined ? ` | ${proposed.charCount} chars` : ""}
        </p>
        <pre
          data-testid="delta-proposed-text-body"
          className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-button bg-bg-card p-2 text-xs text-text-primary"
        >
          {proposed.text}
        </pre>
      </div>
    );
  }
  return (
    <div data-testid="delta-proposed-table">
      <p className="mt-1 text-xs text-text-secondary">
        table proposal
        {proposed.tableId !== undefined ? ` ${proposed.tableId}` : ""}
        {proposed.sheetName !== undefined ? ` | sheet ${proposed.sheetName}` : ""}
        {proposed.pageNumber !== undefined ? ` | page ${proposed.pageNumber}` : ""}
        {proposed.rowCount !== undefined && proposed.columnCount !== undefined
          ? ` | ${proposed.rowCount} rows x ${proposed.columnCount} cols`
          : ""}
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
    </div>
  );
}

/**
 * One delta candidate: identity/display fields, the source file, locator-only
 * evidence references, the proposed evidence (expandable, proposal-only), and
 * the engineer review history (expandable). Reused for pending and decided
 * candidates; the caller collapses the decided group.
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
      <p className="text-xs font-medium text-text-primary">
        <span className="font-mono">{candidate.id}</span> | {candidate.kind} |{" "}
        {candidate.severity} | {candidate.reviewStatus}
        {candidate.confidence !== undefined
          ? ` | confidence ${candidate.confidence}`
          : ""}
      </p>
      <p className="text-xs font-medium text-text-primary">{candidate.title}</p>
      <p className="mt-1 whitespace-pre-wrap text-xs text-text-primary">
        {candidate.description}
      </p>
      {candidate.rationale !== undefined && (
        <p className="mt-1 text-xs text-text-secondary">
          Rationale: {candidate.rationale}
        </p>
      )}
      <p className="text-xs text-text-tertiary">
        source file <span className="font-mono">{candidate.sourceFileId}</span>
      </p>
      {candidate.evidenceReferences.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {candidate.evidenceReferences.map((ref, refIndex) => (
            <li
              key={refIndex}
              data-testid="delta-reference"
              className="text-xs text-text-tertiary"
            >
              <span className="font-mono">{ref.evidenceId}</span> |{" "}
              {kindLabel(ref.evidenceKind)} | {deltaReferenceLine(ref)} | file{" "}
              <span className="font-mono">{ref.sourceFileId}</span> | package{" "}
              <span className="font-mono">{ref.inputPackageArtifactId}</span>
            </li>
          ))}
        </ul>
      )}
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

/** Human label for one finding citation: document/passage/page/sheet/table. */
function citationLine(
  citation: CompiledEvidenceFinding["citations"][number]
): string {
  return [
    citation.documentLabel,
    citation.passageLabel,
    citation.pageLabel,
    citation.sheetLabel,
    citation.tableLabel,
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" | ");
}

/**
 * One primary compiled evidence finding. Only human labels render here - the
 * finding title, source document/role, citation labels, and the grouped text
 * body or readable table - plus presentation flags. Raw machine ids and chunk
 * locators stay in the drawer audit trail, and there is no per-finding
 * technical dropdown.
 */
function CompiledFindingView({ finding }: { finding: CompiledEvidenceFinding }) {
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
        {finding.flags.aiRefined && (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-text-secondary">
            AI refined
          </span>
        )}
      </div>
      <p className="text-xs text-text-secondary">
        {finding.documentName}
        {finding.role !== undefined ? ` (${fileRoleLabel(finding.role)})` : ""}
      </p>
      {finding.citations.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {finding.citations.map((citation, citationIndex) => (
            <li
              key={citationIndex}
              data-testid="ep-finding-citation"
              className="text-xs text-text-tertiary"
            >
              {citationLine(citation)}
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

function ComplianceMatrixRowView({ row }: { row: ComplianceMatrixRow }) {
  return (
    <li
      data-testid="cm-detail-row"
      className="rounded-button border border-[var(--border)] p-2"
    >
      <p className="text-xs font-medium text-text-primary">
        <span className="font-mono">{row.id}</span> |{" "}
        <span className="font-mono">{row.requirementId}</span> | {row.category} |{" "}
        {row.priority} | {row.complianceStatus}
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
            <span className="font-mono">{ref.evidenceId}</span> |{" "}
            {kindLabel(ref.evidenceKind)} | {complianceReferenceLine(ref)} | file{" "}
            <span className="font-mono">{ref.sourceFileId}</span> | package{" "}
            <span className="font-mono">{ref.inputPackageArtifactId}</span>
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
                  <span className="font-mono">
                    {ref.configurationExpansionArtifactId}
                  </span>{" "}
                  | {configurationReferenceLine(ref)}
                </li>
              ))}
            </ul>
          </details>
      )}
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
  onInspect,
}: {
  label: string;
  artifact?: RfpArtifactState;
  actionLabel?: string;
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
            className={PLAIN_BTN}
            onClick={() => onInspect(artifact.id)}
          >
            {actionLabel ?? "Inspect"}
          </button>
        )}
      </div>
      {artifact !== undefined && (
        <TechnicalDetails testId={`${label.toLowerCase().replaceAll(" ", "-")}-technical`}>
          <p>Artifact ID: {artifact.id}</p>
          <p>Status: {artifact.status}</p>
          <p>Version: {artifact.version}</p>
        </TechnicalDetails>
      )}
    </div>
  );
}

function ReviewHistory({
  track,
  onInspect,
}: {
  track: RfpArtifactTrack;
  onInspect?: (artifactId: string) => void;
}) {
  const entries: RfpArtifactHistoryEntry[] = track.history;
  return (
    <details data-testid="review-history" className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        Review history ({entries.length})
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

  const [generatePending, setGeneratePending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);

  const [uploadRole, setUploadRole] = useState<ProjectFileRole>("rfp");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

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

  const [boqWorkspace, setBoqWorkspace] = useState<ProjectRfpBoqWorkspace | null>(null);
  const [boqWorkspaceLoading, setBoqWorkspaceLoading] = useState(true);
  const [boqWorkspaceError, setBoqWorkspaceError] = useState<string | null>(null);

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
        uploadedFileCount: boqWorkspace?.boqFiles.length ?? 0,
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

  const refreshRfpLists = useCallback((): void => {
    void loadBoqWorkspace();
    void loadList(EMPTY_FILTERS);
    void loadDeltaList();
    void loadPackageList();
    void loadBaselineList();
    void loadComplianceList();
  }, [
    loadBaselineList,
    loadBoqWorkspace,
    loadComplianceList,
    loadDeltaList,
    loadList,
    loadPackageList,
  ]);

  const submitUpload = useCallback(async (): Promise<void> => {
    if (uploadFile === null || uploadPending) return;
    setUploadPending(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("fileRole", uploadRole);
      const res = await fetch(`/api/projects/${id}/rfp/files`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setUploadError(UPLOAD_ERROR);
        return;
      }
      setUploadFile(null);
      setUploadSuccess("File uploaded. Create the input package when all roles are ready.");
      void loadBoqWorkspace();
    } catch {
      setUploadError(UPLOAD_ERROR);
    } finally {
      setUploadPending(false);
    }
  }, [id, loadBoqWorkspace, uploadFile, uploadPending, uploadRole]);

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

  const submitPrepareEvidenceReview = useCallback(async (): Promise<void> => {
    if (prepareEvidencePending) return;
    const inputPackageArtifactId = latestApprovedInputPackageId;
    if (workflow.evidencePackage.current !== undefined) {
      setDrawer({
        kind: "evidence-package",
        activeId: workflow.evidencePackage.current.id,
      });
      void loadPackageDetail(workflow.evidencePackage.current.id);
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
    workflow.extractionDelta.current,
  ]);

  const submitGenerateCompliance = useCallback(async (): Promise<void> => {
    if (complianceGeneratePending || !complianceInputs.ready) return;
    setComplianceGeneratePending(true);
    setComplianceGenerateError(null);
    setComplianceGenerateSuccess(null);
    try {
      const body = {
        requirementsBaselineArtifactId:
          complianceInputs.requirementsBaselineArtifactId,
        evidencePackageArtifactId: complianceInputs.evidencePackageArtifactId,
        ...(complianceInputs.configurationExpansionArtifactId !== undefined
          ? {
              configurationExpansionArtifactId:
                complianceInputs.configurationExpansionArtifactId,
            }
          : {}),
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

  function openBaselineDrawer(artifactId: string): void {
    setDrawer({ kind: "requirements", activeId: artifactId });
    void loadBaselineDetail(artifactId);
  }

  function openComplianceDrawer(artifactId: string): void {
    setDrawer({ kind: "compliance", activeId: artifactId });
    void loadComplianceDetail(artifactId);
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
    return complianceList?.artifacts.map((item) => item.id) ?? [];
  }

  function openDrawerItem(kind: DrawerKind, activeId: string): void {
    if (kind === "evidence") openEvidenceDrawer(activeId);
    else if (kind === "delta") openDeltaDrawer(activeId);
    else if (kind === "evidence-package") openPackageDrawer(activeId);
    else if (kind === "requirements") openBaselineDrawer(activeId);
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
  const pendingComplianceRows: ComplianceMatrixRow[] = complianceDetail
    ? complianceDetail.matrix.rows.filter(
        (row) => row.complianceStatus === "needs_review"
      )
    : [];
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
    // The compiled review is derived deterministically from the sanitized
    // evidence records; the raw records stay the persisted authority below.
    const compiledReview = compileCompiledEvidenceReview({
      deterministicEvidence: packageDetail.package.evidence,
    });
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
          <ol data-testid="ep-compiled-review" className="space-y-2">
            {compiledReview.findings.map((finding) => (
              <CompiledFindingView key={finding.findingId} finding={finding} />
            ))}
          </ol>
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
                      {kindLabel(ref.evidenceKind)} - {referenceLine(ref)}
                    </li>
                  ))}
                </ul>
              </details>
              <TechnicalDetails>
                <p>Requirement ID: {req.id}</p>
                {req.evidenceReferences.map((ref, refIndex) => (
                  <p key={refIndex}>
                    Evidence {refIndex + 1}: {ref.evidenceId}, file {ref.sourceFileId},
                    package {ref.inputPackageArtifactId}
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
        <ol className="space-y-2">
          {pendingComplianceRows.map((row) => (
            <ComplianceMatrixRowView key={row.id} row={row} />
          ))}
        </ol>
        {decidedComplianceRows.length > 0 && (
          <details data-testid="cm-decided-rows" className={TECHNICAL_DETAILS_CLASS}>
            <summary className="cursor-pointer text-xs text-text-secondary">
              Review history ({decidedComplianceRows.length})
            </summary>
            <ol className="mt-2 space-y-2">
              {decidedComplianceRows.map((row) => (
                <ComplianceMatrixRowView key={row.id} row={row} />
              ))}
            </ol>
          </details>
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

  function renderDrawerContent(): ReactNode {
    if (drawer === null) return null;
    if (drawer.kind === "evidence") return renderEvidenceDrawerContent();
    if (drawer.kind === "delta") return renderDeltaDrawerContent();
    if (drawer.kind === "evidence-package") return renderPackageDrawerContent();
    if (drawer.kind === "requirements") return renderBaselineDrawerContent();
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
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <label className="flex flex-col text-xs text-text-tertiary">
                  File
                  <input
                    data-testid="rfp-file-input"
                    type="file"
                    onChange={(event) =>
                      setUploadFile(event.target.files?.item(0) ?? null)
                    }
                    className={FIELD}
                  />
                </label>
                <label className="flex flex-col text-xs text-text-tertiary">
                  Role
                  <select
                    data-testid="rfp-file-role"
                    value={uploadRole}
                    onChange={(event) =>
                      setUploadRole(event.target.value as ProjectFileRole)
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
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="rfp-upload-submit"
                  className={ACTION_BTN}
                  disabled={uploadPending || uploadFile === null}
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
          summary="Prepare and review one compiled evidence package. Raw chunks and IDs stay behind inspection."
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
              <ArtifactStatusCard
                label="Extraction refinement"
                artifact={workflow.extractionDelta.current}
                actionLabel="Review"
                onInspect={openDeltaDrawer}
              />
              <ReviewHistory track={workflow.extractionDelta} onInspect={openDeltaDrawer} />
              <ReviewHistory track={workflow.evidencePackage} onInspect={openPackageDrawer} />
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
                generatePending ||
                workflow.requirementsBaseline.current !== undefined ||
                autoEvidencePackageId === null
              }
              onClick={() => void submitGenerate()}
              className={ACTION_BTN}
            >
              {workflow.requirementsBaseline.current !== undefined
                ? "Review current baseline"
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
          {baselineList && baselineList.artifacts.length > 0 ? (
            <ol className="mt-3 grid gap-2 md:grid-cols-2">
              {baselineList.artifacts.map((item) => (
                <li key={item.id} data-testid="baseline-row" className={SUBTLE_CARD}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} />
                        <span className="text-xs text-text-secondary">
                          Version {item.version}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-text-primary">
                        {item.payloadSummary.requirementCount} requirements
                      </p>
                      <p className={MUTED_TEXT}>
                        {item.payloadSummary.evidenceCount} evidence references
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={`baseline-inspect-${item.id}`}
                      disabled={baselineDetailLoading}
                      onClick={() => openBaselineDrawer(item.id)}
                      className={PLAIN_BTN}
                    >
                      Inspect
                    </button>
                  </div>
                  <TechnicalDetails>
                    <p>Artifact ID: {item.id}</p>
                    <p>Source artifacts: {idList(item.sourceArtifactIds)}</p>
                    <p>Source files: {idList(item.sourceFileIds)}</p>
                    <p>Updated: {item.updatedAt}</p>
                  </TechnicalDetails>
                </li>
              ))}
            </ol>
          ) : (
            !baselineLoading && <EmptyState>No requirements baseline yet.</EmptyState>
          )}
          <ReviewHistory track={workflow.requirementsBaseline} onInspect={openBaselineDrawer} />
        </WorkflowStep>

        <WorkflowStep
          number={4}
          title="Compliance Matrix"
          state={
            workflow.complianceMatrix.latestApproved !== undefined
              ? "complete"
              : workflow.requirementsBaseline.latestApproved === undefined
                ? "blocked"
                : workflow.complianceMatrix.current !== undefined
                  ? "current"
                  : "ready"
          }
          active={workflow.nextAction.stage === "compliance"}
          summary="Generate from the approved requirements baseline and evidence package without manual artifact selection."
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
                complianceGeneratePending ||
                workflow.complianceMatrix.current !== undefined ||
                !complianceInputs.ready
              }
              onClick={() => void submitGenerateCompliance()}
              className={ACTION_BTN}
            >
              {workflow.complianceMatrix.current !== undefined
                ? "Review current matrix"
                : "Generate compliance matrix"}
            </button>
          </div>
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
          {complianceList && complianceList.artifacts.length > 0 ? (
            <ol className="mt-3 grid gap-2 md:grid-cols-2">
              {complianceList.artifacts.map((item) => (
                <li key={item.id} data-testid="cm-row" className={SUBTLE_CARD}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} />
                        <span className="text-xs text-text-secondary">
                          Version {item.version}
                        </span>
                      </div>
                      <p data-testid="cm-row-counts" className="mt-2 text-sm text-text-primary">
                        {item.payloadSummary.rowCount} rows
                      </p>
                      <p className={MUTED_TEXT}>{complianceStatusCounts(item)}</p>
                    </div>
                    <button
                      type="button"
                      data-testid={`cm-inspect-${item.id}`}
                      disabled={complianceDetailLoading}
                      onClick={() => openComplianceDrawer(item.id)}
                      className={PLAIN_BTN}
                    >
                      Inspect
                    </button>
                  </div>
                  <TechnicalDetails>
                    <p>Artifact ID: {item.id}</p>
                    <p>
                      Requirements baseline artifact ID:{" "}
                      {item.payloadSummary.sourceRequirementsBaselineArtifactId}
                    </p>
                    <p>
                      Evidence package artifact ID:{" "}
                      {item.payloadSummary.sourceEvidencePackageArtifactId}
                    </p>
                    <p>Source artifacts: {idList(item.payloadSummary.sourceArtifactIds)}</p>
                    <p>Source files: {idList(item.payloadSummary.sourceFileIds)}</p>
                  </TechnicalDetails>
                </li>
              ))}
            </ol>
          ) : (
            !complianceLoading && <EmptyState>No compliance matrix yet.</EmptyState>
          )}
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
