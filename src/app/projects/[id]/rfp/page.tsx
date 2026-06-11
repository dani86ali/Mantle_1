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
 * sends exactly one POST - the page's only write - to
 * /api/projects/[id]/rfp/artifacts/[artifactId]/requirements-baseline/review
 * with { decision } plus a trimmed nonblank note only; it never sends a
 * tenant, project, version, decidedBy, status, payload, requirement, or
 * evidence field. On success the panel applies the post-decision
 * artifactStatus from the response, shows fixed success copy, and reloads
 * the read-only baseline list; on failure it shows fixed error copy and
 * keeps the loaded detail. The POST records one human decision and nothing
 * else: no auto-approval, no extraction, no generation, no other write.
 */

import { useCallback, useEffect, useState } from "react";
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

/** Exact UI copy required for the list/detail failure states. */
const LIST_ERROR = "Unable to load RFP evidence.";
const DETAIL_ERROR = "Unable to load evidence detail.";

/** Exact UI copy required for the baseline list/detail failure states. */
const BASELINE_LIST_ERROR = "Unable to load requirements baseline.";
const BASELINE_DETAIL_ERROR = "Unable to load requirements baseline detail.";

/** Exact UI copy required for the baseline review failure state. */
const BASELINE_REVIEW_ERROR = "Unable to review requirements baseline.";

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

  // The page's single write: record one human approve/reject decision for
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
                  <div className="min-w-0">
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

      <section>
        <h2 className="text-sm font-semibold text-text-primary">Requirements baseline</h2>
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
