"use client";

/**
 * Read-only RFP extraction evidence inspection page (Milestone 1).
 *
 * GETs the lean evidence list from /api/projects/[id]/rfp/evidence (optional
 * sourceFileId / inputPackageArtifactId / kind query filters) and renders
 * identifiers, counts, and ISO dates only - the list never renders a
 * persisted text body or table cells. Clicking Inspect on one row GETs
 * /api/projects/[id]/rfp/evidence/[evidenceId], and only the detail panel
 * renders the sanitized persisted content (text chunk body or table rows)
 * that the detail API returned. Every fetch is a default GET: the page
 * writes nothing, runs no extraction, reads no file bytes, and decides
 * nothing - it only displays what the read-only inspection APIs return.
 * Types come via `import type` from the inspection read model, erased at
 * compile time, so no server or DB code reaches the client.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  RfpEvidenceDetail,
  RfpEvidenceInspectionProjectSummary,
  RfpEvidenceListItemSummary,
} from "@/lib/projects/project-rfp-evidence-inspection";

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

/** Exact UI copy required for the list/detail failure states. */
const LIST_ERROR = "Unable to load RFP evidence.";
const DETAIL_ERROR = "Unable to load evidence detail.";

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
    </main>
  );
}
