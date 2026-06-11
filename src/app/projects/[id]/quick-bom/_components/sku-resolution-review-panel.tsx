"use client";

/**
 * SKU resolution line-review panel (extracted from the Quick BoM page).
 *
 * Loaded on demand from the read-only review route; the panel's review projection is
 * null until the engineer clicks "Load SKU review lines" (the main workspace stays
 * payload-free).
 *
 * Review is split into two presentation sections, not per-line Accept/Reject buttons:
 *  - "Included downstream": eligible priced same-SKU rows (one suggestion equal to the
 *    original SKU, no reject/defer guidance) plus already-accepted rows. Eligible rows
 *    render a checkbox, checked by default - submitting accepts that exact same SKU
 *    (never a substitution).
 *  - "Excluded before pricing": deferred/non-priced rows and any other non-same-SKU
 *    row. These render NO checkbox (not even a disabled one) and are impossible to
 *    approve; submitting rejects them with their internal note carried in the payload
 *    but never shown in the UI.
 * The split is presentation only; the submit decision still keys off isApprovableLine.
 * One "Submit review decisions" action records an explicit decision for EVERY review
 * row in a single POST: included+checked -> accept (the same SKU), everything else ->
 * reject. Nothing is auto-accepted, replaced, or substituted.
 *
 * A successful POST mints a NEW sku_resolution version (new artifact id). When the
 * minted artifact still needs_review the panel auto-refreshes against the returned id;
 * when it is no longer needs_review the panel clears so the normal artifact approval
 * controls appear (review submission is NOT stage approval). When the loaded artifact
 * is already decided (not needs_review) the panel shows a read-only decision table.
 * The body carries only { actions: [...sanitizedActions] }; no tenant/project/artifact/
 * decidedBy/decidedAt/pricing/authority field is ever sent.
 */

import { useCallback, useState } from "react";
import type {
  QuickBomSkuResolutionReviewLine,
  QuickBomSkuResolutionReviewWorkspace,
} from "@/lib/projects/project-quick-bom-sku-resolution-review-workspace";
import { APPROVE_BTN, Card, StatusBadge, bodyMessage } from "./quick-bom-review-ui";
import { SkuResolutionReviewReadOnly } from "./sku-resolution-review-readonly";
import { SkuRelatedConfiguredNote } from "./sku-related-configured-note";

const SKU_REVIEW_ERROR = "Unable to load or update the SKU line review.";

/** Stable per-line key: its source file + row pair. */
function lineKey(line: QuickBomSkuResolutionReviewLine): string {
  return `${line.sourceFileId}::${line.sourceRowNumber}`;
}

/**
 * A row is approvable (selectable, checked by default) only when it still needs review,
 * carries NO reject/defer guidance, carries exactly one suggestion, and that suggestion
 * is the same SKU as the original (case-insensitive, trimmed). This excludes
 * deferred/non-priced guided rows, unresolved, ambiguous, multi-suggestion, and
 * different-SKU rows - none of which may be approved through this panel.
 */
function isApprovableLine(line: QuickBomSkuResolutionReviewLine): boolean {
  if (line.status !== "needs_review") return false;
  if (line.reviewGuidance?.action === "reject") return false;
  if (line.suggestions.length !== 1) return false;
  const suggested = line.suggestions[0].suggestedSku.trim().toLowerCase();
  const original = line.originalSku.trim().toLowerCase();
  return suggested !== "" && suggested === original;
}

/** A row carries an explicit deferred/non-priced reject recommendation. */
function isDeferredLine(line: QuickBomSkuResolutionReviewLine): boolean {
  return line.status === "needs_review" && line.reviewGuidance?.action === "reject";
}

/**
 * Display-only categorization: a line is "included downstream" when it is already
 * accepted or is an eligible same-SKU row (the only rows this panel can approve). Every
 * other line is "excluded before pricing". Pure presentation - it never feeds the submit
 * payload, which is still driven by {@link isApprovableLine}.
 */
function isIncludedLine(line: QuickBomSkuResolutionReviewLine): boolean {
  return line.status === "accepted" || isApprovableLine(line);
}

interface SkuResolutionReviewPanelProps {
  projectId: string;
  artifactId: string;
  onReviewSubmitted: () => Promise<void> | void;
}

export function SkuResolutionReviewPanel({
  projectId,
  artifactId,
  onReviewSubmitted,
}: SkuResolutionReviewPanelProps) {
  const [skuReview, setSkuReview] = useState<QuickBomSkuResolutionReviewWorkspace | null>(null);
  const [skuReviewError, setSkuReviewError] = useState<string | null>(null);
  const [skuReviewBusy, setSkuReviewBusy] = useState(false);
  // Checked row keys, keyed by `${sourceFileId}::${sourceRowNumber}`. Seeded from the
  // approvable rows on every (re)load; deferred/non-approvable rows are never selected.
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // GET the read-only SKU line-review projection for one sku_resolution artifact and
  // seed the default selection (approvable same-SKU rows checked). This is the only
  // place the page fetches review lines. Controlled errors only, never a stack.
  const loadSkuReview = useCallback(
    async (id: string): Promise<void> => {
      setSkuReviewError(null);
      setSkuReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/quick-bom/artifacts/${id}/sku-resolution/review`
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setSkuReview(null);
          setSkuReviewError(bodyMessage(body) ?? SKU_REVIEW_ERROR);
          return;
        }
        const review = (body as { review?: QuickBomSkuResolutionReviewWorkspace } | null)
          ?.review;
        if (!review) {
          setSkuReview(null);
          setSkuReviewError(SKU_REVIEW_ERROR);
          return;
        }
        const defaults: Record<string, boolean> = {};
        for (const line of review.lines) {
          if (isApprovableLine(line)) defaults[lineKey(line)] = true;
        }
        setSelected(defaults);
        setSkuReview(review);
      } catch {
        setSkuReview(null);
        setSkuReviewError(SKU_REVIEW_ERROR);
      } finally {
        setSkuReviewBusy(false);
      }
    },
    [projectId]
  );

  // POST one explicit decision for EVERY review row in a single action array. A
  // successful POST mints a NEW sku_resolution version; while it still needs_review the
  // panel auto-refreshes against the returned id, otherwise it clears so the normal
  // artifact approval controls appear. The body carries only { actions }; no tenant/
  // project/artifact/decidedBy/decidedAt/pricing/authority field is ever sent.
  const submitSkuReviewActions = useCallback(
    async (actions: Record<string, unknown>[]): Promise<void> => {
      if (actions.length === 0) return;
      setSkuReviewError(null);
      setSkuReviewBusy(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/quick-bom/artifacts/${artifactId}/sku-resolution/review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actions }),
          }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setSkuReviewError(bodyMessage(body) ?? SKU_REVIEW_ERROR);
          return;
        }
        const artifact = (body as { artifact?: { id?: unknown; status?: unknown } } | null)
          ?.artifact;
        const nextId =
          typeof artifact?.id === "string" && artifact.id !== "" ? artifact.id : null;
        const stillNeedsReview = artifact?.status === "needs_review";
        await onReviewSubmitted();
        if (stillNeedsReview && nextId) {
          await loadSkuReview(nextId);
        } else {
          setSkuReview(null);
        }
      } catch {
        setSkuReviewError(SKU_REVIEW_ERROR);
      } finally {
        setSkuReviewBusy(false);
      }
    },
    [projectId, artifactId, onReviewSubmitted, loadSkuReview]
  );

  // Build one explicit decision per `needs_review` row and POST them together. A
  // checked (approvable) row accepts its same-SKU suggestion (never invented); every
  // other review row is rejected, carrying the advisory defer note when deferred. No
  // authority/pricing/catalog/replacement field is ever attached.
  function onSubmitReview(review: QuickBomSkuResolutionReviewWorkspace): void {
    const actions = review.lines
      .filter((line) => line.status === "needs_review")
      .map((line) => {
        if (isApprovableLine(line) && selected[lineKey(line)]) {
          return {
            decision: "accept",
            sourceFileId: line.sourceFileId,
            sourceRowNumber: line.sourceRowNumber,
            acceptedSku: line.suggestions[0].suggestedSku,
          };
        }
        const note = isDeferredLine(line) ? line.reviewGuidance?.note : undefined;
        return {
          decision: "reject",
          sourceFileId: line.sourceFileId,
          sourceRowNumber: line.sourceRowNumber,
          ...(note !== undefined ? { note } : {}),
        };
      });
    void submitSkuReviewActions(actions);
  }

  function toggleLine(line: QuickBomSkuResolutionReviewLine): void {
    const key = lineKey(line);
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const reviewable = skuReview?.artifact.status === "needs_review";
  const reviewRowCount = skuReview
    ? skuReview.lines.filter((line) => line.status === "needs_review").length
    : 0;
  const approveCount = skuReview
    ? skuReview.lines.filter(
        (line) => isApprovableLine(line) && selected[lineKey(line)]
      ).length
    : 0;
  // Structural include/exclude split, total-covering across every line. A line goes
  // downstream when it is already accepted or is an eligible same-SKU row; everything
  // else (deferred, different-SKU, ambiguous, rejected, unresolved) is excluded before
  // pricing. This is presentation only - it never changes the submit decision payload.
  const includedLines = skuReview ? skuReview.lines.filter(isIncludedLine) : [];
  const excludedLines = skuReview
    ? skuReview.lines.filter((line) => !isIncludedLine(line))
    : [];

  return (
    <Card title="SKU line review">
      <p className="mt-2 text-xs text-text-secondary">
        Review every line in one pass: rows with a catalog match are pre-selected to go
        downstream; rows not in the active pricing catalog are excluded before pricing.
        Submitting records an explicit decision for every reviewed line.
      </p>
      <button
        type="button"
        data-testid="sku-review-load"
        disabled={skuReviewBusy}
        onClick={() => void loadSkuReview(artifactId)}
        className={`mt-3 ${APPROVE_BTN}`}
      >
        Load SKU review lines
      </button>
      {skuReviewError && (
        <div
          data-testid="sku-review-error"
          className="mt-3 rounded-card border border-destructive/30 bg-destructive-muted p-3 text-sm text-destructive"
        >
          {skuReviewError}
        </div>
      )}
      {skuReview && (
        <div className="mt-3 space-y-3">
          <p data-testid="sku-review-summary" className="text-xs text-text-secondary">
            {skuReview.reviewSummary.totalLineCount} lines:{" "}
            {includedLines.length} included downstream,{" "}
            {excludedLines.length} excluded before pricing
          </p>
          {!reviewable ? (
            <SkuResolutionReviewReadOnly lines={skuReview.lines} />
          ) : (
            <>
              <button
                type="button"
                data-testid="sku-review-submit"
                disabled={skuReviewBusy || reviewRowCount === 0}
                onClick={() => onSubmitReview(skuReview)}
                className={APPROVE_BTN}
              >
                Submit review decisions ({approveCount} included /{" "}
                {reviewRowCount - approveCount} excluded)
              </button>
              <section data-testid="sku-review-included" className="space-y-1">
                <h3 className="text-xs font-semibold text-text-primary">
                  Included downstream ({includedLines.length})
                </h3>
                <ol className="space-y-2">
                  {includedLines.map((line) => {
                    const approvable = isApprovableLine(line);
                    const key = lineKey(line);
                    const matchSku = approvable
                      ? line.suggestions[0].suggestedSku
                      : line.acceptedSku;
                    return (
                      <li
                        key={key}
                        data-testid="sku-review-line"
                        className="rounded-button border border-[var(--border)] p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2">
                            {approvable && (
                              <input
                                type="checkbox"
                                data-testid="sku-review-checkbox"
                                data-row={line.sourceRowNumber}
                                checked={Boolean(selected[key])}
                                disabled={skuReviewBusy}
                                onChange={() => toggleLine(line)}
                              />
                            )}
                            <span className="text-sm font-medium text-text-primary">
                              {line.originalSku}
                            </span>
                          </label>
                          <StatusBadge status={line.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-text-tertiary">
                          Source row {line.sourceRowNumber}
                        </p>
                        {matchSku !== undefined && (
                          <p className="mt-0.5 text-xs text-text-secondary">
                            Catalog match: {matchSku}
                          </p>
                        )}
                        <SkuRelatedConfiguredNote items={line.relatedConfiguredItems} />
                      </li>
                    );
                  })}
                </ol>
              </section>
              <section data-testid="sku-review-excluded" className="space-y-1">
                <h3 className="text-xs font-semibold text-text-primary">
                  Excluded before pricing ({excludedLines.length})
                </h3>
                <ol className="space-y-2">
                  {excludedLines.map((line) => (
                    <li
                      key={lineKey(line)}
                      data-testid="sku-review-line"
                      className="rounded-button border border-[var(--border)] p-2"
                    >
                      <span className="text-sm font-medium text-text-primary">
                        {line.originalSku}
                      </span>
                      <p className="mt-0.5 text-xs text-text-tertiary">
                        Source row {line.sourceRowNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {line.originalSku} is not available in the active pricing catalog.
                      </p>
                      <SkuRelatedConfiguredNote items={line.relatedConfiguredItems} />
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
