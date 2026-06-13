"use client";

/**
 * Read-only RFP inspection page (Milestone 1 evidence + Milestone 2
 * requirements baseline).
 *
 * GETs the lean evidence list from /api/projects/[id]/rfp/evidence (optional
 * sourceFileId / inputPackageArtifactId / kind query filters) and renders
 * identifiers, counts, and ISO dates only - the list never renders a
 * persisted text body or table cells. Clicking Inspect on one row GETs
 * /api/projects/[id]/rfp/evidence/[evidenceId], and only the detail panel
 * renders the sanitized persisted content (text chunk body or table rows)
 * that the detail API returned. Every evidence fetch is a default GET: the
 * evidence views write nothing, run no extraction, read no file bytes, and
 * decide nothing - they only display what the read-only inspection APIs
 * return. Types come via `import type` from the inspection read models,
 * erased at compile time, so no server or DB code reaches the client.
 *
 * Requirements baseline (Milestone 2): on mount the page also GETs the lean
 * requirements_baseline artifact list from
 * /api/projects/[id]/rfp/requirements-baseline - identifiers, ISO dates,
 * counts, requirement ids, and source ids only, never requirement text.
 * Clicking Inspect on one artifact GETs
 * /api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline and
 * only the baseline detail panel renders the sanitized reviewable payload:
 * requirement text plus locator-only evidence references (identifiers,
 * counts, positions - never raw evidence text, never table rows, never a
 * tenant id, never a storage path, never an arbitrary payload key). Every
 * baseline inspection fetch is a default GET.
 *
 * Requirements baseline review (Milestone 2): when the loaded baseline
 * detail has a reviewable status (needs_review or generated) the detail
 * panel shows an optional note plus Approve and Reject buttons. A click
 * sends exactly one POST to
 * /api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/review
 * with { decision } plus a trimmed nonblank note only; it never sends a
 * tenant, project, version, decidedBy, status, payload, requirement, or
 * evidence field. On success the panel applies the post-decision
 * artifactStatus from the response, shows fixed success copy, and reloads
 * the read-only baseline list; on failure it shows fixed error copy and
 * keeps the loaded detail. The POST records one human decision and nothing
 * else: no auto-approval, no extraction, no other side effect.
 *
 * Requirements baseline generation (Milestone 2): every evidence list row
 * carries a selection checkbox that stores only the evidence id - selection
 * works from the lean list alone and never fetches detail content. A compact
 * control under the requirements baseline heading shows the selected count
 * and a Generate button, disabled while zero ids are selected or while a
 * generation is in flight. Clicking Generate sends one POST to
 * /api/projects/[id]/rfp/requirements-baseline/generate whose JSON body is
 * exactly { evidenceIds } - never raw evidence text, table rows, tenant or
 * project or user authority, status, payload, artifact, or approval fields.
 * The server drafts candidate requirements from those persisted evidence
 * rows and stores ONE needs_review draft; nothing generates on mount, the
 * created draft is never auto-inspected, and nothing is auto-approved - the
 * draft still goes through the human review above. On success the control
 * shows fixed success copy, clears the selection, and reloads the read-only
 * baseline list; on failure it shows fixed error copy, keeps the selection,
 * and reloads nothing. Whenever the evidence list reloads, the selection is
 * pruned to ids still present in the current list. Generation and review
 * are the page's only two writes, each on its own endpoint.
 *
 * Extraction review (Stage 1A): on mount the page also GETs two lean,
 * read-only artifact lists - the extraction_delta list from
 * /api/projects/[id]/rfp/extraction-delta and the evidence_package list from
 * /api/projects/[id]/rfp/evidence-package - rendering identifiers, ISO dates,
 * counts, and source ids only, never a candidate body, proposed evidence,
 * final evidence text or table rows, a tenant id, or a storage path. Clicking
 * Inspect on a delta row GETs .../extraction-delta/[artifactId] and shows
 * pending candidates first with their locator-only evidence references and the
 * AI/engineer proposed evidence (a proposal surfaced for review, never
 * authority), keeping decided candidates and review history in collapsed
 * details. Clicking Inspect on an evidence_package row GETs
 * .../evidence-package/[artifactId] and renders the sanitized final evidence
 * text and table content - the package under human review - in collapsed
 * details with full source traceability. All four extraction-review fetches
 * are default GETs that write nothing, run no extraction, and decide nothing.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
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
  RfpExtractionDeltaInspectionArtifactSummary,
  RfpExtractionDeltaInspectionDetail,
  RfpExtractionDeltaInspectionListItem,
} from "@/lib/projects/project-rfp-extraction-delta-inspection";
import type {
  RfpEvidencePackageInspectionArtifactSummary,
  RfpEvidencePackageInspectionListItem,
  RfpEvidencePackageInspectionPackage,
} from "@/lib/projects/project-rfp-evidence-package-inspection";

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

type PackageEvidence = RfpEvidencePackageInspectionPackage["evidence"][number];

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

/** Exact UI copy required for the extraction-delta failure states. */
const DELTA_LIST_ERROR = "Unable to load extraction deltas.";
const DELTA_DETAIL_ERROR = "Unable to load extraction delta detail.";

/** Exact UI copy required for the extraction-delta review outcome states. */
const DELTA_REVIEW_SUCCESS = "Extraction delta review recorded.";
const DELTA_REVIEW_ERROR = "Unable to review extraction delta.";

/** Exact UI copy required for the evidence-package failure states. */
const PACKAGE_LIST_ERROR = "Unable to load final evidence packages.";
const PACKAGE_DETAIL_ERROR = "Unable to load final evidence package detail.";

const EMPTY_FILTERS: EvidenceFilters = {
  sourceFileId: "",
  inputPackageArtifactId: "",
  kind: "all",
};

const ACTION_BTN =
  "rounded-button bg-accent px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-hover disabled:opacity-50";
const PLAIN_BTN =
  "rounded-button border border-[var(--border)] px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-card disabled:opacity-50";
const FIELD =
  "mt-1 rounded-button border border-[var(--border)] bg-bg-card px-2 py-1 text-xs text-text-primary";
const ERROR_BOX =
  "rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive";

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

/** One-line position/size summary for a lean list row; never content. */
function summaryLine(item: RfpEvidenceListItemSummary): string {
  const s = item.contentSummary;
  if (s.evidenceKind === "rfp_document_table") {
    const page = s.pageNumber !== undefined ? ` | page ${s.pageNumber}` : "";
    const sheet = s.sheetName !== undefined ? ` | sheet ${s.sheetName}` : "";
    return `table ${s.tableId}${page}${sheet} | ${s.rowCount} rows x ${s.columnCount} cols`;
  }
  const m = s.documentMetrics;
  const doc =
    m !== undefined ? ` | doc ${m.textCharCount} chars / ${m.tableCount} tables` : "";
  return `chunk ${s.chunkIndex + 1}/${s.chunkCount} | ${s.charCount} chars${doc}`;
}

/** Only these artifact statuses may still receive a human review decision. */
function isReviewableStatus(
  status: RfpRequirementsBaselineInspectionArtifactSummary["status"]
): boolean {
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

export default function ProjectRfpEvidencePage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<EvidenceListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [sourceFileIdInput, setSourceFileIdInput] = useState("");
  const [artifactIdInput, setArtifactIdInput] = useState("");
  const [kindInput, setKindInput] = useState<KindFilter>("all");

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

  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [generatePending, setGeneratePending] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);

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

  const loadList = useCallback(
    async (filters: EvidenceFilters): Promise<void> => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch(evidenceListUrl(id, filters));
        const body = (await res.json().catch(() => null)) as EvidenceListResponse | null;
        if (!res.ok || body === null || !body.project || !Array.isArray(body.evidence)) {
          setData(null);
          setSelectedEvidenceIds([]);
          setListError(LIST_ERROR);
          return;
        }
        setData(body);
        // Selection tracks the visible list only: a reload (filtered or not)
        // drops ids for evidence rows no longer present.
        setSelectedEvidenceIds((prev) =>
          prev.filter((selectedId) =>
            body.evidence.some((item) => item.id === selectedId)
          )
        );
      } catch {
        setData(null);
        setSelectedEvidenceIds([]);
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

  // Final evidence content is fetched only here, on an explicit Inspect click.
  const loadPackageDetail = useCallback(
    async (artifactId: string): Promise<void> => {
      setPackageDetail(null);
      setPackageDetailError(null);
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

  function toggleEvidenceSelection(evidenceId: string): void {
    setSelectedEvidenceIds((prev) =>
      prev.includes(evidenceId)
        ? prev.filter((selectedId) => selectedId !== evidenceId)
        : [...prev, evidenceId]
    );
  }

  // The page's generation write: ask the server to draft ONE reviewable
  // needs_review requirements_baseline artifact from the selected persisted
  // evidence rows. The body carries only the selected evidence ids - never
  // raw content, tenant/project/user authority, status, payload, artifact,
  // or approval fields; the route derives all authority server-side. Success
  // clears the selection and reloads the read-only baseline list; the new
  // draft is never auto-inspected or auto-approved. Failure keeps the
  // selection and reloads nothing.
  const submitGenerate = useCallback(async (): Promise<void> => {
    if (selectedEvidenceIds.length === 0 || generatePending) return;
    setGeneratePending(true);
    setGenerateError(null);
    setGenerateSuccess(null);
    try {
      const res = await fetch(
        `/api/projects/${id}/rfp/requirements-baseline/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evidenceIds: selectedEvidenceIds }),
        }
      );
      if (!res.ok) {
        setGenerateError(GENERATE_ERROR);
        return;
      }
      setGenerateSuccess(GENERATE_SUCCESS);
      setSelectedEvidenceIds([]);
      void loadBaselineList();
    } catch {
      setGenerateError(GENERATE_ERROR);
    } finally {
      setGeneratePending(false);
    }
  }, [generatePending, id, loadBaselineList, selectedEvidenceIds]);

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

  function onApply(): void {
    void loadList({
      sourceFileId: sourceFileIdInput,
      inputPackageArtifactId: artifactIdInput,
      kind: kindInput,
    });
  }

  function onReset(): void {
    setSourceFileIdInput("");
    setArtifactIdInput("");
    setKindInput("all");
    void loadList(EMPTY_FILTERS);
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

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          RFP evidence inspection
        </p>
        {data && (
          <>
            <h1 data-testid="project-name" className="text-lg font-semibold text-text-primary">
              {data.project.name}
            </h1>
            {data.project.customerName && (
              <p data-testid="customer-name" className="mt-1 text-sm text-text-secondary">
                Customer: {data.project.customerName}
              </p>
            )}
            <p data-testid="project-mode" className="text-xs text-text-tertiary">
              Mode: {data.project.mode} | Project:{" "}
              <span className="font-mono">{data.project.id}</span>
            </p>
          </>
        )}
      </header>

      <section className="rounded-card border border-[var(--border)] p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-text-tertiary">
            Source file id
            <input
              data-testid="filter-source-file-id"
              type="text"
              value={sourceFileIdInput}
              onChange={(e) => setSourceFileIdInput(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col text-xs text-text-tertiary">
            Input package artifact id
            <input
              data-testid="filter-artifact-id"
              type="text"
              value={artifactIdInput}
              onChange={(e) => setArtifactIdInput(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col text-xs text-text-tertiary">
            Kind
            <select
              data-testid="filter-kind"
              value={kindInput}
              onChange={(e) => setKindInput(e.target.value as KindFilter)}
              className={FIELD}
            >
              <option value="all">all</option>
              <option value="rfp_document_text_chunk">text</option>
              <option value="rfp_document_table">table</option>
            </select>
          </label>
          <button type="button" data-testid="filter-apply" disabled={listLoading} onClick={onApply} className={ACTION_BTN}>
            Apply
          </button>
          <button type="button" data-testid="filter-reset" disabled={listLoading} onClick={onReset} className={PLAIN_BTN}>
            Reset
          </button>
        </div>
      </section>

      {listError && (
        <div data-testid="list-error" className={ERROR_BOX}>
          {listError}
        </div>
      )}
      {listLoading && (
        <p data-testid="list-loading" className="text-sm text-text-tertiary">
          Loading evidence...
        </p>
      )}

      {data && (
        <section>
          <h2 className="text-sm font-semibold text-text-primary">Evidence</h2>
          <p data-testid="evidence-counts" className="mt-1 text-xs text-text-secondary">
            Evidence: {data.evidenceCount} total | text chunks: {data.textChunkCount} | tables:{" "}
            {data.tableEvidenceCount}
          </p>
          {data.evidence.length === 0 ? (
            <p data-testid="evidence-empty" className="mt-2 text-sm text-text-tertiary">
              No evidence rows match.
            </p>
          ) : (
            <ol className="mt-2 space-y-1">
              {data.evidence.map((item) => (
                <li
                  key={item.id}
                  data-testid="evidence-row"
                  className="flex items-start justify-between gap-2 rounded-button border border-[var(--border)] p-2"
                >
                  <input
                    type="checkbox"
                    data-testid={`evidence-select-${item.id}`}
                    aria-label={`Select evidence ${item.id}`}
                    checked={selectedEvidenceIds.includes(item.id)}
                    onChange={() => toggleEvidenceSelection(item.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-primary">
                      <span className="font-mono">{item.id}</span> | {kindLabel(item.kind)}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {item.contentSummary.sourceFileName} ({item.contentSummary.sourceFileRole}) |
                      file <span className="font-mono">{item.sourceFileId}</span>
                    </p>
                    <p className="text-xs text-text-secondary">{summaryLine(item)}</p>
                    <p className="text-xs text-text-tertiary">
                      package{" "}
                      <span className="font-mono">{item.contentSummary.inputPackageArtifactId}</span>{" "}
                      | extracted {item.extractedAt}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid={`inspect-${item.id}`}
                    disabled={detailLoading}
                    onClick={() => void loadDetail(item.id)}
                    className={ACTION_BTN}
                  >
                    Inspect
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-text-primary">Evidence detail</h2>
        {detailError && (
          <div data-testid="detail-error" className={`mt-2 ${ERROR_BOX}`}>
            {detailError}
          </div>
        )}
        {detailLoading && (
          <p data-testid="detail-loading" className="mt-1 text-sm text-text-tertiary">
            Loading evidence detail...
          </p>
        )}
        {!detail && !detailLoading && !detailError && (
          <p data-testid="detail-empty" className="mt-1 text-xs text-text-tertiary">
            Click Inspect on an evidence row to view its persisted content.
          </p>
        )}
        {detail && content && (
          <div data-testid="detail-panel" className="mt-2 rounded-card border border-[var(--border)] p-3">
            <p data-testid="detail-meta" className="text-xs text-text-secondary">
              <span className="font-mono">{detail.id}</span> | {kindLabel(detail.kind)} | file{" "}
              <span className="font-mono">{detail.sourceFileId}</span> | extracted{" "}
              {detail.extractedAt} | retained until {detail.retainUntil}
            </p>
            {content.evidenceKind === "rfp_document_text_chunk" ? (
              <div data-testid="detail-text">
                <p className="mt-1 text-xs text-text-secondary">
                  {content.sourceFileName} ({content.sourceFileRole}) | chunk{" "}
                  {content.chunkIndex + 1}/{content.chunkCount} | {content.charCount} chars |
                  package <span className="font-mono">{content.inputPackageArtifactId}</span>
                </p>
                <pre
                  data-testid="detail-text-body"
                  className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-button bg-bg-card p-2 text-xs text-text-primary"
                >
                  {content.text}
                </pre>
              </div>
            ) : (
              <div data-testid="detail-table">
                <p className="mt-1 text-xs text-text-secondary">
                  {content.sourceFileName} ({content.sourceFileRole}) | table {content.tableId}
                  {content.pageNumber !== undefined ? ` | page ${content.pageNumber}` : ""}
                  {content.sheetName !== undefined ? ` | sheet ${content.sheetName}` : ""} |{" "}
                  {content.rowCount} rows x {content.columnCount} cols | package{" "}
                  <span className="font-mono">{content.inputPackageArtifactId}</span>
                </p>
                <div className="mt-2 max-h-96 overflow-auto">
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {content.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} data-testid="detail-table-row">
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="border border-[var(--border)] px-2 py-1 text-text-primary">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Extraction review</h2>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Extraction deltas
          </h3>
          {deltaListError && (
            <div data-testid="delta-list-error" className={`mt-2 ${ERROR_BOX}`}>
              {deltaListError}
            </div>
          )}
          {deltaListLoading && (
            <p data-testid="delta-list-loading" className="mt-1 text-sm text-text-tertiary">
              Loading extraction deltas...
            </p>
          )}
          {deltaList && (
            <>
              <p data-testid="delta-count" className="mt-1 text-xs text-text-secondary">
                Extraction deltas: {deltaList.artifactCount}
              </p>
              {deltaList.artifacts.length === 0 ? (
                <p data-testid="delta-empty" className="mt-2 text-sm text-text-tertiary">
                  No extraction delta artifacts yet.
                </p>
              ) : (
                <ol className="mt-2 space-y-1">
                  {deltaList.artifacts.map((item) => (
                    <li
                      key={item.id}
                      data-testid="delta-row"
                      className="flex items-start justify-between gap-2 rounded-button border border-[var(--border)] p-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-primary">
                          <span className="font-mono">{item.id}</span> | version {item.version} |{" "}
                          {item.status}
                        </p>
                        <p className="text-xs text-text-secondary">
                          source {item.payloadSummary.proposalSource} | package{" "}
                          <span className="font-mono">
                            {item.payloadSummary.inputPackageArtifactId}
                          </span>{" "}
                          | candidates {item.payloadSummary.candidateCount}
                        </p>
                        <p className="text-xs text-text-secondary">
                          pending {item.payloadSummary.pendingCount} | accepted{" "}
                          {item.payloadSummary.acceptedCount} | rejected{" "}
                          {item.payloadSummary.rejectedCount} | waived{" "}
                          {item.payloadSummary.waivedCount}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          source artifacts:{" "}
                          <span className="font-mono">{item.sourceArtifactIds.join(", ")}</span> |
                          source files:{" "}
                          <span className="font-mono">{item.sourceFileIds.join(", ")}</span>
                        </p>
                        <p className="text-xs text-text-tertiary">
                          created {item.createdAt} | updated {item.updatedAt}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid={`delta-inspect-${item.id}`}
                        disabled={deltaDetailLoading}
                        onClick={() => void loadDeltaDetail(item.id)}
                        className={ACTION_BTN}
                      >
                        Inspect
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Extraction delta detail
          </h3>
          {deltaDetailError && (
            <div data-testid="delta-detail-error" className={`mt-2 ${ERROR_BOX}`}>
              {deltaDetailError}
            </div>
          )}
          {deltaDetailLoading && (
            <p data-testid="delta-detail-loading" className="mt-1 text-sm text-text-tertiary">
              Loading extraction delta detail...
            </p>
          )}
          {deltaReviewError && (
            <div data-testid="delta-review-error" className={`mt-2 ${ERROR_BOX}`}>
              {deltaReviewError}
            </div>
          )}
          {deltaReviewSuccess && (
            <p data-testid="delta-review-success" className="mt-2 text-xs text-text-secondary">
              {deltaReviewSuccess}
            </p>
          )}
          {!deltaDetail && !deltaDetailLoading && !deltaDetailError && (
            <p data-testid="delta-detail-empty" className="mt-1 text-xs text-text-tertiary">
              No extraction delta inspected yet.
            </p>
          )}
          {deltaDetail && (
            <div
              data-testid="delta-detail-panel"
              className="mt-2 rounded-card border border-[var(--border)] p-3"
            >
              <p data-testid="delta-detail-meta" className="text-xs text-text-secondary">
                <span className="font-mono">{deltaDetail.artifact.id}</span> | version{" "}
                {deltaDetail.artifact.version} | {deltaDetail.artifact.status} | candidates{" "}
                {deltaDetail.delta.candidateCount} | pending {deltaDetail.delta.pendingCount} |
                accepted {deltaDetail.delta.acceptedCount} | rejected{" "}
                {deltaDetail.delta.rejectedCount} | waived {deltaDetail.delta.waivedCount}
              </p>
              {pendingDeltaCandidates.length === 0 ? (
                <p data-testid="delta-pending-empty" className="mt-2 text-xs text-text-tertiary">
                  No pending candidates.
                </p>
              ) : (
                <ol data-testid="delta-pending-list" className="mt-2 space-y-2">
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
              {deltaReviewable ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
                  <p
                    data-testid="delta-review-selected-count"
                    className="text-xs text-text-secondary"
                  >
                    Selected decisions: {selectedDeltaDecisionCount}
                  </p>
                  <button
                    type="button"
                    data-testid="delta-review-submit"
                    disabled={
                      deltaReviewPending || selectedDeltaDecisionCount === 0
                    }
                    onClick={() => void submitDeltaReview()}
                    className={ACTION_BTN}
                  >
                    Record decisions
                  </button>
                </div>
              ) : (
                pendingDeltaCandidates.length > 0 && (
                  <p
                    data-testid="delta-review-readonly"
                    className="mt-2 text-xs text-text-tertiary"
                  >
                    Status {deltaDetail.artifact.status} is not reviewable.
                  </p>
                )
              )}
              {decidedDeltaCandidates.length > 0 && (
                <details data-testid="delta-decided" className="mt-2">
                  <summary className="cursor-pointer text-xs text-text-secondary">
                    Decided candidates ({decidedDeltaCandidates.length})
                  </summary>
                  <ol className="mt-2 space-y-2">
                    {decidedDeltaCandidates.map((candidate) => (
                      <DeltaCandidateRow key={candidate.id} candidate={candidate} />
                    ))}
                  </ol>
                </details>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Final evidence packages
          </h3>
          {packageListError && (
            <div data-testid="ep-list-error" className={`mt-2 ${ERROR_BOX}`}>
              {packageListError}
            </div>
          )}
          {packageListLoading && (
            <p data-testid="ep-list-loading" className="mt-1 text-sm text-text-tertiary">
              Loading final evidence packages...
            </p>
          )}
          {packageList && (
            <>
              <p data-testid="ep-count" className="mt-1 text-xs text-text-secondary">
                Final evidence packages: {packageList.artifactCount}
              </p>
              {packageList.artifacts.length === 0 ? (
                <p data-testid="ep-empty" className="mt-2 text-sm text-text-tertiary">
                  No final evidence package artifacts yet.
                </p>
              ) : (
                <ol className="mt-2 space-y-1">
                  {packageList.artifacts.map((item) => (
                    <li
                      key={item.id}
                      data-testid="ep-row"
                      className="flex items-start justify-between gap-2 rounded-button border border-[var(--border)] p-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-primary">
                          <span className="font-mono">{item.id}</span> | version {item.version} |{" "}
                          {item.status}
                        </p>
                        <p className="text-xs text-text-secondary">
                          package{" "}
                          <span className="font-mono">
                            {item.payloadSummary.inputPackageArtifactId}
                          </span>{" "}
                          | evidence {item.payloadSummary.evidenceCount} | text{" "}
                          {item.payloadSummary.textChunkCount} | tables{" "}
                          {item.payloadSummary.tableEvidenceCount}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          source artifacts:{" "}
                          <span className="font-mono">{item.sourceArtifactIds.join(", ")}</span> |
                          source files:{" "}
                          <span className="font-mono">{item.sourceFileIds.join(", ")}</span>
                        </p>
                        <p className="text-xs text-text-tertiary">
                          created {item.createdAt} | updated {item.updatedAt}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid={`ep-inspect-${item.id}`}
                        disabled={packageDetailLoading}
                        onClick={() => void loadPackageDetail(item.id)}
                        className={ACTION_BTN}
                      >
                        Inspect
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Final evidence package detail
          </h3>
          {packageDetailError && (
            <div data-testid="ep-detail-error" className={`mt-2 ${ERROR_BOX}`}>
              {packageDetailError}
            </div>
          )}
          {packageDetailLoading && (
            <p data-testid="ep-detail-loading" className="mt-1 text-sm text-text-tertiary">
              Loading final evidence package detail...
            </p>
          )}
          {!packageDetail && !packageDetailLoading && !packageDetailError && (
            <p data-testid="ep-detail-empty" className="mt-1 text-xs text-text-tertiary">
              No final evidence package inspected yet.
            </p>
          )}
          {packageDetail && (
            <div
              data-testid="ep-detail-panel"
              className="mt-2 rounded-card border border-[var(--border)] p-3"
            >
              <p data-testid="ep-detail-meta" className="text-xs text-text-secondary">
                <span className="font-mono">{packageDetail.artifact.id}</span> | version{" "}
                {packageDetail.artifact.version} | {packageDetail.artifact.status} | package{" "}
                <span className="font-mono">{packageDetail.package.inputPackageArtifactId}</span> |
                evidence {packageDetail.package.evidenceCount} | text{" "}
                {packageDetail.package.textChunkCount} | tables{" "}
                {packageDetail.package.tableEvidenceCount}
              </p>
              <ol className="mt-2 space-y-2">
                {packageDetail.package.evidence.map((evidence, evidenceIndex) => (
                  <PackageEvidenceView key={evidenceIndex} evidence={evidence} />
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary">Requirements baseline</h2>
        <div
          data-testid="generate-control"
          className="mt-2 flex flex-wrap items-center gap-2 rounded-card border border-[var(--border)] p-3"
        >
          <p data-testid="generate-selected-count" className="text-xs text-text-secondary">
            Selected evidence: {selectedEvidenceIds.length}
          </p>
          <button
            type="button"
            data-testid="generate-baseline"
            disabled={selectedEvidenceIds.length === 0 || generatePending}
            onClick={() => void submitGenerate()}
            className={ACTION_BTN}
          >
            Generate draft
          </button>
        </div>
        {generateError && (
          <div data-testid="generate-error" className={`mt-2 ${ERROR_BOX}`}>
            {generateError}
          </div>
        )}
        {generateSuccess && (
          <p data-testid="generate-success" className="mt-2 text-xs text-text-secondary">
            {generateSuccess}
          </p>
        )}
        {baselineError && (
          <div data-testid="baseline-error" className={`mt-2 ${ERROR_BOX}`}>
            {baselineError}
          </div>
        )}
        {baselineLoading && (
          <p data-testid="baseline-loading" className="mt-1 text-sm text-text-tertiary">
            Loading requirements baseline...
          </p>
        )}
        {baselineList && (
          <>
            <p data-testid="baseline-count" className="mt-1 text-xs text-text-secondary">
              Baseline artifacts: {baselineList.artifactCount}
            </p>
            {baselineList.artifacts.length === 0 ? (
              <p data-testid="baseline-empty" className="mt-2 text-sm text-text-tertiary">
                No requirements baseline artifacts yet.
              </p>
            ) : (
              <ol className="mt-2 space-y-1">
                {baselineList.artifacts.map((item) => (
                  <li
                    key={item.id}
                    data-testid="baseline-row"
                    className="flex items-start justify-between gap-2 rounded-button border border-[var(--border)] p-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-text-primary">
                        <span className="font-mono">{item.id}</span> | version {item.version} |{" "}
                        {item.status}
                      </p>
                      <p className="text-xs text-text-secondary">
                        requirements: {item.payloadSummary.requirementCount} | evidence refs:{" "}
                        {item.payloadSummary.evidenceCount}
                      </p>
                      <p className="text-xs text-text-secondary">
                        requirement ids:{" "}
                        <span className="font-mono">
                          {item.payloadSummary.requirementIds.join(", ")}
                        </span>
                      </p>
                      <p className="text-xs text-text-tertiary">
                        source artifacts:{" "}
                        <span className="font-mono">{item.sourceArtifactIds.join(", ")}</span> |
                        source files:{" "}
                        <span className="font-mono">{item.sourceFileIds.join(", ")}</span>
                      </p>
                      <p className="text-xs text-text-tertiary">
                        created {item.createdAt} | updated {item.updatedAt}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={`baseline-inspect-${item.id}`}
                      disabled={baselineDetailLoading}
                      onClick={() => void loadBaselineDetail(item.id)}
                      className={ACTION_BTN}
                    >
                      Inspect
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-primary">
          Requirements baseline detail
        </h2>
        {baselineDetailError && (
          <div data-testid="baseline-detail-error" className={`mt-2 ${ERROR_BOX}`}>
            {baselineDetailError}
          </div>
        )}
        {baselineDetailLoading && (
          <p data-testid="baseline-detail-loading" className="mt-1 text-sm text-text-tertiary">
            Loading requirements baseline detail...
          </p>
        )}
        {!baselineDetail && !baselineDetailLoading && !baselineDetailError && (
          <p data-testid="baseline-detail-empty" className="mt-1 text-xs text-text-tertiary">
            Click Inspect on a baseline artifact to view its reviewable requirements.
          </p>
        )}
        {baselineDetail && (
          <div
            data-testid="baseline-detail-panel"
            className="mt-2 rounded-card border border-[var(--border)] p-3"
          >
            <p data-testid="baseline-detail-meta" className="text-xs text-text-secondary">
              <span className="font-mono">{baselineDetail.artifact.id}</span> | version{" "}
              {baselineDetail.artifact.version} | {baselineDetail.artifact.status} | created by{" "}
              {baselineDetail.baseline.createdBy} | created {baselineDetail.baseline.createdAt} |
              requirements: {baselineDetail.baseline.requirementCount} | evidence refs:{" "}
              {baselineDetail.baseline.evidenceCount}
            </p>
            <ol className="mt-2 space-y-2">
              {baselineDetail.baseline.requirements.map((req) => (
                <li
                  key={req.id}
                  data-testid="baseline-detail-requirement"
                  className="rounded-button border border-[var(--border)] p-2"
                >
                  <p className="text-xs font-medium text-text-primary">
                    <span className="font-mono">{req.id}</span> | {req.category} | {req.priority}
                    {req.title !== undefined ? ` | ${req.title}` : ""}
                  </p>
                  <p
                    data-testid="baseline-detail-requirement-text"
                    className="mt-1 whitespace-pre-wrap text-xs text-text-primary"
                  >
                    {req.text}
                  </p>
                  {req.notes !== undefined && (
                    <p className="mt-1 text-xs text-text-secondary">Notes: {req.notes}</p>
                  )}
                  <ul className="mt-1 space-y-0.5">
                    {req.evidenceReferences.map((ref, refIndex) => (
                      <li
                        key={refIndex}
                        data-testid="baseline-detail-reference"
                        className="text-xs text-text-tertiary"
                      >
                        <span className="font-mono">{ref.evidenceId}</span> |{" "}
                        {kindLabel(ref.evidenceKind)} | {referenceLine(ref)} | file{" "}
                        <span className="font-mono">{ref.sourceFileId}</span> | package{" "}
                        <span className="font-mono">{ref.inputPackageArtifactId}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              {reviewError && (
                <div data-testid="baseline-review-error" className={`mb-2 ${ERROR_BOX}`}>
                  {reviewError}
                </div>
              )}
              {reviewSuccess && (
                <p
                  data-testid="baseline-review-success"
                  className="mb-2 text-xs text-text-secondary"
                >
                  {reviewSuccess}
                </p>
              )}
              {isReviewableStatus(baselineDetail.artifact.status) ? (
                <>
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
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <p
                  data-testid="baseline-review-readonly"
                  className="text-xs text-text-tertiary"
                >
                  Status {baselineDetail.artifact.status} is not reviewable.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
